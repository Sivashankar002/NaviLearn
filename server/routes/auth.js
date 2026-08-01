const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { validateBody, registerSchema, loginSchema } = require('../middleware/validation');
const { sendInviteEmail } = require('../services/email');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('AUTH');

// Helper function to generate access tokens
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

// Helper function to generate refresh tokens
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', validateBody(registerSchema), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check for existing user
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'Learner'
    });

    await newUser.save();

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get tokens
router.post('/login', validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // If user has not accepted invitation yet
    if (user.isInvited) {
      return res.status(400).json({ message: 'Please activate your account via the invitation link sent to your email.' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Update lastActive timestamp on login
    user.lastActive = new Date();

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token to DB
    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token is required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Find user by ID and check if refresh token matches
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user);

    res.json({
      accessToken: newAccessToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user and invalidate refresh token
router.post('/logout', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/invite-admin
// @desc    Send an email invitation to a new admin (Admin only)
// @access  Private/Admin
router.post('/invite-admin', protect, authorize('Admin'), async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    // Check for existing user
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'A user with this email address already exists' });
    }

    // Generate invitation token (32 random bytes) & 24-hour expiration
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Hash a placeholder password
    const salt = await bcrypt.genSalt(10);
    const tempHashedPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), salt);

    // Create pending Admin user document
    const newAdmin = new User({
      name,
      email,
      password: tempHashedPassword,
      role: 'Admin',
      isInvited: true,
      inviteToken,
      inviteExpires
    });

    await newAdmin.save();

    // Construct client invitation URL
    const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const inviteUrl = `${clientBaseUrl}/accept-invite?token=${inviteToken}`;

    // Send invitation email
    await sendInviteEmail({ name, email, inviteUrl });

    res.status(201).json({
      message: `Admin invitation sent successfully to ${email}`,
      inviteUrl,
      user: {
        id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        isInvited: true
      }
    });
  } catch (error) {
    console.error('Invite admin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/accept-invite
// @desc    Validate invitation token & set password to activate account
// @access  Public
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Find user with valid non-expired invite token
    const user = await User.findOne({
      inviteToken: token,
      inviteExpires: { $gt: new Date() },
      isInvited: true
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired invitation link. Please request a new invitation.' });
    }

    // Hash the password set by the user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Activate user account & clear token fields
    user.password = hashedPassword;
    user.isInvited = false;
    user.inviteToken = null;
    user.inviteExpires = null;
    user.lastActive = new Date();

    // Generate tokens for automatic login
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      message: 'Account activated successfully! You are now logged in as an Administrator.',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
