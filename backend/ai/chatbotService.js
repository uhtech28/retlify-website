/**
 * Retlify — Context-Aware Chatbot Service  (v3)
 * ===============================================
 * Upgrade over v2:
 *  - Uses promptBuilder.buildChatPrompt() for all prompt construction
 *  - Hydrates full user profile + last-5 raw actions before every response
 *  - Passes last-3 chat messages as structured history to the AI provider
 *  - Zero crashes on missing data — every field is optional with safe defaults
 *  - Graceful fallback if AI provider is unavailable or throws
 *
 * Modes
 * ─────
 *  "customer"    → product suggestions, local shop discovery
 *  "shopkeeper"  → business insights, stock advice
 */

'use strict';

const gemini  = require('./geminiService');
const cache   = require('./cacheService');
const behavior = require('./userBehaviorService');
const UserBehavior = require('../models/UserBehavior');
const { buildChatPrompt } = require('./promptBuilder');

/* ── Confidence estimator ────────────────────────────────── */

function _estimateConfidence(reply = '', userProfile = {}) {
  let score = 0.60;
  const lower = reply.toLowerCase();

  // Reward: mentions a category the user cares about
  const topCats = userProfile.topCategories || [];
  if (topCats.some(c => lower.includes(c))) score += 0.12;

  // Reward: mentions the user's city
  const city = userProfile.location?.city || '';
  if (city && lower.includes(city.toLowerCase())) score += 0.08;

  // Reward: contains price (₹ sign)
  if (/₹\d/.test(reply)) score += 0.08;

  // Reward: substantive length
  if (reply.length > 200) score += 0.05;
  if (reply.length < 60)  score -= 0.15;  // penalize very short answers

  return Math.round(Math.min(0.97, Math.max(0.30, score)) * 100) / 100;
}

/* ── Fetch last N raw actions for prompt context ─────────── */

async function _fetchRecentActions(userId, limit = 5) {
  if (!userId) return [];
  try {
    const doc = await UserBehavior.findOne(
      { userId },
      { actions: { $slice: -limit } }
    ).lean();
    return doc?.actions || [];
  } catch {
    return [];
  }
}

/* ── Build user object for promptBuilder ─────────────────── */

async function _buildUserContext(userId, mode, context = {}) {
  // Safe defaults — no crash if userId is null or DB is slow
  const base = {
    userId:         userId || null,
    mode:           mode === 'shopkeeper' ? 'shopkeeper' : 'customer',
    location:       context.location || null,
    topCategories:  context.topCategories  || [],
    recentSearches: context.recentSearches || [],
    recentActions:  [],
    activityLevel:  'new',
    shopName:       context.shopName       || null,
    shopCategories: context.categories     || [],
  };

  if (!userId) return base;

  try {
    // Fetch behavior profile (cached for 60s) and raw actions in parallel
    const [profile, actions] = await Promise.all([
      behavior.getProfile(userId),
      _fetchRecentActions(userId, 5),
    ]);

    if (profile && !profile.isEmpty) {
      base.topCategories  = profile.topCategories  || base.topCategories;
      base.recentSearches = profile.recentSearches || base.recentSearches;
      base.activityLevel  = profile.activityLevel  || 'new';
      base.location       = profile.location       || base.location;
    }
    base.recentActions = actions;
  } catch (err) {
    // Non-fatal — continue with base defaults
    console.warn('[Chatbot] Could not hydrate user context:', err.message);
  }

  // Override with anything explicitly passed in context (caller knows best)
  if (context.city && !base.location?.city) {
    base.location = { ...(base.location || {}), city: context.city };
  }

  return base;
}

/* ── Main chat function ──────────────────────────────────── */

/**
 * @param {Array}  messages  - Full conversation [{role:'user'|'assistant', content}]
 * @param {string} mode      - 'customer' | 'shopkeeper'
 * @param {object} context   - Optional extra context from frontend
 * @param {string} userId    - Authenticated user ID (may be null for anonymous)
 * @returns {Promise<{ reply: string, confidence: number, model: string }>}
 */
