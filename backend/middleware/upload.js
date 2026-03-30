/**
 * Retlify — Upload Middleware
 * ============================
 * Multer configuration for Product Studio image uploads.
 *
 * - Memory storage (no disk writes for temp files)
 * - Max 5 images per request
 * - 10MB per file limit
 * - Accepts: jpg, jpeg, png, webp
 * - Attaches base64 + mimeType to req.processedImages
 */

'use strict';

const multer = require('multer');
const path   = require('path');

/* ── Allowed MIME types ──────────────────────────────────── */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/* ── Multer: memory storage ──────────────────────────────── */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext  = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (ALLOWED_MIME.has(mime) && ALLOWED_EXT.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.originalname}. Only JPG, PNG, and WebP are allowed.`), false);
  }
};

const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:  10 * 1024 * 1024,  // 10MB per file
    files:     5,                  // max 5 images
  },
});

/* ── processImages: convert buffer → base64 ─────────────── */
/**
 * Middleware to convert uploaded file buffers to base64 strings.
 * Attaches req.processedImages = [{ base64, mimeType, name, size }]
 */
function processImages(req, res, next) {
  if (!req.files || !req.files.length) {
    req.processedImages = [];
    return next();
  }

  req.processedImages = req.files.map(file => ({
    base64:   file.buffer.toString('base64'),
    mimeType: file.mimetype,
    name:     file.originalname,
    size:     file.size,
  }));

  next();
}

/* ── Error handler for multer errors ─────────────────────── */
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Maximum 5 images allowed per upload.' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Each image must be under 10MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
}

module.exports = {
  upload: uploadMiddleware,
  processImages,
  handleUploadError,
};
