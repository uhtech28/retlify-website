/**
 * Retlify — Image Analysis Module  (Product Studio v2)
 * ======================================================
 * Handles both multer file objects ({ buffer, mimetype, originalname })
 * and legacy base64 objects ({ base64, mimeType, name }).
 */

'use strict';

const { analyzeProductImage, analyzeMultipleImages } = require('./productAnalyzer');

/**
 * Normalise a file to { base64, mimeType, name } regardless of source.
 */
function _normalise(file) {
  // Already base64 object (legacy processedImages format)
  if (file.base64) return file;
  // Multer file object with buffer
  if (file.buffer) {
    return {
      base64:   file.buffer.toString('base64'),
      mimeType: file.mimetype,
      name:     file.originalname || 'image',
    };
  }
  return null;
}

/**
 * Analyse multiple images.
 * Accepts multer file arrays OR legacy base64 arrays.
 */
async function analyzeUploadedImages(files = [], productName = '') {
  if (!files.length) return null;
  const imageObjs = files.map(_normalise).filter(Boolean);
  if (!imageObjs.length) return null;
  return analyzeMultipleImages(imageObjs, productName);
}

/**
 * Quick safety check on a single file.
 */
async function safetyCheck(file) {
  const obj = _normalise(file);
  if (!obj) return { safe: true };
  const result = await analyzeProductImage(obj.base64, obj.mimeType, '');
  return { safe: result.safe !== false, reason: result.reason || null };
}

module.exports = { analyzeUploadedImages, safetyCheck };
