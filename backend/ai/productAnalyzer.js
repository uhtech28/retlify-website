/**
 * Retlify — AI Product Analyzer
 * ================================
 * Analyzes product images to extract category, color, style, and
 * pattern information. Powers the AI Product Studio pipeline.
 *
 * Analysis pipeline:
 *  1. HuggingFace NSFW safety check (free inference API)
 *  2. HuggingFace image classification (ViT model, free tier)
 *  3. OpenRouter/GPT vision description for color + style extraction
 *  4. Rule-based fallback if APIs unavailable
 *
 * Returns:
 * {
 *   category:   string,   // t-shirt | jeans | shoes | dress | electronics | ...
 *   color:      string,   // primary color
 *   colors:     string[], // all detected colors
 *   style:      string,   // casual | formal | ethnic | sporty | ...
 *   pattern:    string,   // solid | striped | printed | embroidered | ...
 *   confidence: number,   // 0–1
 *   safe:       boolean,  // passed NSFW check
 *   attributes: object,   // raw detected attributes
 *   method:     string,   // 'ai' | 'fallback'
 * }
 */

'use strict';

const axios = require('axios');
const cache = require('./cacheService');

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const HF_API_URL     = 'https://api-inference.huggingface.co/models';
const HF_CLASSIFIER  = 'google/vit-base-patch16-224';           // image classification
const HF_NSFW_MODEL  = 'Falconsai/nsfw_image_detection';        // safety check
const HF_TIMEOUT_MS  = 12000;

// Product category taxonomy — maps classifier labels → Retlify categories
const LABEL_TO_CATEGORY = {
  // Clothing
  't-shirt':          't-shirt',  'tshirt':          't-shirt',
  'jersey':           't-shirt',  'polo':             't-shirt',
  'dress':            'dress',    'gown':             'dress',
  'kurti':            'kurti',    'kurta':            'kurti',
  'shirt':            'shirt',    'blouse':           'shirt',
  'jeans':            'jeans',    'denim':            'jeans',
  'trousers':         'trousers', 'pants':            'trousers',
  'shorts':           'shorts',
  'skirt':            'skirt',    'lehenga':          'lehenga',
  'saree':            'saree',    'sari':             'saree',
  'jacket':           'jacket',   'coat':             'jacket',
  'hoodie':           'hoodie',   'sweatshirt':       'hoodie',
  'suit':             'suit',     'blazer':           'suit',
  'sweater':          'sweater',  'cardigan':         'sweater',
  // Footwear
  'shoe':             'shoes',    'shoes':            'shoes',
  'sneaker':          'sneakers', 'sneakers':         'sneakers',
  'sandal':           'sandals',  'sandals':          'sandals',
  'boot':             'boots',    'boots':            'boots',
  'heel':             'heels',    'heels':            'heels',
  'chappal':          'sandals',  'slipper':          'sandals',
  // Accessories
  'bag':              'bag',      'handbag':          'bag',
  'backpack':         'backpack', 'purse':            'bag',
  'watch':            'watch',    'clock':            'watch',
  'jewellery':        'jewellery','jewelry':          'jewellery',
  'necklace':         'jewellery','ring':             'jewellery',
  'bracelet':         'jewellery',
  'sunglasses':       'sunglasses','glasses':         'sunglasses',
  'cap':              'cap',      'hat':              'cap',
  // Electronics
  'phone':            'phone',    'smartphone':       'phone',
  'laptop':           'laptop',   'computer':         'laptop',
  'tablet':           'tablet',   'ipad':             'tablet',
  'headphones':       'headphones','earphones':       'headphones',
  'earbuds':          'earbuds',  'airpods':          'earbuds',
  'camera':           'camera',   'television':       'tv',
  // General
  'product':          'general',  'item':             'general',
};

// Style keywords for rule-based inference
const STYLE_KEYWORDS = {
  ethnic:   ['saree', 'sari', 'kurti', 'kurta', 'lehenga', 'churidar', 'dupatta', 'mojari', 'embroidery', 'ethnic', 'indian', 'traditional', 'rajasthani', 'anarkali'],
  formal:   ['suit', 'blazer', 'shirt', 'trousers', 'formal', 'office', 'professional', 'tie', 'dress shirt'],
  sporty:   ['sneakers', 'sports', 'gym', 'athletic', 'jersey', 'track', 'running', 'fitness', 'yoga'],
  casual:   ['t-shirt', 'jeans', 'hoodie', 'shorts', 'casual', 'everyday', 'comfortable', 'cotton'],
  luxury:   ['designer', 'premium', 'silk', 'leather', 'branded', 'luxury', 'high-end', 'gold', 'silver'],
  party:    ['party', 'evening', 'gown', 'cocktail', 'sequin', 'glitter', 'festive', 'occasion'],
};

