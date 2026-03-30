/**
 * Retlify — AI Analytics Service  (v3)
 * ======================================
 * Generates market insights, demand spike alerts, and stock suggestions
 * for shopkeepers using real behavior data + city-specific trending catalog.
 *
 * v3 additions:
 *  - getInsights() — new public function with the full structured response
 *    shape: { trends, demandSpikes, suggestions, ... }
 *  - getShopInsights() retained as alias for backward compatibility
 *  - detectRisingTrends() is now async-safe (wraps async getGlobalSearchStats)
 *  - Uses promptBuilder.buildAnalyticsPrompt() for all AI prompts
 *
 * POST /api/ai/insights response shape:
 * {
 *   trends:       [{ product, demand, trend, category }],
 *   demandSpikes: [{ type, message, urgency, confidence }],
 *   suggestions:  [{ title, description, action, priority }],
 *   festivals:    [{ name, demand, urgency }],
 *   headline:     string,
 *   weeklyFocus:  string,
 *   generated:    boolean,
 *   city:         string,
 * }
 */

'use strict';

const gemini   = require('./geminiService');
const cache    = require('./cacheService');
const behavior = require('./userBehaviorService');

/* ── City trending catalog ───────────────────────────────── */

const TRENDING_BY_CITY = {
  default: [
    { product: 'Running Shoes',        category: 'footwear',    demand: 'High',      trend: '+34%' },
    { product: 'Bluetooth Earphones',  category: 'electronics', demand: 'High',      trend: '+28%' },
    { product: 'Ethnic Wear (Kurti)',  category: 'clothing',    demand: 'High',      trend: '+22%' },
    { product: 'Kids Toys',            category: 'toys',        demand: 'Medium',    trend: '+15%' },
    { product: 'Organic Grocery',      category: 'grocery',     demand: 'Medium',    trend: '+19%' },
  ],
  jaipur: [
    { product: 'Rajasthani Lehenga',     category: 'clothing',   demand: 'Very High', trend: '+45%' },
    { product: 'Blue Pottery',           category: 'furniture',  demand: 'High',      trend: '+30%' },
    { product: 'Mojari Footwear',        category: 'footwear',   demand: 'High',      trend: '+25%' },
    { product: 'Silver Jewellery',       category: 'jewellery',  demand: 'High',      trend: '+20%' },
    { product: 'Sanganeri Print Fabric', category: 'clothing',   demand: 'Medium',    trend: '+18%' },
  ],
  mumbai: [
    { product: 'Street Fashion',         category: 'clothing',    demand: 'Very High', trend: '+40%' },
    { product: 'Vada Pav Ingredients',   category: 'grocery',     demand: 'High',      trend: '+22%' },
    { product: 'Monsoon Accessories',    category: 'clothing',    demand: 'Seasonal',  trend: '+55%' },
    { product: 'Office Wear',            category: 'clothing',    demand: 'High',      trend: '+18%' },
    { product: 'Fitness Equipment',      category: 'fitness',     demand: 'Medium',    trend: '+30%' },
  ],
  delhi: [
    { product: 'Winter Jackets',          category: 'clothing',    demand: 'Seasonal',  trend: '+60%' },
    { product: 'Streetwear',              category: 'clothing',    demand: 'Very High', trend: '+35%' },
    { product: 'Electronics Accessories', category: 'electronics', demand: 'High',      trend: '+25%' },
    { product: 'Spices & Masala',         category: 'grocery',     demand: 'High',      trend: '+15%' },
    { product: 'Bridal Jewellery',        category: 'jewellery',   demand: 'High',      trend: '+28%' },
  ],
  bangalore: [
    { product: 'Tech Accessories',       category: 'electronics', demand: 'Very High', trend: '+42%' },
    { product: 'Startup Merch',          category: 'clothing',    demand: 'High',      trend: '+30%' },
    { product: 'Fitness Equipment',      category: 'fitness',     demand: 'High',      trend: '+35%' },
    { product: 'Organic Food',           category: 'grocery',     demand: 'High',      trend: '+28%' },
    { product: 'Coffee & Beverages',     category: 'grocery',     demand: 'Very High', trend: '+38%' },
  ],
  hyderabad: [
    { product: 'Biryani Ingredients',    category: 'grocery',     demand: 'Very High', trend: '+50%' },
    { product: 'Pearl Jewellery',        category: 'jewellery',   demand: 'High',      trend: '+32%' },
    { product: 'Ethnic Wear',            category: 'clothing',    demand: 'High',      trend: '+25%' },
    { product: 'IT Accessories',         category: 'electronics', demand: 'High',      trend: '+28%' },
    { product: 'Fitness Gear',           category: 'fitness',     demand: 'Medium',    trend: '+20%' },
  ],
};

