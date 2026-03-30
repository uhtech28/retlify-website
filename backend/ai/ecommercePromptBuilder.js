/**
 * Retlify — Ecommerce Prompt Builder
 * =====================================
 * Builds highly specific, quality-optimized prompts for 4 image variation types.
 * Pure functions. No I/O. Fully testable.
 *
 * Variation types:
 *  1. STUDIO   — clean white background, product-only
 *  2. LIFESTYLE — product in a natural real-world setting
 *  3. MODEL    — model/person wearing or using the product
 *  4. EDITORIAL — premium brand/magazine style shot
 *
 * Exported:
 *  buildPromptSet(productData) → { studio, lifestyle, model, editorial }
 *  buildPrompt(productData, variationType) → string
 *  buildNegativePrompt() → string
 *  buildEnhancementPrompt(productData) → string  (for uploaded image enhancement)
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   CATEGORY INTELLIGENCE
   ═══════════════════════════════════════════════════════════ */

const CATEGORY_CONTEXT = {
  fashion:     { material: 'premium fabric', setting: 'fashion district', model: 'professional fashion model', color: 'vibrant' },
  electronics: { material: 'sleek plastic and metal', setting: 'modern minimalist desk', model: 'tech professional', color: 'clean' },
  food:        { material: 'fresh ingredients', setting: 'rustic wooden table', model: 'hands holding', color: 'warm and appetizing' },
  furniture:   { material: 'high-quality wood and fabric', setting: 'modern living room', model: 'lifestyle person relaxing', color: 'warm neutral' },
  jewellery:   { material: 'precious metal and gemstones', setting: 'luxury display case', model: 'elegant model wearing', color: 'brilliant sparkle' },
  beauty:      { material: 'glass and premium packaging', setting: 'marble bathroom counter', model: 'beauty model', color: 'soft and glowing' },
  footwear:    { material: 'leather and rubber', setting: 'clean studio floor', model: 'lifestyle model wearing', color: 'bold' },
  bags:        { material: 'leather or canvas', setting: 'urban café backdrop', model: 'fashion-forward person carrying', color: 'rich' },
  sports:      { material: 'technical performance fabric', setting: 'gym or outdoor field', model: 'athletic person using', color: 'dynamic energy' },
  toys:        { material: 'colorful plastic and fabric', setting: 'bright playroom', model: 'happy child playing', color: 'bright and playful' },
  books:       { material: 'paper and hardcover', setting: 'cozy reading nook', model: 'person reading', color: 'warm library tones' },
  kitchen:     { material: 'stainless steel or ceramic', setting: 'modern kitchen counter', model: 'home cook using', color: 'clean and bright' },
  default:     { material: 'premium quality material', setting: 'modern interior', model: 'person using', color: 'neutral and professional' },
};

