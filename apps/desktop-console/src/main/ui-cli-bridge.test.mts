import assert from 'node:assert/strict';
import test from 'node:test';

import { UiCliBridge } from './ui-cli-bridge.mts';

function createBridge(executeJavaScript: (script: string) => Promise<any>, ready = true) {
  const webContents = {
    isDestroyed: () => !ready,
    isCrashed: () => false,
    executeJavaScript,
  };
  const win = ready
    ? ({
      isDestroyed: () => false,
      webContents,
    } as any)
    : null;
  return new UiCliBridge({
    getWindow: () => win,
  });
}

test('ui-cli-bridge returns structured errors for missing action and missing selector', async () => {
  const bridge = createBridge(async () => ({ ok: true }));
  const missingAction = await (bridge as any).handleAction({});
  assert.equal(missingAction.ok, false);
  assert.equal(missingAction.error, 'missing_action');
  assert.equal(missingAction.action, null);

  const missingSelector = await (bridge as any).handleAction({ action: 'wait', state: 'visible' });
  assert.equal(missingSelector.ok, false);
  assert.equal(missingSelector.error, 'missing_selector');
  assert.equal(missingSelector.action, 'wait');
  assert.equal(missingSelector.selector, null);
});

test('ui-cli-bridge wait supports new states', async () => {
  const bridge = createBridge(async (script) => {
    if (script.includes('document.querySelector')) {
      return { exists: true, visible: true, text: 'hello world', value: 'hello', disabled: false };
    }
    return { ok: true };
  });
  const textContains = await (bridge as any).handleAction({
    action: 'wait',
    selector: '#target',
    state: 'text_contains',
    value: 'world',
    timeoutMs: 50,
    intervalMs: 1,
  });
  assert.equal(textContains.ok, true);
  assert.equal(textContains.expected, 'text_contains');

  const valueEquals = await (bridge as any).handleAction({
    action: 'wait',
    selector: '#target',
    state: 'value_equals',
    value: 'hello',
    timeoutMs: 50,
    intervalMs: 1,
  });
  assert.equal(valueEquals.ok, true);
  assert.equal(valueEquals.expected, 'value_equals');

  const notDisabled = await (bridge as any).handleAction({
    action: 'wait',
    selector: '#target',
    state: 'not_disabled',
    timeoutMs: 50,
    intervalMs: 1,
  });
  assert.equal(notDisabled.ok, true);
  assert.equal(notDisabled.expected, 'not_disabled');
});

test('ui-cli-bridge returns structured unsupported_state error', async () => {
  const bridge = createBridge(async () => ({ exists: true, visible: true, text: 'ok', value: 'ok', disabled: false }));
  const out = await (bridge as any).handleAction({
    action: 'wait',
    selector: '#target',
    state: 'unknown_state',
    timeoutMs: 10,
    intervalMs: 1,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'unsupported_state');
  assert.equal(out.action, 'wait');
  assert.equal(out.selector, '#target');
  assert.equal(out.state, 'unknown_state');
});

test('ui-cli-bridge probe forwards detailed flag into action script payload', async () => {
  let captured = '';
  const bridge = createBridge(async (script) => {
    captured = script;
    return { ok: true };
  });
  const out = await (bridge as any).handleAction({
    action: 'probe',
    selector: '#target',
    detailed: true,
  });
  assert.equal(out.ok, true);
  assert.match(captured, /"detailed":true/);
});

test('ui-cli-bridge action execution failure returns structured error with details', async () => {
  const bridge = createBridge(async () => {
    throw new Error('execute_failed');
  });
  const out = await (bridge as any).handleAction({
    action: 'click',
    selector: '#start-btn',
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'execute_failed');
  assert.equal(out.action, 'click');
  assert.equal(out.selector, '#start-btn');
  assert.equal(typeof out.details, 'string');
});
