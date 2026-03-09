import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AutoscriptRunner } from '../../../modules/camo-runtime/src/autoscript/runtime.mjs';

function createRunner({ logs, externalCalls, executeMockOperation } = {}) {
  return new AutoscriptRunner({
    version: 1,
    name: 'debug-snapshot-test',
    profileId: 'test-profile',
    defaults: { disableTimeout: false, timeoutMs: 0 },
    metadata: { env: 'debug', keyword: 'deepseek', outputRoot: '' },
    subscriptions: [],
    operations: [],
  }, {
    log: (payload) => logs.push(payload),
    executeExternalOperation: async (input) => {
      externalCalls.push(input);
      return {
        ok: true,
        code: 'OPERATION_DONE',
        message: 'snapshot captured',
        data: {
          snapshotId: input?.params?.snapshotId || null,
          jsonPath: '/tmp/debug.json',
          screenshotPath: '/tmp/debug.png',
        },
      };
    },
    executeMockOperation,
  });
}

describe('autoscript debug snapshot capture', () => {
  it('captures a debug snapshot when ensure_tab_pool completes in degraded mode', async () => {
    const logs = [];
    const externalCalls = [];
    const runner = createRunner({
      logs,
      externalCalls,
      executeMockOperation: async ({ operation }) => {
        assert.equal(operation.id, 'ensure_tab_pool');
        return {
          ok: true,
          code: 'OPERATION_DONE',
          data: {
            degraded: true,
            reason: 'page:setViewport timeout after 8000ms',
          },
        };
      },
    });

    const outcome = await runner.runOperation({
      id: 'ensure_tab_pool',
      action: 'ensure_tab_pool',
      params: {},
      retry: { attempts: 1, backoffMs: 0 },
      onFailure: 'continue',
    }, {
      type: 'startup',
      subscriptionId: null,
      timestamp: new Date().toISOString(),
    });

    assert.equal(outcome.ok, true);
    assert.equal(externalCalls.length, 1);
    assert.equal(externalCalls[0].action, 'xhs_debug_snapshot');
    assert.equal(externalCalls[0].params.phase, 'done');
    assert.equal(externalCalls[0].params.operationId, 'ensure_tab_pool');
    assert.match(String(externalCalls[0].params.snapshotId || ''), /ensure_tab_pool:1:done$/);
    assert.ok(logs.some((item) => item?.event === 'autoscript:debug_snapshot' && item?.operationId === 'ensure_tab_pool'));
  });

  it('captures a debug snapshot when an operation fails in debug mode', async () => {
    const logs = [];
    const externalCalls = [];
    const runner = createRunner({
      logs,
      externalCalls,
      executeMockOperation: async ({ operation }) => {
        assert.equal(operation.id, 'open_first_detail');
        return {
          ok: false,
          code: 'OPEN_DETAIL_FAILED',
          message: 'detail open failed',
          data: { noteId: 'abc123' },
        };
      },
    });

    const outcome = await runner.runOperation({
      id: 'open_first_detail',
      action: 'xhs_open_detail',
      params: {},
      retry: { attempts: 1, backoffMs: 0 },
      onFailure: 'continue',
    }, {
      type: 'manual',
      subscriptionId: 'detail_modal',
      timestamp: new Date().toISOString(),
    });

    assert.equal(outcome.ok, true);
    assert.equal(externalCalls.length, 1);
    assert.equal(externalCalls[0].action, 'xhs_debug_snapshot');
    assert.equal(externalCalls[0].params.phase, 'error');
    assert.equal(externalCalls[0].params.failureCode, 'OPEN_DETAIL_FAILED');
    assert.equal(externalCalls[0].params.subscriptionId, 'detail_modal');
    assert.ok(logs.some((item) => item?.event === 'autoscript:debug_snapshot' && item?.operationId === 'open_first_detail'));
  });
});
