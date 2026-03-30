/**
 * Retlify — AI Smart Search Service  (v3)
 * =========================================
 * Upgrade over v2:
 *  - Uses promptBuilder.buildSearchPrompt() for consistent AI suggestion prompts
 *  - enrichQuery() returns a full structured response (query + intent + results shape)
 *    that matches the documented API contract:
 *    { query, corrected, intent: { price, category, location }, results: [] }
 *  - Synonym map expanded (cheap → budget, shoes → sneakers, etc.)
 *  - Price detection handles ₹ sign, "rs.", "inr", Hindi patterns
 *  - Category detection unified with userBehaviorService.CATEGORY_KEYWORDS
 *  - Levenshtein typo correction retained, dictionary expanded
 *  - getUserPreferenceScore is awaited correctly (async in v3)
 *
 * Smart ranking formula (unchanged):
 *   score = (relevance × 0.4) + (distance × 0.2) + (popularity × 0.2) + (userPref × 0.2)
 */

'use strict';

const gemini     = require('./geminiService');
const cache      = require('./cacheService');
const behavior   = require('./userBehaviorService');
const { buildSearchPrompt } = require('./promptBuilder');
const translator = require('../utils/translator');

/* ═══════════════════════════════════════════════════════════
   SYNONYM MAP
   ═══════════════════════════════════════════════════════════ */

const SYNONYM_MAP = {
  // Hinglish / transliterations
  'kurti':    ['ethnic wear', 'tunic', 'kurta', 'indian top'],
  'lehenga':  ['skirt', 'ethnic dress', 'ghagra', 'indian outfit'],
  'saree':    ['sari', 'ethnic wear', 'traditional wear'],
  'jeans':    ['denim', 'pants', 'trousers', 'bottoms'],
  'kapde':    ['clothes', 'clothing', 'apparel', 'garments'],
  'kapda':    ['clothes', 'clothing', 'fabric', 'material'],
  'atta':     ['flour', 'wheat flour', 'chakki atta'],
  'dal':      ['lentils', 'pulses', 'legumes'],
  'chawal':   ['rice', 'basmati rice'],
  'saste':    ['cheap', 'affordable', 'budget', 'low price', 'inexpensive'],
  'mehenge':  ['expensive', 'premium', 'luxury', 'high end'],
  'acche':    ['good', 'best', 'quality', 'top rated'],
  'kharidna': ['buy', 'purchase', 'shop for'],
  'paas':     ['nearby', 'near me', 'close', 'local'],
  // English → expanded
  'shoes':       ['footwear', 'sandals', 'chappals', 'sneakers', 'boots', 'loafers'],
  'sneakers':    ['sports shoes', 'running shoes', 'athletic shoes', 'trainers'],
  'mobile':      ['phone', 'smartphone', 'cell phone', 'handset'],
  'headphones':  ['earphones', 'earbuds', 'headset', 'audio gear'],
  'tv':          ['television', 'led tv', 'display', 'smart tv'],
  'best':        ['top', 'highest rated', 'premium', 'recommended'],
  'budget':      ['cheap', 'affordable', 'low cost', 'value for money'],
  'cheap':       ['budget', 'affordable', 'low price', 'inexpensive', 'saste'],
  'nearby':      ['near me', 'close by', 'local', 'in my area', 'paas'],
  'watch':       ['timepiece', 'wristwatch', 'smartwatch'],
  'bag':         ['purse', 'handbag', 'backpack', 'tote'],
  'kids':        ['children', 'baby', 'toddler', 'child'],
  'jewellery':   ['jewelry', 'ornaments', 'gold', 'silver', 'accessories'],
  'organic':     ['natural', 'fresh', 'chemical-free', 'pure'],
  'gym':         ['fitness', 'exercise', 'workout', 'sports'],
};

/* ═══════════════════════════════════════════════════════════
   CATEGORY DETECTION
   (mirrors userBehaviorService — single source of truth via this map)
   ═══════════════════════════════════════════════════════════ */

