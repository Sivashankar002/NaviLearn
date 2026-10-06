const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('GEMINI');

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Extracts and logs detailed diagnostic information from a Gemini API error.
 */
const logGeminiErrorDetails = (error, attempt) => {
  logger.error({
    attempt: attempt + 1,
    statusCode: error?.status || error?.httpStatusCode || 'N/A',
    message: error?.message || 'No message',
    errorCode: error?.code || error?.errorDetails?.[0]?.reason || 'N/A',
    details: error?.errorDetails || [],
    retryAfter: error?.headers?.['retry-after'] || error?.retryAfter || null
  }, `[GEMINI ERROR] Attempt ${attempt + 1} failed`);
};

/**
 * Retry wrapper with Token-Aware Backoff & Jitter for Gemini API rate limit (429) errors.
 */
const callWithRetry = async (fn, maxRetries = 5) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetriable = error?.status === 429 ||
        error?.status === 503 ||
        (error?.status >= 500 && error?.status < 600) ||
        error?.message?.includes('429') ||
        error?.message?.includes('503') ||
        error?.message?.toLowerCase().includes('too many requests') ||
        error?.message?.toLowerCase().includes('resource has been exhausted') ||
        error?.message?.toLowerCase().includes('service unavailable') ||
        error?.message?.toLowerCase().includes('high demand');

      logGeminiErrorDetails(error, attempt);

      if (isRetriable && attempt < maxRetries) {
        const baseDelayMs = 4000 * (attempt + 1);
        const jitterMs = Math.floor(Math.random() * 1000);
        const delayMs = baseDelayMs + jitterMs;

        logger.warn({
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          statusCode: error?.status || 'N/A',
          delaySeconds: (delayMs / 1000).toFixed(1)
        }, `⏳ Gemini transient API error (${error?.status || '503/429'}). Retrying in ${(delayMs / 1000).toFixed(1)}s (Attempt ${attempt + 1}/${maxRetries})...`);

        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
};

/**
 * Generate a personalized learning path based on learner's scores and course modules.
 * @param {string} courseTitle - The title of the course
 * @param {Array} modules - The original list of course modules
 * @param {Object} skillScores - Map of skill tags to percentage scores
 * @param {number} masteryThreshold - The passing threshold (default: 70)
 * @returns {Array} The generated path modules configuration
 */
const generatePersonalizedPath = async (courseTitle, modules, skillScores, masteryThreshold = 70) => {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      console.warn("GEMINI_API_KEY is not defined or is placeholder. Initiating fallback learning path...");
      return generateFallbackPath(modules);
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const prompt = `
You are an expert curriculum planner for the Adaptive Learning Management System "NaviLearn".
Your task is to customize the course "${courseTitle}" for a student.

Here are the course modules:
${JSON.stringify(modules, null, 2)}

Here are the student's onboarding assessment scores (representing percentage mastery in different skill tags):
${JSON.stringify(skillScores, null, 2)}

The passing mastery threshold is set to ${masteryThreshold}%.

Instructions:
1. For each module, determine if the student has demonstrated mastery (score >= ${masteryThreshold}%) in the skill tags associated with the module content.
2. If the student has mastered the skills, set "shouldSkip": true for that module and provide an encouraging reason (e.g., "Skipped: You showed excellent 85% mastery in Arrays during onboarding.").
3. If they have not mastered it (score < ${masteryThreshold}%), or if the module doesn't match any of their scored skill tags, set "shouldSkip": false.
4. Arrange all modules in the most logical sequence order for learning (from beginner to advanced, respecting dependencies).
5. You MUST include every single module ID from the course modules list in the output path.

You MUST respond with a JSON object following this exact schema:
{
  "path": [
    {
      "moduleId": "string (the exact _id of the module)",
      "sequenceOrder": number (starting from 1),
      "shouldSkip": boolean,
      "reason": "string explaining the decision"
    }
  ]
}
`;

    const result = await callWithRetry(() => model.generateContent(prompt));
    
    // Log the dynamically chosen underlying model version for identification
    console.log(`\n[Gemini AI] Successfully generated path using model: ${result.response.modelVersion || 'unknown'}\n`);
    
    const textResponse = result.response.text();
    const parsedData = JSON.parse(textResponse);

    if (parsedData && Array.isArray(parsedData.path)) {
      return parsedData.path;
    }
    throw new Error("Invalid output path structure from Gemini");
  } catch (error) {
    console.error("Gemini Path Generation Error:", error.message || error);
    return generateFallbackPath(modules);
  }
};

