const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  learner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  completedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure a learner can mark a module complete only once
progressSchema.index({ learner: 1, course: 1, moduleId: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);
