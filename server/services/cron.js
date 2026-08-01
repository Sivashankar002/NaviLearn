const cron = require('node-cron');
const LearnerCourse = require('../models/LearnerCourse');
const Course = require('../models/Course');
const Progress = require('../models/Progress');
const { generateWeeklySummaryBatch } = require('./gemini');
const { sendEmail } = require('./email');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('CRON');

const initCronJobs = () => {
  const cronSchedule = process.env.CRON_SCHEDULE || '0 9 * * 1';

  logger.info({ cronSchedule }, `⏰ Initializing Weekly Progress Summary Cron Job (Schedule: "${cronSchedule}")`);

  cron.schedule(cronSchedule, async () => {
    logger.info('⏰ Executing Weekly Learner Progress Summary Emails Job...');
    try {
      const enrollments = await LearnerCourse.find({ status: 'Active' })
        .populate('learner', 'name email')
        .populate('course', 'title modules');

      logger.info({ totalActiveEnrollments: enrollments.length }, `[Weekly Cron] Found ${enrollments.length} active enrollments to process.`);

      // Utility function to chunk array
      const chunkArray = (array, size) => {
        const result = [];
        for (let i = 0; i < array.length; i += size) {
          result.push(array.slice(i, i + size));
        }
        return result;
      };

      const batches = chunkArray(enrollments, 10);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`[Weekly Cron] Processing batch ${i + 1} of ${batches.length} (${batch.length} learners)...`);
        
        const learnersBatch = [];
        const batchContexts = {}; // Store full context to send emails later

        for (const enrollment of batch) {
          const student = enrollment.learner;
          const course = enrollment.course;
          if (!student || !course) continue;

          // Fetch completed progress logs
          const logs = await Progress.find({ learner: student._id, course: course._id });
          const completedModuleIds = new Set(logs.map(l => l.moduleId.toString()));

          // Separate active path into completed and pending arrays
          const activeModules = enrollment.personalizedPath.filter(m => !m.shouldSkip);

          const completedTitles = [];
          const pendingTitles = [];

          activeModules.forEach(m => {
            const originalModule = course.modules.id(m.moduleId);
            const title = originalModule ? originalModule.title : 'Unknown Module';
            if (completedModuleIds.has(m.moduleId.toString())) {
              completedTitles.push(title);
            } else {
              pendingTitles.push(title);
            }
          });

          // Compute pace status string based on completion progress
          const completedCount = completedTitles.length;
          const totalCount = activeModules.length;
          let paceStatus = 'Getting Started';
          if (completedCount === totalCount && totalCount > 0) {
            paceStatus = 'Curriculum Fully Complete';
          } else if (completedCount > (totalCount * 0.7)) {
            paceStatus = 'Excellent Pace (Fast Track to Completion)';
          } else if (completedCount > (totalCount * 0.3)) {
            paceStatus = 'Consistent Progress (On Track)';
          }

          learnersBatch.push({
            learnerId: student._id.toString(),
            learnerName: student.name,
            courseTitle: course.title,
            completedTitles,
            pendingTitles,
            paceStatus
          });

          batchContexts[student._id.toString()] = { student, course };
        }

        if (learnersBatch.length === 0) continue;

        // Request Gemini to write weekly summary for the entire batch
        try {
          console.log(`[Weekly Cron] Requesting Gemini batch AI generation for ${learnersBatch.length} learners...`);
          const generatedEmails = await generateWeeklySummaryBatch(learnersBatch);

          for (const generated of generatedEmails) {
            const context = batchContexts[generated.learnerId];
            if (!context) continue;

            await sendEmail({
              learnerId: context.student._id,
              courseId: context.course._id,
              type: 'WeeklySummary',
              subject: `Weekly Progress Update: ${context.course.title}`,
              body: generated.emailBody,
              emailAddress: context.student.email
            });
          }
        } catch (innerError) {
          console.error(`Failed to process batch ${i + 1}:`, innerError);
        }

        // Add a 5-second delay between batches to prevent Gemini API rate limits
        if (i < batches.length - 1) {
          console.log(`[Weekly Cron] Waiting 5 seconds before processing next batch to respect API rate limits...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      console.log('✅ Weekly progress email run finished.');
    } catch (error) {
      console.error('Failed to run weekly emails scheduler:', error);
    }
  });
};

module.exports = { initCronJobs };
