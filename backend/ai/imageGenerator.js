/**
 * imageGenerator.js — v3 shim
 * Kept for backward-compat. All logic is now in imageGenerationService.js
 */
'use strict';
const { generateImages, generateEnhancedImages } = require('./imageGenerationService');

async function generateStudioImages(analysis, { productName = '', category = null } = {}) {
  return generateImages({ productName, category: category || analysis?.category || '' });
}

module.exports = { generateStudioImages };
