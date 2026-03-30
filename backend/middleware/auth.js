const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided.' });

  try {
    // FIX: use JWT_ACCESS_SECRET (matches .env) with fallback to JWT_SECRET
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(auth.split(' ')[1], secret);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ message: 'User not found.' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

module.exports = { protect };
