import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderDashboard } from './dashboard.mts';

let dom: DomHarness;
let originalConfirm: any;
let originalSetTimeout: any;

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush(times = 3) {
  for (let i = 0; i < times; i += 1) await tick();
}

beforeEach(() => {
  dom = setupDom();
  originalConfirm = (globalThis as any).confirm;
  originalSetTimeout = (globalThis as any).setTimeout;
});

afterEach(() => {
  (globalThis as any).confirm = originalConfirm;
  (globalThis as any).setTimeout = originalSetTimeout;
  dom.cleanup();
});

test('dashboard reacts to runtime streams and control actions', async () => {
  let stateCb: ((update: any) => void) | null = null;
  let cmdCb: ((evt: any) => void) | null = null;
  let busCb: ((evt: any) => void) | null = null;
  let unsubState = false;
  let unsubCmd = false;
  let unsubBus = false;
  let killCalled = 0;
  let activeTab = '';

  (globalThis as any).confirm = () => true;
  (globalThis as any).setTimeout = (fn: (...args: any[]) => any, _ms?: number) => {
    fn();
    return 1;
  };

  const ctx: any = {
    xhsCurrentRun: { runId: 'rid-1', taskId: 'sched-0009' },
    setActiveTab: (id: string) => { activeTab = id; },
    api: {
      settings: {
        profileAliases: {
          'xhs-1': '主账号',
        },
      },
      async configLoadLast() {
        return { keyword: '春晚', target: 100, lastProfileId: 'xhs-1' };
      },
      async stateGetTasks() {
        return [{ runId: 'rid-1', status: 'running' }];
      },
      async cmdKill() {
        killCalled += 1;
        throw new Error('kill_failed');
      },
      onStateUpdate(cb: (update: any) => void) {
        stateCb = cb;
        return () => { unsubState = true; };
      },
      onCmdEvent(cb: (evt: any) => void) {
        cmdCb = cb;
        return () => { unsubCmd = true; };
      },
      onBusEvent(cb: (evt: any) => void) {
        busCb = cb;
        return () => { unsubBus = true; };
      },
    },
  };

  const root = document.createElement('div');
  document.body.appendChild(root);
  const cleanup = renderDashboard(root, ctx);
  await flush(4);

  const pauseBtn = root.querySelector('#pause-btn') as HTMLButtonElement;
  const stopBtn = root.querySelector('#stop-btn') as HTMLButtonElement;
  const backConfigBtn = root.querySelector('#back-config-btn') as HTMLButtonElement;
  const logsToggle = root.querySelector('#toggle-logs-btn') as HTMLButtonElement;
  const logsContainer = root.querySelector('#logs-container') as HTMLDivElement;

  assert.ok(pauseBtn);
  assert.ok(stopBtn);
  assert.ok(backConfigBtn);
  assert.ok(logsToggle);
  assert.equal((root.querySelector('#task-keyword') as HTMLDivElement).textContent, '春晚');
  assert.equal((root.querySelector('#task-account') as HTMLDivElement).textContent, '主账号');
  assert.equal((root.querySelector('#task-config-id') as HTMLDivElement).textContent, 'sched-0009');

  logsToggle.click();
  assert.equal(logsContainer.style.display, 'block');
  logsToggle.click();
  assert.equal(logsContainer.style.display, 'none');

  pauseBtn.click();
  assert.equal(pauseBtn.textContent, '继续');
  pauseBtn.click();
  assert.equal(pauseBtn.textContent, '暂停');

  assert.ok(stateCb);
  stateCb?.({
    runId: 'rid-1',
    data: {
      action: 'phase2_collect',
      status: 'running',
      progress: { total: 100, processed: 20, failed: 1 },
      stats: { commentsCollected: 6, likesPerformed: 2 },
      profileId: 'xhs-1',
      keyword: '春晚',
      target: 100,
      error: 'state_error',
    },
  });

  assert.ok(busCb);
  busCb?.({ event: 'autoscript:operation_error', operationId: 'like_op', message: 'blocked' });

  assert.ok(cmdCb);
  cmdCb?.({ type: 'started', runId: 'rid-1', title: 'xhs unified run', pid: 1 });
  cmdCb?.({ type: 'stdout', runId: 'rid-1', line: '{"event":"autoscript:operation_done","operationId":"comments_harvest","result":{"collected":3}}' });
  cmdCb?.({ type: 'stderr', runId: 'rid-1', line: 'stderr_line' });
  cmdCb?.({ type: 'exit', runId: 'rid-1', exitCode: 1, signal: null });

  await flush(3);

  const errorCount = Number((root.querySelector('#error-count-text') as HTMLDivElement).textContent || '0');
  assert.equal(errorCount > 0, true);
  assert.match(String((root.querySelector('#stat-comments') as HTMLSpanElement).textContent || ''), /条/);

  stopBtn.click();
  await flush(2);
  assert.equal(killCalled, 1);
  assert.equal(activeTab, 'tasks');

  backConfigBtn.click();
  assert.equal(activeTab, 'tasks');

  cleanup();
  assert.equal(unsubState, true);
  assert.equal(unsubCmd, true);
  assert.equal(unsubBus, true);
});

