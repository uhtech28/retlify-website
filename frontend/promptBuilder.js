/**
 * Retlify — promptBuilder.js
 * ===========================
 * Builds highly specific ecommerce image prompts that produce
 * RELEVANT product images — not random scenes or buildings.
 *
 * Core fix: raw user input is NEVER sent to the AI.
 * Every prompt is enriched with category vocabulary, visual anchors,
 * and strong negative prompts that block irrelevant imagery.
 *
 * Exports (browser globals):
 *   window.buildImagePrompts(product)  → { studio, model, lifestyle, editorial }
 *   window.NEGATIVE_PROMPT             → string
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   NEGATIVE PROMPT
   Applied to every shot. Blocks the most common failure modes
   (buildings, landscapes, abstract art, random backgrounds).
───────────────────────────────────────────────────────────── */
const NEGATIVE_PROMPT = [
  'no buildings',
  'no city',
  'no architecture',
  'no landscape',
  'no abstract',
  'no nature',
  'no vehicles',
  'no cars',
  'no street',
  'no sky',
  'no watermark',
  'no text',
  'no logo',
  'no blur',
  'no overexposure',
  'no cartoon',
  'no illustration',
  'no 3D render',
  'no painting',
  'no distortion',
  'no duplicate objects',
].join(', ');

/* ─────────────────────────────────────────────────────────────
   QUALITY SUFFIX
   Appended to every prompt to maximise photorealism.
───────────────────────────────────────────────────────────── */
const QUALITY_SUFFIX = [
  'photorealistic',
  '8K resolution',
  'sharp focus',
  'high detail',
  'professional photography',
  'award-winning ecommerce photo',
].join(', ');

