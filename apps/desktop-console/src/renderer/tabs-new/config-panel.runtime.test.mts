import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderConfigPanel } from './config-panel.mts';

type MockBundle = {
  ctx: any;
  calls: {
    cmdRunJson: string[][];
    configSaveLast: any[];
    configExport: any[];
    setActiveTab: string[];
    setStatus: string[];
    logs: string[];
  };
  state: {
    tasks: any[];
    nextId: number;
  };
};

let dom: DomHarness;
let originalAlert: any;
let alerts: string[] = [];

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush(times = 5) {
  for (let i = 0; i < times; i += 1) {
    await tick();
  }
}

function readFlag(args: string[], flag: string): string {
  const idx = args.indexOf(flag);
  if (idx < 0) return '';
  return String(args[idx + 1] || '').trim();
}

function createMockCtx(tasks: any[] = []): MockBundle {
  const calls = {
    cmdRunJson: [] as string[][],
    configSaveLast: [] as any[],
    configExport: [] as any[],
    setActiveTab: [] as string[],
    setStatus: [] as string[],
    logs: [] as string[],
  };
  const state = {
    tasks: [...tasks],
    nextId: tasks.length + 1,
  };

  const api: any = {
    pathJoin: (...parts: string[]) => parts.filter(Boolean).join('/'),
    osHomedir: () => '/Users/test',
    cmdRunJson: async (spec: any) => {
      const args = Array.isArray(spec?.args) ? spec.args.map((x: any) => String(x)) : [];
      calls.cmdRunJson.push(args);
      if (args.some((item: string) => item.endsWith('/account.mjs')) && args[1] === 'list') {
        return {
          ok: true,
          json: {
            profiles: [
              { profileId: 'xhs-0', accountRecordId: 'acc-0', accountId: 'uid-0', alias: '账号0', status: 'active', valid: true },
              { profileId: 'xhs-1', accountRecordId: 'acc-1', accountId: 'uid-1', alias: '账号1', status: 'active', valid: true },
            ],
          },
        };
      }
      if (args.some((item: string) => item.endsWith('/schedule.mjs'))) {
        const cmd = String(args[1] || '').trim();
        if (cmd === 'list') {
          return { ok: true, json: { tasks: state.tasks } };
        }
        if (cmd === 'update') {
          const id = String(args[2] || '').trim();
          const idx = state.tasks.findIndex((item) => String(item.id) === id);
          if (idx < 0) return { ok: false, error: 'missing_task' };
          const argv = JSON.parse(readFlag(args, '--argv-json') || '{}');
          state.tasks[idx] = {
            ...state.tasks[idx],
            name: readFlag(args, '--name') || state.tasks[idx].name,
            enabled: readFlag(args, '--enabled') !== 'false',
            scheduleType: readFlag(args, '--schedule-type') || 'interval',
            intervalMinutes: Number(readFlag(args, '--interval-minutes') || 30) || 30,
            runAt: readFlag(args, '--run-at') || null,
            maxRuns: Number(readFlag(args, '--max-runs') || 0) > 0 ? Number(readFlag(args, '--max-runs')) : null,
            commandArgv: argv,
            updatedAt: new Date().toISOString(),
          };
          return { ok: true, json: { task: state.tasks[idx] } };
        }
        if (cmd === 'add') {
          const id = `sched-${String(state.nextId).padStart(4, '0')}`;
          state.nextId += 1;
          const argv = JSON.parse(readFlag(args, '--argv-json') || '{}');
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
            commandType: 'xhs-unified',
            commandArgv: argv,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastRunAt: null,
            lastStatus: null,
            lastError: null,
            runCount: 0,
            failCount: 0,
          };
          state.tasks.push(row);
          return { ok: true, json: { task: row } };
        }
        if (cmd === 'run') {
          const id = String(args[2] || '').trim();
          return {
            ok: true,
            json: {
              result: {
                taskId: id,
                runResult: {
                  id,
                  lastRunId: 'rid-from-schedule',
                },
              },
            },
          };
        }
      }
      return { ok: true, json: {} };
    },
    configLoadLast: async () => ({
      keyword: 'legacy-keyword',
      target: 20,
      env: 'debug',
      fetchBody: true,
      fetchComments: true,
      autoLike: false,
      dryRun: true,
      lastProfileId: 'xhs-0',
    }),
    configSaveLast: async (payload: any) => {
      calls.configSaveLast.push(payload);
      return { ok: true };
    },
    configExport: async (payload: any) => {
      calls.configExport.push(payload);
      return { ok: true, path: payload.filePath };
    },
  };

  const ctx: any = {
    api,
    setActiveTab: (id: string) => calls.setActiveTab.push(id),
    setStatus: (text: string) => calls.setStatus.push(text),
    appendLog: (line: string) => calls.logs.push(line),
  };

  return { ctx, calls, state };
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

