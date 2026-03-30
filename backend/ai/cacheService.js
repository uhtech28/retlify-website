/**
 * Retlify AI Cache Service
 * In-memory LRU-style cache with TTL for AI responses.
 * Drop-in Redis-compatible interface — swap store for ioredis when scaling.
 *
 * Usage:
 *   const cache = require('./cacheService');
 *   await cache.set('key', value, 60);   // 60s TTL
 *   const v = await cache.get('key');    // null if missing/expired
 *   await cache.del('key');
 *   cache.stats();                        // { hits, misses, size }
 */

'use strict';

const DEFAULT_TTL_SECONDS = 300;   // 5 min
const MAX_ENTRIES         = 500;   // evict oldest when full
const NAMESPACE_SEP       = ':';

// Internal store: key → { value, expiresAt }
const _store = new Map();

// Metrics
let _hits   = 0;
let _misses = 0;

/* ── Core operations ─────────────────────────────────────── */

/**
 * Get a cached value.
 * Returns the value or null if missing / expired.
 */
async function get(key) {
  const entry = _store.get(key);
  if (!entry) { _misses++; return null; }

  if (Date.now() > entry.expiresAt) {
    _store.delete(key);
    _misses++;
    return null;
  }

  _hits++;
  return entry.value;
}

/**
 * Store a value with optional TTL in seconds.
 */
async function set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  // Evict oldest entry if at capacity
  if (_store.size >= MAX_ENTRIES) {
    const firstKey = _store.keys().next().value;
    _store.delete(firstKey);
  }

  _store.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
    createdAt: Date.now(),
  });
}

/**
 * Delete a cached entry.
 */
async function del(key) {
  _store.delete(key);
}

/**
 * Delete all entries matching a prefix (namespace invalidation).
 * e.g. invalidateNamespace('suggestions') clears all 'suggestions:...' keys.
 */
async function invalidateNamespace(namespace) {
  const prefix = namespace + NAMESPACE_SEP;
  for (const key of _store.keys()) {
    if (key.startsWith(prefix)) _store.delete(key);
  }
}

/**
 * Build a consistent cache key from parts.
 * cacheKey('suggestions', query, city) → 'suggestions:shoes near me:jaipur'
 */
function cacheKey(...parts) {
  return parts
    .map(p => String(p || '').toLowerCase().trim().replace(/\s+/g, ' '))
    .join(NAMESPACE_SEP);
}

/**
 * Wrap an async function with caching.
 * const cachedFn = withCache(expensiveFn, (args) => cacheKey('ns', ...args), 120);
 */
function withCache(fn, keyFn, ttlSeconds = DEFAULT_TTL_SECONDS) {
  return async function (...args) {
    const key = keyFn(args);
    const cached = await get(key);
    if (cached !== null) return cached;

    const result = await fn(...args);
    await set(key, result, ttlSeconds);
    return result;
  };
}

/**
 * Purge all expired entries (call periodically to free memory).
 */
function purgeExpired() {
  const now = Date.now();
  let purged = 0;
  for (const [key, entry] of _store.entries()) {
    if (now > entry.expiresAt) { _store.delete(key); purged++; }
  }
  return purged;
}

/**
 * Return cache statistics.
 */
function stats() {
  return {
    size:       _store.size,
    hits:       _hits,
    misses:     _misses,
    hitRate:    _hits + _misses > 0
      ? Math.round((_hits / (_hits + _misses)) * 100) + '%'
      : 'N/A',
    maxEntries: MAX_ENTRIES,
  };
}

// Auto-purge expired entries every 5 minutes
setInterval(purgeExpired, 5 * 60 * 1000).unref?.();

/* ── TTL presets ─────────────────────────────────────────── */
const TTL = {
  SUGGESTIONS:    60,    // 1 min — real-time feel
  RECOMMENDATIONS: 300,  // 5 min — personalisation
  TRENDS:         600,   // 10 min — slower-moving data
  INSIGHTS:       900,   // 15 min — analytics heavy
  DESCRIPTION:    3600,  // 1 hr  — rarely changes
  TRANSLATION:    86400, // 24 hr — static linguistic data
};

module.exports = { get, set, del, invalidateNamespace, cacheKey, withCache, stats, TTL };
