import { describe, it, expect, vi } from 'vitest';
import { createLogger, softFail, withErrorHandler } from '../lib/errors/logger.js';

describe('createLogger', () => {
  it('creates a logger with all levels', () => {
    var log = createLogger('test');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('logs structured JSON', () => {
    var spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    var log = createLogger('test-phase');
    log.info('scout', 'query_gen', { count: 4 });
    expect(spy).toHaveBeenCalled();
    var logged = JSON.parse(spy.mock.calls[0][0]);
    expect(logged.phase).toBe('test-phase');
    expect(logged.agent).toBe('scout');
    expect(logged.action).toBe('query_gen');
    expect(logged.count).toBe(4);
    spy.mockRestore();
  });
});

describe('softFail', () => {
  it('returns result on success', async () => {
    var result = await softFail('test', async () => 42);
    expect(result).toBe(42);
  });

  it('returns null on failure', async () => {
    var result = await softFail('test', async () => { throw new Error('boom'); });
    expect(result).toBeNull();
  });

  it('logs warning on failure when logger provided', async () => {
    var warned = false;
    var mockLogger = { warn: () => { warned = true; } };
    await softFail('test', async () => { throw new Error('boom'); }, mockLogger);
    expect(warned).toBe(true);
  });
});

describe('withErrorHandler', () => {
  it('passes through successful responses', async () => {
    var handler = withErrorHandler('test', async (req, res) => {
      return res.status(200).json({ ok: true });
    });
    var statusCode = null;
    var body = null;
    var res = {
      headersSent: false,
      status: (code) => { statusCode = code; return res; },
      json: (data) => { body = data; return res; }
    };
    await handler({}, res);
    expect(statusCode).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('catches unhandled errors and returns 500', async () => {
    var handler = withErrorHandler('test', async () => {
      throw new Error('unhandled boom');
    });
    var statusCode = null;
    var body = null;
    var res = {
      headersSent: false,
      status: (code) => { statusCode = code; return res; },
      json: (data) => { body = data; return res; }
    };
    await handler({}, res);
    expect(statusCode).toBe(500);
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('unhandled boom');
  });
});