const CATEGORY_MAP = {
  footwear:    ['shoes', 'sandals', 'chappals', 'sneakers', 'boots', 'heels', 'mojari', 'footwear', 'slippers'],
  clothing:    ['kurti', 'saree', 'lehenga', 'jeans', 'shirt', 'dress', 'kapde', 'ethnic', 'top', 'kurta', 'jacket', 'hoodie', 'suit'],
  electronics: ['mobile', 'phone', 'headphones', 'earphones', 'laptop', 'tv', 'charger', 'earbuds', 'tablet', 'camera'],
  grocery:     ['atta', 'dal', 'chawal', 'sabzi', 'vegetables', 'fruits', 'grocery', 'masala', 'spices', 'kirana'],
  jewellery:   ['gold', 'silver', 'jewellery', 'necklace', 'ring', 'bangle', 'earring', 'bracelet'],
  toys:        ['toys', 'kids', 'children', 'game', 'doll', 'puzzle', 'board game'],
  beauty:      ['cosmetics', 'makeup', 'beauty', 'skincare', 'lipstick', 'cream', 'face wash'],
  fitness:     ['gym', 'fitness', 'sports', 'exercise', 'yoga', 'dumbbell', 'cycle', 'treadmill'],
  books:       ['books', 'stationery', 'notebook', 'pen', 'copy', 'novel', 'textbook'],
  furniture:   ['furniture', 'sofa', 'chair', 'table', 'bed', 'almirah', 'shelf', 'mattress'],
};

function _detectCategory(query) {
  const q = (query || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(k => q.includes(k))) return cat;
  }
  return null; // explicit null — caller decides what to do
}

/* ═══════════════════════════════════════════════════════════
   PRICE PATTERNS
   ═══════════════════════════════════════════════════════════ */

const PRICE_PATTERNS = [
  { re: /under\s+(?:rs\.?|₹|inr)?\s*(\d+)/i,          type: 'max' },
  { re: /below\s+(?:rs\.?|₹|inr)?\s*(\d+)/i,          type: 'max' },
  { re: /(?:rs\.?|₹|inr)\s*(\d+)\s*se\s*kam/i,        type: 'max' },
  { re: /less\s+than\s+(?:rs\.?|₹|inr)?\s*(\d+)/i,    type: 'max' },
  { re: /(?:rs\.?|₹|inr)\s*(\d+)\s*(?:tak|max|only)/i,type: 'max' },
  { re: /above\s+(?:rs\.?|₹|inr)?\s*(\d+)/i,          type: 'min' },
  { re: /over\s+(?:rs\.?|₹|inr)?\s*(\d+)/i,           type: 'min' },
  { re: /more\s+than\s+(?:rs\.?|₹|inr)?\s*(\d+)/i,    type: 'min' },
];

const LOCATION_KEYWORDS = [
  'near me', 'nearby', 'close by', 'paas', 'aas paas',
  'local', 'around me', 'close to me', 'in my area',
];

/* ═══════════════════════════════════════════════════════════
   RETAIL DICTIONARY  (for typo correction)
   ═══════════════════════════════════════════════════════════ */

const RETAIL_DICTIONARY = [
  'shoes','mobile','phone','shirt','dress','kurti','saree','lehenga',
  'jeans','watch','bag','purse','headphones','earphones','laptop',
  'television','refrigerator','furniture','grocery','vegetables',
  'fruits','medicine','pharmacy','jewellery','gold','silver',
  'electronics','clothing','footwear','accessories','stationery',
  'books','toys','sports','fitness','gym','beauty','cosmetics',
  'sneakers','sandals','kurta','ethnic','jacket','hoodie','suit',
  'camera','tablet','charger','earbuds','mattress','sofa','chair',
  'notebook','pen','novel','masala','spices','kirana','organic',
];

/* ═══════════════════════════════════════════════════════════
   LEVENSHTEIN TYPO CORRECTION
   ═══════════════════════════════════════════════════════════ */

function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/**
 * Correct obvious typos in a query against the retail dictionary.
 * Words of 3 chars or fewer are skipped (too short to match reliably).
 */
function correctTypos(query = '') {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(word => {
      if (word.length <= 3) return word;
      let best = word, bestDist = 2; // only correct if distance ≤ 2
      for (const dw of RETAIL_DICTIONARY) {
        const d = _levenshtein(word, dw);
        if (d < bestDist) { bestDist = d; best = dw; }
      }
      return best;
    })
    .join(' ');
}

