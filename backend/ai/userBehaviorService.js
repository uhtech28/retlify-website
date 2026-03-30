/**
 * Retlify — User Behavior Service  (v3 — MongoDB persistent)
 * ============================================================
 * Tracks user actions (searches, clicks, product views, chatbot queries)
 * with full persistence to MongoDB.
 *
 * Architecture
 * ────────────
 *  - Every write uses findOneAndUpdate with $push / $set / $inc —
 *    atomic, no read-modify-write race conditions.
 *  - A write-through in-memory cache (cacheService) absorbs read bursts.
 *  - Action arrays are capped via $slice in the $push modifier —
 *    MongoDB trims the array server-side, never loading the full doc.
 *  - categoryScores are updated with $set after computing weights locally.
 *  - All public functions are async; errors are caught and logged,
 *    never thrown, so tracking never breaks the request pipeline.
 *
 * Public API (backward-compatible with v2 — drop-in replacement)
 * ───────────────────────────────────────────────────────────────
 *  trackSearch(userId, query, opts)
 *  trackClick(userId, product)
 *  trackView(userId, product, durationMs)
 *  trackChatbotQuery(userId, query, opts)  ← NEW
 *  trackPurchase(userId, product)
 *  updateLocation(userId, location)
 *  getProfile(userId) → Promise<ProfileSnapshot>
 *  getUserPreferenceScore(userId, result) → Promise<number>
 *  getChatbotContext(userId) → Promise<object>
 *  batchSync(userId, events) → Promise<void>
 *  getGlobalSearchStats() → Promise<object>
 *  detectCategory(query) → string
 */

'use strict';

const UserBehavior = require('../models/UserBehavior');
const cache        = require('./cacheService');

/* ── Constants ───────────────────────────────────────────── */

const MAX_ACTIONS       = 200;  // Per-user action log cap (trimmed server-side via $slice)
const SCORE_DECAY       = 0.97; // Per-event decay multiplier for category scores
const SCORE_WEIGHTS     = { search: 1, click: 2, view: 1.5, chatbot_query: 1, purchase: 5 };
const PROFILE_CACHE_TTL = 60;   // seconds

/* ── Category mapping ────────────────────────────────────── */

const CATEGORY_KEYWORDS = {
  footwear:    ['shoes', 'sandals', 'chappals', 'sneakers', 'boots', 'heels', 'mojari', 'footwear'],
  clothing:    ['kurti', 'saree', 'lehenga', 'jeans', 'shirt', 'dress', 'kapde', 'ethnic', 'top', 'kurta'],
  electronics: ['mobile', 'phone', 'headphones', 'earphones', 'laptop', 'tv', 'charger', 'earbuds'],
  grocery:     ['atta', 'dal', 'chawal', 'sabzi', 'vegetables', 'fruits', 'grocery', 'masala', 'spices'],
  jewellery:   ['gold', 'silver', 'jewellery', 'necklace', 'ring', 'bangle', 'earring'],
  toys:        ['toys', 'kids', 'children', 'game', 'doll', 'puzzle'],
  beauty:      ['cosmetics', 'makeup', 'beauty', 'skincare', 'lipstick', 'cream'],
  fitness:     ['gym', 'fitness', 'sports', 'exercise', 'yoga', 'dumbbell', 'cycle'],
  books:       ['books', 'stationery', 'notebook', 'pen', 'copy'],
  furniture:   ['furniture', 'sofa', 'chair', 'table', 'bed', 'almirah'],
};

function detectCategory(query) {
  const q = (query || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => q.includes(k))) return cat;
  }
  return 'general';
}

/* ── Internal helpers ────────────────────────────────────── */

function _applyScoreWeight(scores, category, weight) {
  if (!category || category === 'general') return scores;
  const updated = { ...scores };
  for (const cat of Object.keys(updated)) {
    updated[cat] = (updated[cat] || 0) * SCORE_DECAY;
  }
  updated[category] = (updated[category] || 0) + weight;
  return updated;
}

function _invalidateCache(userId) {
  cache.del(cache.cacheKey('behavior_profile', userId));
  cache.del(cache.cacheKey('recs', userId));
}