/**
 * Fallback to default course order if LLM is offline or configuration is missing
 */
const generateFallbackPath = (modules) => {
  return modules.map((mod, index) => ({
    moduleId: mod._id,
    sequenceOrder: index + 1,
    shouldSkip: false,
    reason: 'Original curriculum sequence (AI path generation currently offline).'
  }));
};

/**
 * Generate a personalized welcome email copy for a student.
 */
const generateWelcomeEmailText = async (learnerName, courseTitle, skillScores, masteryThreshold) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const prompt = `
You are an encouraging learning coach at EdTech platform "NaviLearn".
Write a personalized welcome email to a student who has just joined a course.

Learner Name: ${learnerName}
Course Name: ${courseTitle}
Learner Onboarding Skill Scores: ${JSON.stringify(skillScores, null, 2)}
Passing Mastery Threshold: ${masteryThreshold}%

Instructions:
1. Greet the learner warmly by their first name.
2. Congratulate them on taking the onboarding assessment.
3. Reference their identified skill gaps (the areas below the threshold) and highlight their strengths (skills above threshold).
4. Outline what module they should begin working on first based on the path.
5. Keep it conversational, motivational, and under 250 words. Do not output subject lines or mail headers, just the email body text.
`;
    const result = await callWithRetry(() => model.generateContent(prompt));
    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini Welcome Email Generation error:', error);
    return `Hello ${learnerName},\n\nWelcome to your personalized learning path for ${courseTitle}! We are excited to support you on your learning journey. Log in to your dashboard to view your customized modules and get started today.`;
  }
};


/**
 * Generate a weekly progress report email copy for a batch of students.
 * Takes an array of learner metadata objects.
 */
const generateWeeklySummaryBatch = async (learnersBatch) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const prompt = `
You are a learning coach at EdTech platform "NaviLearn".
Your task is to write highly personalized weekly summary emails for a batch of students to keep them motivated.

Here is the data for ${learnersBatch.length} learners:
${JSON.stringify(learnersBatch, null, 2)}

Instructions for EVERY learner:
1. Address the learner by their name.
2. Recap their recent module accomplishments this week (from completedTitles).
3. Reference the remaining modules to show clear progression (from pendingTitles).
4. Give warm, tailored advice based on their current progress pace (paceStatus).
5. Keep the tone encouraging, casual, and under 250 words. Do not output headers or subject lines, only email body copy.

You MUST return a JSON object containing an array for each learner following this exact schema:
{
  "emails": [
    {
      "learnerId": "string (the exact learnerId from the input)",
      "emailBody": "string (the personalized email text)"
    }
  ]
}
`;
    const result = await callWithRetry(() => model.generateContent(prompt));
    const parsedData = JSON.parse(result.response.text());
    
    if (parsedData && Array.isArray(parsedData.emails)) {
      return parsedData.emails;
    }
    throw new Error("Invalid output structure from Gemini Batch Generation");
  } catch (error) {
    console.error('Gemini Weekly Batch Email Generation error:', error);
    // Fallback for the entire batch
    return learnersBatch.map(learner => ({
      learnerId: learner.learnerId,
      emailBody: `Hello ${learner.learnerName},\n\nHere is your weekly progress update for ${learner.courseTitle}. You have completed ${learner.completedTitles.length} modules recently. Keep up the momentum to finish the remaining modules!`
    }));
  }
};

module.exports = {
  generatePersonalizedPath,
  generateWelcomeEmailText,
  generateWeeklySummaryBatch
};
