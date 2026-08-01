/**
 * Client Logger Utility for React (.jsx) components
 * Formats logs in development and forwards logs to POST /api/logs
 */

const isProd = import.meta.env.PROD;

const sendToServer = (level, message, details, component) => {
  try {
    const payload = {
      level,
      message,
      details,
      component,
      timestamp: new Date().toISOString(),
    };

    // Fire and forget POST request to /api/logs
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Ignore network errors on log sending
    });
  } catch (e) {
    // Silent catch
  }
};

const clientLogger = {
  info: (component, message, details = null) => {
    if (!isProd) {
      console.log(`%c[INFO] [${component}] ${message}`, 'color: #3b82f6; font-weight: bold;', details || '');
    }
    if (isProd) {
      sendToServer('info', message, details, component);
    }
  },

  warn: (component, message, details = null) => {
    console.warn(`%c[WARN] [${component}] ${message}`, 'color: #f59e0b; font-weight: bold;', details || '');
    sendToServer('warn', message, details, component);
  },

  error: (component, message, details = null) => {
    console.error(`%c[ERROR] [${component}] ${message}`, 'color: #ef4444; font-weight: bold;', details || '');
    sendToServer('error', message, details, component);
  },
};

export default clientLogger;
