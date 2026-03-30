/**
 * Retlify — UserBehavior Model
 * Persistent MongoDB storage for per-user behavioral events.
 *
 * Design decisions:
 *  - One document per user (single-doc pattern) — O(1) lookup by userId.
 *  - actions[] is a bounded, capped array (never > MAX_ACTIONS via application logic).
 *  - categoryScores is a flat object (category → float) updated in-place.
 *  - TTL index on `updatedAt` lets MongoDB auto-purge inactive profiles (optional).
 *  - Indexed on userId for O(log n) lookups.
 */

'use strict';

const mongoose = require('mongoose');

/* ── Sub-schemas ─────────────────────────────────────────── */

const actionSchema = new mongoose.Schema(
  {
    type: {
      type:     String,
      required: true,
      enum:     ['search', 'click', 'view', 'chatbot_query', 'purchase', 'location'],
    },
    data:      { type: mongoose.Schema.Types.Mixed, required: true },
    timestamp: { type: Number, required: true, index: true },  // Unix ms — faster range queries than Date
  },
  { _id: false }  // No per-action ObjectId — saves storage and index overhead
);

/* ── Root schema ─────────────────────────────────────────── */

const userBehaviorSchema = new mongoose.Schema(
  {
    userId: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },

    // Bounded action log (trimmed to MAX_ACTIONS by the service layer)
    actions: {
      type:    [actionSchema],
      default: [],
    },

    // Pre-computed category interest scores (decayed weights)
    // Stored as a flat object: { "footwear": 3.2, "electronics": 1.1, ... }
    categoryScores: {
      type:    mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Convenience counters (denormalised for fast profile reads)
    searchCount:   { type: Number, default: 0, min: 0 },
    clickCount:    { type: Number, default: 0, min: 0 },
    viewCount:     { type: Number, default: 0, min: 0 },
    chatbotCount:  { type: Number, default: 0, min: 0 },

    // Last seen location (city / coords from frontend)
    location: {
      city: { type: String, default: null },
      lat:  { type: Number, default: null },
      lng:  { type: Number, default: null },
    },

    lastSeenAt: { type: Number, default: () => Date.now() },
  },
  {
    timestamps: true,  // createdAt, updatedAt managed by Mongoose
    versionKey: false,
  }
);

/* ── Indexes ─────────────────────────────────────────────── */

// Compound index: query actions by type + recency
userBehaviorSchema.index({ userId: 1, 'actions.type': 1 });

// Partial index: efficiently find users active in last 30 days
userBehaviorSchema.index(
  { lastSeenAt: -1 },
  { partialFilterExpression: { lastSeenAt: { $exists: true } } }
);

/* ── Static helpers ──────────────────────────────────────── */

/**
 * findOrCreate — atomic upsert, returns the document.
 * Safe for concurrent requests: findOneAndUpdate with upsert:true prevents
 * duplicate-key race conditions better than find + save.
 */
userBehaviorSchema.statics.findOrCreate = function (userId) {
  return this.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, actions: [], categoryScores: {}, lastSeenAt: Date.now() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('UserBehavior', userBehaviorSchema);
