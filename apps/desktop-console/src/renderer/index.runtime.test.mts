import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from './test-dom.mts';

type CmdListener = (evt: any) => void;

let dom: DomHarness;

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush(times = 3) {
  for (let i = 0; i < times; i += 1) await tick();
}

function findTabByText(root: HTMLElement, text: string): HTMLDivElement {
  const tabs = Array.from(root.querySelectorAll('.tab')) as HTMLDivElement[];
  const found = tabs.find((el) => String(el.textContent || '').includes(text));
  if (!found) throw new Error(`tab not found: ${text}`);
  return found;
}

beforeEach(() => {
  dom = setupDom('<!doctype html><html><body><div id="tabs"></div><div id="content"></div><div id="status"></div></body></html>');
});

afterEach(() => {
  dom.cleanup();
});

test('renderer index boots onboarding tabs and responds to cmd events', async () => {
  let cmdListener: CmdListener | null = null;
  const heartbeatCalls: number[] = [];
  const spawns: any[] = [];

  const settings: any = {
    coreDaemonUrl: 'http://127.0.0.1:7700',
    downloadRoot: '/tmp/webauto/download',
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

  (window as any).api = {
    settingsGet: async () => settings,
    settingsSet: async (payload: any) => Object.assign(settings, payload),
    envCheckAll: async () => ({ allReady: false }),
    desktopHeartbeat: async () => {
      heartbeatCalls.push(Date.now());
      return { ok: true };
    },
    onCmdEvent: (cb: CmdListener) => {
      cmdListener = cb;
      return () => {
        cmdListener = null;
      };
    },
    onSettingsChanged: (_cb: any) => () => {},
    onStateUpdate: (_cb: any) => () => {},
    onActiveRunsChanged: (_cb: any) => () => {},
    envCheckCamo: async () => ({ installed: true, version: '0.1.5' }),
    envCheckServices: async () => ({ unifiedApi: true, camoRuntime: true }),
    envCheckFirefox: async () => ({ installed: true, path: '/tmp/camoufox' }),
    envCheckGeoIP: async () => ({ installed: false }),
    envRepairDeps: async () => ({ ok: true }),
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
    configSaveLast: async () => ({ ok: true }),
    configExport: async (_payload: any) => ({ ok: true, path: '/tmp/export.json' }),
    cmdRunJson: async (spec: any) => {
      const args = Array.isArray(spec?.args) ? spec.args.map((x: any) => String(x)) : [];
      if (args.some((x: string) => x.endsWith('/account.mjs')) && args.includes('list')) {
        return {
          ok: true,
          json: {
            profiles: [
              { profileId: 'xhs-1', accountRecordId: 'acc-1', accountId: 'uid-1', alias: '主号', status: 'active', valid: true },
            ],
          },
        };
      }
      if (args.some((x: string) => x.endsWith('/profilepool.mjs')) && args.includes('add')) {
        return { ok: true, json: { profileId: 'xiaohongshu-9' } };
      }
      return { ok: true, json: {} };
    },
    cmdSpawn: async (spec: any) => {
      spawns.push(spec);
      return { runId: `rid-${spawns.length}` };
    },
    cmdKill: async () => ({ ok: true }),
    profilesList: async () => ({ profiles: ['xhs-1', 'xhs-2'] }),
    scriptsXhsFullCollect: async () => ({ ok: true, scripts: [{ id: 'xhs:full', label: 'Full', path: '/tmp/full.mjs' }] }),
    runtimeListSessions: async () => [{ profileId: 'xhs-1', sessionId: 'xhs-1', currentUrl: 'https://www.xiaohongshu.com' }],
    runtimeSetBrowserTitle: async () => ({ ok: true }),
    runtimeSetHeaderBar: async () => ({ ok: true }),
    runtimeFocus: async () => ({ ok: true }),
    runtimeRestartPhase1: async () => ({ ok: true }),
    runtimeKill: async () => ({ ok: true }),
    stateGetTasks: async () => [],
    resultsScan: async () => ({ ok: true, entries: [] }),
    fsListDir: async () => ({ ok: true, entries: [], truncated: false }),
    fsReadTextPreview: async () => ({ ok: true, text: '{}' }),
    fsReadFileBase64: async () => ({ ok: true, data: '' }),
    osOpenPath: async () => ({ ok: true }),
    clipboardWriteText: async () => ({ ok: true }),
    invoke: async () => ({ ok: true, models: ['iflow.glm-5'] }),
    profileDelete: async () => ({ ok: true }),
  };

  await import('./index.mts');
  await flush(6);

  const tabsRoot = document.getElementById('tabs') as HTMLDivElement;
  const contentRoot = document.getElementById('content') as HTMLDivElement;
  const statusRoot = document.getElementById('status') as HTMLDivElement;

  try {
    assert.ok(findTabByText(tabsRoot, '初始化'));
    assert.ok(findTabByText(tabsRoot, '任务'));
    assert.ok(findTabByText(tabsRoot, '看板'));
    assert.ok(findTabByText(tabsRoot, '定时任务'));
    assert.ok(findTabByText(tabsRoot, '账户管理'));

    findTabByText(tabsRoot, '任务').click();
    await flush(3);
    assert.equal(Boolean(contentRoot.querySelector('#task-run-btn')), true);

    findTabByText(tabsRoot, '看板').click();
    await flush(3);
    assert.equal(Boolean(contentRoot.querySelector('#stat-collected')), true);

    for (let i = 0; i < 20 && !cmdListener; i += 1) await flush();
    assert.ok(cmdListener);
    cmdListener({ type: 'started', title: 'xhs unified', pid: 123, runId: 'rid-1' });
    cmdListener({ type: 'started', title: 'xhs shard', pid: 124, runId: 'rid-2' });
    cmdListener({ type: 'stdout', runId: 'rid-1', line: 'phase2 collecting' });
    cmdListener({ type: 'stderr', runId: 'rid-1', line: 'warn timeout' });
    cmdListener({ type: 'exit', runId: 'rid-1', exitCode: 0, signal: null });
    cmdListener({ type: 'exit', runId: 'rid-2', exitCode: 0, signal: null });
    await flush(2);
    assert.match(String(statusRoot.textContent || ''), /idle|running/);

    findTabByText(tabsRoot, '账户管理').click();
    await flush(3);
    assert.match(String(contentRoot.textContent || ''), /账户列表/);

    assert.equal(heartbeatCalls.length > 0, true);
  } finally {
    window.dispatchEvent(new Event('beforeunload'));
    await flush();
  }
});