/* ═══════════════════════════════════════════════════════════
   INTENT DETECTION
   ═══════════════════════════════════════════════════════════ */

/**
 * Parse a search query into structured intent.
 *
 * @param {string} query
 * @returns {{
 *   keywords:      string[],
 *   expandedTerms: string[],
 *   priceFilter:   { type: 'max'|'min', value: number } | null,
 *   hasLocation:   boolean,
 *   category:      string | null,
 *   originalQuery: string,
 *   cleanedQuery:  string,
 * }}
 */
function detectIntent(query = '') {
  const lower = query.toLowerCase().trim();

  // ── Price ─────────────────────────────────────────────
  let priceFilter = null;
  for (const { re, type } of PRICE_PATTERNS) {
    const m = lower.match(re);
    if (m) { priceFilter = { type, value: parseInt(m[1], 10) }; break; }
  }

  // ── Location ──────────────────────────────────────────
  const hasLocation = LOCATION_KEYWORDS.some(k => lower.includes(k));

  // ── Strip modifiers to get clean product keywords ────
  let cleaned = lower
    .replace(/(?:near me|nearby|close by|paas|aas paas|local|around me|close to me|in my area)/gi, '')
    .replace(/(?:under|below|above|over|less than|more than)\s+(?:rs\.?|₹|inr)?\s*\d+/gi, '')
    .replace(/(?:rs\.?|₹|inr)\s*\d+\s*(?:se\s*kam|tak|max|only)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);

  // ── Synonym expansion ─────────────────────────────────
  const expandedTerms = new Set(words);
  words.forEach(w => {
    if (SYNONYM_MAP[w]) SYNONYM_MAP[w].forEach(s => expandedTerms.add(s));
  });

  // ── Category ──────────────────────────────────────────
  const category = _detectCategory(cleaned) || _detectCategory(query);

  return {
    keywords:      words,
    expandedTerms: [...expandedTerms],
    priceFilter,
    hasLocation,
    category,
    originalQuery: query,
    cleanedQuery:  cleaned,
  };
}

/**
 * Public normalized intent — shaped for the API response body.
 * { price, category, location }
 */
function _normalizeIntent(intent) {
  return {
    price:    intent.priceFilter
                ? { [intent.priceFilter.type === 'max' ? 'under' : 'over']: intent.priceFilter.value }
                : null,
    category: intent.category,
    location: intent.hasLocation ? 'nearby' : null,
    keywords: intent.keywords,
  };
}

/* ═══════════════════════════════════════════════════════════
   ENRICH QUERY  (new v3 — returns standardized search object)
   ═══════════════════════════════════════════════════════════ */

/**
 * Full query enrichment pipeline:
 *  1. Typo correction
 *  2. Intent detection
 *  3. Returns structured object matching API contract
 *
 * @param {string} rawQuery
 * @returns {{
 *   query:     string,
 *   corrected: string | null,
 *   intent:    { price, category, location, keywords },
 *   _internal: object   // full intent for ranking/suggestions
 * }}
 */
function enrichQuery(rawQuery = '') {
  // Static Hinglish translation first (zero latency, no AI call)
  const staticResult = translator.normalizeQuery(rawQuery);
  const baseQuery    = staticResult.needsAI ? rawQuery : staticResult.normalized;

  const corrected = correctTypos(baseQuery);
  const intent    = detectIntent(corrected);
  const changed   = corrected !== rawQuery.toLowerCase().trim() || staticResult.changed;

  return {
    query:        rawQuery,
    corrected:    changed ? corrected : null,
    translated:   staticResult.changed ? staticResult.normalized : null,
    language:     staticResult.language,
    intent:       _normalizeIntent(intent),
    results:      [],       // placeholder — caller populates from DB
    _internal:    intent,   // full internal intent for ranking & suggestions
  };
}

/* ═══════════════════════════════════════════════════════════
   AI SUGGESTIONS  (uses promptBuilder)
   ═══════════════════════════════════════════════════════════ */

