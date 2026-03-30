/**
 * Retlify — Language Translator Utility
 * =======================================
 * Standalone utility (no AI dependency) for language detection and
 * static translation. Used by AI services before sending queries to
 * the AI provider, ensuring all prompts are in English regardless of
 * the user's input language.
 *
 * This module is intentionally synchronous and dependency-free so it
 * can be called anywhere without await overhead. AI-assisted translation
 * (for Devanagari script) lives in ai/translationService.js and wraps
 * this module.
 *
 * Supported input languages:
 *  - English          (passthrough)
 *  - Hinglish         (Roman-script Hindi mixed with English — static map)
 *  - Hindi/Devanagari (detected by Unicode range — flagged for AI translation)
 *  - Urdu             (detected by Unicode range — flagged for AI translation)
 *  - Bengali          (detected by Unicode range — flagged for AI translation)
 *
 * Exported functions
 * ──────────────────
 *  detect(text)              → { language, script, confidence }
 *  translateStatic(text)     → { translated, original, language, changed, method }
 *  normalizeQuery(text)      → { normalized, language, needsAI, changed }
 *  getSupportedLanguages()   → string[]
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   UNICODE SCRIPT RANGES
   ═══════════════════════════════════════════════════════════ */

const SCRIPT_RANGES = {
  devanagari: /[\u0900-\u097F]/,   // Hindi, Marathi, Sanskrit
  arabic:     /[\u0600-\u06FF]/,   // Urdu, Arabic
  bengali:    /[\u0980-\u09FF]/,   // Bengali, Assamese
  gujarati:   /[\u0A80-\u0AFF]/,
  gurmukhi:   /[\u0A00-\u0A7F]/,  // Punjabi
  tamil:      /[\u0B80-\u0BFF]/,
  telugu:     /[\u0C00-\u0C7F]/,
  kannada:    /[\u0C80-\u0CFF]/,
  malayalam:  /[\u0D00-\u0D7F]/,
};

/* ═══════════════════════════════════════════════════════════
   HINGLISH VOCABULARY
   High-frequency Hinglish words used to distinguish from English.
   Sorted by frequency — more common words first for fast exit.
   ═══════════════════════════════════════════════════════════ */

const HINGLISH_INDICATORS = new Set([
  // Copulas / auxiliaries
  'hai', 'hain', 'tha', 'thi', 'ho', 'hoga', 'hogi',
  // Prepositions / postpositions
  'mein', 'se', 'ka', 'ki', 'ke', 'par', 'tak',
  // Conjunctions
  'aur', 'ya', 'lekin', 'magar',
  // Negations
  'nahi', 'mat', 'na',
  // Question words
  'kya', 'kahan', 'kab', 'kyun', 'kaun', 'kitna',
  // Common adverbs
  'bahut', 'thoda', 'jyada', 'sirf', 'bilkul', 'zaroor',
  // Shopping-specific
  'sasta', 'saste', 'mehnga', 'accha', 'acchi', 'naya', 'purana',
  'paas', 'dur', 'kharidna', 'chahiye', 'milega', 'dukaan',
]);

/* ═══════════════════════════════════════════════════════════
   COMPREHENSIVE HINGLISH → ENGLISH MAP
   ═══════════════════════════════════════════════════════════ */

