const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const LearnerCourse = require('../models/LearnerCourse');
const Progress = require('../models/Progress');
const EmailLog = require('../models/EmailLog');
const { protect, authorize } = require('../middleware/auth');
const eventBus = require('../utils/eventBus');
// ▲ Import the shared Event Bus singleton.
//   This is the EXACT SAME object instance that learner.js imports.
//   Because Node.js caches require() results, both files share one eventBus.

// ═══════════════════════════════════════════════════════════════════════
// ADMIN SSE STREAM REGISTRY
// ═══════════════════════════════════════════════════════════════════════
//
// This Map tracks all active admin SSE connections, grouped by courseId.
//   Key:   courseId (string) — identifies which course the admin is viewing
//   Value: Set<Express.Response> — a Set of Express response stream objects
//
// Why a Map of Sets?
// ------------------
// Multiple admins could be viewing the same course's analytics simultaneously.
// Using a Set (not an array) ensures:
//   1. O(1) add/delete operations (vs O(n) for array.splice)
//   2. No duplicate entries (a Set automatically deduplicates)
//
// The Map groups streams by courseId so that when a learner completes a module
// in Course A, we only notify admins watching Course A — not every admin on
// every course page.
// ═══════════════════════════════════════════════════════════════════════
const activeAdminStreams = new Map();

// ═══════════════════════════════════════════════════════════════════════
// EVENT BUS LISTENER — React to learner progress updates
// ═══════════════════════════════════════════════════════════════════════
//
// This is the SUBSCRIBER side of the publish/subscribe pattern.
// When learner.js calls eventBus.emit('progressUpdated', { courseId }),
// this callback fires and pushes an SSE message to every admin watching
// that course's analytics page.
//
// Data flow:
//   1. Learner clicks "Mark as Complete" in Dashboard.jsx
//   2. POST /api/learner/courses/:id/modules/:moduleId/complete fires
//   3. learner.js emits eventBus.emit('progressUpdated', { courseId })
//   4. THIS listener fires → finds admin streams for that courseId
//   5. Writes SSE data to each admin's response stream
//   6. Admin's EventSource.onmessage fires in AdminCourseDetail.jsx
//   7. React Query invalidates the 'courseAnalytics' cache
//   8. The analytics dashboard re-fetches and re-renders with new data
// ═══════════════════════════════════════════════════════════════════════
eventBus.on('progressUpdated', ({ courseId }) => {
  // ▲ .on(eventName, callback)
  //   Registers a permanent listener for the 'progressUpdated' event.
  //   Every time eventBus.emit('progressUpdated', ...) is called anywhere
  //   in the application, this callback executes.
  //
  //   The { courseId } parameter is destructured from the payload object
  //   that learner.js passes in its .emit() call.

  const adminSet = activeAdminStreams.get(courseId);
  // ▲ Look up the Set of admin response streams for this specific course.
  //   If no admin is currently viewing this course's analytics, adminSet
  //   will be undefined and we skip the broadcast (no wasted work).

  if (adminSet) {
    // At least one admin has the analytics page open for this course.
    adminSet.forEach(resStream => {
      // ▲ Iterate over every connected admin's response stream.
      //   Each resStream is an Express `res` object from the SSE endpoint.

      resStream.write(`data: ${JSON.stringify({ triggerRefetch: true })}\n\n`);
      // ▲ Write an SSE-formatted message to the admin's browser.
      //   SSE protocol requires:
      //     - "data: " prefix before the JSON payload
      //     - "\n\n" (two newlines) to terminate the message frame
      //   The browser's EventSource API will fire its `onmessage` handler
      //   with event.data set to the JSON string '{"triggerRefetch":true}'.
    });
  }
});

// Helper function: Check if logged-in Admin owns the course
const checkCourseOwnership = (course, user) => {
  // If user is Admin and course has a createdBy field, ensure IDs match
  if (user.role === 'Admin' && course.createdBy) {
    return course.createdBy.toString() === user.id.toString();
  }
  return true; // If no createdBy set yet, allow owner
};

