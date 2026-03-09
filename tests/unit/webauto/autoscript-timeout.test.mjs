import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AutoscriptRunner } from '../../../modules/camo-runtime/src/autoscript/runtime.mjs';

function createRunner(defaults = {}) {
  return new AutoscriptRunner({
    version: 1,
    name: 'timeout-priority-test',
    profileId: 'test-profile',
    defaults,
    subscriptions: [],
    operations: [],
  });
}

describe('autoscript timeout priority', () => {
  it('keeps timeout disabled when defaults.disableTimeout is true and operation has no timeout', () => {
    const runner = createRunner({ disableTimeout: true, timeoutMs: 0 });
    const timeoutMs = runner.resolveTimeoutMs({
      id: 'switch_tab_round_robin',
      action: 'tab_pool_switch_next',
      params: {},
    });
    assert.equal(timeoutMs, 0);
  });

  it('uses operation timeout when defaults.disableTimeout is true', () => {
    const runner = createRunner({ disableTimeout: true, timeoutMs: 0 });
    const timeoutMs = runner.resolveTimeoutMs({
      id: 'switch_tab_round_robin',
      action: 'tab_pool_switch_next',
      timeoutMs: 180000,
      params: {},
    });
    assert.equal(timeoutMs, 180000);
  });

  it('applies default timeout multiplier for blocking failures', () => {
    const runner = createRunner({ disableTimeout: false, timeoutMs: 0 });
    const baseTimeoutMs = runner.resolveTimeoutMs({
      id: 'open_next_detail',
      action: 'xhs_open_detail',
      timeoutMs: 30000,
      onFailure: 'stop_all',
      params: {},
    });
    const budget = runner.resolveBlockingTimeoutMs(
      {
        id: 'open_next_detail',
        action: 'xhs_open_detail',
        timeoutMs: 30000,
        onFailure: 'stop_all',
        params: {},
      },
      baseTimeoutMs,
    );
    assert.equal(baseTimeoutMs, 30000);
    assert.equal(budget.timeoutMs, 90000);
    assert.equal(budget.multiplier, 3);
    assert.equal(budget.blocking, true);
  });

  it('keeps base timeout for continue-on-failure operations', () => {
    const runner = createRunner({ disableTimeout: false, timeoutMs: 0 });
    const baseTimeoutMs = runner.resolveTimeoutMs({
      id: 'comments_harvest',
      action: 'xhs_comments_harvest',
      timeoutMs: 45000,
      onFailure: 'continue',
      params: {},
    });
    const budget = runner.resolveBlockingTimeoutMs(
      {
        id: 'comments_harvest',
        action: 'xhs_comments_harvest',
        timeoutMs: 45000,
        onFailure: 'continue',
        params: {},
      },
      baseTimeoutMs,
    );
    assert.equal(baseTimeoutMs, 45000);
    assert.equal(budget.timeoutMs, 45000);
    assert.equal(budget.multiplier, 1);
    assert.equal(budget.blocking, false);
  });

  it('retries timeout for continue-on-failure operations before failing', async () => {
    const runner = createRunner({ disableTimeout: false, timeoutMs: 0 });
    const logs = [];
    runner.log = (event, payload) => {
      logs.push({ event, payload });
    };
    runner.executeOnce = async () => new Promise(() => {});

    const operation = {
      id: 'comments_harvest',
      action: 'xhs_comments_harvest',
      timeoutMs: 20,
      onFailure: 'continue',
      retry: { attempts: 1, backoffMs: 0 },
      params: {},
    };

    const outcome = await runner.runOperation(operation, {
      type: 'tick',
      subscriptionId: null,
      timestamp: new Date().toISOString(),
    });

    assert.equal(outcome.ok, false);
    assert.equal(logs.filter((entry) => entry.event === 'autoscript:operation_start').length, 1);
    assert.equal(logs.filter((entry) => entry.event === 'autoscript:operation_timeout_retry').length, 0);
  });
});
