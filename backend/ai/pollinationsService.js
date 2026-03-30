/**
 * Retlify — Pollinations AI Service
 * ===================================
 * 100% FREE image generation via Pollinations.ai
 * No API key required. No payment. No rate-limit surprises.
 *
 * API format:
 *   https://image.pollinations.ai/prompt/{encoded_prompt}
 *   ?width=1024&height=1024&seed={seed}&nologo=true&model=flux
 *
 * Returns a direct image URL (GET → image/jpeg).
 * We validate the URL is live by sending a HEAD request before returning.
 */

'use strict';

const https = require('https');

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const BASE_URL    = 'https://image.pollinations.ai/prompt';
const DEFAULT_W   = 1024;
const DEFAULT_H   = 1024;
const HEAD_TIMEOUT = 12_000; // ms — how long to wait for URL validation

/* ═══════════════════════════════════════════════════════════
   URL BUILDER
   ═══════════════════════════════════════════════════════════ */

/**
 * Build a Pollinations image URL from a prompt string.
 *
 * @param {string} prompt  - Full image prompt
 * @param {object} opts
 *   @param {number} [opts.seed=42]
 *   @param {number} [opts.width=1024]
 *   @param {number} [opts.height=1024]
 *   @param {string} [opts.model='flux']  - 'flux' | 'turbo' | 'stable-diffusion'
 * @returns {string} - Direct image URL
 */
function buildUrl(prompt, { seed = 42, width = DEFAULT_W, height = DEFAULT_H, model = 'flux' } = {}) {
  const encodedPrompt = encodeURIComponent(prompt);
  return `${BASE_URL}/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=${model}`;
}

/* ═══════════════════════════════════════════════════════════
   URL VALIDATION (lightweight HEAD check)
   ═══════════════════════════════════════════════════════════ */

/**
 * Validate that a Pollinations URL is reachable.
 * Uses native https to avoid axios dependency in this module.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
function validateUrl(url) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), HEAD_TIMEOUT);
    try {
      const req = https.request(url, { method: 'HEAD' }, (res) => {
        clearTimeout(timer);
        // 200 or 3xx redirects both indicate the image exists
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on('error', () => { clearTimeout(timer); resolve(false); });
      req.end();
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   SINGLE IMAGE GENERATION
   ═══════════════════════════════════════════════════════════ */

/**
 * Generate a single product image URL via Pollinations.
 *
 * @param {object} opts
 *   @param {string}  opts.prompt
 *   @param {number}  [opts.seed=42]
 *   @param {number}  [opts.width=1024]
 *   @param {number}  [opts.height=1024]
 *   @param {string}  [opts.model='flux']
 *   @param {boolean} [opts.validate=true]  - whether to HEAD-check the URL
 * @returns {Promise<{url: string|null, valid: boolean, seed: number}>}
 */
async function generateImageUrl(opts = {}) {
  const {
    prompt   = '',
    seed     = 42,
    width    = DEFAULT_W,
    height   = DEFAULT_H,
    model    = 'flux',
    validate = true,
  } = opts;

  if (!prompt.trim()) return { url: null, valid: false, seed };

  const url = buildUrl(prompt, { seed, width, height, model });

  if (!validate) return { url, valid: true, seed };

  const valid = await validateUrl(url);
  return { url: valid ? url : null, valid, seed };
}

/* ═══════════════════════════════════════════════════════════
   BATCH GENERATION (4 variations in parallel)
   ═══════════════════════════════════════════════════════════ */

/**
 * Generate 4 image URLs in parallel using different seeds.
 * Returns all results; callers should filter out invalid ones.
 *
 * @param {string} prompt
 * @param {object} opts
 *   @param {number[]} [opts.seeds]        - Override seeds array (length 4)
 *   @param {number}   [opts.width=1024]
 *   @param {number}   [opts.height=1024]
 *   @param {string}   [opts.model='flux']
 *   @param {boolean}  [opts.validate=true]
 * @returns {Promise<Array<{url, valid, seed}>>}
 */
async function generateBatch(prompt, opts = {}) {
  const {
    seeds    = [1, 2, 3, 4],
    width    = DEFAULT_W,
    height   = DEFAULT_H,
    model    = 'flux',
    validate = true,
  } = opts;

  return Promise.all(
    seeds.map(seed => generateImageUrl({ prompt, seed, width, height, model, validate }))
  );
}

/* ═══════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════ */

module.exports = {
  buildUrl,
  validateUrl,
  generateImageUrl,
  generateBatch,
};
