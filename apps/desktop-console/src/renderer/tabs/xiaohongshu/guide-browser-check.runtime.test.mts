import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { consumeNavTarget, runGuideBrowserCheck, XHS_NAV_TARGET_KEY } from './guide-browser-check.mts';
import { setupDom, type DomHarness } from '../../test-dom.mts';

let dom: DomHarness;

beforeEach(() => {
  dom = setupDom();
});

afterEach(() => {
  dom.cleanup();
});

test('consumeNavTarget focuses account tile when marker exists', () => {
  const focused: string[] = [];
  window.localStorage.setItem(XHS_NAV_TARGET_KEY, 'account');
  consumeNavTarget((id) => focused.push(id));
  assert.deepEqual(focused, ['account']);
  assert.equal(window.localStorage.getItem(XHS_NAV_TARGET_KEY), null);
});

test('runGuideBrowserCheck marks browser ready on success', async () => {
  (window as any).api = {
    pathJoin: (...parts: string[]) => parts.join('/'),
    cmdRunJson: async () => ({ ok: true, stdout: 'ok' }),
  };
  const guideState = { browserReady: false };
  const browserStatus = dom.document.createElement('span');
  const saved: any[] = [];

  await runGuideBrowserCheck(
    { appendLog: (_line: string) => {} },
    guideState,
    browserStatus,
    (state) => saved.push({ ...state }),
  );

  assert.equal(guideState.browserReady, true);
  assert.match(browserStatus.textContent || '', /通过/);
  assert.equal(saved.length, 1);
});

test('runGuideBrowserCheck handles camoufox-missing and generic failure', async () => {
  const logs: string[] = [];
  const api = { appendLog: (line: string) => logs.push(line) };
  const browserStatus = dom.document.createElement('span');
  const guideState = { browserReady: true };
  const saves: any[] = [];

  (window as any).api = {
    pathJoin: (...parts: string[]) => parts.join('/'),
    cmdRunJson: async () => ({ ok: false, stdout: 'Camoufox 未安装' }),
  };
  await runGuideBrowserCheck(api, guideState, browserStatus, (state) => saves.push({ ...state }));
  assert.equal(guideState.browserReady, false);
  assert.match(browserStatus.textContent || '', /未安装 Camoufox/);
  assert.ok(logs.some((line) => line.includes('install check')));

  (window as any).api = {
    pathJoin: (...parts: string[]) => parts.join('/'),
    cmdRunJson: async () => ({ ok: false, stderr: 'boom' }),
  };
  await runGuideBrowserCheck(api, guideState, browserStatus, (state) => saves.push({ ...state }));
  assert.match(browserStatus.textContent || '', /检查失败/);
  assert.equal(saves.length >= 2, true);
});

test('runGuideBrowserCheck handles unavailable cmdRunJson', async () => {
  (window as any).api = {
    pathJoin: (...parts: string[]) => parts.join('/'),
  };
  const guideState = { browserReady: true };
  const browserStatus = dom.document.createElement('span');
  await runGuideBrowserCheck({}, guideState, browserStatus, () => {});
  assert.equal(guideState.browserReady, false);
  assert.match(browserStatus.textContent || '', /能力不可用/);
});
