const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

// Configure Pino logger
const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

/**
 * Helper to create a contextual child logger with a module/service tag
 * @param {string} moduleName - Name of component/route/service
 */
const createChildLogger = (moduleName) => {
  return logger.child({ module: moduleName });
};

module.exports = logger;
module.exports.createChildLogger = createChildLogger;