async function getAISuggestions(partialQuery = '', userContext = {}) {
  const cKey = cache.cacheKey(
    'suggestions', partialQuery,
    userContext.city     || '',
    userContext.userId   || '',
    (userContext.topCategories || []).slice(0, 2).join('|')
  );
  const cached = await cache.get(cKey);
  if (cached) return cached;

  const staticSugs = _generateStaticSuggestions(partialQuery, userContext);

  if (!gemini.isAvailable() || partialQuery.trim().length < 3) {
    await cache.set(cKey, staticSugs, cache.TTL.SUGGESTIONS);
    return staticSugs;
  }

  const intent = detectIntent(partialQuery);
  const prompt = buildSearchPrompt(partialQuery, intent, {
    city:          userContext.city,
    recentSearches: userContext.recentSearches,
    topCategories:  userContext.topCategories,
    userId:         userContext.userId,
  });

  try {
    const parsed = await gemini.generateJSON(prompt, {
      model: 'flash', maxTokens: 220, temperature: 0.45,
    });
    const suggestions = Array.isArray(parsed) ? parsed.slice(0, 5).map(String) : staticSugs;
    await cache.set(cKey, suggestions, cache.TTL.SUGGESTIONS);
    return suggestions;
  } catch {
    await cache.set(cKey, staticSugs, 30);
    return staticSugs;
  }
}

function _generateStaticSuggestions(query = '', userContext = {}) {
  const q       = query.toLowerCase();
  const personal = [];

  if (userContext.topCategories?.includes('footwear'))    personal.push('sports shoes near me', 'sandals under ₹500');
  if (userContext.topCategories?.includes('clothing'))    personal.push('kurti for office wear', 'ethnic wear near me');
  if (userContext.topCategories?.includes('electronics')) personal.push('budget headphones under ₹500', 'mobile accessories');
  if (userContext.topCategories?.includes('grocery'))     personal.push('fresh vegetables near me', 'organic kirana store');

  const global = [
    'cheap shoes under ₹1000 near me', 'red lehenga for wedding nearby',
    'best mobile shop nearby',          'budget headphones under ₹500',
    'kurti for office wear',            'fresh vegetables near me',
    "men's jeans under ₹500",           'electronics repair shop nearby',
    'saree for festival',               'kids toys near me',
    'sports shoes for running',         'grocery store open now',
    'gold jewellery shop',              'pharmacy near me',
    'books and stationery shop',        'gym equipment home workout',
  ];

  const all = [...personal, ...global];
  const filtered = all.filter(s =>
    s.includes(q) || q.split(' ').some(w => w.length > 2 && s.includes(w))
  );
  return (filtered.length ? filtered : global).slice(0, 5);
}

/* ═══════════════════════════════════════════════════════════
   4-FACTOR SMART RANKING
   ═══════════════════════════════════════════════════════════ */

async function _scoreResultAsync(result, intent, userId = null) {
  const text = `${result.name || ''} ${result.description || ''} ${result.category || ''}`.toLowerCase();

  // Relevance
  let relevanceRaw = 0;
  intent.keywords.forEach(kw   => { if (text.includes(kw)) relevanceRaw += 10; });
  intent.expandedTerms.forEach(t => { if (text.includes(t)) relevanceRaw += 5; });

  // Hard price filter — discard non-matching
  if (intent.priceFilter && result.price != null) {
    if (intent.priceFilter.type === 'max' && result.price > intent.priceFilter.value)
      return { score: -1000, confidence: 0, breakdown: {} };
    if (intent.priceFilter.type === 'min' && result.price < intent.priceFilter.value)
      return { score: -500,  confidence: 0, breakdown: {} };
  }

  const relevance  = Math.min(1, relevanceRaw / 30);
  const distance   = result.distanceKm != null ? Math.max(0, 1 - result.distanceKm / 10) : 0.5;
  const popularity = result.rating
    ? Math.min(1, result.rating / 5)
    : (result.popularity || 0.5);

  // User preference score (async in v3)
  const userPref = userId ? await behavior.getUserPreferenceScore(userId, result) : 0;

  const score      = (relevance * 0.4) + (distance * 0.2) + (popularity * 0.2) + (userPref * 0.2);
  const confidence = Math.round(
    Math.min(0.99, relevance * 0.5 + popularity * 0.3 + (userPref > 0 ? 0.2 : 0.1)) * 100
  ) / 100;

  return { score, confidence, breakdown: { relevance, distance, popularity, userPref } };
}

