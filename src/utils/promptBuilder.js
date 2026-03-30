/**
 * promptBuilder.js
 * ─────────────────
 * Builds 4 highly specific, category-aware prompts.
 * Key design goal: raw input is NEVER sent to AI verbatim —
 * every prompt is enriched with visual anchors + strong negative prompts
 * to block buildings, abstract art, and irrelevant scenes.
 *
 * Exports: buildPrompts(analysis) → Array<PromptObject>
 */

/* ─── Quality suffix appended to every prompt ────────────────── */
const QUALITY =
  'photorealistic, professional photography, 8K ultra-high resolution, ' +
  'sharp focus, high detail, award-winning commercial product shot, ' +
  'perfect lighting, no grain, no noise';

/* ─── Global negative prompt ─────────────────────────────────── */
export const NEGATIVE =
  'no buildings, no city skyline, no architecture, no landscape, no roads, ' +
  'no abstract art, no nature, no trees, no sky, no vehicles, no cars, ' +
  'no watermark, no text overlay, no logo, no blur, no overexposure, ' +
  'no cartoon, no illustration, no 3D render, no painting, no CGI, ' +
  'no distortion, no duplicate objects, no background clutter, ' +
  'no amateur photography, no low resolution, no extra limbs';

/* ─── Per-category visual context ────────────────────────────── */
const CATEGORY_CONTEXT = {
  't-shirt':   { scene:'casual urban lifestyle', model:'lifestyle model wearing the fitted t-shirt with confidence', env:'clean minimalist white studio backdrop' },
  shirt:       { scene:'modern office environment', model:'professional model wearing the formal shirt, sharp look', env:'clean neutral studio backdrop' },
  jeans:       { scene:'urban street environment', model:'fashion model wearing the stylish jeans, full body shot', env:'neutral grey studio backdrop' },
  dress:       { scene:'elegant venue or garden', model:'female fashion model in the flowing dress, full length', env:'luxury white studio with soft light' },
  kurti:       { scene:'Indian cultural setting with natural light', model:'Indian model in the elegant kurti with dupatta', env:'ornate ethnic Indian backdrop' },
  saree:       { scene:'traditional Indian setting with warm light', model:'graceful Indian model draped in the saree, poised', env:'classic Indian marble interior' },
  lehenga:     { scene:'festive wedding celebration hall', model:'Indian model in the vibrant embroidered lehenga', env:'golden-lit Indian bridal setting' },
  trousers:    { scene:'smart-casual office setting', model:'professional model in the tailored trousers, standing', env:'modern clean office backdrop' },
  shorts:      { scene:'casual outdoor sunny park', model:'active person wearing the shorts comfortably', env:'bright white studio, clean floor' },
  hoodie:      { scene:'cosy autumn outdoor café', model:'lifestyle model in the relaxed comfortable hoodie', env:'minimal concrete urban backdrop' },
  jacket:      { scene:'urban rooftop at dusk', model:'model wearing the stylish jacket, dynamic confident pose', env:'industrial textured wall backdrop' },
  suit:        { scene:'corporate boardroom or luxury lobby', model:'professional in the sharp tailored suit, power pose', env:'luxury marble studio backdrop' },
  sweater:     { scene:'cosy café interior with warm tones', model:'lifestyle model in the warm comfortable sweater', env:'warm-toned cream studio backdrop' },
  skirt:       { scene:'modern street style setting', model:'fashion model wearing the skirt, editorial pose', env:'clean studio neutral backdrop' },
  shoes:       { scene:'clean studio floor, product hero shot', model:'close-up model feet wearing the shoes, dynamic step', env:'white marble studio floor' },
  sneakers:    { scene:'urban pavement street scene', model:'lifestyle person wearing the sneakers, street style', env:'minimalist clean white studio floor' },
  boots:       { scene:'autumn outdoor lifestyle path', model:'confident model wearing the boots, walking shot', env:'textured dark studio backdrop' },
  heels:       { scene:'luxury event or upscale venue', model:'elegant female model wearing the heels, standing tall', env:'glossy marble floor studio' },
  sandals:     { scene:'summer beach walkway', model:'casual person wearing the sandals, relaxed pose', env:'bright clean white studio floor' },
  bag:         { scene:'stylish café lifestyle corner', model:'fashion model naturally carrying the bag, candid', env:'luxury boutique display setup' },
  backpack:    { scene:'urban street outdoor lifestyle', model:'person wearing the backpack, active lifestyle', env:'modern minimal city backdrop' },
  watch:       { scene:'luxury product hero showcase', model:'elegant wrist close-up wearing the watch, sharp', env:'dark velvet premium backdrop' },
  sunglasses:  { scene:'sunny outdoor lifestyle', model:'stylish model wearing the sunglasses, bright day', env:'bright white seamless studio' },
  cap:         { scene:'casual street lifestyle', model:'lifestyle person wearing the cap, side angle', env:'clean white or brick backdrop' },
  jewellery:   { scene:'luxury jewellery hero showcase', model:'close-up model wearing the jewellery piece', env:'black velvet luxury backdrop' },
  phone:       { scene:'modern minimalist clean desk', model:'person naturally using the smartphone in hand', env:'clean tech product studio' },
  laptop:      { scene:'creative modern workspace desk', model:'professional using the open laptop, focused', env:'minimalist desk setup, soft light' },
  tablet:      { scene:'modern living room coffee table', model:'person using the tablet, relaxed lifestyle', env:'bright minimal home interior' },
  headphones:  { scene:'music studio or café lifestyle', model:'person wearing the headphones, immersed in music', env:'dark moody atmospheric studio' },
  earbuds:     { scene:'active fitness lifestyle setting', model:'athlete wearing the earbuds while running', env:'clean white sport studio' },
  camera:      { scene:'photography studio setting', model:'photographer holding the camera naturally, working', env:'grey seamless backdrop studio' },
  tv:          { scene:'modern premium living room wall', model:'lifestyle shot of room with the tv on', env:'dark home theater interior' },
  appliance:   { scene:'modern kitchen counter setup', model:'home cook using the appliance, natural lifestyle', env:'bright clean white kitchen' },
  furniture:   { scene:'modern styled living room interior', model:'person enjoying the furniture, lifestyle shot', env:'contemporary interior design' },
  beauty:      { scene:'elegant vanity counter, soft light', model:'beauty model applying the product, close-up', env:'soft-lit white marble bathroom' },
  product:     { scene:'modern lifestyle setting', model:'person using the product naturally and confidently', env:'clean professional studio backdrop' },
};

