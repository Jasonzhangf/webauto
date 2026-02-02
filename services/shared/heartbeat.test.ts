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

test('heartbeat watcher exits when stale', async (t) => {
  // NOTE: startHeartbeatWatcher calls process.exit(0) when stale/missing.
  // We temporarily replace process.exit to assert behavior without terminating the test runner.
  const { startHeartbeatWatcher } = await import('./heartbeat.js');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-heartbeat-'));
  const filePath = path.join(root, 'heartbeat.json');
  fs.writeFileSync(filePath, JSON.stringify({ ts: new Date(0).toISOString(), status: 'running' }), 'utf-8');

  const originalExit = process.exit;
  let exitCode: number | null = null;
  let exitCalled: ((code?: number) => void) | null = null;
  const exitPromise = new Promise<void>((resolve) => {
    exitCalled = (code?: number) => {
      exitCode = typeof code === 'number' ? code : 0;
      resolve();
    };
  });
  process.exit = ((code?: number) => exitCalled?.(code)) as any;

  t.after(() => {
    process.exit = originalExit;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const stop = startHeartbeatWatcher({ serviceName: 'svc', filePath, staleMs: 1, intervalMs: 1 });
  await exitPromise;
  stop();
  assert.equal(exitCode, 0);
});

test('heartbeat watcher exits when status=stopped', async (t) => {
  const { startHeartbeatWatcher } = await import('./heartbeat.js');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-heartbeat-'));
  const filePath = path.join(root, 'heartbeat.json');
  fs.writeFileSync(filePath, JSON.stringify({ ts: new Date().toISOString(), status: 'stopped' }), 'utf-8');

  const originalExit = process.exit;
  let exitCode: number | null = null;
  let exitCalled: ((code?: number) => void) | null = null;
  const exitPromise = new Promise<void>((resolve) => {
    exitCalled = (code?: number) => {
      exitCode = typeof code === 'number' ? code : 0;
      resolve();
    };
  });
  process.exit = ((code?: number) => exitCalled?.(code)) as any;

  t.after(() => {
    process.exit = originalExit;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const stop = startHeartbeatWatcher({ serviceName: 'svc', filePath, staleMs: 10_000, intervalMs: 1 });
  await exitPromise;
  stop();
  assert.equal(exitCode, 0);
});
