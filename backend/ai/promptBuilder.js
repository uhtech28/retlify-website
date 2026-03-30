/**
 * Retlify — AI Prompt Builder
 * ============================
 * Single source of truth for every prompt sent to the AI provider.
 * Centralising prompts here means:
 *  - One place to tune wording / add context without touching service files
 *  - Consistent structure across chat, search, and analytics features
 *  - Easy A/B testing by swapping a builder function
 *
 * All functions are pure (no I/O, no side effects) and return strings.
 *
 * Exported functions
 * ──────────────────
 *  buildChatPrompt(user, history, query)  → { systemPrompt, userPrompt, historyMessages }
 *  buildSearchPrompt(query, intent)       → string
 *  buildAnalyticsPrompt(data)             → string
 *  buildDescriptionPrompt(product)        → string   (bonus — keeps descriptions consistent)
 *
 * "user" shape expected by buildChatPrompt
 * ─────────────────────────────────────────
 * {
 *   userId:           string | null,
 *   mode:             'customer' | 'shopkeeper',
 *   location:         { city, lat, lng } | null,
 *   topCategories:    string[],          // from behavior profile
 *   recentSearches:   string[],          // last N searches
 *   recentActions:    Action[],          // last 5 raw actions from UserBehavior
 *   activityLevel:    'new' | 'light' | 'active',
 *   // shopkeeper-only
 *   shopName:         string | null,
 *   shopCategories:   string[],
 * }
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   SYSTEM PROMPTS
   ═══════════════════════════════════════════════════════════ */

const SYSTEM = {
  customer: `You are Retlify's AI shopping assistant for Indian customers.
Retlify connects local shopkeepers with nearby customers across India.

Your role:
- Help customers find products and shops nearby
- Answer questions about products, prices, and availability
- Give personalized recommendations based on the user's browsing history
- Understand Hinglish, Hindi, and English queries naturally

Personalization rules:
- Reference the user's recent searches and interests naturally when relevant
- Tailor suggestions to their top interest categories
- Mention their city to localize responses when it adds value

Response style:
- Warm, friendly, conversational
- Concise (2–4 sentences unless listing options)
- Use Indian currency (₹) for prices
- Add relevant emojis sparingly
- Always end with one actionable suggestion`,

  shopkeeper: `You are Retlify's AI business advisor for Indian shopkeepers.
Retlify helps local shops get discovered by nearby customers.

Your role:
- Analyze business performance and give actionable advice
- Suggest products to stock based on local demand trends
- Help optimize shop listings and product descriptions
- Give inventory and pricing recommendations for Indian markets

Response style:
- Professional but friendly; data-driven where possible
- Practical and actionable — shopkeepers are busy
- Always give 1–2 concrete next steps
- Be direct; avoid vague generalities`,
};

/* ═══════════════════════════════════════════════════════════
   INTERNAL HELPERS
   ═══════════════════════════════════════════════════════════ */

/**
 * Format the last N raw actions into a compact, readable list.
 * Keeps the prompt tight — AI doesn't need full action objects.
 */
