import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AutoscriptRunner } from '../../../modules/camo-runtime/src/autoscript/runtime.mjs';
import { normalizeAutoscript } from '../../../modules/camo-runtime/src/autoscript/schema.mjs';

describe('autoscript stale trigger continuation', () => {
  it('continues downstream dependencies after stale-trigger skips', async () => {
    const logs = [];
    let runner = null;

    runner = new AutoscriptRunner(normalizeAutoscript({
      version: 1,
      name: 'stale-trigger-resume',
      profileId: 'test-profile',
      defaults: { disableTimeout: true, timeoutMs: 0 },
      subscriptions: [
        { id: 'detail_modal', container: 'detail_modal' },
      ],
      operations: [
        {
          id: 'close_detail',
          action: 'xhs_close_detail',
          trigger: 'detail_modal.exist',
          once: false,
          oncePerAppear: true,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
        {
          id: 'wait_between_notes',
          action: 'wait',
          params: { ms: 1 },
          trigger: 'manual',
          dependsOn: ['close_detail'],
          once: false,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
        {
          id: 'open_next_detail',
          action: 'xhs_open_detail',
          trigger: 'manual',
          dependsOn: ['wait_between_notes'],
          once: false,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
      ],
    }), {
      log: (payload) => logs.push(payload),
      executeMockOperation: async ({ operation }) => {
        if (operation.id === 'close_detail') {
          const state = runner.subscriptionState.get('detail_modal') || {};
          runner.subscriptionState.set('detail_modal', {
            ...state,
            exists: false,
            version: Number(state.version || 0) + 1,
          });
          return { ok: true, code: 'OPERATION_DONE', message: 'closed' };
        }
        if (operation.id === 'open_next_detail') {
          return { ok: true, code: 'OPERATION_DONE', message: 'opened next' };
        }
        return { ok: true, code: 'OPERATION_DONE', message: `${operation.id} done` };
      },
      mockEvents: [
        {
          type: 'exist',
          subscriptionId: 'detail_modal',
          timestamp: new Date().toISOString(),
        },
      ],
      stopWhenMockEventsExhausted: false,
    });

    const handle = await runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    handle.stop('test_complete');
    await handle.done;

    assert.equal(runner.operationState.get('close_detail')?.status, 'done');
    assert.equal(runner.operationState.get('wait_between_notes')?.status, 'done');
    assert.equal(runner.operationState.get('open_next_detail')?.status, 'done');
    assert.ok(logs.some((item) => item?.event === 'autoscript:operation_done' && item?.operationId === 'open_next_detail'));
  });

  it('forces dependents after successful parent when trigger event has already changed', async () => {
    const logs = [];
    let runner = null;

    runner = new AutoscriptRunner(normalizeAutoscript({
      version: 1,
      name: 'success-dependent-resume',
      profileId: 'test-profile',
      defaults: { disableTimeout: true, timeoutMs: 0 },
      subscriptions: [
        { id: 'detail_modal', container: 'detail_modal' },
      ],
      operations: [
        {
          id: 'close_detail',
          action: 'xhs_close_detail',
          trigger: 'detail_modal.exist',
          once: false,
          oncePerAppear: true,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
        {
          id: 'wait_between_notes',
          action: 'wait',
          params: { ms: 1 },
          trigger: 'detail_modal.disappear',
          dependsOn: ['close_detail'],
          once: false,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
      ],
    }), {
      log: (payload) => logs.push(payload),
      executeMockOperation: async ({ operation }) => {
        if (operation.id === 'close_detail') {
          const state = runner.subscriptionState.get('detail_modal') || {};
          runner.subscriptionState.set('detail_modal', {
            ...state,
            exists: false,
            version: Number(state.version || 0) + 1,
          });
        }
        return { ok: true, code: 'OPERATION_DONE', message: `${operation.id} done` };
      },
      mockEvents: [
        {
          type: 'exist',
          subscriptionId: 'detail_modal',
          timestamp: new Date().toISOString(),
        },
      ],
      stopWhenMockEventsExhausted: false,
    });

    const handle = await runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    handle.stop('test_complete');
    await handle.done;

    assert.equal(runner.operationState.get('close_detail')?.status, 'done');
    assert.equal(runner.operationState.get('wait_between_notes')?.status, 'done');
    assert.ok(logs.some((item) => item?.event === 'autoscript:operation_done' && item?.operationId === 'wait_between_notes'));
  });

  it('does not requeue the same operation on the same trigger chain after success', async () => {
    const logs = [];
    let runner = null;
    let openRuns = 0;

    runner = new AutoscriptRunner(normalizeAutoscript({
      version: 1,
      name: 'self-requeue-guard',
      profileId: 'test-profile',
      defaults: { disableTimeout: true, timeoutMs: 0 },
      subscriptions: [
        { id: 'detail_modal', container: 'detail_modal' },
      ],
      operations: [
        {
          id: 'open_next_detail',
          action: 'xhs_open_detail',
          trigger: 'detail_modal.disappear',
          once: false,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
      ],
    }), {
      log: (payload) => logs.push(payload),
      executeMockOperation: async ({ operation }) => {
        if (operation.id === 'open_next_detail') {
          openRuns += 1;
          const state = runner.subscriptionState.get('detail_modal') || {};
          runner.subscriptionState.set('detail_modal', {
            ...state,
            exists: true,
            appearCount: Number(state.appearCount || 0) + 1,
            version: Number(state.version || 0) + 1,
          });
        }
        return { ok: true, code: 'OPERATION_DONE', message: `${operation.id} done` };
      },
      mockEvents: [
        {
          type: 'disappear',
          subscriptionId: 'detail_modal',
          timestamp: new Date().toISOString(),
        },
      ],
      stopWhenMockEventsExhausted: false,
    });

    runner.subscriptionState.set('detail_modal', {
      exists: false,
      appearCount: 1,
      lastEventAt: new Date().toISOString(),
      version: 1,
    });

    const handle = await runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    handle.stop('test_complete');
    await handle.done;

    assert.equal(openRuns, 1);
    assert.equal(logs.filter((item) => item?.event === 'autoscript:operation_start' && item?.operationId === 'open_next_detail').length, 1);
  });

  it('does not force-run subscription dependents when the target subscription is not active', async () => {
    const logs = [];

    const runner = new AutoscriptRunner(normalizeAutoscript({
      version: 1,
      name: 'force-run-trigger-guard',
      profileId: 'test-profile',
      defaults: { disableTimeout: true, timeoutMs: 0 },
      subscriptions: [
        { id: 'detail_modal', container: 'detail_modal' },
        { id: 'home_search_input', container: 'home_search_input' },
      ],
      operations: [
        {
          id: 'open_first_detail',
          action: 'xhs_open_detail',
          trigger: 'startup',
          once: true,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
        {
          id: 'comments_harvest',
          action: 'xhs_comments_harvest',
          trigger: 'detail_modal.exist',
          dependsOn: ['open_first_detail'],
          once: false,
          oncePerAppear: true,
          retry: { attempts: 1, backoffMs: 0 },
          onFailure: 'continue',
          impact: 'op',
        },
      ],
    }), {
      log: (payload) => logs.push(payload),
      executeMockOperation: async ({ operation }) => {
        return { ok: true, code: 'OPERATION_DONE', message: `${operation.id} done` };
      },
      mockEvents: [
        {
          type: 'exist',
          subscriptionId: 'home_search_input',
          timestamp: new Date().toISOString(),
        },
      ],
      stopWhenMockEventsExhausted: false,
    });

    const handle = await runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    handle.stop('test_complete');
    await handle.done;

    assert.equal(runner.operationState.get('open_first_detail')?.status, 'done');
    assert.notEqual(runner.operationState.get('comments_harvest')?.status, 'done');
    assert.equal(logs.some((item) => item?.event === 'autoscript:operation_start' && item?.operationId === 'comments_harvest'), false);
  });
});
