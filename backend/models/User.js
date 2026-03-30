const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const SUPPORTED_LANGUAGES = ['en','hi','bn','te','mr','ta','gu','kn','ml','pa','or','as','ur'];

const userSchema = new mongoose.Schema({
  name:             { type: String, required: true, trim: true, minlength: 2 },
  email:            { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:         { type: String, required: true, minlength: 8, select: false },
  phone:            { type: String, unique: true, sparse: true },
  googleId:         { type: String, default: null },
  surveyCompleted:  { type: Boolean, default: false },
  resetToken:       { type: String, default: null },
  resetTokenExpiry: { type: Date,   default: null },

  // ── i18n ──────────────────────────────────────────────────
  // User's preferred language (ISO 639-1 code)
  // Saved on language change and restored on login
  language:         {
    type: String,
    default: 'en',
    enum: SUPPORTED_LANGUAGES,
  },

  // Stats tracking
  profileViews:     { type: Number, default: 0 },
  productCount:     { type: Number, default: 0 },
  queryCount:       { type: Number, default: 0 },
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
