import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderSchedulerPanel } from './scheduler.mts';
import { createMockCtx, tick, flush, findButtonByText, findButtonByTextIn, type MockBundle } from './scheduler.runtime.helpers.mts';

let dom: DomHarness;
let originalAlert: any;
let originalConfirm: any;
let originalCreateObjectUrl: any;
let originalRevokeObjectUrl: any;
let originalInputClick: any;
let originalAnchorClick: any;
let alertMessages: string[] = [];
let autoImportPayload = '';

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

test('scheduler save auto-selects valid profile when profile input is empty', async () => {
  const { ctx, calls } = createMockCtx();
  ctx.api.pathJoin = (...parts: string[]) => parts.filter(Boolean).join('/');
  ctx.api.cmdRunJson = async (spec: any) => {
    const args = Array.isArray(spec?.args) ? spec.args.map((x: any) => String(x)) : [];
    if (args.some((x: string) => x.endsWith('/account.mjs') || x.endsWith('\\account.mjs')) && args.includes('list')) {
      return {
        ok: true,
        json: {
          profiles: [
            { profileId: 'xiaohongshu-batch-8', platform: 'xiaohongshu', accountId: 'uid-8', valid: true, updatedAt: '2026-02-26T03:00:00.000Z' },
            { profileId: 'xiaohongshu-batch-1', platform: 'xiaohongshu', accountId: 'uid-1', valid: true, updatedAt: '2026-02-25T03:00:00.000Z' },
          ],
        },
      };
    }
    return { ok: true, json: {} };
  };

  const root = document.createElement('div');
  renderSchedulerPanel(root, ctx);
  await flush(6);

  const keywordInput = root.querySelector('#scheduler-keyword') as HTMLInputElement;
  const profileInput = root.querySelector('#scheduler-profile') as HTMLInputElement;
  const saveBtn = root.querySelector('#scheduler-save-btn') as HTMLButtonElement;

  keywordInput.value = '春晚';
  profileInput.value = '';
  saveBtn.click();
  await flush(6);

  const saveCalls = calls.scheduleInvoke.filter((item) => String(item?.action || '') === 'save');
  assert.equal(saveCalls.length > 0, true);
  assert.equal(String(saveCalls.at(-1)?.payload?.argv?.profile || ''), 'xiaohongshu-batch-8');
  assert.equal(profileInput.value, 'xiaohongshu-batch-8');
  assert.equal(alertMessages.length, 0, JSON.stringify(alertMessages));
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