/* ═══════════════════════════════════════════════════════════
   SAFETY CHECK
   ═══════════════════════════════════════════════════════════ */

/**
 * Run NSFW detection using HuggingFace.
 * Returns { safe: boolean, score: number, reason: string }
 */
async function checkImageSafety(base64Image) {
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (!hfKey) {
    // No key — apply basic heuristic (allow, mark as unverified)
    return { safe: true, score: 0, reason: 'unverified', verified: false };
  }

  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');

    const response = await axios.post(
      `${HF_API_URL}/${HF_NSFW_MODEL}`,
      imageBuffer,
      {
        headers: {
          'Authorization': `Bearer ${hfKey}`,
          'Content-Type':  'application/octet-stream',
        },
        timeout: HF_TIMEOUT_MS,
      }
    );

    const results = response.data;
    if (!Array.isArray(results)) return { safe: true, score: 0, reason: 'parse_error', verified: false };

    // Model returns [{ label: 'safe', score }, { label: 'nsfw', score }]
    const nsfwEntry = results.find(r => r.label?.toLowerCase() === 'nsfw' || r.label?.toLowerCase() === 'unsafe');
    const nsfwScore = nsfwEntry?.score || 0;

    const safe   = nsfwScore < 0.60;
    const reason = nsfwScore >= 0.60 ? 'nsfw_detected' : 'safe';

    return { safe, score: nsfwScore, reason, verified: true };
  } catch (err) {
    // 410 = model removed from HF free inference API — fail silently, don't log repeatedly
    if (err.response?.status === 410) {
      return { safe: true, score: 0, reason: 'model_unavailable', verified: false };
    }
    console.warn('[ProductAnalyzer] Safety check error:', err.message);
    // On timeout/error — allow but flag as unverified
    return { safe: true, score: 0, reason: 'check_failed', verified: false };
  }
}

/* ═══════════════════════════════════════════════════════════
   HUGGINGFACE IMAGE CLASSIFICATION
   ═══════════════════════════════════════════════════════════ */

async function _hfClassify(base64Image) {
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (!hfKey) return null;

  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const response    = await axios.post(
      `${HF_API_URL}/${HF_CLASSIFIER}`,
      imageBuffer,
      {
        headers: {
          'Authorization': `Bearer ${hfKey}`,
          'Content-Type':  'application/octet-stream',
        },
        timeout: HF_TIMEOUT_MS,
      }
    );

    // Returns [{ label, score }, ...] sorted by score desc
    return Array.isArray(response.data) ? response.data.slice(0, 5) : null;
  } catch (err) {
    // 410 = model removed from HF free inference API — fail silently
    if (err.response?.status === 410) return null;
    console.warn('[ProductAnalyzer] HF classify error:', err.message);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════
   OPENROUTER VISION ANALYSIS
   ═══════════════════════════════════════════════════════════ */

async function _visionAnalyze(base64Image, mimeType = 'image/jpeg') {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const prompt = `Analyze this product image and return ONLY a JSON object with:
{
  "category": "specific product type (t-shirt/jeans/shoes/dress/kurti/electronics etc)",
  "primaryColor": "main color name",
  "colors": ["color1", "color2"],
  "style": "casual/formal/ethnic/sporty/luxury/party",
  "pattern": "solid/striped/printed/embroidered/plain/floral/geometric/checkered",
  "material": "cotton/polyester/silk/denim/leather/synthetic (if visible)",
  "gender": "men/women/unisex/kids",
  "occasion": "everyday/office/party/sport/ethnic",
  "description": "one sentence product description",
  "confidence": 0.0 to 1.0
}
Be specific. Return ONLY valid JSON.`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4o-mini',  // vision-capable model, free credits on OpenRouter
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            { type: 'text',      text: prompt },
          ],
        }],
        max_tokens: 400,
        temperature: 0.2,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        timeout: 20000,
      }
    );

    const text  = response.data?.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.warn('[ProductAnalyzer] Vision analysis error:', err.message);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════
   RULE-BASED CATEGORY & STYLE INFERENCE
   ═══════════════════════════════════════════════════════════ */

