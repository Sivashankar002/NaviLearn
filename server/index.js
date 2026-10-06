const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const pinoHttp = require('pino-http');
require('dotenv').config();

const logger = require('./utils/logger');
const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const learnerRoutes = require('./routes/learner');
const logsRoutes = require('./routes/logs');
const { initCronJobs } = require('./services/cron');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// Attach Pino HTTP request logging middleware
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/api/health' || req.url.startsWith('/api/logs'),
    },
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  })
);

// Rate Limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per window
  message: { message: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/learner', learnerRoutes);
app.use('/api/logs', logsRoutes);

// Health Check & Trigger Routes
const path = require('path');
const { runWeeklyEmailsJob } = require('./services/cron');

app.get('/test-embed', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../scratch/test_embed.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LMS Backend is running' });
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'NaviLearn API Backend Server', health: '/api/health' });
});

// External Cron Webhook Endpoint (Can be triggered by cron-job.org or manually)
app.all('/api/cron/weekly-summary', async (req, res) => {
  try {
    logger.info('Received HTTP trigger for Weekly Summary Emails job');
    const results = await runWeeklyEmailsJob();
    res.json({ success: true, message: 'Weekly progress summary emails triggered successfully', results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

// Connect to DB asynchronously
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    logger.info('MongoDB connected successfully');
    initCronJobs();
  })
  .catch((err) => {
    logger.error({ err }, 'MongoDB connection error');
  });
