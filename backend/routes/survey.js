const express    = require('express');
const router     = express.Router();
const { Resend } = require('resend');
const Survey     = require('../models/Survey');
const User       = require('../models/User');
const { protect } = require('../middleware/auth');

// ── Helper: build a pretty HTML email from survey answers ─────────
function buildSurveyEmail(user, answers, surveyId, submittedAt) {
  const safe = s => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
  const timeIST = new Date(submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const answerRows = Object.entries(answers).map(([key, value]) => {
    const displayValue = Array.isArray(value) ? value.join(', ') : String(value ?? '—');
    return `
      <tr>
        <td style="padding:10px 14px;background:#F9FAFB;border:1px solid #E5E7EB;font-size:12px;
                   font-weight:700;text-transform:uppercase;color:#6B7280;letter-spacing:.5px;
                   white-space:nowrap;vertical-align:top;border-radius:4px 0 0 4px;">${safe(key)}</td>
        <td style="padding:10px 14px;background:#fff;border:1px solid #E5E7EB;border-left:none;
                   font-size:14px;color:#111827;vertical-align:top;border-radius:0 4px 4px 0;">${safe(displayValue)}</td>
      </tr>`;
  }).join('');

  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:20px 24px;display:flex;align-items:center;gap:10px">
    <span style="background:#FFD23F;border-radius:8px;width:34px;height:34px;display:inline-flex;
                 align-items:center;justify-content:center;font-weight:900;color:#111827;font-size:18px">R</span>
    <span style="color:#fff;font-weight:800;font-size:16px">Retlify</span>
    <span style="margin-left:auto;background:#1F2937;color:#9CA3AF;font-size:11px;
                 padding:4px 10px;border-radius:20px">Survey Submission</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none">
    <h2 style="font-size:20px;margin:0 0 6px;color:#111827">New Survey Response</h2>
    <p style="color:#6B7280;font-size:14px;margin:0 0 24px">A user just completed the onboarding survey.</p>
    <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:16px;margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#3B82F6;letter-spacing:.6px;margin-bottom:8px">User Info</div>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="font-size:13px;color:#374151;padding:3px 0;width:80px"><strong>Name</strong></td>
          <td style="font-size:13px;color:#111827;padding:3px 0">${safe(user.name)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#374151;padding:3px 0"><strong>Email</strong></td>
          <td style="font-size:13px;color:#2563EB;padding:3px 0">${safe(user.email)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#374151;padding:3px 0"><strong>User ID</strong></td>
          <td style="font-size:12px;color:#6B7280;padding:3px 0;font-family:monospace">${safe(user._id)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#374151;padding:3px 0"><strong>Submitted</strong></td>
          <td style="font-size:13px;color:#111827;padding:3px 0">${timeIST} IST</td>
        </tr>
      </table>
    </div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9CA3AF;letter-spacing:.6px;margin-bottom:10px">
      Survey Answers (${Object.keys(answers).length} questions)
    </div>
    <table style="width:100%;border-collapse:separate;border-spacing:0 6px">
      ${answerRows}
    </table>
  </div>
  <div style="background:#F9FAFB;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;
              padding:12px 24px;font-size:11px;color:#9CA3AF;text-align:center">
    Survey ID: <code style="font-family:monospace">${safe(surveyId)}</code> · Sent by Retlify survey system
  </div>
</div>`;
}

// ── POST /api/survey — save survey + send email notification ──────
router.post('/', protect, async (req, res) => {
  try {
    const { answers } = req.body;
    if (!answers || Object.keys(answers).length === 0)
      return res.status(400).json({ message: 'Answers are required.' });

    // 1. Save survey to MongoDB
    const survey = await Survey.create({ userId: req.user._id, answers });

    // 2. Mark user as survey complete
    await User.findByIdAndUpdate(req.user._id, { surveyCompleted: true });

    // 3. Send email via Resend (non-blocking)
    const toEmail = process.env.TO_EMAIL || 'utkarshverma8670@gmail.com';
    const resend  = new Resend(process.env.RESEND_API_KEY);

    resend.emails.send({
      from:    'Retlify Surveys <onboarding@resend.dev>',
      to:      toEmail,
      subject: `New Survey Response — ${req.user.name} (${req.user.email})`,
      html:    buildSurveyEmail(req.user, answers, survey._id, survey.createdAt)
    }).then(() => {
      console.log(`[survey] Email sent to ${toEmail} for user ${req.user.email}`);
    }).catch(err => {
      console.error('[survey] Email failed (survey still saved):', err.message);
    });

    res.json({ message: 'Survey saved. Thank you!', surveyCompleted: true });
  } catch (err) {
    console.error('[survey]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/survey/all — admin: fetch all survey responses ───────
router.get('/all', protect, async (req, res) => {
  try {
    const adminEmail = process.env.TO_EMAIL || 'utkarshverma8670@gmail.com';
    if (req.user.email !== adminEmail)
      return res.status(403).json({ message: 'Admin only.' });

    const surveys = await Survey.find()
      .populate('userId', 'name email createdAt')
      .sort({ createdAt: -1 });

    res.json({ count: surveys.length, surveys });
  } catch (err) {
    console.error('[survey/all]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;