// @route   POST /api/courses
// @desc    Create a new course
// @access  Private/Admin
router.post('/', protect, authorize('Admin'), async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Course title is required' });
    }

    const newCourse = new Course({
      title,
      description,
      modules: [],
      assessment: [],
      createdBy: req.user.id
    });

    await newCourse.save();
    await newCourse.populate('createdBy', 'name email');

    res.status(201).json(newCourse);
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/courses
// @desc    Get all courses (Filtered by creator for Admins, all courses for Learners)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let filter = {};
    // Model B Isolation: Admins on the Admin Dashboard see only courses they created.
    // Learners browsing /courses see all available courses across all admins.
    if (req.user.role === 'Admin' && req.query.all !== 'true') {
      filter = { createdBy: req.user.id };
    }

    const courses = await Course.find(filter)
      .populate('createdBy', 'name email')
      .select('-modules.contentText -assessment');

    res.json(courses);
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/courses/:id
// @desc    Get single course by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate('createdBy', 'name email');
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Verify Admin ownership
    if (!checkCourseOwnership(course, req.user)) {
      return res.status(403).json({ message: 'Forbidden: You can only access courses you created.' });
    }

    res.json(course);
  } catch (error) {
    console.error('Get course by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/courses/:id
// @desc    Update course basic details
// @access  Private/Admin
router.put('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const { title, description } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (!checkCourseOwnership(course, req.user)) {
      return res.status(403).json({ message: 'Forbidden: You can only modify courses you created.' });
    }

    if (title) course.title = title;
    if (description) course.description = description;

    await course.save();
    res.json(course);
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/courses/:id
// @desc    Delete a course and perform cascading deletion of all associated records
// @access  Private/Admin
router.delete('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const courseId = req.params.id;
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (!checkCourseOwnership(course, req.user)) {
      return res.status(403).json({ message: 'Forbidden: You can only delete courses you created.' });
    }

    // Cascading deletion: clean up all associated records across collections
    await Promise.all([
      Course.findByIdAndDelete(courseId),
      LearnerCourse.deleteMany({ course: courseId }),
      Progress.deleteMany({ course: courseId }),
      EmailLog.deleteMany({ course: courseId })
    ]);

    res.json({ message: 'Course and all associated learner data deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/courses/:id/modules
// @desc    Add a module to a course
// @access  Private/Admin
router.post('/:id/modules', protect, authorize('Admin'), async (req, res) => {
  try {
    const { title, description, contentUrl, contentText, duration, difficulty } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (!checkCourseOwnership(course, req.user)) {
      return res.status(403).json({ message: 'Forbidden: You can only modify courses you created.' });
    }

    if (!title || !duration) {
      return res.status(400).json({ message: 'Module title and duration are required' });
    }

    const newModule = {
      title,
      description,
      contentUrl,
      contentText,
      duration,
      difficulty: difficulty || 'Intermediate'
    };

    course.modules.push(newModule);
    await course.save();

    res.status(201).json(course);
  } catch (error) {
    console.error('Add module error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/courses/:id/assessment
// @desc    Add assessment question to a course
// @access  Private/Admin
router.post('/:id/assessment', protect, authorize('Admin'), async (req, res) => {
  try {
    const { question, options, correctAnswer, skillTag } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (!checkCourseOwnership(course, req.user)) {
      return res.status(403).json({ message: 'Forbidden: You can only modify courses you created.' });
    }

    if (!question || !options || !correctAnswer || !skillTag) {
      return res.status(400).json({ message: 'Please enter all question fields' });
    }

    const newQuestion = {
      question,
      options,
      correctAnswer,
      skillTag
    };

    course.assessment.push(newQuestion);
    await course.save();

    res.status(201).json(course);
  } catch (error) {
    console.error('Add question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/courses/:id/modules/:moduleId
// @desc    Update a module within a course
// @access  Private/Admin
router.put('/:id/modules/:moduleId', protect, authorize('Admin'), async (req, res) => {
  try {
    const { title, description, contentUrl, contentText, duration, difficulty } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const module = course.modules.id(req.params.moduleId);
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    if (title) module.title = title;
    if (description !== undefined) module.description = description;
    if (contentUrl !== undefined) module.contentUrl = contentUrl;
    if (contentText !== undefined) module.contentText = contentText;
    if (duration) module.duration = duration;
    if (difficulty) module.difficulty = difficulty;

    await course.save();
    res.json(course);
  } catch (error) {
    console.error('Update module error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/courses/:id/modules/:moduleId
// @desc    Delete a module from a course
// @access  Private/Admin
router.delete('/:id/modules/:moduleId', protect, authorize('Admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const module = course.modules.id(req.params.moduleId);
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    course.modules.pull(req.params.moduleId);
    await course.save();

    res.json(course);
  } catch (error) {
    console.error('Delete module error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/courses/:id/assessment/:questionId
// @desc    Update an assessment question within a course
// @access  Private/Admin
router.put('/:id/assessment/:questionId', protect, authorize('Admin'), async (req, res) => {
  try {
    const { question, options, correctAnswer, skillTag } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const assessmentQuestion = course.assessment.id(req.params.questionId);
    if (!assessmentQuestion) {
      return res.status(404).json({ message: 'Assessment question not found' });
    }

    if (question) assessmentQuestion.question = question;
    if (options) assessmentQuestion.options = options;
    if (correctAnswer) assessmentQuestion.correctAnswer = correctAnswer;
    if (skillTag) assessmentQuestion.skillTag = skillTag;

    await course.save();
    res.json(course);
  } catch (error) {
    console.error('Update assessment question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/courses/:id/assessment/:questionId
// @desc    Delete an assessment question from a course
// @access  Private/Admin
router.delete('/:id/assessment/:questionId', protect, authorize('Admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const assessmentQuestion = course.assessment.id(req.params.questionId);
    if (!assessmentQuestion) {
      return res.status(404).json({ message: 'Assessment question not found' });
    }

    course.assessment.pull(req.params.questionId);
    await course.save();

    res.json(course);
  } catch (error) {
    console.error('Delete assessment question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/courses/:id/analytics
// @desc    Get course completion rates, drop-off heatmap, and per-learner details
// @access  Private/Admin
router.get('/:id/analytics', protect, authorize('Admin'), async (req, res) => {
  try {
    const courseId = req.params.id;
    // 1. Fetch course details to verify existence and look up module titles later
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // 2. Fetch all student enrollments and populate student name, email, and lastActive
    const enrollments = await LearnerCourse.find({ course: courseId })
      .populate('learner', 'name email lastActive');

    // 3. Get all completion records for this course to calculate individual student rates
    const progressLogs = await Progress.find({ course: courseId });

    // 3.2 Fetch all sent email logs to count communication interactions
    const emailLogs = await EmailLog.find({ course: courseId });

    // 3.5 Calculate path generation speed statistics (Metric 3)
    const pathGenTimes = enrollments
      .map(e => e.pathGenerationTimeMs)
      .filter(t => typeof t === 'number');
    const avgPathGenerationTimeMs = pathGenTimes.length > 0
      ? Math.round(pathGenTimes.reduce((sum, val) => sum + val, 0) / pathGenTimes.length)
      : 0;

    let completedCount = 0;
    let totalProgressSum = 0;
    const dropOffCounts = {}; // Key: moduleId, Value: count of students stuck here

    // 4. Map and compute statistics for each student
    const learners = enrollments.map((enrollment) => {
      const student = enrollment.learner;
      if (!student) return null; // Safe guard against deleted user documents

      // Get modules the student must complete (excluding AI-skipped modules)
      const activeModules = enrollment.personalizedPath.filter(m => !m.shouldSkip);
      
      // Get completion logs matching this student
      const studentLogs = progressLogs.filter(log => log.learner.toString() === student._id.toString());
      
      // Match logs with active modules to see how many required modules they finished
      const completedActiveCount = activeModules.filter(m => 
        studentLogs.some(log => log.moduleId.toString() === m.moduleId.toString())
      ).length;

      // Compute progress % (completed required modules / total required modules)
      const progressPercent = activeModules.length > 0
        ? Math.round((completedActiveCount / activeModules.length) * 100)
        : 0;

      totalProgressSum += progressPercent;

      if (enrollment.status === 'Completed') {
        completedCount++;
      } else if (enrollment.status === 'Active') {
        // Find the first uncompleted module in their path to mark the drop-off point
        const nextUncompletedModule = activeModules.find(m => 
          !studentLogs.some(log => log.moduleId.toString() === m.moduleId.toString())
        );
        if (nextUncompletedModule) {
          const modId = nextUncompletedModule.moduleId.toString();
          dropOffCounts[modId] = (dropOffCounts[modId] || 0) + 1;
        }
      }

      // Login Recency Score: decays by 10 points per day of inactivity
      const lastActiveDate = student.lastActive || enrollment.updatedAt || new Date();
      const daysInactive = Math.max(0, Math.floor((Date.now() - new Date(lastActiveDate).getTime()) / (1000 * 60 * 60 * 24)));
      const recencyScore = Math.max(0, 100 - (daysInactive * 10));

      // Onboarding Assessment Average Score: mean of all skill domains
      let avgAssessmentScore = 0;
      if (enrollment.skillScores) {
        const scores = Array.from(enrollment.skillScores.values());
        if (scores.length > 0) {
          avgAssessmentScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
        }
      }

      // Learner Health Score: 50% Progress + 30% Login Recency + 20% Quiz average
      const healthScore = Math.round(
        (progressPercent * 0.5) + (recencyScore * 0.3) + (avgAssessmentScore * 0.2)
      );

      // Classify health status
      let healthStatus = 'Healthy';
      if (healthScore < 40) {
        healthStatus = 'Inactive';
      } else if (healthScore < 70) {
        healthStatus = 'At-Risk';
      }

      // Count emails successfully sent to this student
      const emailsSent = emailLogs.filter(log =>
        log.learner.toString() === student._id.toString() && log.status === 'Sent'
      ).length;

      return {
        id: student._id,
        name: student.name,
        email: student.email,
        progress: progressPercent,
        avgAssessmentScore,
        daysInactive,
        healthScore,
        healthStatus,
        status: enrollment.status,
        emailsSent,
        lastActive: student.lastActive || enrollment.updatedAt
      };
    }).filter(Boolean);

    // 4.5 Compile health score distributions (Metric 5)
    const healthDistribution = { Healthy: 0, 'At-Risk': 0, Inactive: 0 };
    learners.forEach(l => {
      if (l && l.healthStatus) {
        healthDistribution[l.healthStatus] = (healthDistribution[l.healthStatus] || 0) + 1;
      }
    });

    // 5. Calculate course summary statistics
    const totalLearners = learners.length;
    const overallCompletionRate = totalLearners > 0
      ? Math.round((completedCount / totalLearners) * 100)
      : 0;
    const averageProgress = totalLearners > 0
      ? Math.round(totalProgressSum / totalLearners)
      : 0;

    // 6. Identify the top drop-off module (handling ties)
    let dropOffPoint = null;
    let maxDropOffCount = 0;
    let tiedModuleIds = [];

    Object.entries(dropOffCounts).forEach(([moduleId, count]) => {
      if (count > maxDropOffCount) {
        maxDropOffCount = count;
        tiedModuleIds = [moduleId];
      } else if (count === maxDropOffCount && count > 0) {
        tiedModuleIds.push(moduleId);
      }
    });

    if (tiedModuleIds.length > 0) {
      const titles = tiedModuleIds.map(id => {
        const originalModule = course.modules.id(id);
        return originalModule ? originalModule.title : 'Deleted Module';
      });

      dropOffPoint = {
        moduleId: tiedModuleIds[0],
        moduleTitle: titles.join(', '),
        stuckLearnersCount: maxDropOffCount
      };
    }

    // 7. Build drop-off heatmap — per-module stuck counts for ALL modules
    //    Unlike dropOffPoint (which only shows the worst module), the heatmap
    //    shows every module so admins can see the full distribution.
    const totalActiveStudents = learners.filter(l => l.status === 'Active').length;
    const dropOffHeatmap = course.modules.map(mod => {
      const modId = mod._id.toString();
      const stuckCount = dropOffCounts[modId] || 0;
      return {
        moduleId: modId,
        moduleTitle: mod.title,
        stuckCount,
        totalActive: totalActiveStudents,
        // Percentage of active learners stuck at THIS specific module
        stuckPercent: totalActiveStudents > 0
          ? Math.round((stuckCount / totalActiveStudents) * 100)
          : 0
      };
    });

    // 8. Email Delivery Rate % — ratio of successfully sent emails to total attempts
    //    emailLogs already fetched at line 382; statuses are 'Sent' or 'Failed'
    const totalEmails = emailLogs.length;
    const sentEmails = emailLogs.filter(log => log.status === 'Sent').length;
    const emailDeliveryRate = totalEmails > 0
      ? parseFloat(((sentEmails / totalEmails) * 100).toFixed(1))
      : 100; // Default to 100% when no emails have been attempted yet

    // 9. Path Personalization Variance — measures how differently the AI
    //    personalizes paths across learners. Computed as the population
    //    standard deviation of each learner's "skip ratio" (skipped / total),
    //    normalized to a 0-100 scale.
    //
    //    Interpretation:
    //      0%   = Every learner got the exact same path (no personalization)
    //      100% = Maximum divergence (some skip everything, others skip nothing)
    //      30-70% = Healthy range — AI is adapting to individual skill profiles
    let pathPersonalizationVariance = 0;
    if (enrollments.length > 0) {
      const skipRatios = enrollments.map(enrollment => {
        const totalModules = enrollment.personalizedPath.length;
        if (totalModules === 0) return 0;
        const skippedModules = enrollment.personalizedPath.filter(m => m.shouldSkip).length;
        return skippedModules / totalModules; // Value between 0 and 1
      });

      // Population mean of skip ratios
      const mean = skipRatios.reduce((sum, r) => sum + r, 0) / skipRatios.length;

      // Population standard deviation
      const squaredDiffs = skipRatios.map(r => Math.pow(r - mean, 2));
      const populationVariance = squaredDiffs.reduce((sum, d) => sum + d, 0) / skipRatios.length;
      const stdDev = Math.sqrt(populationVariance);

      // Normalize to 0-100 scale. The max possible std-dev for a 0-1 ratio
      // is 0.5 (half skip everything, half skip nothing), so we scale by *200.
      pathPersonalizationVariance = parseFloat(Math.min(100, (stdDev * 200)).toFixed(1));
    }

    res.json({
      summary: {
        totalLearners,
        overallCompletionRate,
        averageProgress,
      },
      avgPathGenerationTimeMs,
      healthDistribution,
      dropOffPoint,
      dropOffHeatmap,
      emailDeliveryRate,
      pathPersonalizationVariance,
      learners
    });
  } catch (error) {
    console.error('Fetch course analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/courses/:id/analytics-stream
// @desc    Server-Sent Events (SSE) stream for real-time admin analytics updates
// @access  Private/Admin
//
// This endpoint keeps an HTTP connection open indefinitely. The admin's browser
// connects via `new EventSource(url)` and receives push notifications whenever
// a learner completes a module in this course.
//
// Unlike a regular REST endpoint that returns data and closes, this response
// NEVER closes (until the admin navigates away or closes the browser tab).
// The browser automatically reconnects if the connection drops.
router.get('/:id/analytics-stream', protect, authorize('Admin'), (req, res) => {
  // ▲ Route handler parameters:
  //   req.params.id — the courseId from the URL
  //   protect — middleware that verifies the JWT token (supports ?token= query param for SSE)
  //   authorize('Admin') — middleware that checks req.user.role === 'Admin'

  const courseId = req.params.id;
  // ▲ Extract the course ID from the URL path.
  //   Example URL: /api/courses/abc123/analytics-stream?token=eyJ...
  //   courseId = 'abc123'

  // ── Set SSE response headers ────────────────────────────────────────
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    // ▲ Tells the browser this is an SSE stream, not a normal JSON response.
    //   The browser's EventSource API requires this Content-Type to work.

    'Cache-Control': 'no-cache',
    // ▲ Prevents proxies and CDNs from caching this response.
    //   SSE messages are real-time and must never be served from cache.

    'Connection': 'keep-alive',
    // ▲ Instructs the TCP layer to keep this socket open indefinitely.
    //   Without this, some reverse proxies (like Nginx) may close idle
    //   connections after a timeout.
  });

  // ── Heartbeat timer ─────────────────────────────────────────────
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
    // ▲ Send an SSE comment (lines starting with ':' are ignored by EventSource).
    //   This prevents load balancers (AWS ALB, Nginx, Cloudflare) from killing
    //   the connection due to inactivity. Most load balancers have a 60-second
    //   idle timeout; sending a heartbeat every 30 seconds keeps it alive.
  }, 30000);
  // ▲ 30000ms = 30 seconds between heartbeats.

  // ── Register this admin's stream in the activeAdminStreams Map ───────
  if (!activeAdminStreams.has(courseId)) {
    activeAdminStreams.set(courseId, new Set());
    // ▲ First admin to view this course's analytics.
    //   Create a new Set to hold their response stream (and any future admins').
  }
  const adminSet = activeAdminStreams.get(courseId);
  // ▲ Get the Set of response streams for this course.

  adminSet.add(res);
  // ▲ Add THIS admin's Express response object to the Set.
  //   When the eventBus listener fires, it will iterate this Set and
  //   call resStream.write() on each entry — including this one.

  // ── Send initial confirmation message ──────────────────────────────
  res.write(`data: ${JSON.stringify({ status: 'connected' })}\n\n`);
  // ▲ Immediately tells the browser's EventSource that the connection
  //   was established successfully. The frontend can log this or ignore it.

  // ── Cleanup when the admin closes the page or navigates away ────────
  req.on('close', () => {
    // ▲ The 'close' event fires when the client disconnects.
    //   This happens when:
    //     - The admin closes the browser tab
    //     - The admin navigates to a different page
    //     - The network connection drops
    //     - The admin switches from the 'analytics' tab to 'curriculum'
    //       (because the useEffect cleanup calls eventSource.close())

    clearInterval(heartbeat);
    // ▲ Stop sending heartbeats to a dead connection.
    //   Without this, the setInterval would keep firing and writing to a
    //   closed socket, causing "write after end" errors in Node.js.

    adminSet.delete(res);
    // ▲ Remove this specific admin's response stream from the Set.
    //   Other admins viewing the same course are NOT affected.

    if (adminSet.size === 0) {
      activeAdminStreams.delete(courseId);
      // ▲ If this was the last admin viewing this course, remove the
      //   courseId entry from the Map entirely. This prevents the Map
      //   from growing indefinitely with empty Sets (memory hygiene).
    }

    res.end();
    // ▲ Formally terminate the HTTP response.
    //   Signals to Node.js that we're done writing to this socket.
  });
});

module.exports = router;
