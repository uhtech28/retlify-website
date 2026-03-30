const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const User    = require('../models/User');
const Survey  = require('../models/Survey');

// GET /api/stats — real live stats for the logged-in user
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const surveyCount = await Survey.countDocuments({ userId: req.user._id });
    res.json({
      products:  user.productCount || 0,
      views:     user.profileViews || 0,
      queries:   user.queryCount   || 0,
      surveys:   surveyCount,
      memberSince: user.createdAt,
    });
  } catch (err) {
    console.error('[stats]', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/stats/view — increment profile view
router.post('/view', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $inc: { profileViews: 1 } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Error.' }); }
});

module.exports = router;