const HINGLISH_MAP = {
  // ── Phrases (process before single words) ──────────────
  'saste kapde':          'cheap clothes',
  'sasta mobile':         'budget phone',
  'sasta phone':          'budget phone',
  'acchi quality':        'good quality',
  'sabse sasta':          'cheapest',
  'sabse accha':          'best',
  'sabse acchi':          'best',
  'kharidna hai':         'want to buy',
  'lena hai':             'want to buy',
  'price kya hai':        'what is the price',
  'kitna price':          'what is the price',
  'dukaan kahan hai':     'where is the shop',
  'paas mein':            'nearby',
  'aas paas':             'nearby',
  'mere paas':            'near me',
  'mere nazdeek':         'near me',
  'door nahi':            'not far',
  'jaldi chahiye':        'need urgently',
  'abhi chahiye':         'need immediately',
  'kal tak':              'by tomorrow',
  'discount milega':      'can get discount',
  'bargaining hogi':      'can negotiate price',
  'home delivery chahiye': 'need home delivery',
  'cash on delivery':     'cash on delivery',
  'free delivery':        'free delivery',

  // ── Products ───────────────────────────────────────────
  'joote':      'shoes',
  'juta':       'shoes',
  'chappal':    'sandals',
  'chappals':   'sandals',
  'kapde':      'clothes',
  'kapda':      'cloth',
  'pant':       'pants',
  'salwar':     'salwar',
  'dupatta':    'dupatta',
  'topi':       'cap',
  'ghadi':      'watch',
  'ghariyal':   'watch',
  'fridge':     'refrigerator',
  'pankha':     'fan',
  'sabji':      'vegetables',
  'sabzi':      'vegetables',
  'dawa':       'medicine',
  'dawai':      'medicine',
  'kitab':      'books',
  'kitabein':   'books',
  'khilona':    'toys',
  'khilone':    'toys',
  'gahna':      'jewellery',
  'gehna':      'jewellery',
  'chaawal':    'rice',
  'chawal':     'rice',
  'aata':       'flour',
  'atta':       'wheat flour',
  'daal':       'lentils',
  'dal':        'lentils',
  'masala':     'spices',
  'mirchi':     'chilli',
  'haldi':      'turmeric',
  'namak':      'salt',
  'tel':        'oil',

  // ── Clothing specifics ─────────────────────────────────
  'kurti':      'kurti',          // keep — known English in Indian context
  'kurta':      'kurta',
  'saree':      'saree',
  'lehenga':    'lehenga',
  'dupatta':    'dupatta',
  'chunni':     'scarf',
  'salwar':     'salwar kameez',

  // ── Modifiers ──────────────────────────────────────────
  'sasta':      'cheap',
  'saste':      'cheap',
  'mehnga':     'expensive',
  'mehenge':    'expensive',
  'accha':      'good',
  'acchi':      'good',
  'acche':      'good',
  'bura':       'bad',
  'naya':       'new',
  'nayi':       'new',
  'purana':     'old',
  'purani':     'old',
  'chota':      'small',
  'bada':       'large',
  'badi':       'large',
  'sundar':     'beautiful',
  'branded':    'branded',
  'original':   'original',
  'nakli':      'fake',
  'asli':       'genuine',

  // ── Location ───────────────────────────────────────────
  'paas':       'nearby',
  'nazdeek':    'nearby',
  'kareeb':     'nearby',
  'dur':        'far',

  // ── Actions ────────────────────────────────────────────
  'kharidna':   'buy',
  'kharido':    'buy',
  'lena':       'buy',
  'lo':         'take',
  'dekhna':     'see',
  'dekho':      'look at',
  'batao':      'tell me',
  'dikhao':     'show me',
  'chahiye':    'need',
  'milega':     'available',
  'milegi':     'available',
};

/* ═══════════════════════════════════════════════════════════
   PUBLIC: detect
   ═══════════════════════════════════════════════════════════ */

/**
 * Detect the primary language/script of a text string.
 *
 * @param {string} text
 * @returns {{
 *   language:   'en' | 'hi' | 'hinglish' | 'ur' | 'bn' | 'gu' | 'pa' | 'ta' | 'te' | 'kn' | 'ml' | 'unknown',
 *   script:     'latin' | 'devanagari' | 'arabic' | 'bengali' | 'gujarati' | 'gurmukhi' | 'tamil' | 'telugu' | 'kannada' | 'malayalam',
 *   confidence: number,  // 0–1
 *   needsAI:    boolean, // true if non-Latin script detected (AI translation recommended)
 * }}
 */
