import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const phase1Path = path.resolve(__dirname, '..', 'phase1-boot.mjs');
const orchestratePath = path.resolve(__dirname, '..', 'phase-orchestrate.mjs');

test('phase1 boot has headless login timeout fallback to headful', async () => {
  const src = await readFile(phase1Path, 'utf8');
  assert.match(src, /headless-login-timeout-sec/);
  assert.match(src, /headless_login_timeout/);
  assert.match(src, /切换 headful 重试/);
  assert.match(src, /startProfile\(\{ profile, headless: false/);
});

test('phase orchestrate retries failed headless steps in headful mode', async () => {
  const src = await readFile(orchestratePath, 'utf8');
  assert.match(src, /runStepWithHeadlessFallback/);
  assert.match(src, /toHeadfulArgs/);
  assert.match(src, /headless 失败，自动切到 headful/);
  assert.match(src, /phase2-collect\.mjs/);
  assert.match(src, /phase-unified-harvest\.mjs/);
});

test('phase1-only keeps browser session open by not forcing --once', async () => {
  const src = await readFile(orchestratePath, 'utf8');
  assert.match(src, /const phase1Once = mode !== 'phase1-only';/);
  assert.match(src, /await runPhase1ForProfiles\(phase1Profiles, headless, phase1Once\);/);
});
