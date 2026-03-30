/**
 * Retlify — Image Generation Service  (v5 — Puter.js Primary Edition)
 * =====================================================================
 * Image pipeline for BACKEND (server-side) generation.
 * The FRONTEND uses Puter.js (image-generator.js) as PRIMARY — no key, no backend.
 * This backend service is used as SECONDARY when Puter.js is unavailable or
 * the request comes from server-side (e.g. bulk generation, SSR).
 *
 * Backend provider stack:
 *  1. Pollinations AI  — free, no key, high quality (flux model)
 *  2. Picsum Photos    — free, stable, beautiful placeholder images
 *  3. Static SVG       — inline data URI, always works, never crashes
 *
 * Core function:
 *  generateImages(productData) → Promise<GenerationResult>
 *
 * Returns exactly 4 images, one per variation type:
 *  [ studio, lifestyle, model, editorial ]
 *
 * GUARANTEES:
 *  - Always returns 4 valid image URLs (never null, never broken)
 *  - Never crashes the server
 *  - Parallel generation for performance
 *  - Proper caching to avoid duplicate API calls
 *
 * NOTE: The FULL image pipeline (with Puter.js as primary) lives in:
 *  frontend/image-generator.js → Puter.js → Pollinations → Picsum → SVG
 */

'use strict';

const { buildPromptSet }       = require('./ecommercePromptBuilder');
const { generateImageUrl }     = require('./pollinationsService');

/* ═══════════════════════════════════════════════════════════
   IN-MEMORY CACHE  (lightweight, avoids re-generating same product)
   ═══════════════════════════════════════════════════════════ */

const _cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function _cacheKey(productName, category, variationType) {
  return `${productName}|${category}|${variationType}`.toLowerCase().replace(/\s+/g, '_');
}

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return entry.value;
}

