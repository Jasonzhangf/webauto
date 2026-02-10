import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = new URL('.', import.meta.url).pathname;
const runPath = path.join(__dirname, 'run.mts');

async function getSrc() {
  return readFile(runPath, 'utf8');
}

test('phase3/phase4/fullCollect support multi-profile modes in resolveProfileArgsForRun', async () => {
  const src = await getSrc();
  assert.match(
    src,
    /supportsMultiProfile\s*=\s*t\s*===\s*'fullCollect'\s*\|\|\s*t\s*===\s*'phase3'\s*\|\|\s*t\s*===\s*'phase4'/,
  );
});

test('fullCollect uses scripts scan result as script path when available', async () => {
  const src = await getSrc();
  assert.match(src, /scriptsXhsFullCollect/);
  assert.match(src, /const scriptPath = chosen\?\.path \|\| window\.api\.pathJoin\('scripts', 'xiaohongshu', 'collect-content\.mjs'\);/);
});

test('run tab persists default keyword/target/env/dry-run on execute', async () => {
  const src = await getSrc();
  assert.match(src, /persistRunInputs\(\{ keyword, target:.*env, dryRun: dryRun\.checked \}\)/);
});

test('run template includes target argument and fullCollect validation', async () => {
  const src = await getSrc();
  assert.match(src, /\['--target', target\]/);
  assert.match(src, /labeledInput\('target', targetInput\)/);
  assert.match(src, /if \(t === 'fullCollect'\) \{/);
  assert.match(src, /fullCollect: 必须填写 keyword/);
  assert.match(src, /alert\('Full Collect: 必须填写 keyword'\)/);
  assert.match(src, /fullCollect: 必须填写 target（正整数）/);
  assert.match(src, /alert\('Full Collect: 必须填写 target（正整数）'\)/);
});

test('non-fullCollect single selection uses runtime picker', async () => {
  const src = await getSrc();
  assert.match(src, /const useRuntimeForSingle = templateSel\.value !== 'fullCollect';/);
  assert.match(src, /profilePickSel\.style\.display = mode === 'profile' && !useRuntimeForSingle \? '' : 'none';/);
  assert.match(src, /runtimePickSel\.style\.display = mode === 'profile' && useRuntimeForSingle \? '' : 'none';/);
});

test('profilepool mode shows profilesBox and auto-selects pool members', async () => {
  const src = await getSrc();
  assert.match(src, /profilesBox\.style\.display = \(mode === 'profiles' \|\| mode === 'profilepool'\) \? '' : 'none';/);
  assert.match(src, /mode === 'profilepool'[\s\S]*pid\.startsWith\(v\)/);
});

test('run tab is debug-only and points orchestration to xiaohongshu tab', async () => {
  const src = await getSrc();
  assert.match(src, /完整编排（Phase1\/2\/Unified \+ 分片）已迁移到“小红书”Tab；这里仅保留调试入口/);
  assert.doesNotMatch(src, /orchestratePhase12Unified/);
  assert.doesNotMatch(src, /phase-orchestrate\.mjs/);
  assert.doesNotMatch(src, /Phase2 collect links/);
});
