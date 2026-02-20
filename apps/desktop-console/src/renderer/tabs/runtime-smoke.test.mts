import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderConfigPanel } from '../tabs-new/config-panel.mts';
import { renderDashboard } from '../tabs-new/dashboard.mts';
import { renderLogs } from './logs.mts';
import { renderProfilePool } from './profile-pool.mts';
import { renderResults } from './results.mts';
import { renderRun } from './run.mts';
import { renderRuntime } from './runtime.mts';
import { renderSettings } from './settings.mts';

type MockBundle = {
  ctx: any;
  calls: any;
  emitters: any;
};

let dom: DomHarness;
let originalFetch: any;
let originalAlert: any;
let originalConfirm: any;

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush(times = 2) {
  for (let i = 0; i < times; i += 1) await tick();
}

function findButtonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const all = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  const found = all.find((btn) => String(btn.textContent || '').includes(text));
  if (!found) {
    throw new Error(`button not found: ${text}`);
  }
  return found;
}

async function waitForSelectOption(
  root: HTMLElement,
  optionValue: string,
  attempts = 20,
  visibleOnly = false,
): Promise<HTMLSelectElement | null> {
  for (let i = 0; i < attempts; i += 1) {
    const found = Array.from(root.querySelectorAll('select')).find((sel) =>
      (!visibleOnly || (sel as HTMLSelectElement).style.display !== 'none') &&
      Array.from((sel as HTMLSelectElement).options || []).some((opt) => opt.value === optionValue),
    ) as HTMLSelectElement | undefined;
    if (found) return found;
    await flush();
  }
  return null;
}

