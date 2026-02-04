import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

function hasNoWriteInit(src) {
  return src.includes('initRunLogging') && src.includes('noWrite') && src.includes('dryRun');
}

test('phase2/3/4 use no-write logger when dry-run', async () => {
  const phase2 = await fs.readFile('scripts/xiaohongshu/phase2-collect.mjs', 'utf8');
  const phase3 = await fs.readFile('scripts/xiaohongshu/phase3-interact.mjs', 'utf8');
  const phase4 = await fs.readFile('scripts/xiaohongshu/phase4-harvest.mjs', 'utf8');

  assert.ok(hasNoWriteInit(phase2), 'phase2-collect should call initRunLogging with noWrite');
  assert.ok(hasNoWriteInit(phase3), 'phase3-interact should call initRunLogging with noWrite');
  assert.ok(hasNoWriteInit(phase4), 'phase4-harvest should call initRunLogging with noWrite');
});

test('phase3/4 gate state writes behind dryRun', async () => {
  const phase3 = await fs.readFile('scripts/xiaohongshu/phase3-interact.mjs', 'utf8');
  const phase4 = await fs.readFile('scripts/xiaohongshu/phase4-harvest.mjs', 'utf8');

  assert.ok(phase3.includes('if (!dryRun) {') && phase3.includes('updateXhsCollectState'), 'phase3 should gate state writes');
  assert.ok(phase4.includes('if (!dryRun) {') && phase4.includes('markXhsCollectCompleted'), 'phase4 should gate completion write');
});

test('collect-content forwards dry-run to phase2 and phase4', async () => {
  const src = await fs.readFile('scripts/xiaohongshu/collect-content.mjs', 'utf8');
  assert.ok(src.includes("phase2Args.push('--dry-run')"), 'collect-content should forward dry-run to phase2');
  assert.ok(src.includes("phase4Args.push('--dry-run')"), 'collect-content should forward dry-run to phase4');
});
