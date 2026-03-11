import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(__dirname, 'index', 'runtime.mts');
const appMainPath = path.join(__dirname, 'index.mts');
const envIpcPath = path.join(__dirname, 'index', 'ipc', 'env.mts');

test('spawnCommand uses buffered line emitter and flushes on close', async () => {
  const src = await readFile(mainPath, 'utf8');
  assert.match(src, /export function createLineEmitter\(runId: string, type: 'stdout' \| 'stderr', onLine\?: \(line: string\) => void/);
  assert.match(src, /let pending = '';/);
  assert.match(src, /pending \+= chunk\.toString\('utf8'\);/);
  assert.match(src, /const stdoutLines = createLineEmitter\(runId, 'stdout',/);
  assert.match(src, /const stderrLines = createLineEmitter\(runId, 'stderr',/);
  assert.match(src, /stdoutLines\.push\(chunk\);/);
  assert.match(src, /stderrLines\.push\(chunk\);/);
  assert.match(src, /stdoutLines\.flush\(\);\s*stderrLines\.flush\(\);\s*finalize\(/s);
});

test('main process wires deterministic cleanup for app quit and env cleanup api', async () => {
  const src = await readFile(appMainPath, 'utf8');
  const envSrc = await readFile(envIpcPath, 'utf8');
  assert.match(src, /function ensureAppExitCleanup\(reason: string/);
  assert.match(src, /function shouldStopCoreServicesOnAppExit\(reason: string, options: CleanupOptions = \{\}\)/);
  assert.match(src, /if \(normalizedReason === 'window_closed'\) return false;/);
  assert.match(src, /function shouldStopCamoSessionsOnCleanup\(reason: string\)/);
  assert.match(src, /function waitForAppExitCleanup\(reason: string, options: CleanupOptions = \{\}\)/);
  assert.match(src, /app\.on\('before-quit', \(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?waitForAppExitCleanup\(reason, \{ stopStateBridge: true \}\)/);
  assert.match(src, /app_exit_cleanup_start/);
  assert.match(src, /stopCoreServices: shouldStopCoreServicesOnAppExit\(reason, options\),/);
  assert.match(src, /stopSessions: shouldStopCamoSessionsOnCleanup\(reason\),/);
  const willQuitBlock = src.match(/app\.on\('will-quit', \(\) => \{([\s\S]*?)\}\);/);
  assert.ok(willQuitBlock, 'will-quit hook should exist');
  assert.doesNotMatch(willQuitBlock[1], /ensureAppExitCleanup/);
  assert.match(src, /async function resetRuntimeForStartup\(\)/);
  assert.match(src, /startup_runtime_reset_start/);
  assert.match(src, /await resetRuntimeForStartup\(\)/);
  assert.match(src, /startup_self_check/);
  assert.match(src, /remainingRuns/);
  assert.match(src, /remainingRunPids/);
  assert.match(envSrc, /ipcMain\.handle\('env:cleanup'/);
  assert.match(src, /cleanupCamoSessionsBestEffort/);
});