function createMockCtx(): MockBundle {
  const emitters: any = {
    settingsChanged: null,
    stateUpdate: null,
    cmdEvent: null,
    activeRunsChanged: null,
  };
  const calls: any = {
    spawns: [],
    kills: [],
    settingsSet: [],
    configSave: [],
    configExport: [],
    invoke: [],
    runtime: {
      focus: [],
      mark: [],
      restart: [],
      kill: [],
    },
    clipboard: '',
    logs: [],
    setStatus: [],
    setActiveTab: [],
  };

  const settings: any = {
    coreDaemonUrl: 'http://127.0.0.1:7700',
    downloadRoot: '/tmp/webauto/download',
    defaultEnv: 'prod',
    defaultKeyword: 'seedance2.0',
    defaultTarget: 50,
    defaultDryRun: false,
    profileAliases: { 'xhs-1': '主号' },
    profileColors: { 'xhs-1': '#112233' },
    timeouts: { loginTimeoutSec: 900, cmdTimeoutSec: 0 },
    aiReply: {
      enabled: false,
      baseUrl: 'http://127.0.0.1:5520',
      apiKey: '',
      model: 'iflow.glm-5',
      temperature: 0.7,
      maxChars: 20,
      timeoutMs: 25000,
      stylePreset: 'friendly',
      styleCustom: '',
    },
  };
  let scheduleSeq = 1;
  const scheduleTasks: any[] = [];

  const api: any = {
    settings,
    pathJoin: (...parts: string[]) => parts.filter(Boolean).join('/'),
    pathNormalize: (p: string) => p,
    pathSep: '/',
    osHomedir: () => '/Users/test',
    configLoadLast: async () => ({
      keyword: 'seedance2.0',
      target: 50,
      env: 'debug',
      fetchBody: true,
      fetchComments: true,
      maxComments: 80,
      autoLike: false,
      likeKeywords: '',
      headless: false,
      dryRun: true,
      lastProfileId: 'xhs-1',
    }),
    configSaveLast: async (cfg: any) => {
      calls.configSave.push(cfg);
      return { ok: true };
    },
    configExport: async (payload: any) => {
      calls.configExport.push(payload);
      return { ok: true, path: payload.filePath };
    },
    cmdRunJson: async (spec: any) => {
      const args = Array.isArray(spec?.args) ? spec.args.map((x: any) => String(x)) : [];
      if (args.some((value: string) => value.endsWith('/account.mjs')) && args.includes('list')) {
        return {
          ok: true,
          json: {
            profiles: [
              { profileId: 'xhs-1', accountRecordId: 'acc-1', accountId: 'uid-1', alias: '主号', status: 'active', valid: true },
              { profileId: 'xhs-2', accountRecordId: 'acc-2', accountId: '', alias: '', status: 'invalid', valid: false },
            ],
          },
        };
      }
      if (args.some((value: string) => value.endsWith('/schedule.mjs'))) {
        const cmd = String(args[1] || '').trim();
        if (cmd === 'list') {
          return { ok: true, json: { tasks: scheduleTasks } };
        }
        if (cmd === 'add') {
          const id = `sched-${String(scheduleSeq).padStart(4, '0')}`;
          scheduleSeq += 1;
          const argvRaw = args[args.indexOf('--argv-json') + 1] || '{}';
          let argv: any = {};
          try { argv = JSON.parse(String(argvRaw)); } catch { argv = {}; }
          const row = {
            id,
            seq: scheduleSeq,
            name: String(args[args.indexOf('--name') + 1] || id),
            enabled: String(args[args.indexOf('--enabled') + 1] || 'true') !== 'false',
            scheduleType: String(args[args.indexOf('--schedule-type') + 1] || 'interval'),
            intervalMinutes: Number(args[args.indexOf('--interval-minutes') + 1] || 30) || 30,
            runAt: String(args[args.indexOf('--run-at') + 1] || '') || null,
            maxRuns: Number(args[args.indexOf('--max-runs') + 1] || 0) > 0
              ? Number(args[args.indexOf('--max-runs') + 1])
              : null,
            nextRunAt: null,
            commandType: 'xhs-unified',
            commandArgv: argv,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            runCount: 0,
            failCount: 0,
          };
          scheduleTasks.push(row);
          return { ok: true, json: { task: row } };
        }
        if (cmd === 'update') {
          const id = String(args[2] || '').trim();
          const row = scheduleTasks.find((item) => String(item.id) === id);
          if (!row) return { ok: false, error: 'missing_task' };
          const argvRaw = args[args.indexOf('--argv-json') + 1] || '{}';
          let argv: any = {};
          try { argv = JSON.parse(String(argvRaw)); } catch { argv = {}; }
          row.name = String(args[args.indexOf('--name') + 1] || row.name);
          row.commandArgv = argv;
          row.updatedAt = new Date().toISOString();
          return { ok: true, json: { task: row } };
        }
        if (cmd === 'run') {
          const id = String(args[2] || '').trim();
          return { ok: true, json: { result: { taskId: id, runResult: { id, lastRunId: 'rid-schedule-1' } } } };
        }
      }
      if (args.some((value: string) => value.endsWith('/profilepool.mjs')) && args.includes('add')) {
        return { ok: true, json: { profileId: 'xiaohongshu-9' } };
      }
      return { ok: true, json: {} };
    },
    cmdSpawn: async (spec: any) => {
      calls.spawns.push(spec);
      return { runId: `rid-${calls.spawns.length}` };
    },
    cmdKill: async (runId: string) => {
      calls.kills.push(runId);
      return { ok: true };
    },
    settingsSet: async (payload: any) => {
      calls.settingsSet.push(payload);
      Object.assign(settings, payload);
      if (typeof emitters.settingsChanged === 'function') emitters.settingsChanged(settings);
      return settings;
    },
    onSettingsChanged: (cb: any) => {
      emitters.settingsChanged = cb;
      return () => {
        emitters.settingsChanged = null;
      };
    },
    onStateUpdate: (cb: any) => {
      emitters.stateUpdate = cb;
      return () => {
        emitters.stateUpdate = null;
      };
    },
    onCmdEvent: (cb: any) => {
      emitters.cmdEvent = cb;
      return () => {
        emitters.cmdEvent = null;
      };
    },
    onActiveRunsChanged: (cb: any) => {
      emitters.activeRunsChanged = cb;
      return () => {
        emitters.activeRunsChanged = null;
      };
    },
    stateGetTasks: async () => [
      {
        runId: 'rid-1',
        status: 'running',
        collected: 3,
        target: 10,
        success: 2,
        failed: 1,
        phase: 'Phase2',
        action: 'collecting',
        keyword: 'seedance2.0',
        profileId: 'xhs-1',
      },
    ],
    runtimeListSessions: async () => [
      { profileId: 'xhs-1', sessionId: 'xhs-1', currentUrl: 'https://www.xiaohongshu.com', lastPhase: 'Phase2', lastActiveAt: new Date().toISOString() },
    ],
    runtimeSetBrowserTitle: async (payload: any) => {
      calls.runtime.mark.push({ type: 'title', payload });
      return { ok: true };
    },
    runtimeSetHeaderBar: async (payload: any) => {
      calls.runtime.mark.push({ type: 'header', payload });
      return { ok: true };
    },
    runtimeFocus: async (payload: any) => {
      calls.runtime.focus.push(payload);
      return { ok: true };
    },
    runtimeRestartPhase1: async (payload: any) => {
      calls.runtime.restart.push(payload);
      return { ok: true };
    },
    runtimeKill: async (payload: any) => {
      calls.runtime.kill.push(payload);
      return { ok: true };
    },
    profilesList: async () => ({ profiles: ['xhs-1', 'xhs-2', 'pool-1'] }),
    scriptsXhsFullCollect: async () => ({
      ok: true,
      scripts: [{ id: 'xhs:full', label: 'Full Collect', path: '/tmp/full-collect.mjs' }],
    }),
    resultsScan: async () => ({
      ok: true,
      entries: [
        { env: 'debug', keyword: 'seedance2.0', path: '/tmp/result', state: { status: 'running', links: 2, target: 10, completed: 1, failed: 0 } },
      ],
    }),
    fsListDir: async () => ({
      ok: true,
      entries: [
        { path: '/tmp/result/a.json', rel: 'a.json', name: 'a.json', isDir: false },
        { path: '/tmp/result/b.png', rel: 'b.png', name: 'b.png', isDir: false },
      ],
      truncated: false,
    }),
    fsReadTextPreview: async () => ({ ok: true, text: '{"ok":true}' }),
    fsReadFileBase64: async () => ({ ok: true, data: 'iVBORw0KGgo=' }),
    osOpenPath: async (_p: string) => ({ ok: true }),
    clipboardWriteText: async (text: string) => {
      calls.clipboard = text;
      return { ok: true };
    },
    invoke: async (channel: string, payload: any) => {
      calls.invoke.push({ channel, payload });
      if (channel === 'ai:listModels') return { ok: true, models: ['iflow.glm-5'], rawCount: 1 };
      if (channel === 'ai:testChatCompletion') return { ok: true, latencyMs: 88, model: payload.model };
      return { ok: false, error: 'unknown_channel' };
    },
  };

  const ctx: any = {
    api,
    settings,
    _logLines: [],
    _activeRunIds: new Set(['rid-1']),
    activeRunId: 'rid-1',
    xhsCurrentRun: { runId: 'rid-1' },
    appendLog: (line: string) => {
      calls.logs.push(line);
      ctx._logLines.push(line);
    },
    clearLog: () => {
      ctx._logLines = [];
    },
    setStatus: (text: string) => {
      calls.setStatus.push(text);
    },
    setActiveTab: (id: string) => {
      calls.setActiveTab.push(id);
    },
    onActiveRunsChanged: (cb: any) => {
      emitters.activeRunsChanged = cb;
      return () => {
        emitters.activeRunsChanged = null;
      };
    },
  };

  return { ctx, calls, emitters };
}

