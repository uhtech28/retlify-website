/**
 * Retlify — AI Image Prompt Builder
 * ====================================
 * Generates high-quality prompts for AI image generation (Replicate/Stability AI)
 * based on analyzed product attributes.
 *
 * Two prompt types:
 *  A. Product Photo  — clean, white-background, e-commerce style
 *  B. Model Photo    — realistic human model wearing the product, Zara style
 *
 * Exported functions
 * ──────────────────
 *  buildProductPhotoPrompt(analysis, opts)  → { prompt, negativePrompt }
 *  buildModelPhotoPrompt(analysis, opts)    → { prompt, negativePrompt }
 *  buildAllPrompts(analysis, opts)          → { productShots, modelShots }
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   STYLE DESCRIPTORS
   ═══════════════════════════════════════════════════════════ */

// Category-specific photography notes
const CATEGORY_PHOTO_STYLE = {
  't-shirt':    'flat lay or hanging, front face showing print clearly',
  'shirt':      'on hanger or flat lay, collar open, crisply pressed',
  'jeans':      'flat lay on white, folded or full length, showing texture',
  'dress':      'on dress form or flat lay, full length visible',
  'kurti':      'flat lay, full garment visible, ethnic styling',
  'lehenga':    'spread out or on form, showing embroidery detail',
  'saree':      'draped or spread flat, showing border and pallu detail',
  'jacket':     'front-facing, on hanger, showing structure',
  'hoodie':     'flat lay, hood arranged neatly',
  'shoes':      'side profile 45-degree angle, single or pair, on white surface',
  'sneakers':   'side profile, clean white background, showing sole edge',
  'sandals':    'top-down and side view, showing strap detail',
  'boots':      'standing pair, side angle, showing full height',
  'bag':        '3/4 angle showing handles and main compartment',
  'watch':      'dial facing, slight angle, clean surface reflection',
  'jewellery':  'close-up macro, showing detail and sparkle',
  'phone':      'screen facing, slight tilt, showing all sides',
  'headphones': 'flat lay or floating, showing ear cup and band',
  'electronics':'clean front-facing, cables neatly arranged if any',
  'general':    'front-facing, clean presentation',
};

// Model pose descriptions for model shots
const MODEL_POSES = {
  front:     'standing facing camera, confident posture, hands relaxed at sides',
  side:      'three-quarter turn, looking slightly off-camera, natural stance',
  lifestyle: 'candid walking pose, slight movement, natural expression',
};

// Model descriptors (diverse, realistic, Indian market context)
const MODEL_DESCRIPTORS = {
  women: [
    'Indian woman, 25 years old, natural features, warm skin tone',
    'South Asian woman, 28 years old, elegant, natural makeup',
    'Indian woman model, 24 years old, contemporary, city lifestyle',
  ],
  men: [
    'Indian man, 27 years old, athletic build, natural features',
    'South Asian man, 30 years old, confident, professional look',
    'Indian male model, 26 years old, contemporary urban style',
  ],
  unisex: [
    'Indian person, 25 years old, natural features, modern style',
  ],
  kids: [
    'Indian child, 8 years old, happy, natural look',
  ],
};

// Style-to-photography-environment mapping
const STYLE_ENVIRONMENT = {
  ethnic:   'soft warm studio lighting, cream/ivory background, golden hour feel',
  formal:   'clean white studio background, crisp professional lighting, minimalist',
  sporty:   'bright white background, high-key lighting, clean athletic aesthetic',
  casual:   'soft white background, natural diffused lighting, lifestyle feel',
  luxury:   'premium studio setup, dramatic side lighting, dark grey or white background',
  party:    'soft studio background, glamour lighting, slight sparkle effect',
};

/* ═══════════════════════════════════════════════════════════
   UNIVERSAL NEGATIVE PROMPT
   (prevents common AI generation artifacts)
   ═══════════════════════════════════════════════════════════ */

const BASE_NEGATIVE = [
  'blurry', 'low quality', 'bad anatomy', 'distorted', 'watermark',
  'text', 'logo', 'signature', 'frame', 'border', 'extra limbs',
  'deformed', 'ugly', 'pixelated', 'oversaturated', 'underexposed',
  'noise', 'grain', 'artifacts', 'jpeg artifacts', 'compression',
].join(', ');

const MODEL_NEGATIVE = [
  BASE_NEGATIVE,
  'nsfw', 'nude', 'revealing', 'inappropriate', 'explicit',
  'extra fingers', 'missing fingers', 'bad hands', 'wrong proportions',
  'uncanny valley', 'plastic skin', 'doll face', 'cartoon',
].join(', ');

const PRODUCT_NEGATIVE = [
  BASE_NEGATIVE,
  'shadow', 'wrinkles', 'dirty', 'stains', 'reflections on product',
  'mannequin', 'person', 'hands',
].join(', ');

/* ═══════════════════════════════════════════════════════════
   PUBLIC: buildProductPhotoPrompt
   ═══════════════════════════════════════════════════════════ */

/**
 * Generate an e-commerce style product photo prompt.
 *
 * @param {object} analysis  - From productAnalyzer.analyzeProductImage()
 * @param {object} opts
 *   @param {string} opts.productName
 *   @param {string} opts.userDescription  - Extra context from user
 * @returns {{ prompt: string, negativePrompt: string, type: 'product' }}
 */