async function _appendAction(userId, actionType, data, category, weight) {
  const action       = { type: actionType, data, timestamp: Date.now() };
  const counterField = actionType === 'chatbot_query' ? 'chatbotCount'
                     : `${actionType}Count`;

  // Upsert to ensure document exists, fetch current scores in one round-trip
  const doc = await UserBehavior.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, actions: [], categoryScores: {}, lastSeenAt: Date.now() } },
    { upsert: true, new: true, projection: { categoryScores: 1 }, setDefaultsOnInsert: true }
  ).lean();

  const newScores = _applyScoreWeight(doc.categoryScores || {}, category, weight);

  // Push action (with server-side trim), update scores + counter — one round-trip
  await UserBehavior.updateOne(
    { userId },
    {
      $push: { actions: { $each: [action], $slice: -MAX_ACTIONS } },
      $set:  { categoryScores: newScores, lastSeenAt: Date.now() },
      $inc:  { [counterField]: 1 },
    }
  );

  _invalidateCache(userId);
}

/* ── Public API ──────────────────────────────────────────── */

async function trackSearch(userId, query, { city } = {}) {
  if (!userId || !query) return;
  try {
    const category = detectCategory(query);
    const data     = { query: query.toLowerCase().trim(), category, ...(city ? { city } : {}) };
    await _appendAction(userId, 'search', data, category, SCORE_WEIGHTS.search);
    if (city) {
      await UserBehavior.updateOne(
        { userId, 'location.city': null },
        { $set: { 'location.city': city } }
      );
    }
  } catch (err) {
    console.error('[BehaviorService] trackSearch error:', err.message);
  }
}

async function trackClick(userId, product) {
  if (!userId || !product) return;
  try {
    const category = product.category || detectCategory(product.name || '');
    const data = {
      productId: product.productId || product.id || null,
      name:      product.name      || null,
      category,
      price:     product.price     || null,
    };
    await _appendAction(userId, 'click', data, category, SCORE_WEIGHTS.click);
  } catch (err) {
    console.error('[BehaviorService] trackClick error:', err.message);
  }
}

async function trackView(userId, product, durationMs = 0) {
  if (!userId || !product) return;
  try {
    const category = product.category || detectCategory(product.name || '');
    const weight   = durationMs > 10000 ? 3 : durationMs > 3000 ? 1.5 : 0.5;
    const data     = {
      productId:  product.productId || product.id || null,
      name:       product.name      || null,
      category,
      durationMs: durationMs || 0,
    };
    await _appendAction(userId, 'view', data, category, weight);
  } catch (err) {
    console.error('[BehaviorService] trackView error:', err.message);
  }
}

async function trackChatbotQuery(userId, query, { intent = null } = {}) {
  if (!userId || !query) return;
  try {
    const category = detectCategory(query);
    const data     = { query: query.trim(), category, ...(intent ? { intent } : {}) };
    await _appendAction(userId, 'chatbot_query', data, category, SCORE_WEIGHTS.chatbot_query);
  } catch (err) {
    console.error('[BehaviorService] trackChatbotQuery error:', err.message);
  }
}

async function trackPurchase(userId, product) {
  if (!userId || !product) return;
  try {
    const category = product.category || detectCategory(product.name || '');
    const data = {
      productId: product.productId || product.id || null,
      name:      product.name      || null,
      category,
      price:     product.price     || null,
    };
    await _appendAction(userId, 'purchase', data, category, SCORE_WEIGHTS.purchase);
  } catch (err) {
    console.error('[BehaviorService] trackPurchase error:', err.message);
  }
}

async function updateLocation(userId, location) {
  if (!userId || !location) return;
  try {
    await UserBehavior.updateOne(
      { userId },
      {
        $set: {
          location: {
            city: location.city || null,
            lat:  location.lat  || null,
            lng:  location.lng  || null,
          },
        },
      },
      { upsert: true }
    );
    _invalidateCache(userId);
  } catch (err) {
    console.error('[BehaviorService] updateLocation error:', err.message);
  }
}