beforeEach(() => {
  dom = setupDom();
  originalFetch = (globalThis as any).fetch;
  originalAlert = (globalThis as any).alert;
  originalConfirm = (globalThis as any).confirm;
  (globalThis as any).alert = () => {};
  (globalThis as any).confirm = () => true;
  (globalThis as any).fetch = async () => new Response(
    JSON.stringify({ allowed: ['xhs-1', 'xhs-2'] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});

afterEach(() => {
  (globalThis as any).fetch = originalFetch;
  (globalThis as any).alert = originalAlert;
  (globalThis as any).confirm = originalConfirm;
  dom.cleanup();
});

test('config panel can load, export and run current schedule config', async () => {
  const { ctx, calls } = createMockCtx();
  (window as any).api = ctx.api;
  const root = document.createElement('div');
  renderConfigPanel(root, ctx);
  await flush(3);

  const accountSel = root.querySelector('#account-select') as HTMLSelectElement;
  const keyword = root.querySelector('#keyword-input') as HTMLInputElement;
  const saveCurrentBtn = root.querySelector('#save-current-btn') as HTMLButtonElement;
  const start = root.querySelector('#start-btn') as HTMLButtonElement;
  const exportBtn = root.querySelector('#export-btn') as HTMLButtonElement;
  assert.ok(accountSel.options.length >= 2);
  accountSel.value = 'xhs-1';
  keyword.value = 'deepseek';

  exportBtn.click();
  await flush();
  assert.equal(calls.configExport.length > 0, true);
  saveCurrentBtn.click();
  await flush(3);

  start.click();
  await flush(6);
  assert.equal(calls.spawns.length, 0);
  assert.equal(calls.logs.some((line: string) => line.includes('schedule run task=')), true);
  assert.ok(calls.setActiveTab.includes('dashboard'));
});

test('dashboard reacts to state/cmd events and supports controls', async () => {
  const { ctx, calls, emitters } = createMockCtx();
  (window as any).api = ctx.api;

  const root = document.createElement('div');
  const cleanup = renderDashboard(root, ctx) as (() => void) | void;
  await flush(2);

  emitters.stateUpdate?.({
    runId: 'rid-1',
    data: { collected: 6, target: 12, phase: 'Phase3', action: 'liking', comments: 9, likes: 3, ratelimits: 1 },
  });
  await flush();
  assert.equal((root.querySelector('#stat-collected') as HTMLDivElement).textContent, '6');
  assert.equal((root.querySelector('#current-phase') as HTMLSpanElement).textContent, 'Phase3');

  emitters.cmdEvent?.({ type: 'stderr', runId: 'rid-1', line: 'fatal err' });
  await flush();
  assert.equal((root.querySelector('#error-count-text') as HTMLDivElement).textContent, '1');

  (root.querySelector('#toggle-logs-btn') as HTMLButtonElement).click();
  assert.equal((root.querySelector('#logs-container') as HTMLDivElement).style.display, 'block');
  (root.querySelector('#pause-btn') as HTMLButtonElement).click();
  assert.match((root.querySelector('#pause-btn') as HTMLButtonElement).textContent || '', /继续|暂停/);

  (root.querySelector('#stop-btn') as HTMLButtonElement).click();
  await flush(3);
  assert.equal(calls.kills.length >= 1, true);

  if (typeof cleanup === 'function') cleanup();
});

test('runtime tab renders sessions and executes actions', async () => {
  const { ctx, calls } = createMockCtx();
  (window as any).api = ctx.api;

  const root = document.createElement('div');
  renderRuntime(root, ctx);
  await flush(3);

  const color = root.querySelector('input[type="color"]') as HTMLInputElement;
  assert.ok(color);
  color.value = '#445566';
  color.dispatchEvent(new Event('change'));
  await flush(2);
  assert.equal(calls.settingsSet.length > 0, true);

  findButtonByText(root, 'focus').click();
  findButtonByText(root, 'mark').click();
  findButtonByText(root, 'phase1').click();
  findButtonByText(root, 'kill').click();
  await flush(2);
  assert.equal(calls.runtime.focus.length, 1);
  assert.equal(calls.runtime.restart.length, 1);
  assert.equal(calls.runtime.kill.length, 1);
});

test('results tab scans entries and previews text/image files', async () => {
  const { ctx } = createMockCtx();
  (window as any).api = ctx.api;

  const root = document.createElement('div');
  renderResults(root, ctx);
  await flush(3);

  const items = Array.from(root.querySelectorAll('.item')) as HTMLDivElement[];
  assert.equal(items.length > 0, true);
  items[0].click();
  await flush(3);

  const fileItems = Array.from(root.querySelectorAll('.item')) as HTMLDivElement[];
  const textItem = fileItems.find((el) => (el.textContent || '').includes('.json'));
  assert.ok(textItem);
  textItem!.click();
  await flush(2);
  assert.equal(Boolean(root.querySelector('pre')), true);

  const imageItem = fileItems.find((el) => (el.textContent || '').includes('.png'));
  assert.ok(imageItem);
  imageItem!.click();
  await flush(2);
  assert.equal(Boolean(root.querySelector('img')), true);
});

test('settings tab saves and performs AI model/test actions', async () => {
  const { ctx, calls } = createMockCtx();
  (window as any).api = ctx.api;

  const root = document.createElement('div');
  renderSettings(root, ctx);
  await flush(3);

  findButtonByText(root, '保存').click();
  await flush();
  assert.equal(calls.settingsSet.length > 0, true);

  findButtonByText(root, '获取模型列表').click();
  findButtonByText(root, '测试连通').click();
  await flush(2);
  const channels = calls.invoke.map((x: any) => x.channel);
  assert.ok(channels.includes('ai:listModels'));
  assert.ok(channels.includes('ai:testChatCompletion'));
});

test('profile-pool tab can load/add/remove/select and save', async () => {
  const { ctx, calls } = createMockCtx();
  (window as any).api = ctx.api;

  const root = document.createElement('div');
  renderProfilePool(root, ctx);
  await flush(4);

  const addBtn = Array.from(root.querySelectorAll('div')).find((el) => String(el.textContent || '').trim() === '+ xhs-1') as HTMLDivElement;
  assert.ok(addBtn);
  addBtn.click();
  await flush();
  const phaseCheckbox = root.querySelector('label input[type="checkbox"]') as HTMLInputElement;
  assert.ok(phaseCheckbox);
  phaseCheckbox.checked = !phaseCheckbox.checked;
  phaseCheckbox.dispatchEvent(new Event('change'));
  await flush();
  const selectedRow = Array.from(root.querySelectorAll('div')).find((el) => String(el.textContent || '').trim() === '✓ xhs-1') as HTMLDivElement;
  assert.ok(selectedRow);
  selectedRow.click();
  await flush();
  const saveBtn = findButtonByText(root, '保存');
  saveBtn.click();
  await flush(2);
  assert.equal(calls.settingsSet.length > 0, true);
  const latest = calls.settingsSet[calls.settingsSet.length - 1];
  assert.equal(Array.isArray(latest.allowedProfiles), true);

  findButtonByText(root, '全选').click();
  await flush(2);
  findButtonByText(root, '清空').click();
  await flush(2);
  findButtonByText(root, '刷新').click();
  await flush(3);
});

test('run tab validates inputs, runs script and supports stop', async () => {
  const { ctx, calls } = createMockCtx();
  (window as any).api = ctx.api;
  const alerts: string[] = [];
  (globalThis as any).alert = (msg: string) => alerts.push(String(msg));

  const root = document.createElement('div');
  renderRun(root, ctx);
  await flush(4);

  const keyword = root.querySelector('input[placeholder=\"keyword\"]') as HTMLInputElement;
  const target = root.querySelector('input[placeholder=\"target\"]') as HTMLInputElement;
  const profileSelect = await waitForSelectOption(root, 'xhs-1', 30, true);
  const runBtn = findButtonByText(root, '运行');
  const stopBtn = findButtonByText(root, '停止');
  const selects = Array.from(root.querySelectorAll('select')) as HTMLSelectElement[];
  const templateSelect = selects[0];
  const profileModeSelect = selects[2];
  const runtimeSelect = selects[4];
  const poolSelect = selects[5];

  keyword.value = '';
  runBtn.click();
  await flush();
  assert.equal(alerts.some((x) => x.includes('keyword')), true);

  keyword.value = 'deepseek';
  target.value = '20';
  assert.ok(profileSelect);
  profileSelect.value = 'xhs-1';
  profileSelect.dispatchEvent(new Event('change'));
  await flush();
  runBtn.click();
  await flush(2);
  assert.equal(calls.spawns.length > 0, true);
  assert.equal(calls.spawns.some((spec: any) => String(spec?.args?.join(' ') || '').includes('/full-collect.mjs')), true);

  templateSelect.value = 'smartReply';
  templateSelect.dispatchEvent(new Event('change'));
  await flush(3);
  runtimeSelect.value = 'xhs-1';
  runtimeSelect.dispatchEvent(new Event('change'));
  await flush();
  runBtn.click();
  await flush(2);
  assert.equal(calls.spawns.some((spec: any) => String(spec?.args?.join(' ') || '').includes('--do-reply true')), true);

  templateSelect.value = 'fullCollect';
  templateSelect.dispatchEvent(new Event('change'));
  await flush(2);
  profileModeSelect.value = 'profilepool';
  profileModeSelect.dispatchEvent(new Event('change'));
  await flush(2);
  poolSelect.value = 'xhs';
  poolSelect.dispatchEvent(new Event('change'));
  await flush();
  runBtn.click();
  await flush(2);
  assert.equal(calls.spawns.some((spec: any) => String(spec?.args?.join(' ') || '').includes('--profilepool xhs')), true);

  profileModeSelect.value = 'profiles';
  profileModeSelect.dispatchEvent(new Event('change'));
  await flush(2);
  const profileChecks = Array.from(root.querySelectorAll('input[data-profile]')) as HTMLInputElement[];
  profileChecks.slice(0, 2).forEach((cb) => {
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
  });
  runBtn.click();
  await flush(2);
  assert.equal(calls.spawns.some((spec: any) => String(spec?.args?.join(' ') || '').includes('--profiles')), true);

  ctx.activeRunId = 'rid-1';
  stopBtn.click();
  await flush();
  assert.equal(calls.kills.includes('rid-1'), true);
});

test('logs tab partitions shard/global logs and supports copy/clear', async () => {
  const { ctx, calls, emitters } = createMockCtx();
  ctx._logLines = [
    '[rid:parent] [shard-hint] profiles=xhs-1,xhs-2',
    '[rid:parent] [Logger] runId=child1',
  ];
  (window as any).api = ctx.api;

  const root = document.createElement('div');
  renderLogs(root, ctx);
  await flush(2);

  ctx.appendLog('[rid:child1] Profile: xhs-1');
  ctx.appendLog('[rid:child1] [exit] code=0');
  emitters.activeRunsChanged?.();
  await flush();

  root.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2', ctrlKey: true, shiftKey: true, bubbles: true }));
  root.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: true, bubbles: true }));
  await flush();
  assert.equal(calls.clipboard.length > 0, true);

  findButtonByText(root, '清空日志').click();
  await flush();
  assert.equal(ctx._logLines.length, 0);
  root.dispatchEvent(new Event('DOMNodeRemoved'));
});