function buildProductPhotoPrompt(analysis, opts = {}) {
  const {
    category   = 'product',
    color      = '',
    style      = 'casual',
    pattern    = 'solid',
    material   = '',
  } = analysis;

  const productName = opts.productName || `${color} ${category}`.trim();
  const photoStyle  = CATEGORY_PHOTO_STYLE[category] || CATEGORY_PHOTO_STYLE.general;
  const environment = STYLE_ENVIRONMENT[style]       || STYLE_ENVIRONMENT.casual;

  const parts = [
    // Core product description
    `professional e-commerce product photo of a ${_formatProductDesc(analysis, productName)}`,
    // Presentation style
    photoStyle,
    // Background + lighting
    environment,
    // Quality markers
    'studio quality, 8k resolution, sharp focus, perfect exposure',
    'shot on Sony A7R IV, 85mm f/1.8 lens',
    'e-commerce standard, product centered, no shadows',
  ];

  // Pattern detail
  if (pattern !== 'solid' && pattern !== 'plain') {
    parts.push(`clearly visible ${pattern} pattern`);
  }

  // Material detail
  if (material) {
    parts.push(`${material} fabric texture visible`);
  }

  return {
    prompt:         parts.join(', '),
    negativePrompt: PRODUCT_NEGATIVE,
    type:           'product',
    seed:           _deterministicSeed(productName + color),
  };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: buildModelPhotoPrompt
   ═══════════════════════════════════════════════════════════ */

/**
 * Generate a model-wearing product photo prompt (Zara-style editorial).
 *
 * @param {object} analysis
 * @param {object} opts
 *   @param {string} opts.productName
 *   @param {string} opts.pose         - 'front' | 'side' | 'lifestyle'
 *   @param {string} opts.gender       - override analysis.gender
 * @returns {{ prompt: string, negativePrompt: string, type: 'model', pose: string }}
 */
function buildModelPhotoPrompt(analysis, opts = {}) {
  const {
    category  = 'clothing',
    color     = '',
    style     = 'casual',
    pattern   = 'solid',
    material  = '',
  } = analysis;

  const gender      = opts.gender  || analysis.gender || 'women';
  const pose        = opts.pose    || 'front';
  const productName = opts.productName || `${color} ${category}`.trim();

  const genderKey    = gender === 'kids' ? 'kids' : (gender === 'men' ? 'men' : 'women');
  const modelDescs   = MODEL_DESCRIPTORS[genderKey] || MODEL_DESCRIPTORS.women;
  const modelDesc    = modelDescs[0]; // primary model descriptor
  const poseDesc     = MODEL_POSES[pose] || MODEL_POSES.front;
  const environment  = STYLE_ENVIRONMENT[style] || STYLE_ENVIRONMENT.casual;

  const parts = [
    // Model + pose
    `fashion editorial photo of ${modelDesc}`,
    // Wearing the product
    `wearing ${_formatProductDesc(analysis, productName)}`,
    // Pose
    poseDesc,
    // Environment
    environment,
    // Style direction
    'Zara style editorial, high fashion photography',
    'professional fashion photographer, natural expression',
    'full body shot, clean minimal background',
    // Quality
    'Vogue India quality, 8k, perfect focus, professional studio',
    'shot on Canon EOS R5, 70-200mm, beautiful light',
  ];

  if (style === 'ethnic') {
    parts.push('Indian fashion editorial, ethnic fashion week style');
  }

  if (style === 'luxury') {
    parts.push('luxury brand lookbook aesthetic, premium photography');
  }

  return {
    prompt:         parts.join(', '),
    negativePrompt: MODEL_NEGATIVE,
    type:           'model',
    pose,
    gender:         genderKey,
    seed:           _deterministicSeed(productName + color + pose),
  };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: buildAllPrompts
   ═══════════════════════════════════════════════════════════ */

/**
 * Generate the complete set of prompts for the Product Studio.
 * Returns 1 product shot + 3 model shots (front, side, lifestyle).
 */
function buildAllPrompts(analysis, opts = {}) {
  const productShot = buildProductPhotoPrompt(analysis, opts);

  const modelShots = ['front', 'side', 'lifestyle'].map(pose =>
    buildModelPhotoPrompt(analysis, { ...opts, pose })
  );

  return {
    productShots: [productShot],
    modelShots,
    analysis: {
      category:   analysis.category,
      color:      analysis.color,
      style:      analysis.style,
      confidence: analysis.confidence,
    },
  };
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function _formatProductDesc(analysis, fallbackName) {
  const parts = [];
  if (analysis.color && analysis.color !== 'multicolor') parts.push(analysis.color);
  if (analysis.material) parts.push(analysis.material);
  parts.push(analysis.category || fallbackName);
  if (analysis.pattern && analysis.pattern !== 'solid') parts.push(`with ${analysis.pattern} pattern`);
  return parts.join(' ');
}

/**
 * Deterministic seed from a string — ensures same product
 * always generates the same image (for caching to work).
 */
function _deterministicSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647;
}

module.exports = {
  buildProductPhotoPrompt,
  buildModelPhotoPrompt,
  buildAllPrompts,
  MODEL_POSES,
  STYLE_ENVIRONMENT,
};
