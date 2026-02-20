import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, test } from 'node:test';

const scriptPath = path.resolve(process.cwd(), 'apps', 'webauto', 'entry', 'xhs-install.mjs');
const tempDirs = [];

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-xhs-install-'));
  tempDirs.push(dir);
  return dir;
}

async function loadInternals() {
  const mod = await import(`${pathToFileURL(scriptPath).href}?t=${Date.now()}-${Math.random()}`);
  return mod.__internals;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveNpxBin returns explicit npx path on win32 when present in PATH', async () => {
  const internals = await loadInternals();
  const binDir = makeDir();
  const npxPath = path.join(binDir, 'npx.cmd');
  fs.writeFileSync(npxPath, '@echo off\r\necho ok\r\n', 'utf8');

  const resolved = internals.resolveNpxBin('win32', `${binDir};C:\\Windows\\System32`);
  assert.equal(path.normalize(resolved), path.normalize(npxPath));
});

test('resolveNpxBin falls back to npx.cmd on win32 when PATH has no npx', async () => {
  const internals = await loadInternals();
  const resolved = internals.resolveNpxBin('win32', 'C:\\missing-one;C:\\missing-two');
  assert.equal(resolved, 'npx.cmd');
});

test('resolveNpxBin uses npx on non-win32 platform', async () => {
  const internals = await loadInternals();
  const resolved = internals.resolveNpxBin('darwin', '/usr/local/bin:/usr/bin');
  assert.equal(resolved, 'npx');
});