/* ─────────────────────────────────────────────────────────────
   CATEGORY VOCABULARY MAP
   Maps category strings → visual anchors that steer the AI
   toward the correct product type.
───────────────────────────────────────────────────────────── */
const CATEGORY_MAP = {
  // Fashion
  'clothing':         { noun: 'clothing apparel garment',      material: 'fabric textile',         modelCtx: 'fashion model wearing',        setting: 'minimalist fashion studio' },
  'shirt':            { noun: 'shirt clothing apparel',        material: 'woven fabric',            modelCtx: 'fashion model wearing the shirt', setting: 'clean fashion studio' },
  'tshirt':           { noun: 't-shirt clothing apparel',      material: 'cotton jersey fabric',    modelCtx: 'person wearing the t-shirt',    setting: 'casual lifestyle studio' },
  't-shirt':          { noun: 't-shirt clothing apparel',      material: 'cotton jersey fabric',    modelCtx: 'person wearing the t-shirt',    setting: 'casual lifestyle studio' },
  'jeans':            { noun: 'jeans denim trousers apparel',  material: 'denim fabric',            modelCtx: 'model wearing the jeans',       setting: 'urban fashion studio' },
  'trousers':         { noun: 'trousers pants clothing',       material: 'fabric textile',          modelCtx: 'model wearing the trousers',    setting: 'fashion studio' },
  'dress':            { noun: 'dress clothing apparel',        material: 'flowing fabric',          modelCtx: 'female fashion model wearing',  setting: 'elegant fashion studio' },
  'jacket':           { noun: 'jacket outerwear clothing',     material: 'fabric or leather',       modelCtx: 'model wearing the jacket',      setting: 'fashion studio' },
  'hoodie':           { noun: 'hoodie sweatshirt clothing',    material: 'fleece cotton fabric',    modelCtx: 'person wearing the hoodie',     setting: 'casual lifestyle' },
  'suit':             { noun: 'suit formal clothing apparel',  material: 'tailored wool fabric',    modelCtx: 'professional model in the suit', setting: 'corporate fashion studio' },
  'saree':            { noun: 'saree Indian ethnic garment',   material: 'silk or cotton fabric with border', modelCtx: 'Indian model draped in the saree', setting: 'elegant Indian festive setting' },
  'kurti':            { noun: 'kurti Indian ethnic top',       material: 'cotton or silk fabric',   modelCtx: 'Indian model wearing the kurti', setting: 'Indian lifestyle setting' },
  'lehenga':          { noun: 'lehenga ethnic skirt outfit',   material: 'embroidered fabric',      modelCtx: 'Indian model in the lehenga',   setting: 'Indian wedding setting' },
  'kurta':            { noun: 'kurta Indian ethnic apparel',   material: 'cotton linen fabric',     modelCtx: 'model wearing the kurta',       setting: 'Indian lifestyle setting' },
  // Footwear
  'shoes':            { noun: 'shoes footwear pair',           material: 'leather rubber sole',     modelCtx: 'feet wearing the shoes',        setting: 'clean footwear studio floor' },
  'sneakers':         { noun: 'sneakers athletic footwear',    material: 'mesh and rubber sole',    modelCtx: 'feet wearing the sneakers',     setting: 'clean studio floor' },
  'sandals':          { noun: 'sandals footwear pair',         material: 'leather or synthetic',    modelCtx: 'feet wearing the sandals',      setting: 'clean studio' },
  'boots':            { noun: 'boots footwear pair',           material: 'leather upper',           modelCtx: 'model wearing the boots',       setting: 'lifestyle setting' },
  'heels':            { noun: 'high heels women footwear',     material: 'leather or patent',       modelCtx: 'female model wearing heels',    setting: 'fashion studio' },
  // Bags
  'bag':              { noun: 'handbag fashion accessory',     material: 'leather or canvas',       modelCtx: 'model holding the bag',         setting: 'fashion lifestyle' },
  'backpack':         { noun: 'backpack bag accessory',        material: 'nylon or canvas fabric',  modelCtx: 'person wearing the backpack',   setting: 'outdoor lifestyle' },
  'wallet':           { noun: 'wallet leather accessory',      material: 'genuine leather',         modelCtx: 'hand holding the wallet',       setting: 'clean studio' },
  'purse':            { noun: 'purse handbag accessory',       material: 'leather or fabric',       modelCtx: 'model holding the purse',       setting: 'fashion studio' },
  // Electronics
  'phone':            { noun: 'smartphone mobile device',      material: 'glass aluminum chassis',  modelCtx: 'hand holding the phone',        setting: 'modern tech desk' },
  'laptop':           { noun: 'laptop computer device',        material: 'aluminum chassis screen', modelCtx: 'person using the laptop',       setting: 'modern desk workspace' },
  'watch':            { noun: 'wristwatch timepiece accessory',material: 'metal or leather strap',  modelCtx: 'wrist wearing the watch',       setting: 'luxury product studio' },
  'headphones':       { noun: 'headphones audio device',       material: 'plastic metal cushion',   modelCtx: 'person wearing headphones',     setting: 'clean tech studio' },
  'earphones':        { noun: 'earphones audio device',        material: 'silicone plastic',        modelCtx: 'person wearing earphones',      setting: 'clean tech studio' },
  // Jewellery
  'necklace':         { noun: 'necklace jewellery accessory',  material: 'metal gemstones',         modelCtx: 'neck wearing the necklace',     setting: 'luxury jewellery studio' },
  'ring':             { noun: 'ring jewellery accessory',      material: 'precious metal gemstone', modelCtx: 'finger wearing the ring',       setting: 'luxury jewellery macro studio' },
  'bracelet':         { noun: 'bracelet jewellery accessory',  material: 'metal or beads',          modelCtx: 'wrist wearing the bracelet',    setting: 'luxury jewellery studio' },
  'earrings':         { noun: 'earrings jewellery accessory',  material: 'metal gemstone',          modelCtx: 'model wearing earrings',        setting: 'close-up jewellery studio' },
  // Beauty
  'perfume':          { noun: 'perfume fragrance bottle',      material: 'glass bottle luxury packaging', modelCtx: 'hand holding the perfume',  setting: 'luxury beauty studio marble' },
  'lipstick':         { noun: 'lipstick cosmetic beauty product', material: 'cosmetic casing',      modelCtx: 'model applying lipstick',       setting: 'beauty studio' },
  'moisturizer':      { noun: 'moisturizer skincare product',  material: 'cosmetic packaging',      modelCtx: 'model applying moisturizer',    setting: 'clean beauty studio' },
  'serum':            { noun: 'serum skincare beauty product', material: 'glass dropper bottle',    modelCtx: 'hand holding the serum bottle', setting: 'minimalist beauty studio' },
  // Home
  'sofa':             { noun: 'sofa couch furniture',          material: 'upholstery fabric or leather', modelCtx: 'person sitting on the sofa', setting: 'modern living room interior' },
  'lamp':             { noun: 'lamp lighting home decor',      material: 'metal fabric shade',      modelCtx: 'interior room with the lamp',   setting: 'modern home interior' },
  'mug':              { noun: 'mug cup kitchenware',           material: 'ceramic or porcelain',    modelCtx: 'hand holding the mug',          setting: 'cozy kitchen countertop' },
  // Sports
  'yoga mat':         { noun: 'yoga mat fitness accessory',    material: 'rubber foam material',    modelCtx: 'person doing yoga on the mat',  setting: 'bright gym or studio' },
  'dumbbell':         { noun: 'dumbbell gym equipment',        material: 'metal rubber grip',       modelCtx: 'person holding the dumbbell',   setting: 'gym fitness setting' },
  // Default
  'default':          { noun: 'product ecommerce item',        material: 'quality material',        modelCtx: 'person using the product',      setting: 'clean studio' },
};

/* ─────────────────────────────────────────────────────────────
   HELPER: resolve category vocabulary from product name
───────────────────────────────────────────────────────────── */
function _resolveVocab(productName, category) {
  const combined = `${productName} ${category || ''}`.toLowerCase();

  // Walk the map keys — first match wins
  for (const [key, vocab] of Object.entries(CATEGORY_MAP)) {
    if (key === 'default') continue;
    if (combined.includes(key)) return vocab;
  }
  return CATEGORY_MAP.default;
}

