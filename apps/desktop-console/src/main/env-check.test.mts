import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { checkCamoCli, checkEnvironment, checkFirefox, checkGeoIP, checkServices } from './env-check.mts';

let tempRoot = '';
let prevHome = '';
let prevUserProfile = '';
let prevPath = '';
let prevWebautoRoot = '';
let originalFetch: any;

function ensureExecutable(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-env-check-'));
  prevHome = process.env.HOME || '';
  prevUserProfile = process.env.USERPROFILE || '';
  prevPath = process.env.PATH || '';
  prevWebautoRoot = process.env.WEBAUTO_ROOT || '';
  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;
  originalFetch = (globalThis as any).fetch;
});

afterEach(() => {
  process.env.HOME = prevHome;
  process.env.USERPROFILE = prevUserProfile;
  process.env.PATH = prevPath;
  process.env.WEBAUTO_ROOT = prevWebautoRoot;
  (globalThis as any).fetch = originalFetch;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('checkGeoIP detects missing/present database', async () => {
  const first = await checkGeoIP();
  assert.equal(first.installed, false);

  const geoPath = path.join(tempRoot, '.webauto', 'geoip', 'GeoLite2-City.mmdb');
  await fsp.mkdir(path.dirname(geoPath), { recursive: true });
  await fsp.writeFile(geoPath, 'x', 'utf8');

  const second = await checkGeoIP();
  assert.equal(second.installed, true);
  assert.equal(second.path, geoPath);
});

test('checkGeoIP honors WEBAUTO_ROOT override', async () => {
  const portableRoot = path.join(tempRoot, 'portable-data');
  process.env.WEBAUTO_ROOT = portableRoot;
  const geoPath = path.join(portableRoot, '.webauto', 'geoip', 'GeoLite2-City.mmdb');
  await fsp.mkdir(path.dirname(geoPath), { recursive: true });
  await fsp.writeFile(geoPath, 'x', 'utf8');

  const result = await checkGeoIP();
  assert.equal(result.installed, true);
  assert.equal(result.path, geoPath);
});

test('checkServices maps endpoint health booleans', async () => {
  (globalThis as any).fetch = async (url: string) => {
    if (String(url).includes(':7701')) return { ok: true };
    if (String(url).includes(':7704')) return { ok: false };
    throw new Error('unreachable');
  };
  const result = await checkServices();
  assert.equal(result.unifiedApi, true);
  assert.equal(result.camoRuntime, false);
  assert.equal(result.searchGate, false);
});

test('checkCamoCli and checkEnvironment return structured payloads', async () => {
  process.env.PATH = '/__missing_path_for_camo_test__';
  (globalThis as any).fetch = async () => ({ ok: false });

  const camo = await checkCamoCli();
  assert.equal(typeof camo.installed, 'boolean');
  if (!camo.installed) {
    assert.equal(typeof camo.error, 'string');
  }

  const env = await checkEnvironment();
  assert.equal(typeof env.allReady, 'boolean');
  assert.equal(typeof env.services.unifiedApi, 'boolean');
  assert.equal(typeof env.services.camoRuntime, 'boolean');
  assert.equal(typeof env.firefox.installed, 'boolean');
  assert.equal(typeof env.geoip.installed, 'boolean');
});

test('checkFirefox supports direct camoufox command path probe', async () => {
  const installRoot = path.join(tempRoot, 'camoufox-install');
  fs.mkdirSync(installRoot, { recursive: true });
  const exeName = process.platform === 'win32' ? 'camoufox.exe' : 'camoufox';
  fs.writeFileSync(path.join(installRoot, exeName), 'stub');

  const binDir = path.join(tempRoot, 'bin');
  if (process.platform === 'win32') {
    ensureExecutable(
      path.join(binDir, 'camoufox.cmd'),
      `@echo off\r\necho ${installRoot}\r\n`,
    );
  } else {
    ensureExecutable(
      path.join(binDir, 'camoufox'),
      `#!/bin/sh\necho \"${installRoot}\"\n`,
    );
  }

  process.env.PATH = binDir;
  const result = await checkFirefox();
  assert.equal(result.installed, true);
  assert.equal(result.path, installRoot);
});

test('checkEnvironment aligns ready semantics with runtime service fallback', async () => {
  const binDir = path.join(tempRoot, 'bin');
  if (process.platform === 'win32') {
    ensureExecutable(path.join(binDir, 'camo.cmd'), '@echo off\r\necho camo version 0.1.0\r\n');
  } else {
    ensureExecutable(path.join(binDir, 'camo'), '#!/bin/sh\necho \"camo version 0.1.0\"\n');
  }
  process.env.PATH = binDir;
  (globalThis as any).fetch = async (url: string) => {
    if (String(url).includes(':7701')) return { ok: true };
    if (String(url).includes(':7704')) return { ok: true };
    return { ok: false };
  };

  const env = await checkEnvironment();
  assert.equal(env.camo.installed, true);
  assert.equal(env.services.unifiedApi, true);
  assert.equal(env.services.camoRuntime, true);
  assert.equal(env.allReady, true);
});