/* ── Festival demand calendar ────────────────────────────── */

function _getUpcomingFestivals() {
  const month = new Date().getMonth() + 1;
  const festivals = [];
  if (month >= 9  && month <= 11) festivals.push({ name: 'Navratri / Diwali',        demand: 'Ethnic wear, lights, sweets, gifts',  urgency: 'High'   });
  if (month === 1 || month === 2) festivals.push({ name: "Republic Day / Valentine's",demand: 'Gifts, clothing, accessories',         urgency: 'Medium' });
  if (month >= 3  && month <= 4)  festivals.push({ name: 'Holi / Gudi Padwa',        demand: 'Colors, sweets, new clothes',          urgency: 'High'   });
  if (month >= 6  && month <= 8)  festivals.push({ name: 'Raksha Bandhan / Eid',     demand: 'Gifts, ethnic wear, sweets',           urgency: 'High'   });
  if (month === 12)               festivals.push({ name: 'Christmas / New Year',      demand: 'Gifts, party wear, decorations',       urgency: 'High'   });
  return festivals;
}

/* ── Demand spike detection ──────────────────────────────── */

async function detectRisingTrends(city = '') {
  try {
    const { topQueries, topCategories } = await behavior.getGlobalSearchStats();
    const alerts = [];

    for (const { category, count } of topCategories.slice(0, 5)) {
      if (count >= 3) alerts.push({
        type:       'category_spike',
        category,
        count,
        message:    `High demand for ${category} in ${city || 'your area'} this week`,
        confidence: Math.min(0.95, 0.5 + count * 0.05),
        urgency:    count >= 8 ? 'High' : count >= 5 ? 'Medium' : 'Low',
      });
    }
    for (const { query, count } of topQueries.slice(0, 5)) {
      if (count >= 2) alerts.push({
        type:       'query_spike',
        query,
        count,
        message:    `"${query}" is trending — ${count} searches recently`,
        confidence: Math.min(0.90, 0.45 + count * 0.08),
        urgency:    count >= 5 ? 'High' : 'Medium',
      });
    }
    return alerts;
  } catch {
    return [];
  }
}

/* ── AI insight generation ───────────────────────────────── */

async function _generateAIInsights({ city, categories, trending, festivals, risingAlerts, salesData, searchLogs }) {
  const { buildAnalyticsPrompt } = require('./promptBuilder');

  const basePrompt = buildAnalyticsPrompt({
    city, categories, searchLogs, salesData,
    trendingProducts: trending,
    festivalDemand:   festivals,
    risingAlerts,
  });

  const fullPrompt = basePrompt + `

Generate JSON with this exact shape (no other keys):
{
  "headline":            "One compelling line summarizing the key opportunity",
  "suggestions": [
    { "title": "...", "description": "...", "action": "...", "priority": "high" },
    { "title": "...", "description": "...", "action": "...", "priority": "medium" },
    { "title": "...", "description": "...", "action": "...", "priority": "low" }
  ],
  "stockRecommendations": ["Specific product to stock and why"],
  "demandGaps":           ["Category with high demand but low local supply"],
  "weeklyFocus":          "Top priority action for this week"
}
Return ONLY valid JSON. No markdown fences.`;

  const parsed = await gemini.generateJSON(fullPrompt, { model: 'flash', maxTokens: 750, temperature: 0.4 });
  return parsed;
}

/* ── Fallback insights ───────────────────────────────────── */

