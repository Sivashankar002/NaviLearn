const nodemailer = require('nodemailer');
const EmailLog = require('../models/EmailLog');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('EMAIL');

// Create transporter from env variables or default to a mock print transporter
let transporter;
const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

if (hasSmtpConfig) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Log and send email to learner
 */
const sendEmail = async ({ learnerId, courseId, type, subject, body, emailAddress }) => {
  try {
    if (hasSmtpConfig) {
      await transporter.sendMail({
        from: `"NaviLearn EdTech" <${process.env.SMTP_USER}>`,
        to: emailAddress,
        subject,
        text: body,
      });
      logger.info({ to: emailAddress, type }, `[SMTP Email Sent] Successfully sent ${type} email to ${emailAddress}`);
    } else {
      logger.info({ to: emailAddress, type, subject }, `[Mock Email Sent] To: ${emailAddress} | Type: ${type}`);
    }

    // Save success log to DB
    const log = new EmailLog({
      learner: learnerId,
      course: courseId,
      type,
      subject,
      body,
      status: 'Sent',
    });
    await log.save();
  } catch (error) {
    console.error('Email transmission failed:', error);
    // Save failure log to DB
    const log = new EmailLog({
      learner: learnerId,
      course: courseId,
      type,
      subject,
      body,
      status: 'Failed',
      error: error.message || 'Unknown error',
    });
    await log.save();
  }
};

/**
 * Send Admin invitation email with password set token link
 */
const sendInviteEmail = async ({ name, email, inviteUrl }) => {
  const subject = `You've been invited as an Administrator on NaviLearn EdTech!`;
  const body = `Hello ${name},\n\nYou have been invited to join NaviLearn as an Administrator.\n\nPlease click the link below to set your password and activate your account:\n\n${inviteUrl}\n\nThis invitation link will expire in 24 hours.\n\nBest regards,\nNaviLearn Platform Team`;

  try {
    if (hasSmtpConfig) {
      await transporter.sendMail({
        from: `"NaviLearn EdTech" <${process.env.SMTP_USER}>`,
        to: email,
        subject,
        text: body,
      });
      console.log(`[Email Service] Invitation email sent to ${email}`);
    } else {
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log(`║               ADMIN INVITATION EMAIL (MOCK)                  ║`);
      console.log(`║  To        : ${email}                                    ║`);
      console.log(`║  Invite Link: ${inviteUrl}                               ║`);
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log(body);
      console.log('─'.repeat(60) + '\n');
    }
  } catch (error) {
    console.error('Failed to send admin invitation email:', error);
  }
};

module.exports = { sendEmail, sendInviteEmail };