/* ─────────────────────────────────────────────────────────────
   HELPER: build feature string from array or comma-separated str
───────────────────────────────────────────────────────────── */
function _featureString(features) {
  if (!features) return '';
  const arr = Array.isArray(features)
    ? features
    : String(features).split(',').map(f => f.trim()).filter(Boolean);
  return arr.slice(0, 4).join(', ');
}

/* ─────────────────────────────────────────────────────────────
   MAIN EXPORT: buildImagePrompts(product)

   @param {object} product
     product.productName  {string}  required
     product.category     {string}  optional
     product.features     {string|string[]}  optional

   @returns {{ studio, model, lifestyle, editorial }}
     Each value: { prompt: string, negative: string, label: string, type: string }
───────────────────────────────────────────────────────────── */
function buildImagePrompts(product) {
  const name     = String(product.productName || product.name || '').trim();
  const category = String(product.category || '').trim();
  const features = _featureString(product.features);

  if (!name) throw new Error('buildImagePrompts: productName is required');

  const vocab      = _resolveVocab(name, category);
  const featureTag = features ? `, ${features}` : '';
  const enriched   = `${name} ${vocab.noun}`;  // e.g. "shirt clothing apparel garment"

  return {

    /* ── 1. STUDIO ─────────────────────────────────────────────
       Clean product-only shot on pure white.
       Primary listing image — Amazon / Flipkart / Meesho style.
    ────────────────────────────────────────────────────────── */
    studio: {
      type:  'studio',
      label: 'Studio Shot',
      emoji: '📦',
      prompt: [
        `ecommerce product photo of a ${enriched}`,
        `clothing apparel fashion catalog style`,
        `pure white background`,
        `studio lighting softbox`,
        `centered composition front view`,
        `realistic fabric texture${featureTag}`,
        `high resolution sharp focus`,
        `commercial product photography`,
        QUALITY_SUFFIX,
      ].join(', '),
      negative: NEGATIVE_PROMPT,
    },

    /* ── 2. MODEL ──────────────────────────────────────────────
       Human model wearing / holding the product.
       Shows fit, scale, and real-world appearance.
    ────────────────────────────────────────────────────────── */
    model: {
      type:  'model',
      label: 'Model Shot',
      emoji: '👗',
      prompt: [
        `${vocab.modelCtx} the ${enriched}`,
        `fashion editorial photography`,
        `clothing apparel lookbook`,
        `studio lighting neutral background`,
        `full body editorial pose`,
        `realistic fabric texture${featureTag}`,
        `high-end fashion magazine quality`,
        `professional model photography`,
        QUALITY_SUFFIX,
      ].join(', '),
      negative: NEGATIVE_PROMPT,
    },

    /* ── 3. LIFESTYLE ──────────────────────────────────────────
       Product in a real-world aspirational context.
       Adds emotion and relatability.
    ────────────────────────────────────────────────────────── */
    lifestyle: {
      type:  'lifestyle',
      label: 'Lifestyle Shot',
      emoji: '🌿',
      prompt: [
        `lifestyle photo featuring a ${enriched}`,
        `clothing apparel in everyday life setting`,
        `${vocab.setting}`,
        `realistic fabric texture${featureTag}`,
        `warm natural lighting`,
        `shallow depth of field soft bokeh`,
        `authentic real-life context`,
        `fashion lifestyle photography`,
        QUALITY_SUFFIX,
      ].join(', '),
      negative: NEGATIVE_PROMPT,
    },

    /* ── 4. EDITORIAL ──────────────────────────────────────────
       Luxury / premium brand campaign style.
       Dramatic lighting, aspirational aesthetic.
    ────────────────────────────────────────────────────────── */
    editorial: {
      type:  'editorial',
      label: 'Editorial Shot',
      emoji: '✨',
      prompt: [
        `luxury brand campaign image of a ${enriched}`,
        `clothing apparel premium advertising`,
        `realistic fabric texture${featureTag}`,
        `dramatic cinematic studio lighting`,
        `dark gradient background deep shadows`,
        `high contrast designer fashion aesthetic`,
        `Vogue editorial visual style`,
        `premium fashion photography`,
        QUALITY_SUFFIX,
      ].join(', '),
      negative: NEGATIVE_PROMPT,
    },

  };
}

/* ─────────────────────────────────────────────────────────────
   BROWSER EXPORTS
───────────────────────────────────────────────────────────── */
if (typeof window !== 'undefined') {
  window.buildImagePrompts = buildImagePrompts;
  window.NEGATIVE_PROMPT   = NEGATIVE_PROMPT;
}

/* ─────────────────────────────────────────────────────────────
   NODE EXPORTS (for backend use / testing)
───────────────────────────────────────────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildImagePrompts, NEGATIVE_PROMPT, QUALITY_SUFFIX, CATEGORY_MAP };
}