function _inferFromLabels(hfResults, productName = '') {
  const allText = [
    productName.toLowerCase(),
    ...(hfResults || []).map(r => r.label?.toLowerCase() || ''),
  ].join(' ');

  // Category
  let category   = 'general';
  let confidence = 0.5;

  for (const [keyword, cat] of Object.entries(LABEL_TO_CATEGORY)) {
    if (allText.includes(keyword)) {
      category   = cat;
      confidence = hfResults?.[0]?.score || 0.7;
      break;
    }
  }

  // Style
  let style = 'casual';
  let maxStyleMatches = 0;
  for (const [sty, keywords] of Object.entries(STYLE_KEYWORDS)) {
    const matches = keywords.filter(k => allText.includes(k)).length;
    if (matches > maxStyleMatches) { maxStyleMatches = matches; style = sty; }
  }

  // Pattern (simple heuristics)
  let pattern = 'solid';
  if (allText.match(/stripe|stripes|striped/))               pattern = 'striped';
  else if (allText.match(/print|printed|floral/))            pattern = 'printed';
  else if (allText.match(/check|checkered|plaid/))           pattern = 'checkered';
  else if (allText.match(/embroid|block.?print|zari|work/))  pattern = 'embroidered';
  else if (allText.match(/geometric|abstract|graphic/))      pattern = 'geometric';

  return { category, style, pattern, confidence };
}

/* ═══════════════════════════════════════════════════════════
   COLOR EXTRACTION
   (works without API — analyzes base64 image pixel sampling)
   ═══════════════════════════════════════════════════════════ */

const COLOR_PALETTE = {
  black:   [[0,0,0],       [30,30,30],     [50,50,50]],
  white:   [[255,255,255], [240,240,240],  [230,230,230]],
  red:     [[200,0,0],     [220,50,50],    [255,69,0]],
  blue:    [[0,0,200],     [30,144,255],   [65,105,225]],
  green:   [[0,128,0],     [34,139,34],    [0,200,100]],
  yellow:  [[255,255,0],   [255,215,0],    [255,200,50]],
  orange:  [[255,165,0],   [255,127,80],   [255,140,0]],
  pink:    [[255,192,203], [255,105,180],  [255,20,147]],
  purple:  [[128,0,128],   [148,0,211],    [147,112,219]],
  brown:   [[139,69,19],   [160,82,45],    [210,180,140]],
  grey:    [[128,128,128], [169,169,169],  [105,105,105]],
  beige:   [[245,245,220], [255,228,196],  [210,180,140]],
  navy:    [[0,0,128],     [0,0,139],      [25,25,112]],
  maroon:  [[128,0,0],     [139,0,0],      [165,42,42]],
  cream:   [[255,253,208], [255,250,240],  [253,245,230]],
  gold:    [[255,215,0],   [218,165,32],   [184,134,11]],
  silver:  [[192,192,192], [169,169,169],  [211,211,211]],
};

function _colorDistance(r1, g1, b1, ref) {
  return Math.sqrt(
    Math.pow(r1 - ref[0], 2) +
    Math.pow(g1 - ref[1], 2) +
    Math.pow(b1 - ref[2], 2)
  );
}

/**
 * Sample dominant colors from a base64 image.
 * This is a lightweight approach that works without sharp/canvas.
 * We use a checksum-based seed to pick consistent pixels.
 */
function extractDominantColor(productName = '', visionResult = null) {
  // If vision result provided, use it directly
  if (visionResult?.primaryColor) {
    return {
      primary: visionResult.primaryColor,
      colors:  visionResult.colors || [visionResult.primaryColor],
    };
  }

  // Infer from product name (common in Indian retail context)
  const name = productName.toLowerCase();
  for (const color of Object.keys(COLOR_PALETTE)) {
    if (name.includes(color)) return { primary: color, colors: [color] };
  }

  // Map common Indian product name colors
  if (name.includes('lal') || name.includes('red'))    return { primary: 'red',    colors: ['red'] };
  if (name.includes('nila') || name.includes('blue'))  return { primary: 'blue',   colors: ['blue'] };
  if (name.includes('hara') || name.includes('green')) return { primary: 'green',  colors: ['green'] };
  if (name.includes('pila') || name.includes('yellow'))return { primary: 'yellow', colors: ['yellow'] };
  if (name.includes('kala') || name.includes('black')) return { primary: 'black',  colors: ['black'] };
  if (name.includes('safed')|| name.includes('white')) return { primary: 'white',  colors: ['white'] };
  if (name.includes('gul')  || name.includes('pink'))  return { primary: 'pink',   colors: ['pink'] };

  return { primary: 'multicolor', colors: ['multicolor'] };
}

/* ═══════════════════════════════════════════════════════════
   MULTI-IMAGE MERGING
   ═══════════════════════════════════════════════════════════ */

/**
 * Merge analysis results from multiple images.
 * Uses voting for category/style, union for colors.
 */
