import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderTasksPanel } from './tasks.mts';

type MockBundle = {
  ctx: any;
  calls: {
    cmdRunJson: string[][];
    scheduleInvoke: any[];
    taskRunEphemeral: any[];
    setActiveTab: string[];
    setStatus: string[];
  };
  state: {
    tasks: any[];
    nextId: number;
    cmdEventCb: ((evt: any) => void) | null;
    unsubscribed: boolean;
  };
};

let dom: DomHarness;
let alerts: string[] = [];
let originalAlert: any;

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush(times = 5) {
  for (let i = 0; i < times; i += 1) await tick();
}

function createMockCtx(): MockBundle {
  const calls = {
    cmdRunJson: [] as string[][],
    scheduleInvoke: [] as any[],
    taskRunEphemeral: [] as any[],
    setActiveTab: [] as string[],
    setStatus: [] as string[],
  };
  const state = {
    tasks: [
      {
        id: 'sched-0001',
        seq: 1,
        name: 'old-task',
        enabled: true,
        scheduleType: 'interval',
        intervalMinutes: 20,
        runAt: null,
        maxRuns: null,
        nextRunAt: null,
        commandType: 'xhs-unified',
        commandArgv: {
          profile: 'xhs-0',
          keyword: 'old',
          'max-notes': 20,
          env: 'debug',
          'do-comments': true,
          'do-likes': false,
          'fetch-body': true,
        },
        createdAt: '2026-02-20T10:00:00.000Z',
        updatedAt: '2026-02-20T10:30:00.000Z',
        runCount: 1,
        failCount: 0,
      },
      {
        id: 'sched-0002',
        seq: 2,
        name: 'latest-task',
        enabled: true,
        scheduleType: 'daily',
        intervalMinutes: 30,
        runAt: '2026-02-20T01:30:00.000Z',
        maxRuns: 9,
        nextRunAt: null,
        commandType: 'xhs-unified',
        commandArgv: {
          profile: 'xhs-1',
          keyword: 'latest',
          'max-notes': 66,
          env: 'prod',
          'do-comments': false,
          'do-likes': true,
          'like-keywords': '真敬业',
        },
        createdAt: '2026-02-20T11:00:00.000Z',
        updatedAt: '2026-02-20T12:00:00.000Z',
        runCount: 3,
        failCount: 0,
      },
    ] as any[],
    nextId: 3,
    cmdEventCb: null as ((evt: any) => void) | null,
    unsubscribed: false,
  };

  const api: any = {
    pathJoin: (...parts: string[]) => parts.filter(Boolean).join('/'),
    cmdRunJson: async (spec: any) => {
      const args = Array.isArray(spec?.args) ? spec.args.map((x: any) => String(x)) : [];
      calls.cmdRunJson.push(args);
      if (args.some((item: string) => item.endsWith('/quota-status.mjs') || item.endsWith('\\quota-status.mjs'))) {
        return {
          ok: true,
          json: {
            ok: true,
            quotas: [
              { type: 'search', count: 1, max: 60 },
              { type: 'like', count: 0, max: 30 },
              { type: 'comment', count: 2, max: 50 },
            ],
          },
        };
      }
      return { ok: true, json: {} };
    },
    scheduleInvoke: async (input: any) => {
      calls.scheduleInvoke.push(input);
      const action = String(input?.action || '').trim();
      if (action === 'list') {
        return { ok: true, json: { tasks: state.tasks } };
      }
      if (action === 'save') {
        const payload = input?.payload || {};
        const id = String(payload.id || '').trim() || `sched-${String(state.nextId).padStart(4, '0')}`;
        const idx = state.tasks.findIndex((row) => String(row.id) === id);
        const row = {
          ...(idx >= 0 ? state.tasks[idx] : {}),
          id,
          seq: idx >= 0 ? state.tasks[idx].seq : state.nextId,
          name: String(payload.name || id),
          enabled: payload.enabled !== false,
          scheduleType: String(payload.scheduleType || 'interval'),
          intervalMinutes: Number(payload.intervalMinutes || 30) || 30,
          runAt: payload.runAt || null,
          maxRuns: Number(payload.maxRuns || 0) > 0 ? Number(payload.maxRuns) : null,
          nextRunAt: null,
          commandType: String(payload.commandType || 'xhs-unified'),
          commandArgv: payload.argv || {},
          createdAt: idx >= 0 ? state.tasks[idx].createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          runCount: idx >= 0 ? state.tasks[idx].runCount : 0,
          failCount: idx >= 0 ? state.tasks[idx].failCount : 0,
        };
        if (idx >= 0) {
          state.tasks[idx] = row;
        } else {
          state.tasks.push(row);
          state.nextId += 1;
        }
        return { ok: true, json: { task: row } };
      }
      if (action === 'run') {
        const id = String(input?.taskId || '').trim();
        return { ok: true, json: { result: { runResult: { lastRunId: `rid-${id}` } } } };
      }
      return { ok: true, json: {} };
    },
    taskRunEphemeral: async (spec: any) => {
      calls.taskRunEphemeral.push(spec);
      return { ok: true, runId: `spawn-${calls.taskRunEphemeral.length}` };
    },
    configLoadLast: async () => ({ lastProfileId: 'xhs-0', keyword: 'legacy' }),
    onCmdEvent: (cb: (evt: any) => void) => {
      state.cmdEventCb = cb;
      return () => {
        state.unsubscribed = true;
        state.cmdEventCb = null;
      };
    },
  };

  return {
    ctx: {
      api,
      setActiveTab: (id: string) => calls.setActiveTab.push(id),
      setStatus: (text: string) => calls.setStatus.push(text),
    },
    calls,
    state,
  };
}

