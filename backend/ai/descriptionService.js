/**
 * Retlify — AI Product Description Generator  (v3)
 * ==================================================
 * Generates SEO-optimized product descriptions for shopkeepers.
 *
 * Response shape (v3 — matches API spec):
 * {
 *   title:       string,   // compelling headline, max 60 chars
 *   description: string,   // 2–3 sentence benefit-focused copy
 *   highlights:  string[], // 3–4 short bullet points
 *   tags:        string[], // 5 lowercase SEO keywords
 *   generated:   boolean,
 *   model:       string,
 * }
 *
 * Note: "tags" is the canonical field (spec). "seoTags" is also included
 * as an alias for backward compatibility with any v2 callers.
 *
 * Uses promptBuilder.buildDescriptionPrompt() for consistent prompt structure.
 * Falls back to template-based generation if AI is unavailable.
 */

'use strict';

const gemini = require('./geminiService');
const cache  = require('./cacheService');
const { buildDescriptionPrompt } = require('./promptBuilder');
const translator = require('../utils/translator');

/* ── Normalize AI response to canonical shape ────────────── */

function _normalize(parsed, fallback = false) {
  // Resolve either "tags" or "seoTags" from the AI response
  const tags = Array.isArray(parsed.tags)    ? parsed.tags
             : Array.isArray(parsed.seoTags) ? parsed.seoTags
             : [];

  return {
    title:       parsed.title       || '',
    description: parsed.description || '',
    highlights:  Array.isArray(parsed.highlights) ? parsed.highlights : [],
    tags,
    // Backward-compat alias
    seoTags:     tags,
    callToAction: parsed.callToAction || 'Visit our shop today!',
    generated:   !fallback,
    model:       fallback ? 'fallback' : 'openrouter/gpt-3.5',
  };
}

/* ── Main generator ──────────────────────────────────────── */

/**
 * @param {object} opts
 *   @param {string}   opts.productName
 *   @param {string}   opts.category
 *   @param {string[]} opts.features
 *   @param {string}   opts.language   'en' | 'hi' | 'hinglish' | ...
 * @returns {Promise<DescriptionResult>}
 */
async function generateProductDescription({ productName, category, features = [], language = 'en' }) {
  if (!productName || !category) {
    return _normalize(_getFallbackData({ productName: productName || 'Product', category: category || 'item', features }), true);
  }

  // Translate product name if Hinglish/Hindi (ensures English prompt)
  const nameNorm = translator.normalizeQuery(productName);
  const catNorm  = translator.normalizeQuery(category);
  const normalizedName     = nameNorm.changed ? nameNorm.normalized : productName;
  const normalizedCategory = catNorm.changed  ? catNorm.normalized  : category;

  const cKey = cache.cacheKey('desc_v3', normalizedName, normalizedCategory, language);
  const cached = await cache.get(cKey);
  if (cached) return cached;

  if (!gemini.isAvailable()) {
    const fb = _normalize(_getFallbackData({ productName: normalizedName, category: normalizedCategory, features }), true);
    return fb;
  }

  const prompt = buildDescriptionPrompt({
    productName: normalizedName,
    category:    normalizedCategory,
    features,
    language,
  });

  try {
    const parsed = await gemini.generateJSON(prompt, { model: 'flash', maxTokens: 550, temperature: 0.55 });
    const result = _normalize(parsed);
    await cache.set(cKey, result, cache.TTL.DESCRIPTION);
    return result;
  } catch (err) {
    console.error('[Description] AI error:', err.message);
    const fb = _normalize(_getFallbackData({ productName: normalizedName, category: normalizedCategory, features }), true);
    await cache.set(cKey, fb, 120); // short cache for fallbacks
    return fb;
  }
}

/* ── Template fallback ───────────────────────────────────── */

function _getFallbackData({ productName, category, features }) {
  const name = productName || 'Product';
  const cat  = category    || 'item';

  const featureHighlights = features.length
    ? features.slice(0, 2).map(f => `${f}`)
    : [`Genuine ${name}`, 'Best price guaranteed'];

  return {
    title:       `${name} — Premium ${cat} at Best Price`,
    description: `Discover our high-quality ${name.toLowerCase()} perfect for everyday use. `
               + `Sourced from trusted suppliers, this ${cat.toLowerCase()} offers great value for money. `
               + `Available for immediate pickup at our local store — contact us via WhatsApp for quick orders.`,
    highlights: [
      ...featureHighlights,
      'Available for immediate pickup',
      'Trusted local seller with genuine products',
    ].slice(0, 4),
    tags:        [name.toLowerCase(), cat.toLowerCase(), 'local shop', 'best price', 'buy near me'],
    seoTags:     [name.toLowerCase(), cat.toLowerCase(), 'local shop', 'best price', 'buy near me'],
    callToAction: 'Visit our shop or WhatsApp us for the best deal!',
  };
}

module.exports = { generateProductDescription };
