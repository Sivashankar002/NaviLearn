const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['Admin', 'Learner'],
    default: 'Learner'
  },
  refreshToken: {
    type: String,
    default: null
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  inviteToken: {
    type: String,
    default: null
  },
  inviteExpires: {
    type: Date,
    default: null
  },
  isInvited: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
