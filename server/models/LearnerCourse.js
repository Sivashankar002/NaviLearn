const mongoose = require('mongoose');

const pathModuleSchema = new mongoose.Schema({
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course.modules',
    required: true
  },
  sequenceOrder: {
    type: Number,
    required: true
  },
  shouldSkip: {
    type: Boolean,
    default: false
  },
  reason: {
    type: String,
    trim: true
  }
});

const learnerCourseSchema = new mongoose.Schema({
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
  skillScores: {
    type: Map,
    of: Number,
    default: {}
  },
  personalizedPath: [pathModuleSchema],
  pathGeneratedAt: {
    type: Date
  },
  pathGenerationTimeMs: {
    type: Number
  },
  status: {
    type: String,
    enum: ['Onboarding', 'Active', 'Completed'],
    default: 'Onboarding'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('LearnerCourse', learnerCourseSchema);
