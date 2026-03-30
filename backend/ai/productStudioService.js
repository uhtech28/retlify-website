/**
 * Retlify — Product Studio Service  (v3 — All-Free Edition)
 * ===========================================================
 * Orchestrates the full Product Studio pipeline:
 *   1. Generate product description (via OpenRouter/Gemini)
 *   2. Generate 4 product images (via Pollinations AI)
 *
 * Removed: HuggingFace safety classifier (replaced with simple regex-based check)
 * Removed: Replicate dependency
 *
 * Main export: runProductStudio(options) → Promise<StudioResult>
 */

'use strict';

const { generateProductDescription } = require('./descriptionService');
const { generateImages, generateEnhancedImages } = require('./imageGenerationService');

/* ═══════════════════════════════════════════════════════════
   LIGHTWEIGHT SAFETY FILTER (no external API needed)
   ═══════════════════════════════════════════════════════════ */

const BLOCKED_TERMS = new Set([
  'nude', 'naked', 'nsfw', 'explicit', 'sexual', 'erotic', 'porn',
  'topless', 'weapon', 'bomb', 'drug', 'illegal', 'violence',
]);

function isSafe(text = '') {
  const lower = text.toLowerCase();
  return ![...BLOCKED_TERMS].some(term => lower.includes(term));
}

/* ═══════════════════════════════════════════════════════════
   MAIN ORCHESTRATOR
   ═══════════════════════════════════════════════════════════ */

/**
 * Run the full Product Studio pipeline.
 *
 * @param {object} opts
 *   @param {Array}   opts.images          - Uploaded files (multer format, optional)
 *   @param {string}  opts.productName
 *   @param {string}  [opts.category]
 *   @param {string[]} [opts.features]
 *   @param {string}  [opts.language]       - 'en' | 'hi' | ...
 *   @param {boolean} [opts.generateImages] - false to skip image generation
 *   @param {string}  [opts.style]
 *   @param {string}  [opts.targetAudience]
 *
 * @returns {Promise<StudioResult>}
 */
async function runProductStudio(opts = {}) {
  const {
    images        = [],
    productName   = '',
    category      = '',
    features      = [],
    language      = 'en',
    generateImages: doGenerateImages = true,
    style         = '',
    targetAudience = '',
  } = opts;

  // ── Safety check ──────────────────────────────────────────
  if (!isSafe(productName) || features.some(f => !isSafe(f))) {
    return {
      success: false,
      safe:    false,
      error:   'Content rejected by safety filter',
    };
  }

  const hasUploadedImages = images.length > 0;
  const productData = { productName, category, style, targetAudience };

  try {
    // ── Run description + image generation in parallel ────────
    const [descResult, imageResult] = await Promise.all([
      // Text description (via existing descriptionService)
      generateProductDescription({ productName, category, features, language }).catch(err => {
        console.error('[ProductStudio] Description error:', err.message);
        return _fallbackDescription(productName, category, features);
      }),

      // Image generation (Pollinations AI)
      doGenerateImages
        ? (hasUploadedImages
            ? generateEnhancedImages(productData)
            : generateImages(productData)
          ).catch(err => {
            console.error('[ProductStudio] Image gen error:', err.message);
            return _fallbackImageResult(productData);
          })
        : Promise.resolve(null),
    ]);

    // ── Assemble response ─────────────────────────────────────
    const response = {
      success:      true,
      productName,
      category,
      language,
      // Text content
      title:         descResult.title        || productName,
      description:   descResult.description  || '',
      highlights:    descResult.highlights   || [],
      seoTags:       descResult.seoTags      || [],
      callToAction:  descResult.callToAction || 'Shop Now',
      marketingLine: descResult.marketingLine || descResult.callToAction || '',
      // Image content
      images:        imageResult?.images     || [],
      imagePrompts:  imageResult?.prompts    || {},
      imagesFromCache: imageResult?.fromCache || false,
      hasUploadedImages,
      generatedAt:   new Date().toISOString(),
    };

    return response;

  } catch (err) {
    console.error('[ProductStudio] Fatal error:', err.message);
    return {
      success:     false,
      error:       'Product Studio encountered an error',
      details:     err.message,
    };
  }
}

/* ═══════════════════════════════════════════════════════════
   FALLBACKS (ensure UI never breaks)
   ═══════════════════════════════════════════════════════════ */

function _fallbackDescription(productName, category, features) {
  return {
    title:        productName || 'Premium Product',
    description:  `Discover the ${productName} — a top-quality ${category || 'product'} designed to meet your needs with style and functionality.`,
    highlights:   features.slice(0, 3).length ? features.slice(0, 3) : ['Premium quality', 'Fast delivery', 'Best value'],
    seoTags:      [productName.toLowerCase(), category.toLowerCase(), 'buy online', 'best price', 'quality'].filter(Boolean),
    callToAction: 'Order Now — Fast Delivery Available',
    marketingLine: `The ${productName} you've been looking for.`,
  };
}

function _fallbackImageResult(productData) {
  const { _picsumUrl } = require('./imageGenerationService');
  const types = ['studio', 'lifestyle', 'model', 'editorial'];
  const labels = ['Studio Shot', 'Lifestyle Shot', 'Model Shot', 'Editorial Shot'];
  return {
    images: types.map((t, i) => ({
      url:    _picsumUrl(t, 0),
      source: 'picsum',
      type:   t,
      label:  labels[i],
    })),
    prompts:     {},
    fromCache:   false,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { runProductStudio };