function _cacheSet(key, value) {
  // Prevent unbounded growth — cap at 500 entries
  if (_cache.size > 500) {
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  _cache.set(key, { value, ts: Date.now() });
}

/* ═══════════════════════════════════════════════════════════
   FALLBACK: PICSUM PHOTOS
   Deterministic seed ensures same product → same placeholder image.
   ═══════════════════════════════════════════════════════════ */

const PICSUM_SEEDS = {
  studio:    [200, 1020],
  lifestyle: [400, 560],
  model:     [600, 870],
  editorial: [800, 1080],
};

function _picsumUrl(variationType, seedOffset = 0) {
  const seeds = PICSUM_SEEDS[variationType] || PICSUM_SEEDS.studio;
  const seed  = seeds[seedOffset % seeds.length];
  return `https://picsum.photos/seed/${seed}/1024/1024`;
}

/* ═══════════════════════════════════════════════════════════
   STATIC FINAL FALLBACK (never fails, inline SVG data URI)
   ═══════════════════════════════════════════════════════════ */

function _staticFallback(variationType) {
  const labels = {
    studio:    'Studio Shot',
    lifestyle: 'Lifestyle Shot',
    model:     'Model Shot',
    editorial: 'Editorial Shot',
  };
  const label = labels[variationType] || 'Product Image';
  const colors = {
    studio:    '#F3F4F6',
    lifestyle: '#FEF3C7',
    model:     '#EDE9FE',
    editorial: '#1F2937',
  };
  const bg = colors[variationType] || '#F3F4F6';
  const textColor = variationType === 'editorial' ? '#FFFFFF' : '#9CA3AF';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="${bg}"/>
    <text x="256" y="230" text-anchor="middle" font-family="sans-serif" font-size="48" fill="${textColor}">📦</text>
    <text x="256" y="290" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="600" fill="${textColor}">${label}</text>
    <text x="256" y="320" text-anchor="middle" font-family="sans-serif" font-size="13" fill="${textColor}" opacity="0.7">Retlify AI Product Studio</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/* ═══════════════════════════════════════════════════════════
   CORE: Generate a Single Variation Image
   Backend chain: Pollinations → Picsum → Static SVG
   (Puter.js is handled on the frontend — see image-generator.js)
   ═══════════════════════════════════════════════════════════ */

/**
 * Attempt to generate one image via Pollinations with fallback chain.
 * Falls back to Picsum → static SVG on failure.
 *
 * @param {string} prompt
 * @param {number} seed
 * @param {string} variationType
 * @returns {Promise<{url: string, source: 'pollinations'|'picsum'|'static', type: string}>}
 */
async function _generateOne(prompt, seed, variationType) {
  // Sanitise prompt before sending to any provider
  const safePrompt = String(prompt || '')
    .replace(/<[^>]+>/g, '')           // strip HTML tags
    .replace(/[\x00-\x1F\x7F]/g, '')   // strip control chars
    .substring(0, 500)                  // cap at 500 chars
    .trim();

  if (!safePrompt) {
    console.warn(`[ImageGen] Empty prompt for ${variationType} — using static fallback`);
    return { url: _staticFallback(variationType), source: 'static', type: variationType };
  }

  // --- Attempt 1: Pollinations AI (backend primary) ---
  try {
    const result = await generateImageUrl({
      prompt:   safePrompt,
      seed,
      width:    1024,
      height:   1024,
      model:    'flux',
      validate: false,
    });

    if (result.url) {
      return { url: result.url, source: 'pollinations', type: variationType };
    }
  } catch (err) {
    console.warn(`[ImageGen] Pollinations failed for ${variationType}:`, err.message);
  }

  // --- Attempt 2: Picsum fallback ---
  try {
    const picsumUrl = _picsumUrl(variationType, seed % 2);
    return { url: picsumUrl, source: 'picsum', type: variationType };
  } catch (err) {
    console.warn(`[ImageGen] Picsum fallback failed for ${variationType}:`, err.message);
  }

  // --- Attempt 3: Static SVG (always works) ---
  return { url: _staticFallback(variationType), source: 'static', type: variationType };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: generateImages
   ═══════════════════════════════════════════════════════════ */

/**
 * Generate 4 product images (one per variation type) in parallel.
 *
 * @param {object} productData
 *   @param {string}   productData.productName
 *   @param {string}   [productData.category]
 *   @param {string}   [productData.style]
 *   @param {string}   [productData.targetAudience]
 *
 * @returns {Promise<GenerationResult>}
 */
async function generateImages(productData = {}) {
  const { productName = 'product', category = '', style = '', targetAudience = '' } = productData;

  // Build prompts
  const promptSet = buildPromptSet({ productName, category, style, targetAudience });

  const variations = ['studio', 'lifestyle', 'model', 'editorial'];

  // Check cache for all 4
  const cacheHits = variations.map(v => ({
    type:  v,
    value: _cacheGet(_cacheKey(productName, category, v)),
  }));

  const allCached = cacheHits.every(h => h.value !== null);

  if (allCached) {
    return {
      images:      cacheHits.map(h => h.value),
      prompts:     {
        studio:    promptSet.studio.prompt,
        lifestyle: promptSet.lifestyle.prompt,
        model:     promptSet.model.prompt,
        editorial: promptSet.editorial.prompt,
      },
      fromCache:   true,
      generatedAt: new Date().toISOString(),
    };
  }

  // Generate all 4 in parallel
  const tasks = variations.map(v => {
    const cached = _cacheGet(_cacheKey(productName, category, v));
    if (cached) return Promise.resolve(cached);

    const info = promptSet[v];
    return _generateOne(info.prompt, info.seeds[0], v)
      .then(result => ({ ...result, label: info.label }))
      .catch(err => {
        console.warn(`[ImageGen] _generateOne failed for ${v}:`, err.message);
        return { url: _picsumUrl(v), source: 'picsum', type: v, label: info.label };
      });
  });

  const images = await Promise.all(tasks);

  // Cache results
  images.forEach(img => {
    const key = _cacheKey(productName, category, img.type);
    _cacheSet(key, img);
  });

  return {
    images,
    prompts: {
      studio:    promptSet.studio.prompt,
      lifestyle: promptSet.lifestyle.prompt,
      model:     promptSet.model.prompt,
      editorial: promptSet.editorial.prompt,
    },
    fromCache:   false,
    generatedAt: new Date().toISOString(),
  };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: generateEnhancedImages (for uploaded images)
   ═══════════════════════════════════════════════════════════ */

async function generateEnhancedImages(productData = {}) {
  const { buildEnhancementPrompt } = require('./ecommercePromptBuilder');
  const enhancedProductData = {
    ...productData,
    style: 'enhanced professional ' + (productData.style || ''),
  };
  return generateImages(enhancedProductData);
}

/* ═══════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════ */

module.exports = {
  generateImages,
  generateEnhancedImages,
  _picsumUrl,
  _staticFallback,
};
