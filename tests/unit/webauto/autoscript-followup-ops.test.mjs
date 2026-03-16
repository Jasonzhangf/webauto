import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AutoscriptRunner } from '../../../modules/camo-runtime/src/autoscript/runtime.mjs';
import { normalizeAutoscript } from '../../../modules/camo-runtime/src/autoscript/schema.mjs';

describe('autoscript followup operations', () => {
  it('schedules configured followupOperations after parent operation succeeds', async () => {
    const queue = [];
    let handle = null;

    const runner = new AutoscriptRunner(normalizeAutoscript({
      version: 1,
      name: 'followup-operations-smoke',
      profileId: 'xhs-followup-ops-smoke',
      defaults: { disableTimeout: true, timeoutMs: 0 },
      subscriptions: [],
      operations: [
        {
          id: 'open_next_detail',
          action: 'xhs_open_detail',
          trigger: 'startup',
          followupOperations: ['detail_harvest'],
          once: true,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
        {
          id: 'detail_harvest',
          action: 'xhs_detail_harvest',
          trigger: 'manual',
          once: false,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
      ],
    }), {
      profileId: 'xhs-followup-ops-smoke',
      mockEvents: [
        { type: 'startup', timestamp: new Date().toISOString() },
      ],
      stopWhenMockEventsExhausted: false,
      executeMockOperation: async ({ operation }) => {
        queue.push(operation.id);
        if (operation.id === 'detail_harvest') {
          setTimeout(() => handle?.stop('test_complete'), 0);
        }
        return { ok: true, code: 'OPERATION_DONE', data: { id: operation.id } };
      },
    });

    handle = await runner.start();
    await handle.done;

    assert.deepEqual(queue, ['open_next_detail', 'detail_harvest']);
  });
});
