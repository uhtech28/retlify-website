/**
 * Retlify — imageService.js
 * ==========================
 * Generates 4 product images using a 3-level fallback chain:
 *
 *   Level 1 — Puter.js       browser-side AI, free, no API key
 *   Level 2 — Pollinations   server-side URL, free, no API key
 *   Level 3 — Picsum Photos  deterministic placeholder, never fails
 *
 * Main export:
 *   window.generateImages(product) → Promise<ImageResult[]>
 *
 * ImageResult shape:
 *   { url, type, label, emoji, source, prompt, error }
 *
 * Depends on:
 *   promptBuilder.js  (must be loaded first — provides window.buildImagePrompts)
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   PICSUM SEED MAP
   Deterministic seeds so same product type → same placeholder.
   Used as Level-3 final fallback.
───────────────────────────────────────────────────────────── */
const PICSUM_SEEDS = {
  studio:    42,
  model:     73,
  lifestyle: 91,
  editorial: 17,
};

function _picsumUrl(type, productName) {
  // Mix product name into seed for variety across products
  const nameHash = Array.from(String(productName || '')).reduce(
    (acc, ch) => acc + ch.charCodeAt(0), 0
  );
  const seed = (PICSUM_SEEDS[type] || 42) + (nameHash % 100);
  return `https://picsum.photos/seed/${seed}/512/512`;
}

/* ─────────────────────────────────────────────────────────────
   POLLINATIONS URL BUILDER
   Free, no API key, direct image URL.
   Used as Level-2 fallback when Puter.js fails.
───────────────────────────────────────────────────────────── */
function _pollinationsUrl(prompt, seed) {
  const safe  = String(prompt || '')
    .replace(/<[^>]+>/g, '')          // strip HTML
    .replace(/[\x00-\x1F\x7F]/g, '') // strip control chars
    .substring(0, 500)               // cap length
    .trim();
  const encodedPrompt = encodeURIComponent(safe);
  const s = seed || 42;
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${s}&nologo=true&model=flux`;
}

/* ─────────────────────────────────────────────────────────────
   PUTER.JS LOADER
   Dynamically injects the SDK once, caches the promise.
───────────────────────────────────────────────────────────── */
let _puterPromise = null;

function _loadPuter() {
  if (_puterPromise) return _puterPromise;

  _puterPromise = new Promise((resolve, reject) => {
    // Already loaded
    if (typeof window !== 'undefined' && window.puter && window.puter.ai &&
        typeof window.puter.ai.txt2img === 'function') {
      return resolve(window.puter);
    }

    const script   = document.createElement('script');
    script.src     = 'https://js.puter.com/v2/';
    script.async   = true;

    script.onload  = () => {
      // Poll until puter.ai.txt2img is available
      let attempts = 0;
      const poll = setInterval(() => {
        if (window.puter && window.puter.ai && typeof window.puter.ai.txt2img === 'function') {
          clearInterval(poll);
          resolve(window.puter);
        }
        if (++attempts > 150) {  // 15 second timeout
          clearInterval(poll);
          reject(new Error('Puter.js: txt2img not available after 15s'));
        }
      }, 100);
    };

    script.onerror = () => reject(new Error('Puter.js: failed to load SDK script'));
    document.head.appendChild(script);
  });

  return _puterPromise;
}

/* ─────────────────────────────────────────────────────────────
   GENERATE ONE IMAGE  (with full fallback chain)

   Tries:  Puter.js → Pollinations URL → Picsum
   Never throws. Always returns a valid { url, source } object.
───────────────────────────────────────────────────────────── */
async function _generateOne(shotConfig, productName) {
  const { type, label, emoji, prompt } = shotConfig;
  const seed = PICSUM_SEEDS[type] || 42;

  // ── Level 1: Puter.js ──────────────────────────────────────
  try {
    const puter = await _loadPuter();
    const imgEl = await puter.ai.txt2img(prompt, false);

    if (imgEl && imgEl.src) {
      return { url: imgEl.src, source: 'puter', type, label, emoji, prompt, error: false };
    }
  } catch (err) {
    console.warn(`[ImageService] Puter.js failed for "${type}":`, err.message);
  }

  // ── Level 2: Pollinations ──────────────────────────────────
  try {
    const url = _pollinationsUrl(prompt, seed);
    // Return URL immediately — Pollinations is a direct image URL,
    // the <img> tag will load it; onerror handles any dead URL.
    return { url, source: 'pollinations', type, label, emoji, prompt, error: false };
  } catch (err) {
    console.warn(`[ImageService] Pollinations failed for "${type}":`, err.message);
  }

  // ── Level 3: Picsum (always works) ────────────────────────
  return {
    url:    _picsumUrl(type, productName),
    source: 'picsum',
    type,
    label,
    emoji,
    prompt,
    error:  false,
  };
}

/* ─────────────────────────────────────────────────────────────
   MAIN EXPORT: generateImages(product)

   @param {object} product
     product.productName  {string}  required
     product.category     {string}  optional
     product.features     {string|string[]}  optional
     product.onProgress   {function}  optional — called after each image completes

   @returns {Promise<ImageResult[]>}  — always 4 items, never throws
───────────────────────────────────────────────────────────── */
async function generateImages(product) {
  if (!product || !String(product.productName || product.name || '').trim()) {
    throw new Error('generateImages: productName is required');
  }

  // Build all 4 prompts using the prompt builder
  if (typeof window.buildImagePrompts !== 'function') {
    throw new Error('generateImages: promptBuilder.js must be loaded before imageService.js');
  }

  const prompts     = window.buildImagePrompts(product);
  const shotTypes   = ['studio', 'model', 'lifestyle', 'editorial'];
  const productName = String(product.productName || product.name || '');
  let   completed   = 0;

  console.log('[ImageService] Generating 4 images for:', productName);

  // Fire all 4 in parallel — individual failures don't block the others
  const tasks = shotTypes.map(type =>
    _generateOne(prompts[type], productName)
      .then(result => {
        completed++;
        if (typeof product.onProgress === 'function') {
          product.onProgress(completed, shotTypes.length, type);
        }
        return result;
      })
      .catch(err => {
        // Should never reach here (each _generateOne has its own fallback)
        // but we guard anyway
        console.error(`[ImageService] Unexpected error for "${type}":`, err.message);
        return {
          url:    _picsumUrl(type, productName),
          source: 'picsum',
          type,
          label:  prompts[type]?.label || type,
          emoji:  prompts[type]?.emoji || '📦',
          prompt: prompts[type]?.prompt || '',
          error:  false,
        };
      })
  );

  const results = await Promise.all(tasks);

  console.log('[ImageService] Done. Sources:', results.map(r => `${r.type}:${r.source}`).join(' | '));
  return results;
}

/* ─────────────────────────────────────────────────────────────
   BROWSER EXPORTS
───────────────────────────────────────────────────────────── */
if (typeof window !== 'undefined') {
  window.generateImages = generateImages;
  window._picsumUrl     = _picsumUrl;        // exposed for onerror handlers
  window._pollinationsUrl = _pollinationsUrl; // exposed for testing
}

/* ─────────────────────────────────────────────────────────────
   NODE EXPORTS
───────────────────────────────────────────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateImages, _picsumUrl, _pollinationsUrl };
}
