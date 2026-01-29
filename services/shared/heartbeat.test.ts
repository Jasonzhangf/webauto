import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startHeartbeatWriter } from './heartbeat.js';

function readHeartbeat(filePath: string) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

test('heartbeat writer updates status and persists payload', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-heartbeat-'));
  const filePath = path.join(root, 'heartbeat.json');
  const previous = {
    file: process.env.WEBAUTO_HEARTBEAT_FILE,
    interval: process.env.WEBAUTO_HEARTBEAT_INTERVAL_MS,
    stale: process.env.WEBAUTO_HEARTBEAT_STALE_MS,
  };

  t.after(() => {
    process.env.WEBAUTO_HEARTBEAT_FILE = previous.file;
    process.env.WEBAUTO_HEARTBEAT_INTERVAL_MS = previous.interval;
    process.env.WEBAUTO_HEARTBEAT_STALE_MS = previous.stale;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const writer = startHeartbeatWriter({ filePath, intervalMs: 50, initialStatus: 'idle' });
  const first = readHeartbeat(filePath);
  assert.equal(first.status, 'idle');
  assert.equal(first.pid, process.pid);
  assert.ok(typeof first.ts === 'string');

  writer.setStatus('running');
  const second = readHeartbeat(filePath);
  assert.equal(second.status, 'running');

  writer.stop();
  const third = readHeartbeat(filePath);
  assert.equal(third.status, 'stopped');
});
