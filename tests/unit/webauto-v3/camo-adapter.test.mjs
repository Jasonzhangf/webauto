import test from 'node:test';
import assert from 'node:assert/strict';

import { CamoAdapter } from '../../../modules/webauto-v3/src/camo-adapter.mjs';

function recordingRunner() {
  const calls = [];
  return {
    calls,
    runner: async (args) => {
      calls.push(args);
      if (args[0] === 'start') {
        return { ok: true, stdout: '', stderr: '', json: { target: 't_1', sessionId: 's_1' } };
      }
      if (args[0] === 'get-page-info') {
        return { ok: true, stdout: '', stderr: '', json: { url: 'https://m.weibo.cn/detail/1' } };
      }
      if (args[0] === 'evaluate') {
        return { ok: true, stdout: '', stderr: '', json: { result: { ok: true } } };
      }
      return { ok: true, stdout: '', stderr: '', json: {} };
    },
  };
}

test('camo adapter uses the installed 0.4.6 CLI arguments', async () => {
  const recorder = recordingRunner();
  const adapter = new CamoAdapter({ runner: recorder.runner, cwd: '/tmp' });
  await adapter.start({ profileId: 'default', width: 390, height: 844 });
  await adapter.setViewport({ profileId: 'default', width: 390, height: 844 });
  await adapter.type({ profileId: 'default', text: 'AI', selector: 'input.woo-input-main' });
  await adapter.click({ profileId: 'default', selector: 'button.s-btn-b' });
  await adapter.scroll({ profileId: 'default', dx: 0, dy: 700, atX: 100, atY: 200 });

  assert.deepEqual(recorder.calls[0], [
    'start', '--profile', 'default', '--width', '390', '--height', '844',
  ]);
  assert.deepEqual(recorder.calls[1], [
    'set-viewport', '--width', '390', '--height', '844', '--profile', 'default',
    '--target', 't_1',
  ]);
  assert.deepEqual(recorder.calls[2], [
    'type', 'AI', '--profile', 'default', '--target', 't_1', '--selector', 'input.woo-input-main',
  ]);
  assert.deepEqual(recorder.calls[3], [
    'click', '--selector', 'button.s-btn-b', '--profile', 'default', '--target', 't_1',
  ]);
  assert.deepEqual(recorder.calls[4], [
    'scroll', '--x', '0', '--y', '700', '--profile', 'default', '--target', 't_1',
    '--at-x', '100', '--at-y', '200',
  ]);
});

test('every target-scoped command carries its owning profile', async () => {
  // A target id is only resolvable inside its owning profile: camo rejects a
  // target addressed without the profile that owns it, so every target-scoped
  // command must carry both flags.
  const calls = [];
  const runner = async (args) => {
    calls.push(args);
    if (args[0] === 'start') return { ok: true, stdout: '', stderr: '', json: { target: 't_1' } };
    return { ok: true, stdout: '', stderr: '', json: { result: { ok: true } } };
  };
  const adapter = new CamoAdapter({ runner, cwd: '/tmp' });
  await adapter.start({ profileId: 'weibo-2' });
  await adapter.goto({ profileId: 'weibo-2', url: 'https://example.com' });
  await adapter.evaluate({ profileId: 'weibo-2', script: '1' });
  await adapter.click({ profileId: 'weibo-2', selector: 'a' });
  await adapter.scroll({ profileId: 'weibo-2', dy: 100 });

  for (const call of calls.slice(1)) {
    const targetAt = call.indexOf('--target');
    assert.ok(targetAt >= 0, `expected a target-scoped call: ${call.join(' ')}`);
    const profileAt = call.indexOf('--profile');
    assert.ok(profileAt >= 0, `target-scoped call is missing --profile: ${call.join(' ')}`);
    assert.equal(call[profileAt + 1], 'weibo-2');
  }
});

test('fillInput sets the value in page context instead of typing key events', async () => {
  const calls = [];
  const runner = async (args) => {
    calls.push(args);
    if (args[0] === 'start') {
      return { ok: true, stdout: '', stderr: '', json: { target: 't_1' } };
    }
    if (args[0] === 'evaluate') {
      return { ok: true, stdout: '', stderr: '', json: { result: { ok: true, value: 'AI眼镜', length: 4 } } };
    }
    return { ok: true, stdout: '', stderr: '', json: {} };
  };
  const adapter = new CamoAdapter({ runner, cwd: '/tmp' });
  await adapter.start({ profileId: 'default' });
  const result = await adapter.fillInput({
    profileId: 'default',
    selector: '#search-input',
    value: 'AI眼镜',
  });

  const evaluateCall = calls.find((args) => args[0] === 'evaluate');
  assert.ok(evaluateCall, 'fillInput must go through evaluate, not type');
  const script = evaluateCall[evaluateCall.indexOf('--script') + 1];
  assert.match(script, /nativeInputValueSetter|HTMLInputElement\.prototype|getOwnPropertyDescriptor/);
  assert.match(script, /dispatchEvent\(new Event\('input'/);
  assert.match(script, /dispatchEvent\(new Event\('change'/);
  assert.equal(result.ok, true);
});

test('pressKey dispatches a real protocol key for shortcuts', async () => {
  const calls = [];
  const runner = async (args) => {
    calls.push(args);
    if (args[0] === 'start') return { ok: true, stdout: '', stderr: '', json: { target: 't_1' } };
    return { ok: true, stdout: '', stderr: '', json: {} };
  };
  const adapter = new CamoAdapter({ runner, cwd: '/tmp' });
  await adapter.start({ profileId: 'default' });
  await adapter.pressKey({ profileId: 'default', key: 'Enter' });

  assert.deepEqual(calls[1], ['keyboard', 'press', 'Enter', '--profile', 'default', '--target', 't_1']);
});

test('fillInput fails loudly when the input is absent', async () => {
  const runner = async (args) => {
    if (args[0] === 'start') return { ok: true, stdout: '', stderr: '', json: { target: 't_1' } };
    return {
      ok: true,
      stdout: '',
      stderr: '',
      json: { result: { ok: false, errorCode: 'E_INPUT_NOT_FOUND' } },
    };
  };
  const adapter = new CamoAdapter({ runner, cwd: '/tmp' });
  await adapter.start({ profileId: 'default' });

  await assert.rejects(
    () => adapter.fillInput({ profileId: 'default', selector: '#missing', value: 'x' }),
    /E_INPUT_NOT_FOUND/,
  );
});
