/**
 * imageService.js
 * ────────────────
 * Image generation pipeline — 3-level fallback chain:
 *   Level 1 → Puter.js   (browser AI, free, no API key)
 *   Level 2 → Pollinations (direct URL, free, no API key)
 *   Level 3 → Picsum Photos (deterministic placeholder, never fails)
 *
 * Exports:
 *   generateImages(analysis, onProgress) → Promise<ImageResult[]>
 *   processProductImage(file, analysis, onProgress) → Promise<ImageResult[]>
 */

import { buildPrompts } from '../utils/promptBuilder.js';

/* ─── Deterministic seeds for Picsum fallback ─────────────────── */
const SEEDS = { studio: 42, model: 73, lifestyle: 91, editorial: 17 };

/* ─── Puter.js loader (lazy, cached) ─────────────────────────── */
let _puterReady = null;

function _loadPuter() {
  if (_puterReady) return _puterReady;
  _puterReady = new Promise((resolve, reject) => {
    // Already available (loaded from index.html <script>)
    if (typeof window !== 'undefined' && window.puter?.ai?.txt2img) {
      return resolve(window.puter);
    }
    // Inject script dynamically
    const script = document.createElement('script');
    script.src = 'https://js.puter.com/v2/';
    script.async = true;
    let attempts = 0;
    script.onload = () => {
      const poll = setInterval(() => {
        if (window.puter?.ai?.txt2img) {
          clearInterval(poll);
          resolve(window.puter);
        }
        if (++attempts > 120) { // 12s timeout
          clearInterval(poll);
          reject(new Error('Puter.js: txt2img unavailable after 12s'));
        }
      }, 100);
    };
    script.onerror = () => reject(new Error('Puter.js: script failed to load'));
    document.head.appendChild(script);
  });
  return _puterReady;
}

/* ─── Level 1: Puter.js ──────────────────────────────────────── */
async function _tryPuter(prompt) {
  try {
    const puter = await _loadPuter();
    const result = await puter.ai.txt2img(prompt, false);
    if (!result) throw new Error('Empty result');
    if (result?.src) return { url: result.src, source: 'puter' };
    if (typeof result === 'string' && result.startsWith('http')) return { url: result, source: 'puter' };
    if (result instanceof Blob) return { url: URL.createObjectURL(result), source: 'puter' };
    if (result instanceof HTMLImageElement && result.src) return { url: result.src, source: 'puter' };
    throw new Error(`Unrecognised result shape: ${typeof result}`);
  } catch (err) {
    console.warn('[ImageService] Puter failed:', err.message);
    return null;
  }
}

/* ─── Level 2: Pollinations.ai ───────────────────────────────── */
function _pollinationsUrl(prompt, seed) {
  const safe = String(prompt || '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, 480)
    .trim();
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(safe)}?width=768&height=768&seed=${seed}&nologo=true&enhance=true&model=flux`;
}

async function _tryPollinations(prompt, seed) {
  try {
    const url = _pollinationsUrl(prompt, seed);
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
      setTimeout(() => reject(new Error('Timeout')), 25000);
    });
    return { url, source: 'pollinations' };
  } catch (err) {
    console.warn('[ImageService] Pollinations failed:', err.message);
    return null;
  }
}

/* ─── Level 3: Picsum (always works) ─────────────────────────── */
function _picsumUrl(type, extra = 0) {
  const seed = (SEEDS[type] || 42) + extra;
  return `https://picsum.photos/seed/${seed}/768/768`;
}

/* ─── Single image generator (full fallback chain) ────────────── */
async function _generateOne(promptObj, index) {
  const seed = 1000 + index * 419;

  // Level 1
  const puter = await _tryPuter(promptObj.prompt);
  if (puter) return { ...promptObj, ...puter, status: 'done' };

  // Level 2
  const poll = await _tryPollinations(promptObj.prompt, seed);
  if (poll) return { ...promptObj, ...poll, status: 'done' };

  // Level 3 — guaranteed
  return {
    ...promptObj,
    url: _picsumUrl(promptObj.type, index),
    source: 'picsum',
    status: 'done',
  };
}

/**
 * generateImages — generates all 4 product images in parallel.
 *
 * @param {{ category, color, pattern, material }} analysis
 * @param {(index: number) => void} [onProgress]
 * @returns {Promise<ImageResult[]>} Always 4 items, never throws.
 */
export async function generateImages(analysis, onProgress) {
  const prompts = buildPrompts(analysis);
  const results = new Array(4);

  await Promise.all(
    prompts.map(async (promptObj, index) => {
      try {
        results[index] = await _generateOne(promptObj, index);
      } catch (err) {
        console.error('[ImageService] Unexpected error at index', index, err);
        results[index] = {
          ...promptObj,
          url: _picsumUrl(promptObj.type, index),
          source: 'picsum',
          status: 'done',
        };
      }
      if (typeof onProgress === 'function') onProgress(index);
    })
  );

  return results;
}

/**
 * processProductImage — full pipeline: analyze → prompts → generate.
 * Entry point for direct file processing.
 *
 * @param {File} file
 * @param {{ category, color, pattern, material }} analysis
 * @param {(index: number) => void} [onProgress]
 * @returns {Promise<ImageResult[]>}
 */
export async function processProductImage(file, analysis, onProgress) {
  return generateImages(analysis, onProgress);
}