test('config panel defaults to latest task and supports update/save-as-new/run', async () => {
  const bundle = createMockCtx([
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
        'max-notes': 40,
        env: 'debug',
        'do-comments': true,
        'do-likes': false,
        'dry-run': true,
      },
      createdAt: '2026-02-20T01:00:00.000Z',
      updatedAt: '2026-02-20T02:00:00.000Z',
      runCount: 0,
      failCount: 0,
    },
    {
      id: 'sched-0002',
      seq: 2,
      name: 'latest-task',
      enabled: true,
      scheduleType: 'daily',
      intervalMinutes: 30,
      runAt: '2026-02-22T01:30:00.000Z',
      maxRuns: 9,
      nextRunAt: null,
      commandType: 'xhs-unified',
      commandArgv: {
        profile: 'xhs-1',
        keyword: 'new',
        'max-notes': 66,
        env: 'prod',
        'do-comments': false,
        'do-likes': true,
        'like-keywords': '真敬业',
        'dry-run': false,
      },
      createdAt: '2026-02-20T03:00:00.000Z',
      updatedAt: '2026-02-20T05:00:00.000Z',
      runCount: 0,
      failCount: 0,
    },
  ]);

  const root = document.createElement('div');
  renderConfigPanel(root, bundle.ctx);
  await flush(8);

  const taskSelect = root.querySelector('#task-config-select') as HTMLSelectElement;
  const keywordInput = root.querySelector('#keyword-input') as HTMLInputElement;
  const targetInput = root.querySelector('#target-input') as HTMLInputElement;
  const accountSelect = root.querySelector('#account-select') as HTMLSelectElement;
  const scheduleTypeSelect = root.querySelector('#schedule-type-select') as HTMLSelectElement;
  const scheduleRunAtWrap = root.querySelector('#schedule-runat-wrap') as HTMLDivElement;
  const scheduleMaxRunsInput = root.querySelector('#schedule-max-runs-input') as HTMLInputElement;
  const saveCurrentBtn = root.querySelector('#save-current-btn') as HTMLButtonElement;
  const saveNewBtn = root.querySelector('#save-new-btn') as HTMLButtonElement;
  const runBtn = root.querySelector('#start-btn') as HTMLButtonElement;

  assert.equal(taskSelect.value, 'sched-0002');
  assert.equal(keywordInput.value, 'new');
  assert.equal(targetInput.value, '66');
  assert.equal(accountSelect.value, 'xhs-1');
  assert.equal(scheduleTypeSelect.value, 'daily');
  assert.equal(scheduleRunAtWrap.style.display === 'none', false);
  assert.equal(scheduleMaxRunsInput.value, '9');

  taskSelect.value = 'sched-0001';
  taskSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await flush(3);
  assert.equal(keywordInput.value, 'old');
  keywordInput.value = 'old-updated';
  saveCurrentBtn.click();
  await flush(5);
  assert.equal(bundle.calls.cmdRunJson.some((args) => args[1] === 'update' && args[2] === 'sched-0001'), true);

  saveNewBtn.click();
  await flush(5);
  assert.equal(bundle.calls.cmdRunJson.some((args) => args[1] === 'add'), true);
  assert.equal(taskSelect.value.startsWith('sched-'), true);

  runBtn.click();
  await flush(8);
  assert.equal(bundle.calls.cmdRunJson.some((args) => args[1] === 'run'), true);
  assert.equal(bundle.calls.setActiveTab.includes('dashboard'), true);
  assert.equal(bundle.calls.logs.some((line) => line.includes('schedule run task=')), true);
});

test('config panel validates runAt for once/daily/weekly schedules', async () => {
  const bundle = createMockCtx([]);
  const root = document.createElement('div');
  renderConfigPanel(root, bundle.ctx);
  await flush(6);

  const keywordInput = root.querySelector('#keyword-input') as HTMLInputElement;
  const accountSelect = root.querySelector('#account-select') as HTMLSelectElement;
  const scheduleTypeSelect = root.querySelector('#schedule-type-select') as HTMLSelectElement;
  const scheduleRunAtInput = root.querySelector('#schedule-runat-input') as HTMLInputElement;
  const saveCurrentBtn = root.querySelector('#save-current-btn') as HTMLButtonElement;

  keywordInput.value = '春晚';
  accountSelect.value = 'xhs-0';
  scheduleTypeSelect.value = 'once';
  scheduleTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  scheduleRunAtInput.value = '';
  saveCurrentBtn.click();
  await flush(3);

  assert.equal(alerts.some((item) => item.includes('once 任务需要设置执行时间')), true);
});