/**
 * buildPrompts — builds 4 production-grade image prompts.
 * @param {{ category: string, color: string, pattern: string, material: string }} analysis
 * @returns {Array<{ type, label, desc, color, prompt, negative }>}
 */
export function buildPrompts({ category = 'product', color = 'multicolor', pattern = 'solid', material = 'quality material' }) {
  const ctx = CATEGORY_CONTEXT[category] || CATEGORY_CONTEXT.product;

  // Build a rich visual descriptor with all known attributes
  const colorPart    = color !== 'multicolor' ? `${color} colored ` : '';
  const patternPart  = pattern !== 'solid' ? `${pattern} patterned ` : '';
  const materialPart = material !== 'quality material' ? `, made of ${material}` : '';
  const descriptor   = `${colorPart}${patternPart}${category}${materialPart}`;
  const sameProduct  = `same exact ${descriptor}, identical design, same color, same pattern, same product`;

  return [
    /* ── 1. STUDIO SHOT ─────────────────────────────────────────
       Pure white bg, product centered, catalog / listing quality.
       No model, no scene. Product hero only.
    ──────────────────────────────────────────────────────────── */
    {
      type: 'studio',
      label: 'Studio Shot',
      desc: 'Clean product photography',
      color: '#818cf8',
      prompt: [
        `ecommerce product photo of a ${descriptor}`,
        'pure white background, product centered perfectly',
        'professional studio softbox lighting, front-facing view',
        'clean sharp edges, catalog quality, product only',
        'realistic fabric texture and material detail',
        'Amazon/Flipkart listing style hero shot',
        'isolated product, no model, no hands, no props',
        QUALITY,
      ].join(', '),
      negative: NEGATIVE + ', model, person, hands, background objects, shadows on wall',
    },

    /* ── 2. MODEL SHOT ───────────────────────────────────────────
       Human model wearing / using the EXACT product.
       Enforces same color + pattern + product type.
    ──────────────────────────────────────────────────────────── */
    {
      type: 'model',
      label: 'Model Shot',
      desc: 'Worn/used by model',
      color: '#34d399',
      prompt: [
        `${ctx.model} — ${sameProduct}`,
        'natural confident editorial pose',
        `${ctx.env} background`,
        'professional studio lighting with soft rim light',
        'full body fashion editorial style',
        'authentic lifestyle brand campaign feel',
        'realistic material and texture preserved',
        QUALITY,
      ].join(', '),
      negative: NEGATIVE + ', wrong product, different color product, different pattern, missing product',
    },

    /* ── 3. LIFESTYLE SHOT ───────────────────────────────────────
       Product in an aspirational real-world scene.
       Depth of field, natural light, story-telling.
    ──────────────────────────────────────────────────────────── */
    {
      type: 'lifestyle',
      label: 'Lifestyle Shot',
      desc: 'Real-world context',
      color: '#f59e0b',
      prompt: [
        `${descriptor} in ${ctx.scene}`,
        'lifestyle product photography, real-world aspirational context',
        'ambient warm natural golden hour lighting',
        'editorial depth-of-field bokeh background',
        'authentic relatable atmosphere, story-telling composition',
        `${sameProduct}`,
        QUALITY,
      ].join(', '),
      negative: NEGATIVE + ', unrealistic scene, overcrowded, messy background',
    },

    /* ── 4. EDITORIAL SHOT ───────────────────────────────────────
       Luxury / premium Vogue-style campaign image.
       Dramatic moody lighting, high-fashion aesthetic.
    ──────────────────────────────────────────────────────────── */
    {
      type: 'editorial',
      label: 'Editorial Shot',
      desc: 'Magazine style',
      color: '#f472b6',
      prompt: [
        `luxury premium editorial campaign photo of a ${descriptor}`,
        'Vogue magazine fashion spread aesthetic',
        'dramatic cinematic moody studio lighting',
        'sophisticated color grading, deep shadows and highlights',
        'high-fashion composition, premium brand identity',
        `${sameProduct}`,
        QUALITY,
      ].join(', '),
      negative: NEGATIVE + ', amateur, casual, flat lighting, ordinary background',
    },
  ];
}
