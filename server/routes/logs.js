const express = require('express');
const router = express.Router();
const { createChildLogger } = require('../utils/logger');

const clientLogger = createChildLogger('CLIENT');

// @route   POST /api/logs
// @desc    Ingest and output client-side React log events through Pino
// @access  Public
router.post('/', (req, res) => {
  try {
    const { level, message, details, component, timestamp } = req.body;

    const logPayload = {
      clientTimestamp: timestamp || new Date().toISOString(),
      component: component || 'ReactApp',
      ...(details ? { details } : {})
    };

    switch (level) {
      case 'error':
        clientLogger.error(logPayload, `[CLIENT ERROR] ${message}`);
        break;
      case 'warn':
        clientLogger.warn(logPayload, `[CLIENT WARN] ${message}`);
        break;
      default:
        clientLogger.info(logPayload, `[CLIENT INFO] ${message}`);
        break;
    }

    res.status(204).end();
  } catch (error) {
    res.status(500).end();
  }
});

module.exports = router;