const QUALITY_SUFFIX = 'photorealistic, 8K resolution, professional photography, sharp focus, high detail, award-winning product photography';
const NEGATIVE_SUFFIX = 'text, watermark, logo, blur, noise, pixelated, distorted, deformed, disfigured, bad anatomy, extra limbs, extra fingers, missing fingers, duplicate, ugly, bad quality, low resolution, overexposed, underexposed, cartoon, illustration, painting, drawing, animation, CGI, 3D render, sketch, draft';

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function _getContext(category) {
  if (!category) return CATEGORY_CONTEXT.default;
  const key = category.toLowerCase().trim();
  // fuzzy match
  for (const [k, v] of Object.entries(CATEGORY_CONTEXT)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return CATEGORY_CONTEXT.default;
}

function _buildBase(productName, category) {
  const ctx = _getContext(category);
  return { ctx, base: `${productName}` };
}

function _optional(value, prefix = '', suffix = '') {
  return value ? `${prefix}${value}${suffix}` : '';
}

/* ═══════════════════════════════════════════════════════════
   VARIATION BUILDERS
   ═══════════════════════════════════════════════════════════ */

/**
 * VARIATION 1: Studio shot — clean, white background, product-only
 * Best for product listing thumbnails, Amazon/Flipkart style.
 */
function _buildStudioPrompt(productName, category, style) {
  const { ctx } = _buildBase(productName, category);
  const styleHint = style ? `, ${style} style` : '';
  return [
    `${productName}, ${ctx.material}`,
    `ecommerce product photography, pure white background, studio lighting`,
    `centered composition, front view, clean edges`,
    `${ctx.color} colors${styleHint}`,
    `professional product shot, catalog quality`,
    QUALITY_SUFFIX,
  ].join(', ');
}

/**
 * VARIATION 2: Lifestyle shot — product in real-world context
 * Shows the product being used, adds aspiration and context.
 */
function _buildLifestylePrompt(productName, category, targetAudience) {
  const { ctx } = _buildBase(productName, category);
  const audienceHint = targetAudience ? `, perfect for ${targetAudience}` : '';
  return [
    `${productName} in a ${ctx.setting}`,
    `lifestyle product photography, ambient natural light`,
    `${ctx.color} color palette, editorial composition`,
    `everyday life context, aspirational scene${audienceHint}`,
    `depth of field bokeh background, warm atmosphere`,
    QUALITY_SUFFIX,
  ].join(', ');
}

/**
 * VARIATION 3: Model shot — person wearing/using the product
 * Humanises the product, shows scale and fit.
 */
function _buildModelPrompt(productName, category, targetAudience) {
  const { ctx } = _buildBase(productName, category);
  const audienceHint = targetAudience ? `${targetAudience} demographic, ` : '';
  return [
    `${ctx.model} with ${productName}`,
    `${audienceHint}fashion editorial photography`,
    `natural confident pose, authentic expression`,
    `professional lighting, shallow depth of field`,
    `${ctx.setting} backdrop, lifestyle brand aesthetic`,
    QUALITY_SUFFIX,
  ].join(', ');
}

/**
 * VARIATION 4: Editorial / Premium brand shot
 * Magazine-quality, aspirational, high-end brand feel.
 */
function _buildEditorialPrompt(productName, category, style) {
  const { ctx } = _buildBase(productName, category);
  const styleHint = style ? `${style} aesthetic, ` : '';
  return [
    `${productName}, luxury premium product`,
    `${styleHint}high-end brand photography`,
    `dramatic moody lighting, editorial magazine spread`,
    `sophisticated ${ctx.color} color grading`,
    `premium packaging detail shot, luxury brand visual identity`,
    `Vogue magazine style, aspirational, cinematic composition`,
    QUALITY_SUFFIX,
  ].join(', ');
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════ */

/**
 * Build the complete set of 4 prompts for product studio generation.
 *
 * @param {object} productData
 *   @param {string}   productData.productName
 *   @param {string}   [productData.category]
 *   @param {string}   [productData.style]         - e.g. 'minimalist', 'bold', 'vintage'
 *   @param {string}   [productData.targetAudience] - e.g. 'young professionals', 'women 25-40'
 *
 * @returns {{
 *   studio:    { prompt: string, type: 'studio',    seeds: number[] },
 *   lifestyle: { prompt: string, type: 'lifestyle', seeds: number[] },
 *   model:     { prompt: string, type: 'model',     seeds: number[] },
 *   editorial: { prompt: string, type: 'editorial', seeds: number[] },
 *   negative:  string,
 * }}
 */
function buildPromptSet(productData = {}) {
  const {
    productName    = 'product',
    category       = '',
    style          = '',
    targetAudience = '',
  } = productData;

  const name = productName.trim() || 'product';

  return {
    studio: {
      prompt: _buildStudioPrompt(name, category, style),
      type:   'studio',
      label:  'Studio Shot',
      seeds:  [101],
    },
    lifestyle: {
      prompt: _buildLifestylePrompt(name, category, targetAudience),
      type:   'lifestyle',
      label:  'Lifestyle Shot',
      seeds:  [202],
    },
    model: {
      prompt: _buildModelPrompt(name, category, targetAudience),
      type:   'model',
      label:  'Model Shot',
      seeds:  [303],
    },
    editorial: {
      prompt: _buildEditorialPrompt(name, category, style),
      type:   'editorial',
      label:  'Editorial Shot',
      seeds:  [404],
    },
    negative: buildNegativePrompt(),
  };
}

/**
 * Build a single prompt for a specific variation type.
 *
 * @param {object} productData
 * @param {'studio'|'lifestyle'|'model'|'editorial'} variationType
 * @returns {string}
 */
function buildPrompt(productData = {}, variationType = 'studio') {
  const set = buildPromptSet(productData);
  return set[variationType]?.prompt || set.studio.prompt;
}

/**
 * Get the universal negative prompt.
 * @returns {string}
 */
function buildNegativePrompt() {
  return NEGATIVE_SUFFIX;
}

/**
 * Build an "AI Enhancement" prompt for an uploaded image.
 * Used when the user uploads their own photo and wants AI-enhanced versions.
 *
 * @param {object} productData
 * @returns {string}
 */
function buildEnhancementPrompt(productData = {}) {
  const { productName = 'product', category = '' } = productData;
  const ctx = _getContext(category);
  return [
    `enhanced professional ecommerce photograph of ${productName}`,
    `improved studio lighting, clean background removal`,
    `color correction, sharpened details, professional retouching`,
    `${ctx.color} color grading, commercial photography quality`,
    `Amazon listing style, premium product photography`,
    QUALITY_SUFFIX,
  ].join(', ');
}

module.exports = {
  buildPromptSet,
  buildPrompt,
  buildNegativePrompt,
  buildEnhancementPrompt,
};
