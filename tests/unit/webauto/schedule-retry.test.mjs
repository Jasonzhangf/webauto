import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, shouldRetry, calcBackoffMs, calcRetryAt, evaluateRetry, RETRY_DEFAULTS } from '../../../apps/webauto/entry/lib/schedule-retry.mjs';

describe('schedule-retry - classifyError', () => {
  it('classifies risk_control errors', () => {
    assert.equal(classifyError({ code: 'RISK_CONTROL' }), 'risk_control');
    assert.equal(classifyError({ code: 'risk_control' }), 'risk_control');
    assert.equal(classifyError({ message: 'risk_control_detected' }), 'risk_control');
    assert.equal(classifyError({ message: '触发风控' }), 'risk_control');
  });

  it('classifies auth/login errors', () => {
    assert.equal(classifyError({ message: 'login_required' }), 'auth_error');
    assert.equal(classifyError({ message: 'auth_expired' }), 'auth_error');
    assert.equal(classifyError({ code: 'AUTH_ERROR' }), 'auth_error');
    assert.equal(classifyError({ code: 'LOGIN_REQUIRED' }), 'auth_error');
  });

  it('classifies config errors', () => {
    assert.equal(classifyError({ message: 'invalid_config' }), 'config_error');
    assert.equal(classifyError({ message: 'missing_profile: xhs-1' }), 'config_error');
    assert.equal(classifyError({ code: 'CONFIG_ERROR' }), 'config_error');
  });

  it('classifies timeout errors', () => {
    assert.equal(classifyError({ code: 'TIMEOUT' }), 'timeout');
    assert.equal(classifyError({ code: 'ETIMEDOUT' }), 'timeout');
    assert.equal(classifyError({ message: 'operation_timeout' }), 'timeout');
  });

  it('classifies network errors', () => {
    assert.equal(classifyError({ code: 'NETWORK' }), 'network');
    assert.equal(classifyError({ code: 'ECONNREFUSED' }), 'network');
    assert.equal(classifyError({ code: 'ECONNRESET' }), 'network');
    assert.equal(classifyError({ message: 'network error' }), 'network');
  });

  it('classifies page errors', () => {
    assert.equal(classifyError({ message: 'navigation failed' }), 'page_error');
    assert.equal(classifyError({ message: 'page_load error' }), 'page_error');
    assert.equal(classifyError({ code: 'PAGE_LOAD_ERROR' }), 'page_error');
  });

  it('classifies unknown errors as retryable', () => {
    assert.equal(classifyError({ message: 'something unexpected' }), 'unknown');
    assert.equal(classifyError(new Error('test')), 'unknown');
    assert.equal(classifyError({}), 'unknown');
  });
});

describe('schedule-retry - shouldRetry', () => {
  it('does not retry risk_control', () => {
    assert.equal(shouldRetry('risk_control'), false);
  });

  it('does not retry auth_error', () => {
    assert.equal(shouldRetry('auth_error'), false);
  });

  it('does not retry config_error', () => {
    assert.equal(shouldRetry('config_error'), false);
  });

  it('retries timeout', () => {
    assert.equal(shouldRetry('timeout'), true);
  });

  it('retries network', () => {
    assert.equal(shouldRetry('network'), true);
  });

  it('retries unknown', () => {
    assert.equal(shouldRetry('unknown'), true);
  });

  it('retries page_error', () => {
    assert.equal(shouldRetry('page_error'), true);
  });
});

describe('schedule-retry - calcBackoffMs', () => {
  const defaults = { baseMs: 60000, multiplier: 2, maxMs: 3600000 };

  it('first attempt: base delay', () => {
    assert.equal(calcBackoffMs(1, defaults), 60000);
  });

  it('second attempt: 2x base', () => {
    assert.equal(calcBackoffMs(2, defaults), 120000);
  });

  it('third attempt: 4x base', () => {
    assert.equal(calcBackoffMs(3, defaults), 240000);
  });

  it('respects max cap', () => {
    assert.equal(calcBackoffMs(7, defaults), 3600000);
  });

  it('custom base and multiplier', () => {
    const custom = { baseMs: 30000, multiplier: 3, maxMs: 600000 };
    assert.equal(calcBackoffMs(1, custom), 30000);
    assert.equal(calcBackoffMs(2, custom), 90000);
    assert.equal(calcBackoffMs(3, custom), 270000);
    assert.equal(calcBackoffMs(4, custom), 600000);
  });

  it('attempt 0 falls back to base', () => {
    assert.equal(calcBackoffMs(0, defaults), 60000);
  });
});

describe('schedule-retry - calcRetryAt', () => {
  it('returns a valid ISO timestamp', () => {
    const retryAt = calcRetryAt(0);
    const parsed = Date.parse(retryAt);
    assert.ok(!isNaN(parsed), 'retryAt should be a valid ISO timestamp');
  });

  it('retryAt is in the future', () => {
    const retryAt = calcRetryAt(0);
    const parsed = Date.parse(retryAt);
    assert.ok(parsed > Date.now(), 'retryAt should be in the future');
  });

  it('second failure has longer delay', () => {
    const first = Date.parse(calcRetryAt(0));
    const second = Date.parse(calcRetryAt(1));
    assert.ok(second > first, 'second failure should have longer delay');
  });
});

describe('schedule-retry - evaluateRetry', () => {
  it('returns shouldRetry=false for risk_control', () => {
    const result = evaluateRetry(new Error('risk_control'), {});
    assert.equal(result.shouldRetry, false);
    assert.equal(result.errorType, 'risk_control');
    assert.equal(result.retryAt, undefined);
  });

  it('returns shouldRetry=true for unknown errors', () => {
    const result = evaluateRetry(new Error('something'), { failCount: 0 });
    assert.equal(result.shouldRetry, true);
    assert.equal(result.errorType, 'unknown');
    assert.ok(result.retryAt, 'should have a retryAt');
  });

  it('returns shouldRetry=false when maxAttempts reached', () => {
    const result = evaluateRetry(new Error('timeout'), { failCount: 3 }, { maxAttempts: 3 });
    assert.equal(result.shouldRetry, false);
    assert.equal(result.reason, 'max_attempts_reached');
  });

  it('returns shouldRetry=true when under maxAttempts', () => {
    const result = evaluateRetry(new Error('timeout'), { failCount: 1 }, { maxAttempts: 3 });
    assert.equal(result.shouldRetry, true);
    assert.ok(result.retryAt, 'should have a retryAt');
  });

  it('uses custom retry config', () => {
    const result = evaluateRetry(new Error('timeout'), { failCount: 0 }, { maxAttempts: 1 });
    assert.equal(result.shouldRetry, true); // failCount=0 < maxAttempts=1
  });
});

describe('schedule-retry - RETRY_DEFAULTS', () => {
  it('has expected default values', () => {
    assert.equal(RETRY_DEFAULTS.baseMs, 60000);
    assert.equal(RETRY_DEFAULTS.multiplier, 2);
    assert.equal(RETRY_DEFAULTS.maxMs, 3600000);
    assert.equal(RETRY_DEFAULTS.maxAttempts, 3);
  });
});