function detect(text) {
  if (!text || typeof text !== 'string') {
    return { language: 'en', script: 'latin', confidence: 1.0, needsAI: false };
  }

  const t = text.trim();

  // ── Script detection (fast Unicode range check) ─────────
  for (const [script, re] of Object.entries(SCRIPT_RANGES)) {
    if (re.test(t)) {
      const langMap = {
        devanagari: 'hi', arabic: 'ur', bengali: 'bn',
        gujarati: 'gu', gurmukhi: 'pa', tamil: 'ta',
        telugu: 'te', kannada: 'kn', malayalam: 'ml',
      };
      return {
        language:   langMap[script] || 'unknown',
        script,
        confidence: 0.97,
        needsAI:    true,
      };
    }
  }

  // ── Hinglish detection (Latin script, Hindi vocabulary) ─
  const words     = t.toLowerCase().split(/\s+/);
  const totalWords = words.length;
  const hinglishCount = words.filter(w => HINGLISH_INDICATORS.has(w)).length;

  if (hinglishCount >= 2 || (totalWords >= 2 && hinglishCount / totalWords >= 0.25)) {
    const confidence = Math.min(0.95, 0.55 + (hinglishCount / totalWords) * 1.5);
    return { language: 'hinglish', script: 'latin', confidence, needsAI: false };
  }

  // Check for single well-known Hinglish words
  if (hinglishCount === 1 && totalWords <= 4) {
    return { language: 'hinglish', script: 'latin', confidence: 0.65, needsAI: false };
  }

  return { language: 'en', script: 'latin', confidence: 0.90, needsAI: false };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: translateStatic
   ═══════════════════════════════════════════════════════════ */

/**
 * Apply the static Hinglish→English map to a query.
 * Processes phrases first (longer matches take priority), then words.
 * Does NOT call any AI — fully synchronous and zero-latency.
 *
 * @param {string} text
 * @returns {{
 *   translated: string,
 *   original:   string,
 *   language:   string,
 *   changed:    boolean,
 *   method:     'static' | 'passthrough',
 *   replacements: { from, to }[],
 * }}
 */
function translateStatic(text) {
  if (!text || typeof text !== 'string') {
    return { translated: text, original: text, language: 'en', changed: false, method: 'passthrough', replacements: [] };
  }

  const original    = text;
  const { language } = detect(text);
  let result        = text.toLowerCase().trim();
  let changed       = false;
  const replacements = [];

  // Sort map entries by key length descending — longer phrases match first
  const entries = Object.entries(HINGLISH_MAP).sort((a, b) => b[0].length - a[0].length);

  for (const [hi, en] of entries) {
    if (result.includes(hi)) {
      result  = result.replace(new RegExp(hi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), en);
      changed = true;
      replacements.push({ from: hi, to: en });
    }
  }

  return {
    translated:   changed ? result : original,
    original,
    language,
    changed,
    method:       'static',
    replacements,
  };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: normalizeQuery
   ═══════════════════════════════════════════════════════════ */

/**
 * Full normalization pipeline for a search query.
 * Combines detection + static translation.
 * If non-Latin script is found, sets needsAI=true so the caller
 * can optionally pass to translationService.translateQuery().
 *
 * @param {string} text
 * @returns {{
 *   normalized: string,   // best available translation
 *   original:   string,
 *   language:   string,
 *   needsAI:    boolean,  // true if Devanagari/other script — static map insufficient
 *   changed:    boolean,
 *   method:     string,
 * }}
 */
function normalizeQuery(text) {
  if (!text || typeof text !== 'string') {
    return { normalized: '', original: text, language: 'en', needsAI: false, changed: false, method: 'passthrough' };
  }

  const detected = detect(text);

  // Non-Latin script — can't do static translation; flag for AI
  if (detected.needsAI) {
    return {
      normalized: text,           // return original — AI service will handle it
      original:   text,
      language:   detected.language,
      needsAI:    true,
      changed:    false,
      method:     'pending_ai',
    };
  }

  // Latin script — apply static map
  const { translated, changed, replacements, method } = translateStatic(text);

  return {
    normalized: translated,
    original:   text,
    language:   detected.language,
    needsAI:    false,
    changed,
    method,
    replacements,
  };
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: getSupportedLanguages
   ═══════════════════════════════════════════════════════════ */

function getSupportedLanguages() {
  return ['en', 'hi', 'hinglish', 'ur', 'bn', 'gu', 'pa', 'ta', 'te', 'kn', 'ml'];
}

/* ═══════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════ */

module.exports = {
  detect,
  translateStatic,
  normalizeQuery,
  getSupportedLanguages,
  // Expose maps for testing / extension
  HINGLISH_MAP,
  HINGLISH_INDICATORS,
};
