import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const coreDaemonPath = path.resolve(__dirname, '..', '..', 'core-daemon.mjs');
const portUtilsPath = path.resolve(__dirname, '..', '..', 'lib', 'port-utils.mjs');

test('core-daemon resolves node binary without relying on PATH only', async () => {
  const src = await readFile(coreDaemonPath, 'utf8');
  assert.match(src, /function resolveNodeBin\(\)/);
  assert.match(src, /process\.env\.WEBAUTO_NODE_BIN/);
  assert.match(src, /process\.env\.npm_node_execpath/);
  assert.match(src, /spawn\(resolveNodeBin\(\), \[scriptPath\]/);
});

test('core-daemon and port-utils use taskkill tree mode on windows', async () => {
  const coreSrc = await readFile(coreDaemonPath, 'utf8');
  const portSrc = await readFile(portUtilsPath, 'utf8');
  assert.match(coreSrc, /spawn\('taskkill', args, \{ stdio: 'ignore', windowsHide: true \}\)/);
  assert.match(coreSrc, /\/PID/);
  assert.match(coreSrc, /\/T/);
  assert.match(portSrc, /execSync\(`taskkill \$\{args\.join\(' '\)\}`/);
  assert.match(portSrc, /args\.push\('\/F'\)/);
});