function _formatRecentActions(actions = [], limit = 5) {
  if (!actions.length) return null;
  const recent = actions.slice(-limit).reverse(); // newest first
  const lines = recent.map(a => {
    const ts  = new Date(a.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    switch (a.type) {
      case 'search':        return `  • Searched "${a.data?.query || ''}" [${ts}]`;
      case 'click':         return `  • Clicked on "${a.data?.name || a.data?.productId || ''}" [${ts}]`;
      case 'view':          return `  • Viewed "${a.data?.name || ''}" for ${Math.round((a.data?.durationMs || 0) / 1000)}s [${ts}]`;
      case 'chatbot_query': return `  • Asked chatbot: "${(a.data?.query || '').slice(0, 60)}" [${ts}]`;
      case 'purchase':      return `  • Purchased "${a.data?.name || ''}" [${ts}]`;
      default:              return null;
    }
  }).filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

/**
 * Format the last N chat messages (excluding the current query)
 * into a short narrative so the AI sees conversational context.
 */
function _formatChatHistory(history = [], limit = 3) {
  if (!history.length) return null;
  const recent = history.slice(-(limit * 2)); // limit pairs
  return recent.map(m => {
    const role = m.role === 'assistant' ? 'Assistant' : 'User';
    return `  ${role}: ${(m.content || '').slice(0, 120)}`;
  }).join('\n');
}

/**
 * Build the "Current user context" block that is appended to system prompts.
 * Returns an empty string if there is nothing meaningful to add.
 */
function _buildContextBlock(user, historySnippet) {
  const parts = [];

  // Location
  const city = user?.location?.city;
  if (city) parts.push(`Location: ${city}`);

  // Mode-specific
  if (user?.mode === 'shopkeeper') {
    if (user.shopName)        parts.push(`Shop name: ${user.shopName}`);
    if (user.shopCategories?.length) parts.push(`Shop categories: ${user.shopCategories.join(', ')}`);
  } else {
    if (user?.topCategories?.length)  parts.push(`Top interests: ${user.topCategories.slice(0, 4).join(', ')}`);
    if (user?.recentSearches?.length) parts.push(`Recent searches: ${user.recentSearches.slice(0, 5).join(', ')}`);
    if (user?.activityLevel === 'new') parts.push('Note: New user — be welcoming and broad in suggestions.');
  }

  // Recent activity
  const actionsStr = _formatRecentActions(user?.recentActions, 5);
  if (actionsStr) parts.push(`Recent activity (newest first):\n${actionsStr}`);

  // Prior conversation
  if (historySnippet) parts.push(`Recent conversation:\n${historySnippet}`);

  if (!parts.length) return '';
  return '\n\n--- Current user context ---\n' + parts.join('\n');
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: buildChatPrompt
   ═══════════════════════════════════════════════════════════ */

/**
 * Build all prompt components for a chat turn.
 *
 * @param {object} user     - User profile (see header for shape)
 * @param {Array}  history  - Full message array [{role, content}, ...]
 * @param {string} query    - The current user message (last turn)
 * @returns {{
 *   systemPrompt:    string,   // full system instruction + context
 *   userPrompt:      string,   // the current query (unchanged)
 *   historyMessages: Array,    // prior turns in OpenAI format for generateText(history:)
 * }}
 */
function buildChatPrompt(user, history = [], query = '') {
  const mode = user?.mode === 'shopkeeper' ? 'shopkeeper' : 'customer';
  const base = SYSTEM[mode];

  // Use last 3 message pairs (6 messages) as in-context history for the AI provider
  const historyMessages = (history.slice(0, -1) || [])
    .slice(-6)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  // The last 3 messages as a readable snippet for the context block
  const historySnippet = _formatChatHistory(history.slice(0, -1), 3);

  const contextBlock = _buildContextBlock(user, historySnippet);
  const systemPrompt = base + contextBlock;

  return { systemPrompt, userPrompt: query, historyMessages };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: buildSearchPrompt
   ═══════════════════════════════════════════════════════════ */

/**
 * Build a prompt for AI-powered search suggestion generation.
 *
 * @param {string} query   - Partial or full search query
 * @param {object} intent  - Parsed intent from searchService.detectIntent()
 * @param {object} opts    - { city, recentSearches, topCategories, userId }
 * @returns {string}       - Complete prompt string ready for generateJSON()
 */
function buildSearchPrompt(query, intent = {}, opts = {}) {
  const city     = opts.city || 'India';
  const recent   = (opts.recentSearches || []).slice(0, 5);
  const topCats  = (opts.topCategories  || []).slice(0, 3);

  const intentParts = [];
  if (intent.priceFilter) {
    const dir = intent.priceFilter.type === 'max' ? 'under' : 'over';
    intentParts.push(`Price filter: ${dir} ₹${intent.priceFilter.value}`);
  }
  if (intent.hasLocation)   intentParts.push('Location intent: nearby / near me');
  if (intent.keywords?.length) intentParts.push(`Keywords: ${intent.keywords.join(', ')}`);

  const lines = [
    'You are a search suggestion engine for Retlify, an Indian local retail discovery platform.',
    'Generate exactly 5 search suggestions as a JSON array of strings.',
    'Rules:',
    '  - Each suggestion must be under 10 words',
    '  - Match the detected intent (price, location, category)',
    '  - Personalize using the user\'s interests when possible',
    '  - Mix Hinglish naturally where appropriate',
    '  - Return ONLY a JSON array — no markdown, no explanation',
    '',
    `Query: "${query}"`,
    `City:  ${city}`,
  ];

  if (intentParts.length) lines.push(`Detected intent:\n  ${intentParts.join('\n  ')}`);
  if (recent.length)      lines.push(`User's recent searches: ${recent.join(', ')}`);
  if (topCats.length)     lines.push(`User's top interests:   ${topCats.join(', ')}`);

  return lines.join('\n');
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: buildAnalyticsPrompt
   ═══════════════════════════════════════════════════════════ */

/**
 * Build a prompt for shopkeeper analytics / market insights.
 *
 * @param {object} data
 *   @param {string}   data.city
 *   @param {string[]} data.categories      - Shop's product categories
 *   @param {Array}    data.searchLogs      - Recent search query objects
 *   @param {object}   data.salesData       - Optional: { total, topProducts, growth }
 *   @param {Array}    data.trendingProducts - From CITY_TRENDING catalog
 *   @param {Array}    data.festivalDemand  - Upcoming festival demand signals
 *   @param {Array}    data.risingAlerts    - From detectRisingTrends()
 * @returns {string}
 */
function buildAnalyticsPrompt(data = {}) {
  const {
    city             = 'India',
    categories       = [],
    searchLogs       = [],
    salesData        = null,
    trendingProducts = [],
    festivalDemand   = [],
    risingAlerts     = [],
  } = data;

  const lines = [
    'You are Retlify\'s AI business analyst for Indian shopkeepers.',
    'Provide 3 actionable market insights based on the data below.',
    'Format: JSON with shape { insights: [{ title, description, action, priority }] }',
    'Priority values: "high" | "medium" | "low".',
    'Keep each insight under 60 words. Be specific to the city and categories.',
    'Return ONLY valid JSON — no markdown fences.',
    '',
    `City:       ${city}`,
    `Categories: ${categories.join(', ') || 'General'}`,
  ];

  if (trendingProducts.length) {
    lines.push('');
    lines.push('Trending in this city:');
    trendingProducts.slice(0, 5).forEach(p =>
      lines.push(`  • ${p.product || p.name}: demand ${p.demand || ''}, trend ${p.trend || ''}`)
    );
  }

  if (festivalDemand.length) {
    lines.push('');
    lines.push('Upcoming festival demand:');
    festivalDemand.forEach(f =>
      lines.push(`  • ${f.name}: ${f.demand} (urgency: ${f.urgency})`)
    );
  }

  if (risingAlerts.length) {
    lines.push('');
    lines.push('Real-time search spikes:');
    risingAlerts.slice(0, 3).forEach(a =>
      lines.push(`  • ${a.category}: ${a.count} searches — ${a.message}`)
    );
  }

  if (searchLogs.length) {
    const topQueries = searchLogs.slice(0, 5).map(s => s.query || s).join(', ');
    lines.push('');
    lines.push(`Recent top searches: ${topQueries}`);
  }

  if (salesData) {
    lines.push('');
    if (salesData.total != null) lines.push(`Sales total: ₹${salesData.total}`);
    if (salesData.growth != null) lines.push(`Growth: ${salesData.growth}`);
    if (salesData.topProducts?.length) lines.push(`Top products: ${salesData.topProducts.join(', ')}`);
  }

  return lines.join('\n');
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: buildDescriptionPrompt (bonus)
   ═══════════════════════════════════════════════════════════ */

/**
 * Build a prompt for AI product description generation.
 *
 * @param {object} product
 *   @param {string}   product.productName
 *   @param {string}   product.category
 *   @param {string[]} product.features
 *   @param {string}   product.language    'en' | 'hi' | ...
 * @returns {string}
 */
function buildDescriptionPrompt(product = {}) {
  const { productName = '', category = '', features = [], language = 'en' } = product;
  const featureList = features.length ? features.map(f => `  - ${f}`).join('\n') : '  (none provided)';
  const langNote    = language !== 'en'
    ? `Write the description in ${language} with natural phrasing for Indian customers.`
    : 'Write in clear, engaging English suitable for Indian customers.';

  return [
    'You are a product copywriter for Retlify, an Indian local retail platform.',
    'Generate a product listing as JSON with shape:',
    '{ title, description, highlights: string[], seoTags: string[], callToAction }',
    'Rules:',
    '  - title: compelling, under 12 words',
    '  - description: 2–3 sentences, benefit-focused',
    '  - highlights: 3 bullet points, each under 10 words',
    '  - seoTags: 5 lowercase keywords',
    '  - callToAction: one short sentence',
    langNote,
    'Return ONLY valid JSON — no markdown.',
    '',
    `Product name: ${productName}`,
    `Category:     ${category}`,
    `Features:\n${featureList}`,
  ].join('\n');
}

/* ═══════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════ */

module.exports = {
  buildChatPrompt,
  buildSearchPrompt,
  buildAnalyticsPrompt,
  buildDescriptionPrompt,
  // expose internals for testing
  _formatRecentActions,
  _formatChatHistory,
  _buildContextBlock,
};
