/**
 * Retlify — Translation & Language Service  (v3)
 * ================================================
 * Upgrade over v2:
 *  - Delegates language detection + static translation to utils/translator.js
 *  - Consistent detect → static → AI pipeline with clear method tagging
 *  - translateQuery() is now the single entry point for all callers
 *  - Non-Latin scripts (Devanagari, Bengali, etc.) are sent to AI provider
 *  - Hinglish/Roman-script queries are resolved statically (zero API cost)
 *  - Every result carries: { translated, original, language, changed, method }
 *
 * Pipeline
 * ────────
 *  1. utils/translator.detect()        → determine script / language
 *  2. utils/translator.translateStatic() → apply Hinglish→English map
 *  3. If needsAI (Devanagari etc.)     → AI provider translation (cached 24h)
 *  4. Return normalised result
 */

'use strict';

const gemini     = require('./geminiService');
const cache      = require('./cacheService');
const translator = require('../utils/translator');

/* ── AI translation for non-Latin scripts ────────────────── */

async function _aiTranslate(text, detectedLanguage) {
  const cKey   = cache.cacheKey('translate_ai', text);
  const cached = await cache.get(cKey);
  if (cached) return cached;

  const langName = {
    hi: 'Hindi', ur: 'Urdu', bn: 'Bengali',
    gu: 'Gujarati', pa: 'Punjabi', ta: 'Tamil',
    te: 'Telugu', kn: 'Kannada', ml: 'Malayalam',
  }[detectedLanguage] || 'Indian language';

  try {
    const aiTranslated = await gemini.generateText(
      `Translate this ${langName} retail search query to English.\nReturn ONLY the English translation — no explanation, no punctuation changes.\nQuery: "${text}"`,
      { model: 'flash', maxTokens: 120, temperature: 0.1 }
    );

    if (aiTranslated?.trim()) {
      const result = {
        translated: aiTranslated.trim(),
        original:   text,
        language:   detectedLanguage,
        changed:    true,
        method:     'ai',
      };
      await cache.set(cKey, result, cache.TTL.TRANSLATION);
      return result;
    }
  } catch (err) {
    console.error('[Translation] AI error:', err.message);
  }

  // AI failed — return original with flag so caller knows it's untranslated
  return {
    translated: text,
    original:   text,
    language:   detectedLanguage,
    changed:    false,
    method:     'ai_failed',
  };
}

/* ── Main entry point ────────────────────────────────────── */

/**
 * Translate a query to English using the tiered pipeline:
 *  detect → static map → AI (if needed).
 *
 * @param {string} query
 * @returns {Promise<{
 *   translated: string,
 *   original:   string,
 *   language:   string,
 *   changed:    boolean,
 *   method:     'passthrough' | 'static' | 'ai' | 'ai_failed',
 * }>}
 */
async function translateQuery(query) {
  if (!query || typeof query !== 'string') {
    return { translated: query || '', original: query || '', language: 'en', changed: false, method: 'passthrough' };
  }

  // Step 1 + 2: detect language and apply static Hinglish map
  const normalized = translator.normalizeQuery(query);

  // Step 3: Non-Latin script — attempt AI translation
  if (normalized.needsAI && gemini.isAvailable()) {
    return _aiTranslate(query, normalized.language);
  }

  // Non-Latin but no AI key — return as-is with warning flag
  if (normalized.needsAI) {
    return {
      translated: query,
      original:   query,
      language:   normalized.language,
      changed:    false,
      method:     'ai_unavailable',
    };
  }

  // Hinglish / English — static result is sufficient
  return {
    translated: normalized.normalized,
    original:   normalized.original,
    language:   normalized.language,
    changed:    normalized.changed,
    method:     normalized.changed ? 'static' : 'passthrough',
  };
}

/**
 * Lightweight language detector — delegates to utils/translator.
 * Returns language code string for backward compatibility.
 */
function detectLanguage(text) {
  return translator.detect(text || '').language;
}

module.exports = { translateQuery, detectLanguage };
