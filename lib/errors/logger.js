'use strict';
// lib/errors/logger.js — Structured logging and error handling (Pattern 3: Error Resolution)
//
// Provides structured JSON logging for Vercel serverless functions.
// Each log entry includes: timestamp, level, phase, agent, action, and metadata.

var LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
var CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

/**
 * Create a structured log entry.
 */
function formatLog(level, phase, agent, action, meta) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level: level,
    phase: phase || '-',
    agent: agent || '-',
    action: action,
    ...meta
  });
}

/**
 * Log at a specific level. Respects LOG_LEVEL env var.
 */
function log(level, phase, agent, action, meta) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;
  var entry = formatLog(level, phase, agent, action, meta || {});
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

/**
 * Create a phase-scoped logger (returns logger bound to a phase).
 * Usage:
 *   var log = createLogger('phase1');
 *   log.info('scout', 'query_gen', { queries: 4 });
 *   log.error('scout', 'analysis_failed', { error: e.message });
 */
function createLogger(phase) {
  return {
    debug: function(agent, action, meta) { log('debug', phase, agent, action, meta); },
    info:  function(agent, action, meta) { log('info', phase, agent, action, meta); },
    warn:  function(agent, action, meta) { log('warn', phase, agent, action, meta); },
    error: function(agent, action, meta) { log('error', phase, agent, action, meta); }
  };
}

/**
 * Wrap an async handler with structured error handling.
 * Catches unhandled errors, logs them, and returns a structured 500 response.
 *
 * Usage:
 *   module.exports = withErrorHandler('cron', async function(req, res) { ... });
 */
function withErrorHandler(handlerName, fn) {
  return async function(req, res) {
    var startTime = Date.now();
    try {
      return await fn(req, res);
    } catch(e) {
      var duration = Date.now() - startTime;
      log('error', handlerName, '-', 'unhandled_error', {
        error: e.message,
        stack: (e.stack || '').split('\n').slice(0, 5).join(' | '),
        duration_ms: duration
      });
      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Internal server error',
          handler: handlerName,
          message: e.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  };
}

/**
 * Wrap an async operation with error context (for non-critical operations).
 * Returns null on failure instead of throwing.
 *
 * Usage:
 *   await softFail('trajectory_update', async () => { ... });
 */
async function softFail(operationName, fn, logger) {
  try {
    return await fn();
  } catch(e) {
    if (logger) {
      logger.warn('-', operationName + '_failed', { error: e.message });
    } else {
      console.warn('[YNOT] ' + operationName + ' failed (non-blocking): ' + e.message);
    }
    return null;
  }
}

module.exports = {
  log: log,
  createLogger: createLogger,
  withErrorHandler: withErrorHandler,
  softFail: softFail
};
