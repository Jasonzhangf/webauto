import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderConfigPanel } from './config-panel.mts';

type MockBundle = {
  ctx: any;
  calls: {
    cmdRunJson: string[][];
    scheduleInvoke: any[];
    taskRunEphemeral: any[];
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

function createMockCtx(tasks: any[] = []): MockBundle {
  const calls = {
    cmdRunJson: [] as string[][],
    scheduleInvoke: [] as any[],
    taskRunEphemeral: [] as any[],
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
        const argv = payload?.argv || {};
        if (!argv.profile && !argv.profiles && !argv.profilepool) {
          return { ok: false, error: 'profile/profiles/profilepool 至少填写一个' };
        }
        if (!argv.keyword) {
          return { ok: false, error: '关键词不能为空' };
        }
        if ((payload.scheduleType === 'once' || payload.scheduleType === 'daily' || payload.scheduleType === 'weekly') && !payload.runAt) {
          return { ok: false, error: `${payload.scheduleType} 任务需要锚点时间` };
        }
        const id = String(payload.id || '').trim() || `sched-${String(state.nextId).padStart(4, '0')}`;
        const idx = state.tasks.findIndex((item) => String(item.id) === id);
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
          lastRunAt: idx >= 0 ? state.tasks[idx].lastRunAt : null,
          lastStatus: idx >= 0 ? state.tasks[idx].lastStatus : null,
          lastError: idx >= 0 ? state.tasks[idx].lastError : null,
          runCount: idx >= 0 ? state.tasks[idx].runCount : 0,
          failCount: idx >= 0 ? state.tasks[idx].failCount : 0,
        };
        if (idx >= 0) state.tasks[idx] = row;
        else {
          state.tasks.push(row);
          state.nextId += 1;
        }
        return { ok: true, json: { task: row } };
      }
      if (action === 'run') {
        const id = String(input?.taskId || '').trim();
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
      return { ok: true, json: {} };
    },
    taskRunEphemeral: async (input: any) => {
      calls.taskRunEphemeral.push(input);
      return { ok: true, runId: `ephemeral-${calls.taskRunEphemeral.length}` };
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
  const periodicTypeSelect = root.querySelector('#schedule-periodic-type-select') as HTMLSelectElement;
  const scheduleRunAtWrap = root.querySelector('#schedule-runat-wrap') as HTMLDivElement;
  const scheduleMaxRunsInput = root.querySelector('#schedule-max-runs-input') as HTMLInputElement;
  const saveCurrentBtn = root.querySelector('#save-current-btn') as HTMLButtonElement;
  const saveNewBtn = root.querySelector('#save-new-btn') as HTMLButtonElement;
  const saveOpenSchedulerBtn = root.querySelector('#save-open-scheduler-btn') as HTMLButtonElement;
  const runBtn = root.querySelector('#start-btn') as HTMLButtonElement;
  const configIdText = root.querySelector('#config-active-task-id') as HTMLDivElement;
  const dirtyStateText = root.querySelector('#config-dirty-state') as HTMLDivElement;

  assert.equal(taskSelect.value, 'sched-0002');
  assert.equal(keywordInput.value, 'new');
  assert.equal(targetInput.value, '66');
  assert.equal(accountSelect.value, 'xhs-1');
  assert.equal(scheduleTypeSelect.value, 'periodic');
  assert.equal(periodicTypeSelect.value, 'daily');
  assert.equal(scheduleRunAtWrap.style.display === 'none', false);
  assert.equal(scheduleMaxRunsInput.value, '9');
  assert.equal(configIdText.textContent, 'sched-0002');
  assert.equal(dirtyStateText.textContent, '已保存');

  taskSelect.value = 'sched-0001';
  taskSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await flush(3);
  assert.equal(keywordInput.value, 'old');
  keywordInput.value = 'old-updated';
  keywordInput.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(dirtyStateText.textContent, '未保存');
  saveCurrentBtn.click();
  await flush(5);
  assert.equal(bundle.calls.scheduleInvoke.some((item) => item.action === 'save' && item.payload?.id === 'sched-0001'), true);
  assert.equal(dirtyStateText.textContent, '已保存');

  saveNewBtn.click();
  await flush(5);
  assert.equal(bundle.calls.scheduleInvoke.some((item) => item.action === 'save' && !item.payload?.id), true);
  assert.equal(taskSelect.value.startsWith('sched-'), true);

  saveOpenSchedulerBtn.click();
  await flush(5);
  assert.equal(bundle.calls.setActiveTab.includes('scheduler'), true);

  runBtn.click();
  await flush(8);
  assert.equal(bundle.calls.scheduleInvoke.some((item) => item.action === 'run'), true);
  assert.equal(bundle.calls.setActiveTab.includes('dashboard'), true);
  assert.equal(bundle.calls.logs.some((line) => line.includes('schedule run task=')), true);
});

test('config panel validates runAt for scheduled task', async () => {
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
  scheduleTypeSelect.value = 'scheduled';
  scheduleTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  scheduleRunAtInput.value = '';
  saveCurrentBtn.click();
  await flush(3);

  assert.equal(alerts.some((item) => item.includes('once 任务需要锚点时间')), true);
});

test('config panel supports immediate run without save and without schedule runAt', async () => {
  const bundle = createMockCtx([]);
  const root = document.createElement('div');
  renderConfigPanel(root, bundle.ctx);
  await flush(6);

  const keywordInput = root.querySelector('#keyword-input') as HTMLInputElement;
  const accountSelect = root.querySelector('#account-select') as HTMLSelectElement;
  const scheduleTypeSelect = root.querySelector('#schedule-type-select') as HTMLSelectElement;
  const scheduleRunAtInput = root.querySelector('#schedule-runat-input') as HTMLInputElement;
  const runNowBtn = root.querySelector('#start-now-btn') as HTMLButtonElement;

  keywordInput.value = '春晚';
  accountSelect.value = 'xhs-0';
  scheduleTypeSelect.value = 'immediate';
  scheduleTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  scheduleRunAtInput.value = '';

  const saveCountBefore = bundle.calls.scheduleInvoke.filter((item) => item.action === 'save').length;
  const runCountBefore = bundle.calls.scheduleInvoke.filter((item) => item.action === 'run').length;
  runNowBtn.click();
  await flush(6);

  assert.equal(bundle.calls.taskRunEphemeral.length, 1);
  assert.equal(bundle.calls.taskRunEphemeral[0]?.argv?.keyword, '春晚');
  assert.equal(bundle.calls.scheduleInvoke.filter((item) => item.action === 'save').length, saveCountBefore);
  assert.equal(bundle.calls.scheduleInvoke.filter((item) => item.action === 'run').length, runCountBefore);
  assert.equal(bundle.calls.setActiveTab.includes('dashboard'), true);
});
