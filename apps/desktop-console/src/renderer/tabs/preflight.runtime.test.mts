import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderPreflight } from './preflight.mts';

type MockBundle = {
  ctx: any;
  calls: {
    spawns: any[];
    settingsSet: any[];
    profileDeletes: any[];
    logs: string[];
    setActiveTab: string[];
  };
};

let dom: DomHarness;
let originalAlert: any;
let originalConfirm: any;

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush(times = 3) {
  for (let i = 0; i < times; i += 1) await tick();
}

function findButtonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  const found = buttons.find((btn) => String(btn.textContent || '').includes(text));
  if (!found) throw new Error(`button not found: ${text}`);
  return found;
}

function createMockCtx(): MockBundle {
  const calls = {
    spawns: [],
    settingsSet: [],
    profileDeletes: [],
    logs: [],
    setActiveTab: [],
  };

  const settings: any = {
    downloadRoot: '/tmp/webauto/download',
    timeouts: { loginTimeoutSec: 900 },
    profileAliases: { 'xhs-1': '主号' },
  };

  let scanEntries: any[] = [
    {
      profileId: 'xhs-1',
      profileDir: '/tmp/webauto/profiles/xhs-1',
      fingerprintPath: '/tmp/webauto/fingerprints/xhs-1.json',
      fingerprint: {
        platform: 'windows',
        originalPlatform: 'windows',
        osVersion: '11',
        userAgent: 'Mozilla/5.0 test',
      },
    },
    {
      profileId: 'xhs-2',
      profileDir: '/tmp/webauto/profiles/xhs-2',
      fingerprintPath: '/tmp/webauto/fingerprints/xhs-2.json',
      fingerprint: null,
    },
  ];

  const api: any = {
    settings,
    pathJoin: (...parts: string[]) => parts.filter(Boolean).join('/'),
    osOpenPath: async () => ({ ok: true }),
    settingsSet: async (payload: any) => {
      calls.settingsSet.push(payload);
      Object.assign(settings, payload);
      return settings;
    },
    profilesScan: async () => ({
      ok: true,
      entries: scanEntries,
      profilesRoot: '/tmp/webauto/profiles',
      fingerprintsRoot: '/tmp/webauto/fingerprints',
    }),
    fingerprintRegenerate: async () => ({ ok: true }),
    fingerprintDelete: async () => ({ ok: true }),
    profileDelete: async (payload: any) => {
      calls.profileDeletes.push(payload);
      return { ok: true };
    },
    cmdRunJson: async (spec: any) => {
      const args = Array.isArray(spec?.args) ? spec.args.map((x: any) => String(x)) : [];
      if (args.some((x: string) => x.endsWith('/xhs-install.mjs'))) {
        return { ok: true, stdout: 'Camoufox browser ready' };
      }
      if (args.some((x: string) => x.endsWith('/profilepool.mjs')) && args.includes('list')) {
        return { ok: true, json: { profiles: ['xiaohongshu-batch-1', 'xiaohongshu-batch-2'], root: '/tmp/webauto/profiles' } };
      }
      if (args.some((x: string) => x.endsWith('/profilepool.mjs')) && args.includes('add')) {
        scanEntries = scanEntries.concat({
          profileId: 'xiaohongshu-batch-3',
          profileDir: '/tmp/webauto/profiles/xiaohongshu-batch-3',
          fingerprintPath: '/tmp/webauto/fingerprints/xiaohongshu-batch-3.json',
          fingerprint: null,
        });
        return { ok: true, json: { profileId: 'xiaohongshu-batch-3' } };
      }
      return { ok: true, json: {} };
    },
    cmdSpawn: async (spec: any) => {
      calls.spawns.push(spec);
      return { runId: `rid-${calls.spawns.length}` };
    },
  };

  const ctx: any = {
    api,
    settings,
    clearLog: () => {
      calls.logs.length = 0;
    },
    appendLog: (line: string) => calls.logs.push(String(line || '')),
    setActiveTab: (id: string) => calls.setActiveTab.push(id),
  };

  return { ctx, calls };
}

beforeEach(() => {
  dom = setupDom();
  originalAlert = (globalThis as any).alert;
  originalConfirm = (globalThis as any).confirm;
  (globalThis as any).alert = () => {};
  (globalThis as any).confirm = () => true;
});

afterEach(() => {
  (globalThis as any).alert = originalAlert;
  (globalThis as any).confirm = originalConfirm;
  dom.cleanup();
});

test('preflight renders profile list and supports browser/pool actions', async () => {
  const { ctx, calls } = createMockCtx();
  (window as any).api = ctx.api;

  const root = document.createElement('div');
  renderPreflight(root, ctx);
  await flush(6);

  const aliasInput = Array.from(root.querySelectorAll('input')).find((el) =>
    String((el as HTMLInputElement).placeholder || '').includes('账号名（alias'),
  ) as HTMLInputElement;
  assert.ok(aliasInput);
  aliasInput.value = '主号-更新';
  aliasInput.dispatchEvent(new Event('blur'));
  await flush(2);
  assert.equal(calls.settingsSet.length > 0, true);

  findButtonByText(root, '检查浏览器/依赖').click();
  await flush(3);
  findButtonByText(root, '下载 Camoufox').click();
  await flush(3);

  findButtonByText(root, '打开').click();
  findButtonByText(root, '指纹').click();
  findButtonByText(root, '保存').click();
  await flush(2);
  findButtonByText(root, '重生').click();
  await flush(2);
  findButtonByText(root, '删指').click();
  await flush(2);
  findButtonByText(root, '删档').click();
  await flush(2);

  const selectAll = Array.from(root.querySelectorAll('input[type=\"checkbox\"]')).find(
    (el) => !String((el as HTMLInputElement).dataset.profileId || '').trim(),
  ) as HTMLInputElement;
  assert.ok(selectAll);
  selectAll.checked = true;
  selectAll.dispatchEvent(new Event('change'));
  await flush();
  findButtonByText(root, '批量删除选中 profile').click();
  await flush(2);

  findButtonByText(root, '扫描池').click();
  await flush(3);
  findButtonByText(root, '新增一个并登录').click();
  await flush(4);
  findButtonByText(root, '批量登录/补登录').click();
  await flush(3);

  assert.equal(calls.spawns.length >= 2, true);
  assert.equal(calls.spawns.some((spec) => String(spec?.args?.join(' ') || '').includes('profilepool.mjs login-profile')), true);
  assert.equal(calls.spawns.some((spec) => String(spec?.args?.join(' ') || '').includes('profilepool.mjs login')), true);
  assert.equal(calls.profileDeletes.length > 0, true);

  findButtonByText(root, '去小红书首页').click();
  assert.equal(calls.setActiveTab.includes('xiaohongshu'), true);
  assert.equal(window.localStorage.getItem('webauto.xhs.navTarget.v1'), 'account');

  // Some preflight actions schedule deferred refresh; let them drain before dom cleanup.
  await new Promise((resolve) => setTimeout(resolve, 1200));
});
