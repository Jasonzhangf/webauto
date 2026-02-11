import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_DAEMON_URL,
  UNIFIED_API_URL,
  BROWSER_SERVICE_URL,
  SEARCH_GATE_URL,
  getCoreDaemonConfig,
} from '../lib/core-daemon.mjs';

test('core-daemon url mapping separates daemon and unified endpoints', () => {
  const cfg = getCoreDaemonConfig();
  assert.equal(CORE_DAEMON_URL, 'http://127.0.0.1:7700');
  assert.equal(UNIFIED_API_URL, 'http://127.0.0.1:7701');
  assert.equal(BROWSER_SERVICE_URL, 'http://127.0.0.1:7704');
  assert.equal(SEARCH_GATE_URL, 'http://127.0.0.1:7790');
  assert.equal(cfg.coreDaemon.url, CORE_DAEMON_URL);
  assert.equal(cfg.unifiedApi.url, UNIFIED_API_URL);
});

