import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderAccountManager } from './account-manager.mts';

type MockBundle = {
  ctx: any;
  calls: {
    spawns: any[];
    settingsSet: any[];
    deletes: any[];
    sync: string[];
  };
};

let dom: DomHarness;
let originalAlert: any;
let originalConfirm: any;
let originalPrompt: any;

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
    deletes: [],
    sync: [],
  };
  let failRefreshOnce = true;

  let accounts: any[] = [
    {
      profileId: 'xhs-1',
      accountRecordId: 'acc-1',
      accountId: 'uid-1',
      alias: '主号',
      name: '主号',
      status: 'active',
      valid: true,
      reason: '',
      updatedAt: new Date().toISOString(),
    },
    {
      profileId: 'xhs-2',
      accountRecordId: 'acc-2',
      accountId: '',
      alias: '',
      name: '',
      status: 'invalid',
      valid: false,
      reason: 'missing_cookie',
      updatedAt: new Date().toISOString(),
    },
  ];

  const settings: any = {
    profileAliases: { 'xhs-1': '主号' },
    timeouts: { loginTimeoutSec: 900 },
  };

  const api: any = {
    settings,
    pathJoin: (...parts: string[]) => parts.filter(Boolean).join('/'),
    envCheckCamo: async () => ({ installed: true }),
    envCheckServices: async () => ({ unifiedApi: true, camoRuntime: true }),
    envCheckFirefox: async () => ({ installed: true }),
    cmdRunJson: async (spec: any) => {
      const args = Array.isArray(spec?.args) ? spec.args.map((x: any) => String(x)) : [];
      if (args.some((x: string) => x.endsWith('/account.mjs')) && args.includes('list')) {
        return { ok: true, json: { profiles: accounts } };
      }
      if (args.some((x: string) => x.endsWith('/account.mjs')) && args.includes('sync')) {
        const profileId = String(args[2] || '').trim();
        calls.sync.push(profileId);
        const profile = {
          profileId,
          accountId: profileId === 'xhs-2' ? 'uid-2' : 'uid-1',
          alias: profileId === 'xhs-2' ? '副号' : '主号',
          status: 'active',
          valid: true,
          reason: '',
        };
        accounts = accounts.map((row) => (row.profileId === profileId ? { ...row, ...profile } : row));
        return { ok: true, json: { profile } };
      }
      if (args.some((x: string) => x.endsWith('/account.mjs')) && args.includes('add')) {
        return {
          ok: true,
          json: {
            account: { id: 'xhs-0009', profileId: 'xiaohongshu-batch-9', status: 'pending', valid: false },
          },
        };
      }
      if (args.some((x: string) => x.endsWith('/account.mjs')) && args.includes('delete')) {
        calls.deletes.push(args);
        return { ok: true, json: {} };
      }
      return { ok: true, json: {} };
    },
    cmdSpawn: async (spec: any) => {
      calls.spawns.push(spec);
      if (
        failRefreshOnce &&
        String(spec?.args?.join(' ') || '').includes('account.mjs login')
      ) {
        failRefreshOnce = false;
        throw new Error('simulated_refresh_failure');
      }
      return { runId: `rid-${calls.spawns.length}` };
    },
    settingsSet: async (payload: any) => {
      calls.settingsSet.push(payload);
      Object.assign(settings, payload);
      return settings;
    },
    profileDelete: async (payload: any) => {
      calls.deletes.push(payload);
      return { ok: true };
    },
  };

  const ctx: any = {
    api,
    refreshSettings: async () => settings,
  };

  return { ctx, calls };
}

beforeEach(() => {
  dom = setupDom();
  originalAlert = (globalThis as any).alert;
  originalConfirm = (globalThis as any).confirm;
  originalPrompt = (globalThis as any).prompt;
  (globalThis as any).alert = () => {};
  (globalThis as any).confirm = () => true;
  (globalThis as any).prompt = () => '';
});

afterEach(() => {
  (globalThis as any).alert = originalAlert;
  (globalThis as any).confirm = originalConfirm;
  (globalThis as any).prompt = originalPrompt;
  dom.cleanup();
});

test('account manager supports add/check/refresh flows', async () => {
  const { ctx, calls } = createMockCtx();
  (window as any).api = ctx.api;
  const alerts: string[] = [];
  (globalThis as any).alert = (msg: string) => alerts.push(String(msg));
  const originalConsoleError = console.error;
  console.error = () => {};

  const root = document.createElement('div');
  const dispose = renderAccountManager(root, ctx) as (() => void) | void;
  try {
    await flush(4);

    findButtonByText(root, '添加账户').click();
    await flush(4);
    assert.equal(calls.spawns.some((spec) => String(spec?.args?.join(' ') || '').includes('login-profile')), true);

    findButtonByText(root, '刷新失效').click();
    await flush(3);
    assert.equal(calls.spawns.some((spec) => String(spec?.args?.join(' ') || '').includes('account.mjs login')), true);

    findButtonByText(root, '检查所有').click();
    await flush(4);
    assert.equal(calls.sync.includes('xhs-2'), true);
    assert.equal(calls.settingsSet.length > 0, true);

    findButtonByText(root, '刷新失效').click();
    await flush(2);
    assert.equal(alerts.some((msg) => msg.includes('没有失效的账户需要刷新')), true);
  } finally {
    console.error = originalConsoleError;
    if (typeof dispose === 'function') dispose();
  }
});