beforeEach(() => {
  dom = setupDom();
  alerts = [];
  originalAlert = (globalThis as any).alert;
  (globalThis as any).alert = (msg: string) => alerts.push(String(msg));
});

afterEach(() => {
  (globalThis as any).alert = originalAlert;
  dom.cleanup();
});

test('history select supports edit and clone for save-as', async () => {
  const bundle = createMockCtx();
  const root = document.createElement('div');
  renderTasksPanel(root, bundle.ctx);
  await flush(8);

  const historySelect = root.querySelector('#task-history-select') as HTMLSelectElement;
  const historyEditBtn = root.querySelector('#task-history-edit-btn') as HTMLButtonElement;
  const historyCloneBtn = root.querySelector('#task-history-clone-btn') as HTMLButtonElement;
  const editingId = root.querySelector('#task-editing-id') as HTMLInputElement;
  const keywordInput = root.querySelector('#task-keyword') as HTMLInputElement;
  const nameInput = root.querySelector('#task-name') as HTMLInputElement;
  const profileInput = root.querySelector('#task-profile') as HTMLInputElement;
  const saveBtn = root.querySelector('#task-save-btn') as HTMLButtonElement;

  assert.equal(historySelect.options.length >= 3, true);
  historySelect.value = 'sched-0002';
  historyEditBtn.click();
  assert.equal(editingId.value, 'sched-0002');
  assert.equal(keywordInput.value, 'latest');

  historyCloneBtn.click();
  assert.equal(editingId.value, '');
  assert.match(nameInput.value, /-copy$/);

  profileInput.value = profileInput.value || 'xhs-1';
  saveBtn.click();
  await flush(6);
  const scheduleCommands = bundle.calls.scheduleInvoke.map((item) => String(item?.action || ''));
  assert.equal(scheduleCommands.includes('save'), true);
});

test('run-ephemeral executes directly without schedule save', async () => {
  const bundle = createMockCtx();
  const root = document.createElement('div');
  renderTasksPanel(root, bundle.ctx);
  await flush(6);

  const keywordInput = root.querySelector('#task-keyword') as HTMLInputElement;
  const profileInput = root.querySelector('#task-profile') as HTMLInputElement;
  const runEphemeralBtn = root.querySelector('#task-run-ephemeral-btn') as HTMLButtonElement;
  const beforeCommands = bundle.calls.scheduleInvoke.length;

  keywordInput.value = '春晚';
  profileInput.value = 'xhs-0';
  runEphemeralBtn.click();
  await flush(4);

  assert.equal(bundle.calls.taskRunEphemeral.length, 1);
  const runSpec = bundle.calls.taskRunEphemeral[0];
  assert.equal(runSpec.commandType, 'xhs-unified');
  assert.equal(runSpec.argv.keyword, '春晚');
  assert.equal(bundle.calls.scheduleInvoke.length, beforeCommands);
});

test('save and run uses schedule run and no direct spawn', async () => {
  const bundle = createMockCtx();
  const root = document.createElement('div');
  renderTasksPanel(root, bundle.ctx);
  await flush(6);

  const keywordInput = root.querySelector('#task-keyword') as HTMLInputElement;
  const profileInput = root.querySelector('#task-profile') as HTMLInputElement;
  const runBtn = root.querySelector('#task-run-btn') as HTMLButtonElement;
  const scheduleTypeSelect = root.querySelector('#task-schedule-type') as HTMLSelectElement;

  keywordInput.value = '工作服';
  profileInput.value = 'xhs-1';
  scheduleTypeSelect.value = 'periodic';
  scheduleTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  runBtn.click();
  await flush(8);

  const scheduleCommands = bundle.calls.scheduleInvoke.map((item) => String(item?.action || ''));
  assert.equal(scheduleCommands.includes('save'), true);
  assert.equal(scheduleCommands.includes('run'), true);
  assert.equal(bundle.calls.taskRunEphemeral.length, 0);
  assert.equal(bundle.calls.setActiveTab.includes('dashboard'), true);
  assert.equal(alerts.length, 0);
});

test('saved task list supports double-click load and immediate run ignoring schedule', async () => {
  const bundle = createMockCtx();
  const root = document.createElement('div');
  renderTasksPanel(root, bundle.ctx);
  await flush(8);

  const historySelect = root.querySelector('#task-history-select') as HTMLSelectElement;
  const historyRunBtn = root.querySelector('#task-history-run-btn') as HTMLButtonElement;
  const editingId = root.querySelector('#task-editing-id') as HTMLInputElement;
  const taskRow = root.querySelector('.task-item[data-id="sched-0002"]') as HTMLDivElement;

  assert.ok(taskRow);
  taskRow.dispatchEvent(new Event('dblclick', { bubbles: true }));
  assert.equal(editingId.value, 'sched-0002');
  assert.equal(historySelect.value, 'sched-0002');

  historySelect.value = 'sched-0001';
  historyRunBtn.click();
  await flush(6);

  assert.equal(bundle.calls.scheduleInvoke.some((item) => item.action === 'run' && item.taskId === 'sched-0001'), true);
  assert.equal(bundle.calls.setActiveTab.includes('dashboard'), true);
});