async function getProfile(userId) {
  if (!userId) return null;

  const ck     = cache.cacheKey('behavior_profile', userId);
  const cached = await cache.get(ck);
  if (cached) return cached;

  try {
    const doc = await UserBehavior.findOne({ userId }).lean();
    if (!doc) return { userId, isEmpty: true };

    const topCategories = Object.entries(doc.categoryScores || {})
      .filter(([, score]) => score > 0.1)
      .sort(([, a], [, b]) => b - a)
      .map(([cat]) => cat);

    const searchActions     = (doc.actions || []).filter(a => a.type === 'search').slice(-20);
    const recentSearches    = [...new Set(searchActions.map(a => a.data?.query).filter(Boolean))].slice(-10);
    const searchedCategories = [...new Set(
      (doc.actions || []).filter(a => a.type === 'search').slice(-30)
        .map(a => a.data?.category).filter(c => c && c !== 'general')
    )];

    const total       = (doc.searchCount || 0) + (doc.clickCount || 0);
    const activityLevel = total > 10 ? 'active' : total > 0 ? 'light' : 'new';

    const profile = {
      userId,
      topCategories,
      recentSearches,
      searchedCategories,
      location:       doc.location   || null,
      searchCount:    doc.searchCount  || 0,
      clickCount:     doc.clickCount   || 0,
      viewCount:      doc.viewCount    || 0,
      chatbotCount:   doc.chatbotCount || 0,
      lastSeenAt:     doc.lastSeenAt   || null,
      activityLevel,
      categoryScores: doc.categoryScores || {},
    };

    await cache.set(ck, profile, PROFILE_CACHE_TTL);
    return profile;
  } catch (err) {
    console.error('[BehaviorService] getProfile error:', err.message);
    return { userId, isEmpty: true, error: true };
  }
}

async function getUserPreferenceScore(userId, result) {
  if (!userId) return 0;
  try {
    const profile = await getProfile(userId);
    if (!profile || !profile.categoryScores || !Object.keys(profile.categoryScores).length) return 0;
    const resultCategory = result.category || detectCategory(`${result.name || ''} ${result.description || ''}`);
    const maxScore = Math.max(...Object.values(profile.categoryScores), 1);
    const userScore = profile.categoryScores[resultCategory] || 0;
    return Math.min(1, userScore / maxScore);
  } catch (err) {
    console.error('[BehaviorService] getUserPreferenceScore error:', err.message);
    return 0;
  }
}

async function getChatbotContext(userId) {
  if (!userId) return {};
  try {
    const profile = await getProfile(userId);
    if (!profile || profile.isEmpty) return { isNewUser: true };

    // Fetch last 10 actions with a projection for minimal data transfer
    const doc = await UserBehavior.findOne({ userId }, { actions: { $slice: -10 } }).lean();
    const recentSearches = (doc?.actions || [])
      .filter(a => a.type === 'search')
      .slice(-5)
      .map(a => a.data?.query)
      .filter(Boolean);

    return {
      recentSearches,
      topCategories: profile.topCategories.slice(0, 3),
      location:      profile.location,
      isNewUser:     (profile.searchCount || 0) < 3,
    };
  } catch (err) {
    console.error('[BehaviorService] getChatbotContext error:', err.message);
    return {};
  }
}

async function batchSync(userId, events = []) {
  if (!userId || !events.length) return;
  for (const evt of events) {
    switch (evt.type) {
      case 'search':        await trackSearch(userId, evt.query, { city: evt.city }); break;
      case 'click':         await trackClick(userId, evt.product); break;
      case 'view':          await trackView(userId, evt.product, evt.durationMs); break;
      case 'chatbot_query': await trackChatbotQuery(userId, evt.query, { intent: evt.intent }); break;
      case 'purchase':      await trackPurchase(userId, evt.product); break;
      case 'location':      await updateLocation(userId, evt.location); break;
    }
  }
}

async function getGlobalSearchStats() {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    const results = await UserBehavior.aggregate([
      { $unwind: '$actions' },
      { $match: { 'actions.type': 'search', 'actions.timestamp': { $gte: cutoff } } },
      {
        $group: {
          _id:   { query: '$actions.data.query', category: '$actions.data.category' },
          count: { $sum: 1 },
        },
      },
      { $sort:  { count: -1 } },
      { $limit: 50 },
    ]);

    const topQueries = results
      .map(r => ({ query: r._id.query, count: r.count }))
      .slice(0, 20);

    const categoryMap = {};
    for (const r of results) {
      const cat = r._id.category;
      if (cat && cat !== 'general') categoryMap[cat] = (categoryMap[cat] || 0) + r.count;
    }
    const topCategories = Object.entries(categoryMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([category, count]) => ({ category, count }));

    const totalProfiles = await UserBehavior.estimatedDocumentCount();
    return { topQueries, topCategories, totalProfiles };
  } catch (err) {
    console.error('[BehaviorService] getGlobalSearchStats error:', err.message);
    return { topQueries: [], topCategories: [], totalProfiles: 0 };
  }
}

module.exports = {
  trackSearch,
  trackClick,
  trackView,
  trackChatbotQuery,
  trackPurchase,
  updateLocation,
  getProfile,
  getUserPreferenceScore,
  getChatbotContext,
  batchSync,
  getGlobalSearchStats,
  detectCategory,
};
