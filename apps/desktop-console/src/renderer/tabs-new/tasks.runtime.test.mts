import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderTasksPanel } from './tasks.mts';

type MockBundle = {
  ctx: any;
  calls: {
    cmdRunJson: string[][];
    cmdSpawn: any[];
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

function readFlag(args: string[], flag: string): string {
  const idx = args.indexOf(flag);
  if (idx < 0) return '';
  return String(args[idx + 1] || '').trim();
}

function isScheduleCommand(args: string[]) {
  return args.some((item) => item.endsWith('/schedule.mjs') || item.endsWith('\\schedule.mjs'));
}

function parseScheduleCommand(args: string[]): string {
  if (!isScheduleCommand(args)) return '';
  return String(args[1] || '').trim();
}

function createMockCtx(): MockBundle {
  const calls = {
    cmdRunJson: [] as string[][],
    cmdSpawn: [] as any[],
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
      if (isScheduleCommand(args)) {
        const cmd = parseScheduleCommand(args);
        if (cmd === 'list') {
          return { ok: true, json: { tasks: state.tasks } };
        }
        if (cmd === 'add') {
          const id = `sched-${String(state.nextId).padStart(4, '0')}`;
          state.nextId += 1;
          const argvRaw = readFlag(args, '--argv-json');
          let argv: any = {};
          try { argv = JSON.parse(argvRaw || '{}'); } catch { argv = {}; }
          const row = {
            id,
            seq: state.nextId,
            name: readFlag(args, '--name') || id,
            enabled: readFlag(args, '--enabled') !== 'false',
            scheduleType: readFlag(args, '--schedule-type') || 'interval',
            intervalMinutes: Number(readFlag(args, '--interval-minutes') || 30) || 30,
            runAt: readFlag(args, '--run-at') || null,
            maxRuns: Number(readFlag(args, '--max-runs') || 0) > 0 ? Number(readFlag(args, '--max-runs')) : null,
            nextRunAt: null,
            commandType: readFlag(args, '--command-type') || 'xhs-unified',
            commandArgv: argv,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            runCount: 0,
            failCount: 0,
          };
          state.tasks.push(row);
          return { ok: true, json: { task: row } };
        }
        if (cmd === 'update') {
          const id = String(args[2] || '').trim();
          const idx = state.tasks.findIndex((row) => String(row.id) === id);
          if (idx < 0) return { ok: false, error: 'missing_task' };
          const argvRaw = readFlag(args, '--argv-json');
          let argv: any = {};
          try { argv = JSON.parse(argvRaw || '{}'); } catch { argv = {}; }
          state.tasks[idx] = {
            ...state.tasks[idx],
            name: readFlag(args, '--name') || state.tasks[idx].name,
            scheduleType: readFlag(args, '--schedule-type') || 'interval',
            intervalMinutes: Number(readFlag(args, '--interval-minutes') || 30) || 30,
            runAt: readFlag(args, '--run-at') || null,
            commandType: readFlag(args, '--command-type') || state.tasks[idx].commandType,
            commandArgv: argv,
            updatedAt: new Date().toISOString(),
          };
          return { ok: true, json: { task: state.tasks[idx] } };
        }
        if (cmd === 'run') {
          const id = String(args[2] || '').trim();
          return { ok: true, json: { result: { runResult: { lastRunId: `rid-${id}` } } } };
        }
      }
      return { ok: true, json: {} };
    },
    cmdSpawn: async (spec: any) => {
      calls.cmdSpawn.push(spec);
      return { runId: `spawn-${calls.cmdSpawn.length}` };
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
  const scheduleCommands = bundle.calls.cmdRunJson
    .filter((args) => isScheduleCommand(args))
    .map((args) => parseScheduleCommand(args));
  assert.equal(scheduleCommands.includes('add'), true);
  assert.equal(scheduleCommands.includes('update'), false);
});

test('run-ephemeral executes directly without schedule save', async () => {
  const bundle = createMockCtx();
  const root = document.createElement('div');
  renderTasksPanel(root, bundle.ctx);
  await flush(6);

  const keywordInput = root.querySelector('#task-keyword') as HTMLInputElement;
  const profileInput = root.querySelector('#task-profile') as HTMLInputElement;
  const runEphemeralBtn = root.querySelector('#task-run-ephemeral-btn') as HTMLButtonElement;
  const beforeCommands = bundle.calls.cmdRunJson
    .filter((args) => isScheduleCommand(args))
    .map((args) => parseScheduleCommand(args));

  keywordInput.value = '春晚';
  profileInput.value = 'xhs-0';
  runEphemeralBtn.click();
  await flush(4);

  assert.equal(bundle.calls.cmdSpawn.length, 1);
  const spawnSpec = bundle.calls.cmdSpawn[0];
  assert.equal(Array.isArray(spawnSpec.args), true);
  assert.equal(spawnSpec.title, 'xhs unified: 春晚');
  assert.equal(String(spawnSpec.args[0]).endsWith('/xhs-unified.mjs'), true);
  assert.equal(spawnSpec.args.includes('--keyword'), true);
  assert.equal(spawnSpec.args.includes('春晚'), true);

  const afterCommands = bundle.calls.cmdRunJson
    .filter((args) => isScheduleCommand(args))
    .map((args) => parseScheduleCommand(args));
  assert.deepEqual(afterCommands, beforeCommands);
});

test('save and run uses schedule run and no direct spawn', async () => {
  const bundle = createMockCtx();
  const root = document.createElement('div');
  renderTasksPanel(root, bundle.ctx);
  await flush(6);

  const keywordInput = root.querySelector('#task-keyword') as HTMLInputElement;
  const profileInput = root.querySelector('#task-profile') as HTMLInputElement;
  const runBtn = root.querySelector('#task-run-btn') as HTMLButtonElement;

  keywordInput.value = '工作服';
  profileInput.value = 'xhs-1';
  runBtn.click();
  await flush(8);

  const scheduleCommands = bundle.calls.cmdRunJson
    .filter((args) => isScheduleCommand(args))
    .map((args) => parseScheduleCommand(args));
  assert.equal(scheduleCommands.includes('add'), true);
  assert.equal(scheduleCommands.includes('run'), true);
  assert.equal(bundle.calls.cmdSpawn.length, 0);
  assert.equal(bundle.calls.setActiveTab.includes('dashboard'), true);
  assert.equal(alerts.length, 0);
});