async function getChatResponse(messages = [], mode = 'customer', context = {}, userId = null) {
  // Guard: nothing to respond to
  if (!messages.length) {
    return { reply: 'How can I help you today?', confidence: 0.5, model: 'fallback' };
  }

  const lastMsg = messages[messages.length - 1]?.content || '';

  // Build rich user context (profile + recent actions)
  const userCtx = await _buildUserContext(userId, mode, context);

  // Attempt AI response
  if (gemini.isAvailable()) {
    // Cache key: mode + first 60 chars of query + top category (personalisation signal)
    const cKey = cache.cacheKey(
      'chat', mode,
      lastMsg.slice(0, 60),
      (userCtx.topCategories[0] || ''),
      (userCtx.location?.city   || '')
    );

    // Only cache single-turn (shallow) conversations — multi-turn is dynamic
    if (messages.length <= 2) {
      const cached = await cache.get(cKey);
      if (cached) return cached;
    }

    // Build prompt components via promptBuilder
    const { systemPrompt, userPrompt, historyMessages } = buildChatPrompt(
      userCtx,
      messages,
      lastMsg
    );

    try {
      const reply = await gemini.generateText(userPrompt, {
        model:        'flash',
        systemPrompt,
        maxTokens:    450,
        temperature:  0.75,
        history:      historyMessages,
      });

      const confidence = _estimateConfidence(reply, userCtx);
      const result     = { reply, confidence, model: 'openrouter/gpt-3.5' };

      if (messages.length <= 2) await cache.set(cKey, result, 30);
      return result;
    } catch (err) {
      console.error('[Chatbot] AI provider error:', err.message);
      // Fall through to fallback
    }
  }

  // Graceful fallback — always returns something sensible
  return _getFallbackResponse(lastMsg, mode, userCtx);
}

/* ── Personalized fallback ───────────────────────────────── */

function _getFallbackResponse(query = '', mode = 'customer', userCtx = {}) {
  const q    = query.toLowerCase();
  const city = userCtx.location?.city || '';
  const cats = userCtx.topCategories  || [];
  const loc  = city ? ` in ${city}` : ' nearby';

  if (mode === 'shopkeeper') {
    if (q.includes('stock') || q.includes('product') || q.includes('inventory'))
      return { reply: '📦 Focus on fast-moving categories: ethnic wear ahead of festivals, electronics accessories year-round, and daily groceries for steady revenue. Survey your top customers about what they couldn\'t find recently.', confidence: 0.72, model: 'fallback' };
    if (q.includes('sales') || q.includes('low') || q.includes('slow') || q.includes('revenue'))
      return { reply: '📊 Low sales often mean low visibility. Make sure your listing has: (1) clear product photos, (2) updated price list, (3) accurate hours. Adding your WhatsApp number helps — 73% of local purchases start with a message.', confidence: 0.75, model: 'fallback' };
    if (q.includes('price') || q.includes('discount') || q.includes('offer'))
      return { reply: '💰 A well-timed 10–15% discount on slow-moving stock can clear inventory and attract new customers. Highlight offers in your shop description. Festival seasons (Diwali, Eid, Navratri) are ideal for promotions.', confidence: 0.70, model: 'fallback' };
    return { reply: '💡 To grow on Retlify: update inventory daily, respond to queries within 1 hour, and upload quality product photos. Shops with photos get 3× more profile views.', confidence: 0.65, model: 'fallback' };
  }

  // Customer mode — personalise on topCategories
  if (cats.includes('footwear') || q.includes('shoe') || q.includes('sandal') || q.includes('chappal'))
    return { reply: `👟 Based on your interest in footwear, there are great options${loc}! Sports shoes, mojaris, and everyday sandals are trending. Local markets often beat malls on price — try filtering by "under ₹1000".`, confidence: 0.74, model: 'fallback' };
  if (cats.includes('electronics') || q.includes('headphone') || q.includes('mobile') || q.includes('phone'))
    return { reply: `🎧 For electronics${loc}, local shops offer better after-sales support than online. Always check the warranty card and test before purchase. Compare 2–3 shops for the best deal.`, confidence: 0.72, model: 'fallback' };
  if (cats.includes('clothing') || q.includes('kurti') || q.includes('lehenga') || q.includes('saree') || q.includes('dress'))
    return { reply: `👗 For ethnic wear${loc}, shops with seasonal stock usually have better prices. Cotton kurtis, printed sarees, and festive lehengas are in high demand right now! Check your nearest market area.`, confidence: 0.73, model: 'fallback' };
  if (cats.includes('grocery') || q.includes('vegetable') || q.includes('grocery') || q.includes('atta'))
    return { reply: `🥬 For groceries${loc}, look for shops with daily fresh stock. Many local kirana stores now have WhatsApp ordering — much faster than waiting in queue!`, confidence: 0.70, model: 'fallback' };
  if (q.includes('cheap') || q.includes('budget') || q.includes('affordable') || q.includes('saste'))
    return { reply: `💰 Budget shopping${loc}? Use price filters (under ₹500, under ₹1000) in the search to find the best deals. Local shops often have better prices than e-commerce with same-day pickup!`, confidence: 0.68, model: 'fallback' };

  return { reply: `🔍 I'll help you find what you need${loc}! Use the search above to discover local shops. Filter by distance and price to find the best match. What are you looking for?`, confidence: 0.55, model: 'fallback' };
}

module.exports = { getChatResponse };