test('dashboard handles loading errors and bus-only progress events', async () => {
  let busCb: ((evt: any) => void) | null = null;
  let cmdCb: ((evt: any) => void) | null = null;
  let setTab = '';

  (globalThis as any).confirm = () => true;
  (globalThis as any).setTimeout = (fn: (...args: any[]) => any, _ms?: number) => {
    fn();
    return 1;
  };

  const ctx: any = {
    xhsCurrentRun: { runId: '', taskId: 'sched-start' },
    setActiveTab: (id: string) => { setTab = id; },
    api: {
      settings: { profileAliases: {} },
      async configLoadLast() {
        throw new Error('load_fail');
      },
      async stateGetTasks() {
        throw new Error('state_fail');
      },
      async cmdKill() {
        return { ok: true };
      },
      onStateUpdate() {
        return () => {};
      },
      onCmdEvent(cb: (evt: any) => void) {
        cmdCb = cb;
        return () => {};
      },
      onBusEvent(cb: (evt: any) => void) {
        busCb = cb;
        return () => {};
      },
    },
  };

  const root = document.createElement('div');
  document.body.appendChild(root);
  const cleanup = renderDashboard(root, ctx);
  await flush(4);

  busCb?.({ event: 'xhs.unified.start', runId: 'rid-2', keyword: '工作服', maxNotes: 50, ts: new Date().toISOString() });
  busCb?.({ event: 'autoscript:operation_done', operationId: 'open_first_detail', result: { visited: 8, maxNotes: 50 } });
  busCb?.({ event: 'autoscript:operation_done', operationId: 'comment_like', result: { likedCount: 2, skippedCount: 1, alreadyLikedSkipped: 1, dedupSkipped: 1 } });
  busCb?.({ event: 'autoscript:operation_terminal', code: 'NO_VISIBLE_NOTE' });
  busCb?.({ event: 'xhs.unified.merged', profilesFailed: 1 });
  busCb?.({ event: 'xhs.unified.stop', reason: 'script_failure', stoppedAt: new Date().toISOString() });
  cmdCb?.({ type: 'started', runId: 'rid-2', title: 'xhs unified run', pid: 99 });
  cmdCb?.({ type: 'exit', runId: 'rid-2', exitCode: 0, signal: null });

  const stopBtn = root.querySelector('#stop-btn') as HTMLButtonElement;
  stopBtn.click();
  await flush(2);

  assert.equal(setTab, 'tasks');
  assert.match(String((root.querySelector('#task-keyword') as HTMLDivElement).textContent || ''), /工作服/);
  assert.match(String((root.querySelector('#current-action') as HTMLSpanElement).textContent || ''), /exit|terminal|script_failure/i);
  assert.match(String((root.querySelector('#stat-likes') as HTMLSpanElement).textContent || ''), /跳过/);
  assert.equal((root.querySelector('#task-config-id') as HTMLDivElement).textContent, 'sched-start');

  cleanup();
});

test('dashboard keeps context run and task metadata when state list only has stale runs', async () => {
  const ctx: any = {
    xhsCurrentRun: {
      runId: 'rid-new',
      taskId: null,
      profileId: 'xhs-0',
      keyword: '宇树机器人',
      target: 200,
      startedAt: '2026-02-21T03:00:00.000Z',
    },
    activeRunId: 'rid-new',
    api: {
      settings: {
        profileAliases: {
          'xhs-0': 'batch-0',
        },
      },
      async configLoadLast() {
        return { keyword: '春晚', target: 222, lastProfileId: 'xhs-old', taskId: 'sched-old' };
      },
      async stateGetTasks() {
        return [{ runId: 'rid-old', status: 'completed', keyword: '春晚', target: 222 }];
      },
      onStateUpdate() {
        return () => {};
      },
      onCmdEvent() {
        return () => {};
      },
      onBusEvent() {
        return () => {};
      },
    },
  };

  const root = document.createElement('div');
  document.body.appendChild(root);
  const cleanup = renderDashboard(root, ctx);
  await flush(4);

  assert.equal((root.querySelector('#run-id-text') as HTMLDivElement).textContent, 'rid-new');
  assert.equal((root.querySelector('#task-keyword') as HTMLDivElement).textContent, '宇树机器人');
  assert.equal((root.querySelector('#task-target') as HTMLDivElement).textContent, '200');
  assert.equal((root.querySelector('#task-account') as HTMLDivElement).textContent, 'batch-0');

  cleanup();
});