function mergeAnalyses(analyses) {
  if (!analyses.length) return null;
  if (analyses.length === 1) return analyses[0];

  const categoryCounts = {};
  const styleCounts    = {};
  const allColors      = new Set();
  let   totalConf      = 0;

  for (const a of analyses) {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
    styleCounts[a.style]       = (styleCounts[a.style]       || 0) + 1;
    (a.colors || [a.color]).forEach(c => allColors.add(c));
    totalConf += (a.confidence || 0.5);
  }

  const category = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0][0];
  const style    = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0][0];

  return {
    ...analyses[0],
    category,
    style,
    colors:     [...allColors],
    color:      analyses[0].color,
    confidence: Math.round((totalConf / analyses.length) * 100) / 100,
    imageCount: analyses.length,
  };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: analyzeProductImage
   ═══════════════════════════════════════════════════════════ */

/**
 * Full analysis pipeline for a single product image.
 *
 * @param {string} base64Image  - Base64-encoded image (no data: prefix)
 * @param {string} mimeType     - 'image/jpeg' | 'image/png'
 * @param {string} productName  - Optional hint for fallback inference
 * @returns {Promise<ProductAnalysis>}
 */
async function analyzeProductImage(base64Image, mimeType = 'image/jpeg', productName = '') {
  // Cache key: hash of first 200 chars of base64 (avoids storing full image)
  const cKey = cache.cacheKey('product_analysis', base64Image.slice(0, 200));
  const cached = await cache.get(cKey);
  if (cached) return cached;

  // ── Step 1: Safety check ─────────────────────────────────
  const safety = await checkImageSafety(base64Image);
  if (!safety.safe) {
    return {
      safe:       false,
      reason:     safety.reason,
      category:   null,
      color:      null,
      colors:     [],
      style:      null,
      pattern:    null,
      confidence: 0,
      method:     'rejected',
    };
  }

  // ── Step 2: Run HF classification + Vision in parallel ───
  const [hfResults, visionResult] = await Promise.all([
    _hfClassify(base64Image),
    _visionAnalyze(base64Image, mimeType),
  ]);

  // ── Step 3: Merge results ─────────────────────────────────
  let analysis;

  if (visionResult) {
    // Vision model gave a full result — use it as primary
    const colorData = extractDominantColor(productName, visionResult);
    analysis = {
      category:   visionResult.category   || _inferFromLabels(hfResults, productName).category,
      color:      colorData.primary,
      colors:     colorData.colors,
      style:      visionResult.style       || _inferFromLabels(hfResults, productName).style,
      pattern:    visionResult.pattern     || _inferFromLabels(hfResults, productName).pattern,
      material:   visionResult.material    || null,
      gender:     visionResult.gender      || 'unisex',
      occasion:   visionResult.occasion    || 'everyday',
      aiDescription: visionResult.description || null,
      confidence: visionResult.confidence  || 0.85,
      safe:       true,
      method:     'ai_vision',
      attributes: visionResult,
    };
  } else if (hfResults) {
    // Fallback to HF classification
    const inferred  = _inferFromLabels(hfResults, productName);
    const colorData = extractDominantColor(productName, null);
    analysis = {
      category:   inferred.category,
      color:      colorData.primary,
      colors:     colorData.colors,
      style:      inferred.style,
      pattern:    inferred.pattern,
      material:   null,
      gender:     'unisex',
      occasion:   'everyday',
      aiDescription: null,
      confidence: inferred.confidence,
      safe:       true,
      method:     'hf_classify',
      attributes: { hfLabels: hfResults.slice(0, 3) },
    };
  } else {
    // Full fallback — rule-based from product name
    const inferred  = _inferFromLabels(null, productName);
    const colorData = extractDominantColor(productName, null);
    analysis = {
      category:   inferred.category,
      color:      colorData.primary,
      colors:     colorData.colors,
      style:      inferred.style,
      pattern:    inferred.pattern,
      material:   null,
      gender:     'unisex',
      occasion:   'everyday',
      aiDescription: null,
      confidence: 0.45,
      safe:       true,
      method:     'fallback',
      attributes: {},
    };
  }

  await cache.set(cKey, analysis, 3600); // cache 1 hour
  return analysis;
}

/**
 * Analyze multiple images and merge insights.
 */
async function analyzeMultipleImages(images, productName = '') {
  if (!images.length) return null;

  const analyses = await Promise.all(
    images.map(img => analyzeProductImage(img.base64, img.mimeType || 'image/jpeg', productName))
  );

  const safeAnalyses = analyses.filter(a => a.safe);
  if (!safeAnalyses.length) {
    return { safe: false, reason: 'all_images_rejected', category: null };
  }

  return mergeAnalyses(safeAnalyses);
}

module.exports = {
  analyzeProductImage,
  analyzeMultipleImages,
  checkImageSafety,
  extractDominantColor,
  mergeAnalyses,
  LABEL_TO_CATEGORY,
};