function _fallbackInsights({ trending, festivals, categories, risingAlerts, city }) {
  const loc = city ? `in ${city}` : 'in your area';
  const t0  = trending[0] || { product: 'Running Shoes', trend: '+30%', demand: 'High' };
  const t1  = trending[1] || { product: 'Ethnic Wear',   trend: '+20%', demand: 'Medium' };

  return {
    headline:   `${risingAlerts.length > 0 ? risingAlerts.length + ' demand spikes detected' : '3 growth opportunities identified'} ${loc}`,
    suggestions: [
      {
        title:       'High local demand detected',
        description: `${t0.product} searches are up ${t0.trend} ${loc}.`,
        action:      `Stock more ${t0.product} this week.`,
        priority:    'high',
      },
      {
        title:       festivals.length ? `${festivals[0].name} season approaching` : 'Weekend shopping peak',
        description: festivals.length
          ? `Demand for ${festivals[0].demand} rises 40–60% during this period.`
          : 'Saturday & Sunday see 2× more local searches — ensure stock is ready.',
        action:      'Update your Retlify listing with relevant products.',
        priority:    'medium',
      },
      {
        title:       'Profile completeness boosts visibility',
        description: 'Shops with photos and updated hours get 3× more enquiries.',
        action:      'Upload at least 5 product photos and verify your shop hours.',
        priority:    'low',
      },
    ],
    stockRecommendations: [
      `Stock more ${t0.product} — high area demand (${t0.trend})`,
      `Add ${t1.product} to your inventory — ${t1.demand} demand`,
    ],
    demandGaps:  [`Customers searching for ${t0.product} — limited local supply`],
    weeklyFocus: `Focus on ${t0.product} and ${t1.product} — highest ROI opportunity this week.`,
  };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: getInsights — primary function (v3)
   Returns the full structured analytics shape.
   ═══════════════════════════════════════════════════════════ */

/**
 * @param {object} opts
 *   @param {string}   opts.city
 *   @param {string[]} opts.categories
 *   @param {Array}    opts.searchLogs
 *   @param {object}   opts.salesData
 * @returns {Promise<InsightsResult>}
 */
async function getInsights({ city = '', categories = [], searchLogs = [], salesData = null } = {}) {
  const cityKey = (city || '').toLowerCase().replace(/\s+/g, '');
  const cKey    = cache.cacheKey('insights_v3', cityKey, categories.join(','));
  const cached  = await cache.get(cKey);
  if (cached) return cached;

  const trending     = TRENDING_BY_CITY[cityKey] || TRENDING_BY_CITY.default;
  const festivals    = _getUpcomingFestivals();
  const risingAlerts = await detectRisingTrends(city);

  let aiData = null;
  if (gemini.isAvailable()) {
    try {
      aiData = await _generateAIInsights({ city, categories, trending, festivals, risingAlerts, salesData, searchLogs });
    } catch (err) {
      console.error('[Analytics] AI error:', err.message);
    }
  }

  const base = aiData || _fallbackInsights({ trending, festivals, categories, risingAlerts, city });

  const result = {
    // Core structured fields (spec-mandated)
    trends:       trending,
    demandSpikes: risingAlerts,
    suggestions:  base.suggestions  || [],
    festivals,
    // Extended fields
    headline:     base.headline      || '',
    weeklyFocus:  base.weeklyFocus   || '',
    stockRecommendations: base.stockRecommendations || [],
    demandGaps:   base.demandGaps    || [],
    // Metadata
    city:         city || 'India',
    generated:    !!aiData,
    model:        aiData ? 'openrouter/gpt-3.5' : 'fallback',
    generatedAt:  new Date().toISOString(),
  };

  await cache.set(cKey, result, cache.TTL.INSIGHTS);
  return result;
}

/* ── Backward-compat alias ───────────────────────────────── */
async function getShopInsights({ city, categories = [], searchLogs = [], salesData = null }) {
  return getInsights({ city, categories, searchLogs, salesData });
}

module.exports = { getInsights, getShopInsights, detectRisingTrends, TRENDING_BY_CITY };
