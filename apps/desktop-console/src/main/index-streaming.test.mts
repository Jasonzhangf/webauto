import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(__dirname, 'index.mts');

test('spawnCommand uses buffered line emitter and flushes on close', async () => {
  const src = await readFile(mainPath, 'utf8');
  assert.match(src, /function createLineEmitter\(runId: string, type: StreamEventType, onLine\?: \(line: string\) => void\)/);
  assert.match(src, /let pending = '';/);
  assert.match(src, /pending \+= chunk\.toString\('utf8'\);/);
  assert.match(src, /const stdoutLines = createLineEmitter\(runId, 'stdout',/);
  assert.match(src, /const stderrLines = createLineEmitter\(runId, 'stderr',/);
  assert.match(src, /stdoutLines\.push\(chunk\);/);
  assert.match(src, /stderrLines\.push\(chunk\);/);
  assert.match(src, /stdoutLines\.flush\(\);\s*stderrLines\.flush\(\);\s*finalize\(/s);
});

test('main process wires deterministic cleanup for app quit and env cleanup api', async () => {
  const src = await readFile(mainPath, 'utf8');
  assert.match(src, /function ensureAppExitCleanup\(reason: string/);
  assert.match(src, /app\.on\('before-quit', \(\) => \{\s*void ensureAppExitCleanup\('before_quit'\);/s);
  assert.match(src, /app\.on\('will-quit', \(\) => \{\s*void ensureAppExitCleanup\('will_quit'/s);
  assert.match(src, /ipcMain\.handle\('env:cleanup'/);
  assert.match(src, /cleanupCamoSessionsBestEffort/);
});
