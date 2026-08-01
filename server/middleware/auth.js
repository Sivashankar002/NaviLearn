const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // Check for token in headers or query parameters (for SSE support)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from the token, attach to request object
    // Exclude password field from user details
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // ── Throttled lastActive update (at most once per 60 seconds) ────────────
    const now = new Date();
    const lastActive = req.user.lastActive;
    if (!lastActive || (now - new Date(lastActive)) >= 60000) {
      req.user.lastActive = now;
      User.findByIdAndUpdate(req.user._id, { lastActive: now }).catch(err =>
        console.error('Failed to update lastActive timestamp:', err)
      );
    }

    return next();
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Role (${req.user?.role || 'None'}) is not authorized to access this route`
      });
    }
    return next();
  };
};

module.exports = { protect, authorize };
