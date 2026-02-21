import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderSchedulerPanel } from './scheduler.mts';

type MockBundle = {
  ctx: any;
  calls: {
    scheduleInvoke: any[];
    taskRunEphemeral: any[];
    cmdKill: any[];
    setActiveTab: string[];
    setStatus: string[];
  };
  state: {
    tasks: any[];
    nextId: number;
    cmdEventCb: ((evt: any) => void) | null;
    unsubscribed: boolean;
    failListOnce: boolean;
  };
};

let dom: DomHarness;
let originalAlert: any;
let originalConfirm: any;
let originalCreateObjectUrl: any;
let originalRevokeObjectUrl: any;
let originalInputClick: any;
let originalAnchorClick: any;
let alertMessages: string[] = [];
let autoImportPayload = '';

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) await tick();
}

function findButtonByText(root: HTMLElement, text: string, nth = 0): HTMLButtonElement {
  const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  const matched = buttons.filter((btn) => String(btn.textContent || '').includes(text));
  const button = matched[nth];
  if (!button) throw new Error(`button not found: ${text}#${nth}`);
  return button;
}

function findButtonByTextIn(container: HTMLElement, text: string, nth = 0): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
  const matched = buttons.filter((btn) => String(btn.textContent || '').includes(text));
  const button = matched[nth];
  if (!button) throw new Error(`button not found in container: ${text}#${nth}`);
  return button;
}

