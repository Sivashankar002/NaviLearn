const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const LearnerCourse = require('../models/LearnerCourse');
const Progress = require('../models/Progress');
const { protect } = require('../middleware/auth');
const { generatePersonalizedPath, generateWelcomeEmailText } = require('../services/gemini');
const { sendEmail } = require('../services/email');
const { validateBody, assessmentSubmissionSchema } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');
const eventBus = require('../utils/eventBus');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('LEARNER');
// ▲ Import the shared Event Bus singleton.
//   This is the SAME object instance that courses.js will import.
//   When we call eventBus.emit('progressUpdated', ...) here, the
//   listener registered in courses.js will fire immediately.

// Registry to track active EventSource connections for progress updates
// Key: "learnerId-courseId", Value: Express response stream object
const activeStreams = new Map();

const assessmentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 5 : 100, // Limit each IP to 5 submissions in production, 100 in dev
  message: { message: 'Too many quiz submissions. Please wait an hour before retrying.' },
  standardHeaders: true,
  legacyHeaders: false
});

// @route   GET /api/learner/courses
// @desc    Get all courses with enrollment status
// @access  Private
router.get('/courses', protect, async (req, res) => {
  try {
    const courses = await Course.find().select('-modules -assessment');
    const enrollments = await LearnerCourse.find({ learner: req.user.id });

    const coursesWithStatus = courses.map(course => {
      const enrollment = enrollments.find(e => e.course.toString() === course._id.toString());
      return {
        ...course.toObject(),
        status: enrollment ? enrollment.status : 'Not Enrolled',
        enrollmentId: enrollment ? enrollment._id : null
      };
    });

    res.json(coursesWithStatus);
  } catch (error) {
    console.error('Fetch learner courses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/learner/courses/:id/enroll
// @desc    Enroll in a course
// @access  Private
router.post('/courses/:id/enroll', protect, async (req, res) => {
  try {
    const courseId = req.params.id;
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const existingEnrollment = await LearnerCourse.findOne({
      learner: req.user.id,
      course: courseId
    });

    if (existingEnrollment) {
      return res.status(400).json({ message: 'Already enrolled in this course' });
    }

    const newEnrollment = new LearnerCourse({
      learner: req.user.id,
      course: courseId,
      status: 'Onboarding'
    });

    await newEnrollment.save();
    res.status(201).json(newEnrollment);
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/learner/courses/:id/assessment
// @desc    Get assessment questions for a course (without correct answers)
// @access  Private
router.get('/courses/:id/assessment', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).select('title assessment');
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Strip answers to prevent client-side inspection cheating
    const safeQuestions = course.assessment.map(q => ({
      _id: q._id,
      question: q.question,
      options: q.options,
      skillTag: q.skillTag
    }));

    res.json({
      title: course.title,
      questions: safeQuestions
    });
  } catch (error) {
    console.error('Fetch assessment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/learner/courses/:id/submit-assessment
// @desc    Submit assessment answers, compute scores, and generate AI path
// @access  Private
router.post('/courses/:id/submit-assessment', protect, assessmentLimiter, validateBody(assessmentSubmissionSchema), async (req, res) => {
  try {
    const courseId = req.params.id;
    const { answers } = req.body;

    const enrollment = await LearnerCourse.findOne({
      learner: req.user.id,
      course: courseId
    });

    if (!enrollment) {
      return res.status(400).json({ message: 'Not enrolled in this course' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Compute skill tag correctness metrics
    const tagTotals = {};
    course.assessment.forEach(question => {
      const tag = question.skillTag;
      if (!tagTotals[tag]) {
        tagTotals[tag] = { correct: 0, total: 0 };
      }
      tagTotals[tag].total += 1;

      const userAnswer = answers.find(ans => ans.questionId === question._id.toString());
      if (userAnswer && userAnswer.selectedAnswer === question.correctAnswer) {
        tagTotals[tag].correct += 1;
      }
    });

    const skillScores = {};
    Object.keys(tagTotals).forEach(tag => {
      const { correct, total } = tagTotals[tag];
      skillScores[tag] = Math.round((correct / total) * 100);
    });

    const startTime = Date.now();
    const personalizedPath = await generatePersonalizedPath(
      course.title,
      course.modules,
      skillScores,
      course.masteryThreshold || 70
    );
    const pathGenerationTimeMs = Date.now() - startTime;

    enrollment.skillScores = skillScores;
    enrollment.personalizedPath = personalizedPath;
    enrollment.pathGeneratedAt = new Date();
    enrollment.pathGenerationTimeMs = pathGenerationTimeMs;
    enrollment.status = 'Active';

    await enrollment.save();

    // Asynchronously generate welcome copy and send email (non-blocking)
    const learnerName = req.user.name;
    const emailAddress = req.user.email;
    const threshold = course.masteryThreshold || 70;

    generateWelcomeEmailText(learnerName, course.title, skillScores, threshold)
      .then(emailBody => {
        return sendEmail({
          learnerId: req.user.id,
          courseId,
          type: 'Welcome',
          subject: `Your Personalized Learning Journey for ${course.title} Starts Today!`,
          body: emailBody,
          emailAddress
        });
      })
      .catch(err => console.error('Delayed welcome email generation failed:', err));

    res.json({
      message: 'Assessment completed and path generated successfully',
      enrollment
    });
  } catch (error) {
    console.error('Submit assessment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/learner/courses/:id/path
// @desc    Get the personalized learning path timeline
// @access  Private
router.get('/courses/:id/path', protect, async (req, res) => {
  try {
    const courseId = req.params.id;
    
    const enrollment = await LearnerCourse.findOne({
      learner: req.user.id,
      course: courseId
    });

    if (!enrollment || enrollment.status === 'Onboarding') {
      return res.status(400).json({ message: 'Please complete your onboarding assessment first.' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const completedModules = await Progress.find({
      learner: req.user.id,
      course: courseId
    }).select('moduleId');

    const completedSet = new Set(completedModules.map(p => p.moduleId.toString()));

    const orderedPath = enrollment.personalizedPath.map(pathItem => {
      const moduleDetails = course.modules.id(pathItem.moduleId);
      return {
        moduleId: pathItem.moduleId,
        sequenceOrder: pathItem.sequenceOrder,
        shouldSkip: pathItem.shouldSkip,
        reason: pathItem.reason,
        title: moduleDetails ? moduleDetails.title : 'Deleted Module',
        description: moduleDetails ? moduleDetails.description : '',
        duration: moduleDetails ? moduleDetails.duration : 0,
        difficulty: moduleDetails ? moduleDetails.difficulty : 'Intermediate',
        contentUrl: moduleDetails ? moduleDetails.contentUrl : '',
        contentText: moduleDetails ? moduleDetails.contentText : '',
        isCompleted: completedSet.has(pathItem.moduleId.toString())
      };
    });

    res.json({
      courseTitle: course.title,
      courseDescription: course.description,
      status: enrollment.status,
      path: orderedPath
    });
  } catch (error) {
    console.error('Fetch path timeline error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/learner/courses/:id/progress-stream
// @desc    Server-Sent Events endpoint to stream real-time progress updates
// @access  Private
router.get('/courses/:id/progress-stream', protect, (req, res) => {
  const courseId = req.params.id;
  const userId = req.user.id;
  const streamKey = `${userId}-${courseId}`;

  // Establish standard SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Keep-alive heartbeat (every 30 seconds) to prevent load balancer timeouts
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // Store the client connection in our map
  activeStreams.set(streamKey, res);

  // Send initial validation message
  res.write(`data: ${JSON.stringify({ status: 'connected' })}\n\n`);

  // Handle client socket termination
  req.on('close', () => {
    clearInterval(heartbeat);
    activeStreams.delete(streamKey);
    res.end();
  });
});

// @route   POST /api/learner/courses/:id/modules/:moduleId/complete
// @desc    Mark a module as complete
// @access  Private
router.post('/courses/:id/modules/:moduleId/complete', protect, async (req, res) => {
  try {
    const { id: courseId, moduleId } = req.params;

    const progress = new Progress({
      learner: req.user.id,
      course: courseId,
      moduleId
    });

    try {
      await progress.save();
    } catch (dbError) {
      if (dbError.code === 11000) {
        return res.status(200).json({ message: 'Module already completed' });
      }
      throw dbError;
    }

    const enrollment = await LearnerCourse.findOne({
      learner: req.user.id,
      course: courseId
    });

    let progressPercent = 0;
    if (enrollment) {
      const activeModuleIds = enrollment.personalizedPath
        .filter(m => !m.shouldSkip)
        .map(m => m.moduleId.toString());

      const completedLogs = await Progress.find({
        learner: req.user.id,
        course: courseId
      });
      const completedIds = new Set(completedLogs.map(l => l.moduleId.toString()));

      const allFinished = activeModuleIds.every(id => completedIds.has(id));

      if (allFinished && activeModuleIds.length > 0) {
        enrollment.status = 'Completed';
        await enrollment.save();
      }

      // Calculate progress percentage
      const completedActiveCount = activeModuleIds.filter(id => completedIds.has(id)).length;
      progressPercent = activeModuleIds.length > 0
        ? Math.round((completedActiveCount / activeModuleIds.length) * 100)
        : 0;

      // Broadcast progress update event on the user's active SSE connection stream
      const streamKey = `${req.user.id}-${courseId}`;
      const resStream = activeStreams.get(streamKey);
      if (resStream) {
        resStream.write(`data: ${JSON.stringify({ progressPercent, triggerRefetch: true })}\n\n`);
      }

      // ── Emit cross-route event to notify admin analytics listeners ──
      // This is the KEY line that bridges learner actions to admin views.
      // The eventBus is an in-memory publish/subscribe channel.
      // We publish a 'progressUpdated' event with the courseId as payload.
      // Any listener (in courses.js) that called eventBus.on('progressUpdated', ...)
      // will receive this payload and can push updates to connected admin clients.
      eventBus.emit('progressUpdated', { courseId: courseId.toString() });
      // ▲ .emit(eventName, payload)
      //   - eventName: 'progressUpdated' — a string identifier we define.
      //     Both the emitter and listener must use the exact same string.
      //   - payload: { courseId } — the data passed to the listener callback.
      //     We send the courseId so the listener knows WHICH course's admin
      //     streams to notify (an admin viewing Course A shouldn't get updates
      //     for Course B).
    }

    res.json({ message: 'Module marked as complete', progressPercent });
  } catch (error) {
    console.error('Complete module error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/learner/ping
// @desc    Heartbeat ping from active learner browser (triggers lastActive update)
// @access  Private
router.post('/ping', protect, (req, res) => {
  res.json({ status: 'active', lastActive: req.user.lastActive });
});

module.exports = router;
