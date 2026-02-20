import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { checkCamoCli, checkEnvironment, checkGeoIP, checkServices } from './env-check.mts';

let tempRoot = '';
let prevHome = '';
let prevUserProfile = '';
let prevPath = '';
let originalFetch: any;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-env-check-'));
  prevHome = process.env.HOME || '';
  prevUserProfile = process.env.USERPROFILE || '';
  prevPath = process.env.PATH || '';
  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;
  originalFetch = (globalThis as any).fetch;
});

afterEach(() => {
  process.env.HOME = prevHome;
  process.env.USERPROFILE = prevUserProfile;
  process.env.PATH = prevPath;
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
