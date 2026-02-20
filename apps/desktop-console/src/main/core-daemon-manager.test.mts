import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { startCoreDaemon, stopCoreDaemon } from './core-daemon-manager.mts';

let originalFetch: any;
let prevNodeBin = '';

beforeEach(() => {
  originalFetch = (globalThis as any).fetch;
  prevNodeBin = process.env.WEBAUTO_NODE_BIN || '';
});

afterEach(() => {
  (globalThis as any).fetch = originalFetch;
  process.env.WEBAUTO_NODE_BIN = prevNodeBin;
});

test('startCoreDaemon returns true when health checks are already green', async () => {
  (globalThis as any).fetch = async () => ({ ok: true });
  const ok = await startCoreDaemon();
  assert.equal(ok, true);
});

test('startCoreDaemon returns false when dependencies cannot be spawned', async () => {
  (globalThis as any).fetch = async () => ({ ok: false });
  process.env.WEBAUTO_NODE_BIN = '/__missing_node_binary__';
  const ok = await startCoreDaemon();
  assert.equal(ok, false);
});

test('stopCoreDaemon returns false when stop script cannot run', async () => {
  process.env.WEBAUTO_NODE_BIN = '/__missing_node_binary__';
  const ok = await stopCoreDaemon();
  assert.equal(ok, false);
});
