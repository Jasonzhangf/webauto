import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { setupDom, type DomHarness } from '../test-dom.mts';
import { renderSetupWizard } from './setup-wizard.mts';

type MockBundle = {
  ctx: any;
  calls: {
    repairs: any[];
    spawns: any[];
    settingsSet: any[];
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
    repairs: [],
    spawns: [],
    settingsSet: [],
    setActiveTab: [],
  };

  const state = {
    env: {
      camo: { installed: false, version: '' },
      services: { unifiedApi: false, camoRuntime: false },
      firefox: { installed: false, path: '' },
      geoip: { installed: false },
    },
    accounts: [
      {
        profileId: 'xhs-1',
        accountRecordId: 'acc-1',
        accountId: 'uid-1',
        alias: '主号',
        status: 'active',
        valid: true,
      },
    ] as any[],
  };

  const settings: any = {
    profileAliases: { 'xhs-1': '主号' },
    timeouts: { loginTimeoutSec: 900 },
  };

  const api: any = {
    settings,
    pathJoin: (...parts: string[]) => parts.filter(Boolean).join('/'),
    envCheckAll: async () => {
      const browserReady = Boolean(state.env.firefox.installed || state.env.services.camoRuntime);
      return {
        ...state.env,
        browserReady,
        missing: {
          core: !state.env.services.unifiedApi,
          runtimeService: !state.env.services.camoRuntime,
          camo: !state.env.camo.installed,
          runtime: !browserReady,
          geoip: !state.env.geoip.installed,
        },
        allReady: Boolean(state.env.camo.installed && state.env.services.unifiedApi && browserReady),
      };
    },
    envCheckCamo: async () => state.env.camo,
    envCheckServices: async () => state.env.services,
    envCheckFirefox: async () => state.env.firefox,
    envCheckGeoIP: async () => state.env.geoip,
    envRepairDeps: async (payload: any) => {
      calls.repairs.push(payload);
      state.env = {
        camo: { installed: true, version: '0.1.5' },
        services: { unifiedApi: true, camoRuntime: true },
        firefox: { installed: true, path: '/tmp/camoufox' },
        geoip: { installed: true },
      };
      return { ok: true };
    },
    cmdRunJson: async (spec: any) => {
      const args = Array.isArray(spec?.args) ? spec.args.map((x: any) => String(x)) : [];
      if (args.some((x: string) => x.endsWith('/account.mjs')) && args.includes('list')) {
        return { ok: true, json: { profiles: state.accounts } };
      }
      if (args.some((x: string) => x.endsWith('/account.mjs')) && args.includes('add')) {
        const profileId = 'xiaohongshu-batch-9';
        state.accounts.push({
          profileId,
          accountRecordId: null,
          accountId: null,
          alias: '',
          status: 'pending',
          valid: false,
        });
        return {
          ok: true,
          json: { account: { id: 'xhs-0009', profileId, status: 'pending', valid: false } },
        };
      }
      if (args.some((x: string) => x.endsWith('/account.mjs')) && args.includes('sync')) {
        const profileId = String(args[2] || '').trim();
        const profile = {
          profileId,
          accountId: profileId === 'xiaohongshu-batch-9' ? 'uid-9' : '',
          alias: profileId === 'xiaohongshu-batch-9' ? '新账号' : '',
          status: 'active',
          valid: profileId === 'xiaohongshu-batch-9',
          reason: '',
        };
        state.accounts = state.accounts.map((row) =>
          row.profileId === profileId
            ? { ...row, accountId: profile.accountId, alias: profile.alias, valid: profile.valid, status: profile.status }
            : row,
        );
        return { ok: true, json: { profile } };
      }
      return { ok: true, json: {} };
    },
    cmdSpawn: async (spec: any) => {
      calls.spawns.push(spec);
      return { runId: `rid-${calls.spawns.length}` };
    },
    settingsSet: async (payload: any) => {
      calls.settingsSet.push(payload);
      Object.assign(settings, payload);
      return settings;
    },
  };

  const ctx: any = {
    api,
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

test('setup wizard checks env, repairs missing deps, creates account and enters main tab', async () => {
  const { ctx, calls } = createMockCtx();
  (window as any).api = ctx.api;

  const root = document.createElement('div');
  const dispose = renderSetupWizard(root, ctx) as (() => void) | void;
  await flush(4);

  const repairAllBtn = root.querySelector('#env-repair-all-btn') as HTMLButtonElement;
  assert.equal(repairAllBtn.style.display !== 'none', true);
  repairAllBtn.click();
  await flush(5);
  assert.equal(calls.repairs.length > 0, true);

  const aliasInput = root.querySelector('#new-alias-input') as HTMLInputElement;
  aliasInput.value = '';
  const addBtn = root.querySelector('#add-account-btn') as HTMLButtonElement;
  addBtn.click();
  await flush(5);
  assert.equal(calls.spawns.some((spec) => String(spec?.args?.join(' ') || '').includes('login-profile')), true);

  const enterBtn = root.querySelector('#enter-main-btn') as HTMLButtonElement;
  assert.equal(enterBtn.disabled, false);
  enterBtn.click();
  assert.equal(calls.setActiveTab.includes('tasks'), true);

  if (typeof dispose === 'function') dispose();
});

test('setup wizard supports one-click reinstall resources', async () => {
  const { ctx, calls } = createMockCtx();
  (window as any).api = ctx.api;

  const root = document.createElement('div');
  const dispose = renderSetupWizard(root, ctx) as (() => void) | void;
  await flush(4);

  const reinstallBtn = root.querySelector('#env-reinstall-all-btn') as HTMLButtonElement;
  assert.ok(reinstallBtn);
  reinstallBtn.click();
  await flush(4);
  assert.equal(calls.repairs.some((item) => item?.reinstall === true && item?.browser === true && item?.geoip === true), true);

  if (typeof dispose === 'function') dispose();
});
