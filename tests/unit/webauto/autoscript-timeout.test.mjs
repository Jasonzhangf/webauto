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
});