function createMockCtx(): MockBundle {
  const calls = {
    scheduleInvoke: [] as any[],
    taskRunEphemeral: [] as any[],
    cmdKill: [] as any[],
    setActiveTab: [] as string[],
    setStatus: [] as string[],
  };
  const state = {
    tasks: [
      {
        id: 'sched-0001',
        name: 'daily-seed',
        enabled: true,
        scheduleType: 'interval',
        intervalMinutes: 30,
        runAt: null,
        maxRuns: null,
        nextRunAt: null,
        commandType: 'xhs-unified',
        commandArgv: {
          profile: 'xiaohongshu-batch-0',
          keyword: 'seedance2.0',
          'max-notes': 30,
          env: 'debug',
          'do-comments': true,
          'do-likes': false,
          'like-keywords': '',
          headless: false,
          'dry-run': true,
        },
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
        runCount: 0,
        failCount: 0,
        runHistory: [
          {
            timestamp: '2026-02-20T10:00:00.000Z',
            status: 'success',
            durationMs: 4321,
          },
        ],
      },
    ] as any[],
    nextId: 2,
    cmdEventCb: null as ((evt: any) => void) | null,
    unsubscribed: false,
    failListOnce: false,
  };

  const api: any = {
    scheduleInvoke: async (input: any) => {
      calls.scheduleInvoke.push(input);
      const action = String(input?.action || '').trim();
      if (action === 'list') {
        if (state.failListOnce) {
          state.failListOnce = false;
          return { ok: false, error: 'list_failed' };
        }
        return { ok: true, json: { tasks: state.tasks } };
      }
      if (action === 'save') {
        const payload = input?.payload || {};
        const argv = payload?.argv || {};
        const commandType = String(payload?.commandType || 'xhs-unified');
        if (!argv.profile && !argv.profiles && !argv.profilepool) {
          return { ok: false, error: 'profile/profiles/profilepool 至少填写一个' };
        }
        if ((commandType === 'xhs-unified' || commandType === 'weibo-search' || commandType === '1688-search') && !argv.keyword) {
          return { ok: false, error: '关键词不能为空' };
        }
        if (commandType === 'weibo-monitor' && !argv['user-id']) {
          return { ok: false, error: '微博 monitor 任务需要 user-id' };
        }
        if ((payload.scheduleType === 'once' || payload.scheduleType === 'daily' || payload.scheduleType === 'weekly') && !payload.runAt) {
          return { ok: false, error: `${payload.scheduleType} 任务需要锚点时间` };
        }
        const id = String(payload.id || '').trim() || `sched-${String(state.nextId).padStart(4, '0')}`;
        const idx = state.tasks.findIndex((x) => String(x.id) === id);
        const row = {
          ...(idx >= 0 ? state.tasks[idx] : {}),
          id,
          name: String(payload.name || id),
          enabled: payload.enabled !== false,
          scheduleType: String(payload.scheduleType || 'interval'),
          intervalMinutes: Number(payload.intervalMinutes || 30) || 30,
          runAt: payload.runAt || null,
          maxRuns: Number(payload.maxRuns || 0) > 0 ? Number(payload.maxRuns) : null,
          nextRunAt: null,
          commandType: String(payload.commandType || 'xhs-unified'),
          commandArgv: payload.argv || {},
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
        const row = state.tasks.find((x) => String(x.id) === id);
        if (row) {
          row.runCount = Number(row.runCount || 0) + 1;
          row.lastStatus = 'success';
          row.lastRunAt = new Date().toISOString();
        }
        return { ok: true, json: { result: { runResult: { lastRunId: `rid-${id}` } } } };
      }
      if (action === 'delete') {
        const id = String(input?.taskId || '').trim();
        state.tasks = state.tasks.filter((x) => String(x.id) !== id);
        return { ok: true, json: { id } };
      }
      if (action === 'run-due') {
        return { ok: true, json: { count: 1, success: 1, failed: 0 } };
      }
      if (action === 'export') {
        const maybeId = String(input?.taskId || '').trim();
        if (!maybeId) return { ok: true, json: { tasks: state.tasks } };
        const row = state.tasks.find((x) => String(x.id) === maybeId);
        return { ok: true, json: row ? { task: row } : {} };
      }
      if (action === 'import') {
        const payloadRaw = String(input?.payloadJson || '');
        try {
          const parsed = JSON.parse(payloadRaw);
          const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
          for (const row of tasks) {
            if (!row?.id) continue;
            const id = String(row.id);
            const idx = state.tasks.findIndex((x) => String(x.id) === id);
            if (idx >= 0) state.tasks[idx] = { ...state.tasks[idx], ...row };
            else state.tasks.push(row);
          }
        } catch {
          // ignore parse failures in tests
        }
        return { ok: true, json: {} };
      }
      if (action === 'daemon-start') {
        const runId = `daemon-run-${calls.scheduleInvoke.filter((item) => item.action === 'daemon-start').length}`;
        return { ok: true, runId };
      }
      return { ok: true, json: {} };
    },
    taskRunEphemeral: async (input: any) => {
      calls.taskRunEphemeral.push(input);
      return { ok: true, runId: `ephemeral-${calls.taskRunEphemeral.length}` };
    },
    cmdKill: async (payload: any) => {
      calls.cmdKill.push(payload);
      return { ok: true };
    },
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
  alertMessages = [];
  autoImportPayload = JSON.stringify({
    tasks: [
      {
        id: 'sched-import-1',
        name: 'imported',
        enabled: true,
        scheduleType: 'interval',
        intervalMinutes: 20,
        runAt: null,
        maxRuns: null,
        nextRunAt: null,
        commandType: 'xhs-unified',
        commandArgv: { profile: 'xiaohongshu-batch-3', keyword: 'imported-task' },
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
        runCount: 0,
        failCount: 0,
      },
    ],
  });
  originalAlert = (globalThis as any).alert;
  originalConfirm = (globalThis as any).confirm;
  (globalThis as any).alert = (msg: string) => alertMessages.push(String(msg));
  (globalThis as any).confirm = () => true;

  originalCreateObjectUrl = (globalThis as any).URL?.createObjectURL;
  originalRevokeObjectUrl = (globalThis as any).URL?.revokeObjectURL;
  (globalThis as any).URL.createObjectURL = () => 'blob://scheduler-test';
  (globalThis as any).URL.revokeObjectURL = () => {};

  originalInputClick = (window as any).HTMLInputElement.prototype.click;
  (window as any).HTMLInputElement.prototype.click = function patchedClick(this: HTMLInputElement) {
    const isImportInput =
      String((this as any).type || '').toLowerCase() === 'file' ||
      String((this as any).accept || '').includes('.json');
    if (isImportInput && typeof (this as any).onchange === 'function') {
      const file = new (window as any).File([autoImportPayload], 'schedules.json', { type: 'application/json' });
      Object.defineProperty(this, 'files', { configurable: true, value: [file] });
      (this as any).onchange({ target: this });
      return;
    }
    return originalInputClick.call(this);
  };
  originalAnchorClick = (window as any).HTMLAnchorElement.prototype.click;
  (window as any).HTMLAnchorElement.prototype.click = function patchedAnchorClick() {};
});

afterEach(() => {
  (globalThis as any).alert = originalAlert;
  (globalThis as any).confirm = originalConfirm;
  if (originalCreateObjectUrl) (globalThis as any).URL.createObjectURL = originalCreateObjectUrl;
  else delete (globalThis as any).URL.createObjectURL;
  if (originalRevokeObjectUrl) (globalThis as any).URL.revokeObjectURL = originalRevokeObjectUrl;
  else delete (globalThis as any).URL.revokeObjectURL;
  (window as any).HTMLInputElement.prototype.click = originalInputClick;
  (window as any).HTMLAnchorElement.prototype.click = originalAnchorClick;
  dom.cleanup();
});

test('scheduler panel supports validate + add/update/delete/import + daemon lifecycle', async () => {
  const { ctx, calls, state } = createMockCtx();
  const root = document.createElement('div');
  const dispose = renderSchedulerPanel(root, ctx) as (() => void) | void;
  await flush(6);

  const nameInput = root.querySelector('#scheduler-name') as HTMLInputElement;
  const profileInput = root.querySelector('#scheduler-profile') as HTMLInputElement;
  const keywordInput = root.querySelector('#scheduler-keyword') as HTMLInputElement;
  const runAtInput = root.querySelector('#scheduler-runat') as HTMLInputElement;
  const typeSelect = root.querySelector('#scheduler-type') as HTMLSelectElement;
  const periodicTypeSelect = root.querySelector('#scheduler-periodic-type') as HTMLSelectElement;
  const maxNotesInput = root.querySelector('#scheduler-max-notes') as HTMLInputElement;
  const openConfigBtn = root.querySelector('#scheduler-open-config-btn') as HTMLButtonElement;
  const activeTaskText = root.querySelector('#scheduler-active-task-id') as HTMLElement;
  const saveBtn = root.querySelector('#scheduler-save-btn') as HTMLButtonElement;
  const runNowBtn = root.querySelector('#scheduler-run-now-btn') as HTMLButtonElement;
  const resetBtn = root.querySelector('#scheduler-reset-btn') as HTMLButtonElement;
  const intervalWrap = root.querySelector('#scheduler-interval-wrap') as HTMLDivElement;
  const runAtWrap = root.querySelector('#scheduler-runat-wrap') as HTMLDivElement;

  resetBtn.click();
  await flush(1);
  saveBtn.click();
  await flush(2);
  assert.equal(alertMessages.some((x) => x.includes('profile/profiles/profilepool 至少填写一个')), true);

  nameInput.value = 'missing-profile';
  saveBtn.click();
  await flush(2);
  assert.equal(alertMessages.some((x) => x.includes('profile/profiles/profilepool 至少填写一个')), true);

  profileInput.value = 'xiaohongshu-batch-0';
  saveBtn.click();
  await flush(2);
  assert.equal(alertMessages.some((x) => x.includes('关键词不能为空')), true);

  keywordInput.value = '春晚';
  typeSelect.value = 'scheduled';
  typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(runAtWrap.style.display === 'none', false);
  assert.equal(intervalWrap.style.display, 'none');
  runAtInput.value = '';
  saveBtn.click();
  await flush(2);
  assert.equal(alertMessages.some((x) => x.includes('once 任务需要锚点时间')), true);

  runAtInput.value = '2026-02-20T10:30';
  saveBtn.click();
  await flush(4);
  assert.equal(calls.scheduleInvoke.some((item) => item.action === 'save'), true);

  const listAfterAdd = root.querySelector('#scheduler-list') as HTMLDivElement;
  assert.equal(String(listAfterAdd.textContent || '').includes('missing-profile'), true);
  assert.equal(String(listAfterAdd.textContent || '').includes('recent:'), true);
  assert.equal(String(listAfterAdd.textContent || '').includes('✅'), true);

  const schedulerList = root.querySelector('#scheduler-list') as HTMLDivElement;
  findButtonByTextIn(schedulerList, '编辑', 0).click();
  await flush(2);
  assert.equal(activeTaskText.textContent, 'sched-0001');
  maxNotesInput.value = '99';
  saveBtn.click();
  await flush(4);
  assert.equal(calls.scheduleInvoke.filter((item) => item.action === 'save').length >= 2, true);

  findButtonByTextIn(schedulerList, '载入配置', 0).click();
  await flush(2);
  assert.equal(calls.setActiveTab.includes('tasks'), true);

  findButtonByTextIn(schedulerList, '执行', 0).click();
  await flush(3);
  assert.equal(calls.scheduleInvoke.some((item) => item.action === 'run'), true);
  assert.equal(calls.setStatus.some((text) => text.includes('running: sched-0001')), true);
  assert.equal(calls.setActiveTab.includes('dashboard'), true);

  typeSelect.value = 'immediate';
  periodicTypeSelect.value = 'interval';
  typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  runAtInput.value = '';
  profileInput.value = 'xiaohongshu-batch-0';
  keywordInput.value = '立即执行';
  runNowBtn.click();
  await flush(3);
  assert.equal(calls.taskRunEphemeral.length >= 1, true);
  assert.equal(calls.taskRunEphemeral.at(-1)?.argv?.keyword, '立即执行');

  openConfigBtn.click();
  await flush(2);
  assert.equal(calls.setActiveTab.filter((id) => id === 'tasks').length >= 2, true);

  findButtonByTextIn(schedulerList, '导出', 0).click();
  await flush(3);
  assert.equal(calls.scheduleInvoke.some((item) => item.action === 'export' && item.taskId), true);

  findButtonByTextIn(schedulerList, '删除', 0).click();
  await flush(3);
  assert.equal(calls.scheduleInvoke.some((item) => item.action === 'delete'), true);

  const refreshBtn = root.querySelector('#scheduler-refresh-btn') as HTMLButtonElement;
  const runDueBtn = root.querySelector('#scheduler-run-due-btn') as HTMLButtonElement;
  const exportAllBtn = root.querySelector('#scheduler-export-all-btn') as HTMLButtonElement;
  const importBtn = root.querySelector('#scheduler-import-btn') as HTMLButtonElement;
  const originalCreateElement = document.createElement.bind(document);
  let createdImportInput: HTMLInputElement | null = null;
  (document as any).createElement = ((tagName: string, options?: ElementCreationOptions) => {
    const el = originalCreateElement(tagName as any, options as any);
    if (String(tagName).toLowerCase() === 'input') {
      createdImportInput = el as HTMLInputElement;
    }
    return el;
  }) as any;
  refreshBtn.click();
  runDueBtn.click();
  exportAllBtn.click();
  importBtn.click();
  if (createdImportInput && typeof (createdImportInput as any).onchange === 'function') {
    const file = {
      name: 'schedules.json',
      type: 'application/json',
      text: async () => autoImportPayload,
    };
    Object.defineProperty(createdImportInput, 'files', { configurable: true, value: [file] });
    await (createdImportInput as any).onchange({ target: createdImportInput });
  }
  (document as any).createElement = originalCreateElement;
  await flush(8);
  assert.equal(calls.scheduleInvoke.some((item) => item.action === 'run-due'), true);
  assert.equal(calls.scheduleInvoke.some((item) => item.action === 'export' && !item.taskId), true);
  assert.equal(calls.scheduleInvoke.some((item) => item.action === 'import'), true);
  assert.equal(String((root.querySelector('#scheduler-list') as HTMLDivElement).textContent || '').includes('imported'), true);

  const daemonStatus = root.querySelector('#scheduler-daemon-status') as HTMLSpanElement;
  const daemonStartBtn = root.querySelector('#scheduler-daemon-start-btn') as HTMLButtonElement;
  const daemonStopBtn = root.querySelector('#scheduler-daemon-stop-btn') as HTMLButtonElement;
  daemonStopBtn.click();
  assert.equal(daemonStatus.textContent?.includes('未启动'), true);

  daemonStartBtn.click();
  await flush(2);
  assert.equal(calls.scheduleInvoke.some((item) => item.action === 'daemon-start'), true);
  assert.equal(daemonStatus.textContent?.includes('运行中'), true);
  state.cmdEventCb?.({ runId: 'daemon-run-1', type: 'exit' });
  await flush(2);
  assert.equal(daemonStatus.textContent?.includes('已退出'), true);

  daemonStartBtn.click();
  await flush(2);
  daemonStopBtn.click();
  await flush(2);
  assert.equal(calls.cmdKill.length > 0, true);
  assert.equal(daemonStatus.textContent?.includes('已停止'), true);

  resetBtn.click();
  assert.equal(nameInput.value, '');
  assert.equal(keywordInput.value, '');
  assert.equal(profileInput.value, '');

  if (typeof dispose === 'function') dispose();
  assert.equal(state.unsubscribed, true);
});

test('scheduler panel renders list failure fallback when list command errors', async () => {
  const bundle = createMockCtx();
  bundle.state.failListOnce = true;
  const root = document.createElement('div');
  const dispose = renderSchedulerPanel(root, bundle.ctx) as (() => void) | void;
  await flush(4);
  const list = root.querySelector('#scheduler-list') as HTMLDivElement;
  assert.equal(String(list.textContent || '').includes('加载失败'), true);
  if (typeof dispose === 'function') dispose();
});

test('scheduler panel escapes untrusted task content when rendering task cards', async () => {
  const bundle = createMockCtx();
  bundle.state.tasks = [{
    id: 'sched-xss',
    name: '<img src=x onerror=alert(1)>',
    enabled: true,
    scheduleType: 'interval',
    intervalMinutes: 10,
    runAt: null,
    maxRuns: null,
    nextRunAt: null,
    commandType: 'xhs-unified',
    commandArgv: { profile: 'xiaohongshu-batch-0', keyword: 'xss' },
    lastRunAt: null,
    lastStatus: 'failure',
    lastError: '<script>boom</script>',
    runCount: 1,
    failCount: 1,
    runHistory: [
      { timestamp: '2026-02-20T10:00:00.000Z" onmouseover="alert(2)', status: 'failure', durationMs: 2200 },
    ],
  }];
  const root = document.createElement('div');
  const dispose = renderSchedulerPanel(root, bundle.ctx) as (() => void) | void;
  await flush(6);
  const schedulerList = root.querySelector('#scheduler-list') as HTMLDivElement;
  assert.equal(schedulerList.querySelector('img') == null, true);
  assert.equal(schedulerList.querySelector('script') == null, true);
  assert.equal(String(schedulerList.textContent || '').includes('<img src=x onerror=alert(1)>'), true);
  assert.equal(String(schedulerList.textContent || '').includes('<script>boom</script>'), true);
  if (typeof dispose === 'function') dispose();
});
