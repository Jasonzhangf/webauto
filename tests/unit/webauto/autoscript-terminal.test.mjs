import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AutoscriptRunner } from '../../../modules/camo-runtime/src/autoscript/runtime.mjs';
import { normalizeAutoscript } from '../../../modules/camo-runtime/src/autoscript/schema.mjs';

describe('autoscript terminal done handling', () => {
  it('stops script when operation returns AUTOSCRIPT_DONE_* with ok=true', async () => {
    const logs = [];
    const runner = new AutoscriptRunner(normalizeAutoscript({
      version: 1,
      name: 'terminal-done-test',
      profileId: 'test-profile',
      defaults: { disableTimeout: true, timeoutMs: 0 },
      subscriptions: [],
      operations: [
        {
          id: 'open_next_detail',
          action: 'xhs_open_detail',
          trigger: 'startup',
          once: true,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
      ],
    }), {
      log: (payload) => logs.push(payload),
      executeMockOperation: ({ operation }) => {
        if (operation.id !== 'open_next_detail') return undefined;
        return {
          ok: true,
          code: 'AUTOSCRIPT_DONE_NO_MORE_NOTES',
          message: 'no more notes',
          data: { stopReason: 'no_more_notes' },
        };
      },
      mockEvents: [],
      stopWhenMockEventsExhausted: false,
    });

    const handle = await runner.start();
    const done = await Promise.race([
      handle.done,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout waiting done')), 3000)),
    ]);

    assert.equal(done.reason, 'script_complete');

    const terminalEvent = logs.find((item) => item?.event === 'autoscript:operation_terminal');
    assert.ok(terminalEvent);
    assert.equal(terminalEvent.operationId, 'open_next_detail');
    assert.equal(terminalEvent.code, 'AUTOSCRIPT_DONE_NO_MORE_NOTES');
  });

});
