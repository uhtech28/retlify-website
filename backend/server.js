require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes   = require('./routes/auth');
const surveyRoutes = require('./routes/survey');
const statsRoutes  = require('./routes/stats');
const aiRoutes     = require('./routes/ai');

const app  = express();
app.set('trust proxy', 1); // ← ADD THIS LINE
const PORT = process.env.PORT || 5000;

// ── Security ─────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '10mb' })); // larger limit for base64 photos
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 30, message: { message: 'Too many requests. Try again later.' } });

// ── Serve frontend ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth',   authLimiter, authRoutes);
app.use('/auth',       authRoutes);   // for Google OAuth callbacks (/auth/google, /auth/google/callback)
app.use('/api/survey', surveyRoutes);
app.use('/api/stats',  statsRoutes);
app.use('/api/ai',     aiRoutes);
// Convenience alias: /api/generate-images → /api/ai/generate-images
app.post('/api/generate-images', (req, res, next) => {
  req.url = '/generate-images';
  aiRoutes(req, res, next);
});

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'Retlify API', time: new Date() }));

// ── POST /api/contact ─────────────────────────────────────
const nodemailer = require('nodemailer');
const contactLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, message: { message: 'Too many requests.' } });

const getMailer = () => nodemailer.createTransport({
  host:   'smtp.gmail.com',
  port:   465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'retlifyy@gmail.com',
    pass: process.env.SMTP_PASS || ''
  }
});
app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, message, timestamp } = req.body;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!name || name.trim().length < 2)        return res.status(400).json({ message: 'Invalid name.' });
    if (!email || !emailRe.test(email))          return res.status(400).json({ message: 'Invalid email.' });
    if (!message || message.trim().length < 10)  return res.status(400).json({ message: 'Message too short.' });

    const safe = s => String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;').trim();
    const safeTime = timestamp ? new Date(timestamp).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});

    await getMailer().sendMail({
      from:    `"Retlify Contact" <${process.env.SMTP_USER || 'retlifyy@gmail.com'}>`,
      to:      process.env.TO_EMAIL || 'retlifyy@gmail.com',
      replyTo: safe(email),
      subject: 'New Contact Form Submission - Retlify',
      text:    `Name: ${safe(name)}\nEmail: ${safe(email)}\nMessage:\n${safe(message)}\nSubmitted At: ${safeTime} (IST)`,
      html:    `<div style="font-family:sans-serif;max-width:540px;margin:auto"><div style="background:#111827;border-radius:12px 12px 0 0;padding:24px;display:flex;align-items:center;gap:10px"><span style="background:#FFD23F;border-radius:8px;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;font-weight:900;color:#111827">R</span><span style="color:#fff;font-weight:800;font-size:16px">Retlify</span></div><div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none"><h2 style="font-size:20px;margin:0 0 18px">New Contact Form Submission</h2><div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin-bottom:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9CA3AF;letter-spacing:.6px;margin-bottom:5px">Name</div><div style="font-size:15px;font-weight:700;color:#111827">${safe(name)}</div></div><div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin-bottom:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9CA3AF;letter-spacing:.6px;margin-bottom:5px">Email</div><div style="font-size:15px;font-weight:700;color:#2563EB">${safe(email)}</div></div><div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin-bottom:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9CA3AF;letter-spacing:.6px;margin-bottom:5px">Message</div><div style="font-size:14px;color:#374151;line-height:1.65;white-space:pre-wrap">${safe(message)}</div></div><div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin-bottom:20px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9CA3AF;letter-spacing:.6px;margin-bottom:5px">Submitted At</div><div style="font-size:14px;font-weight:600;color:#111827">${safeTime} (IST)</div></div><div style="text-align:center"><a href="mailto:${safe(email)}?subject=Re: Your message to Retlify" style="display:inline-block;background:#FFD23F;color:#111827;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px">Reply to ${safe(name)}</a></div></div><div style="background:#F9FAFB;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:12px 24px;font-size:11px;color:#9CA3AF;text-align:center">Sent by Retlify contact form</div></div>`
    });

    console.log(`[Contact] Email sent from ${safe(email)} (${safe(name)})`);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Contact] Error:', err.message);
    res.status(500).json({ message: 'Failed to send message.' });
  }
});

// ── Serve HTML pages ──────────────────────────────────────
const pages = ['login','signup','survey','dashboard','forgot-password','reset-password','privacy-policy','contact'];
pages.forEach(p => {
  app.get(`/${p}.html`, (req, res) => res.sendFile(path.join(__dirname, `../frontend/${p}.html`)));
});
// ── Landing page is the homepage ──────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/landing.html')));

// ── Clean-URL aliases for landing page CTAs ───────────────
app.get('/login',  (req, res) => res.sendFile(path.join(__dirname, '../frontend/login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, '../frontend/signup.html')));

// ── 404 for unknown API ───────────────────────────────────
app.use('/api/*', (req, res) => res.status(404).json({ message: `API route not found: ${req.originalUrl}` }));

// ── Global error handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.statusCode || 500).json({ message: err.message || 'Internal server error.' });
});

// ── MongoDB + Start ───────────────────────────────────────
if (!process.env.MONGO_URI || process.env.MONGO_URI.includes('REPLACE_USER')) {
  console.error('❌  MONGO_URI is not set in your .env file.');
  console.error('👉  Open backend/.env and replace MONGO_URI with your MongoDB Atlas connection string.');
  console.error('    Example: MONGO_URI=mongodb+srv://myuser:mypassword@cluster0.abcde.mongodb.net/retlify');
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 10000, // fail fast if unreachable
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('✅  MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚀  Retlify → http://localhost:${PORT}`);
      console.log(`📧  Survey emails → ${process.env.TO_EMAIL || 'retlifyy@gmail.com'}`);
      console.log(`📱  OTP DEV MODE: Check console for OTPs when Twilio not configured`);
      if (!process.env.GOOGLE_CLIENT_ID) console.log(`⚠️   Google OAuth: Add GOOGLE_CLIENT_ID to .env to enable`);
      if (!process.env.SMTP_PASS || process.env.SMTP_PASS.includes('REPLACE'))
        console.log(`⚠️   Email: Add SMTP_PASS (Gmail App Password) to .env to enable survey emails`);
    });
  })
  .catch(err => {
    console.error('❌  MongoDB connection failed:', err.message);
    if (err.message.includes('ENOTFOUND') || err.message.includes('ETIMEDOUT')) {
      console.error('👉  Cannot reach MongoDB Atlas. Check:');
      console.error('    1. Your MONGO_URI in .env has the correct username/password');
      console.error('    2. Your IP is whitelisted in MongoDB Atlas → Network Access');
      console.error('    3. The cluster name/region in the URI is correct');
    } else if (err.message.includes('Authentication failed')) {
      console.error('👉  Wrong username or password in MONGO_URI');
    } else {
      console.error('👉  Fix MONGO_URI in backend/.env');
    }
    process.exit(1);
  });

module.exports = app;
