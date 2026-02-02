import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = new URL('.', import.meta.url).pathname;
const runPath = path.join(__dirname, 'run.mts');

test('phase1 supports multi-profile modes in resolveProfileArgsForRun', async () => {
  const src = await readFile(runPath, 'utf8');
  // Ensure Phase1 is included in supportsMultiProfile predicate.
  assert.match(
    src,
    /supportsMultiProfile\s*=\s*t\s*===\s*'fullCollect'\s*\|\|\s*t\s*===\s*'phase1'/,
  );
});

test('fullCollect supports multi-profile modes', async () => {
  const src = await readFile(runPath, 'utf8');
  assert.match(
    src,
    /supportsMultiProfile\s*=\s*t\s*===\s*'fullCollect'\s*\|\|\s*t\s*===\s*'phase1'/,
  );
});

test('fullCollect uses scripts scan result as script path when available', async () => {
  const src = await readFile(runPath, 'utf8');
  assert.match(src, /scriptsXhsFullCollect/);
  assert.match(src, /const scriptPath = chosen\?\.path \|\| window\.api\.pathJoin\('scripts', 'xiaohongshu', 'collect-content\.mjs'\);/);
});

test('run template includes target argument', async () => {
  const src = await readFile(runPath, 'utf8');
  assert.match(src, /\['--target', target\]/);
  assert.match(src, /labeledInput\('target', targetInput\)/);
});

test('fullCollect and phase2 validate keyword/target before spawn', async () => {
  const src = await readFile(runPath, 'utf8');
  assert.match(src, /if \(t === 'fullCollect'\) \{/);
  assert.match(src, /fullCollect: 必须填写 keyword/);
  assert.match(src, /alert\('Full Collect: 必须填写 keyword'\)/);
  assert.match(src, /fullCollect: 必须填写 target（正整数）/);
  assert.match(src, /alert\('Full Collect: 必须填写 target（正整数）'\)/);
  assert.match(src, /if \(t === 'phase2'\) \{/);
  assert.match(src, /phase2: 必须填写 keyword/);
  assert.match(src, /alert\('Phase2: 必须填写 keyword'\)/);
  assert.match(src, /phase2: 必须填写 target（正整数）/);
  assert.match(src, /alert\('Phase2: 必须填写 target（正整数）'\)/);
});

test('non-phase1 single selection uses runtime picker', async () => {
  const src = await readFile(runPath, 'utf8');
  assert.match(src, /const useRuntimeForSingle = templateSel\.value !== 'phase1' && templateSel\.value !== 'fullCollect';/);
  assert.match(src, /runtimePickSel\.style\.display = mode === 'profile' && useRuntimeForSingle \? '' : 'none';/);
  assert.match(src, /profilePickSel\.style\.display = mode === 'profile' && !useRuntimeForSingle \? '' : 'none';/);
});

test('profilepool mode shows profilesBox and auto-selects pool members', async () => {
  const src = await readFile(runPath, 'utf8');
  assert.match(src, /profilesBox\.style\.display = \(mode === 'profiles' \|\| mode === 'profilepool'\) \? '' : 'none';/);
  assert.match(src, /mode === 'profilepool'[\s\S]*pid\.startsWith\(v\)/);
});