/**
 * Rank an array of results against a parsed intent.
 * Synchronous wrapper that calls the async scorer sequentially.
 * (Kept sync-compatible via Promise.all for caller convenience)
 */
async function rankResultsAsync(results = [], intent, userId = null) {
  const scored = await Promise.all(
    results.map(async r => {
      const { score, confidence, breakdown } = await _scoreResultAsync(r, intent, userId);
      return { ...r, _score: score, confidence, _breakdown: breakdown };
    })
  );
  return scored.sort((a, b) => b._score - a._score);
}

/**
 * Synchronous fallback for callers that can't await (backward compat).
 * Does NOT apply async userPref score.
 */
function rankResults(results = [], intent, userId = null) {
  return results
    .map(r => {
      const text = `${r.name || ''} ${r.description || ''} ${r.category || ''}`.toLowerCase();
      let relevanceRaw = 0;
      intent.keywords.forEach(kw     => { if (text.includes(kw)) relevanceRaw += 10; });
      intent.expandedTerms.forEach(t => { if (text.includes(t)) relevanceRaw += 5; });

      if (intent.priceFilter && r.price != null) {
        if (intent.priceFilter.type === 'max' && r.price > intent.priceFilter.value) return { ...r, _score: -1000, confidence: 0 };
        if (intent.priceFilter.type === 'min' && r.price < intent.priceFilter.value) return { ...r, _score: -500,  confidence: 0 };
      }

      const relevance  = Math.min(1, relevanceRaw / 30);
      const distance   = r.distanceKm != null ? Math.max(0, 1 - r.distanceKm / 10) : 0.5;
      const popularity = r.rating ? Math.min(1, r.rating / 5) : (r.popularity || 0.5);
      const score      = (relevance * 0.4) + (distance * 0.2) + (popularity * 0.2);
      const confidence = Math.round(Math.min(0.99, relevance * 0.5 + popularity * 0.3 + 0.1) * 100) / 100;
      return { ...r, _score: score, confidence, _breakdown: { relevance, distance, popularity } };
    })
    .sort((a, b) => b._score - a._score);
}

/* ═══════════════════════════════════════════════════════════
   TRENDING SEARCHES
   ═══════════════════════════════════════════════════════════ */

const TRENDING_BY_CITY = {
  jaipur:  ['🔥 Rajasthani lehenga', '💍 Silver jewellery near me', '👟 Mojari footwear', '📱 Mobile shop Jaipur', '🧵 Block print fabric'],
  mumbai:  ['🔥 Street fashion tops', '☔ Monsoon raincoat',         '👔 Office formals',    '📱 Budget smartphone', '🥬 Organic vegetables'],
  delhi:   ['🔥 Winter jacket sale',  '👟 Sports shoes Delhi',       '💍 Bridal jewellery', '📱 Electronics accessories', '🥘 Spices masala'],
  default: ['🔥 Running shoes near me', '🛍️ Red lehenga for wedding', '📱 Best mobile shop nearby', '🎧 Budget headphones under ₹500', '👗 Kurti for office wear'],
};

function getTrendingSearches(city = '') {
  const key = (city || '').toLowerCase().replace(/\s+/g, '');
  return TRENDING_BY_CITY[key] || TRENDING_BY_CITY.default;
}

/* ═══════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════ */

module.exports = {
  // Core pipeline
  enrichQuery,           // NEW v3 — full enrichment returning standard shape
  detectIntent,          // intent parser (used by enrichQuery & routes)
  correctTypos,          // typo corrector
  // AI suggestions
  getAISuggestions,
  // Ranking
  rankResults,           // sync (backward compat)
  rankResultsAsync,      // async with userPref score
  // Trending
  getTrendingSearches,
  // Internal (exported for testing)
  _generateStaticSuggestions: _generateStaticSuggestions,
  _normalizeIntent,
  _detectCategory,
};
