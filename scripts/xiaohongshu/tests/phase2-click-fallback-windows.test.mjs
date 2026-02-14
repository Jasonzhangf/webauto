import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const phase2CollectPath = path.resolve(
  process.cwd(),
  'modules',
  'xiaohongshu',
  'app',
  'src',
  'blocks',
  'Phase2CollectLinksBlock.ts',
);

test('phase2 collect keeps protocol-first click and windows-specific focus fallback', async () => {
  const src = await readFile(phase2CollectPath, 'utf8');
  assert.match(src, /const softHitTestPass = !preClickVerify\?\.ok && preClickReason === 'hit_test_fail';/);
  assert.match(src, /Rigid gate soft-pass index=\$\{domIndex\}/);
  assert.match(src, /waitForSafeExploreUrl/);
  assert.match(src, /type ClickPoint = \{ x: number; y: number; name\?: string \}/);
  assert.match(src, /performCoordinateClick/);
  assert.match(src, /performContainerClick/);
  assert.match(src, /attemptedStrategies\.push\('container_protocol'\);/);
  assert.match(src, /const shouldEnsureFocusBeforeMouseFallback = process\.platform === 'win32';/);
  assert.match(src, /if \(shouldEnsureFocusBeforeMouseFallback\) \{\s*await ensureBrowserFocus\('mouse_center'\);/s);
  assert.match(src, /Focus ensure skipped: platform=\$\{process\.platform\} strategy=mouse_center/);
  assert.match(src, /clickPoints\.slice\(0, 3\)/);
  assert.match(src, /const strategy = `point:\$\{String\(point\?\.name \|\| 'unknown'\)\}`;/);
  assert.doesNotMatch(src, /container_system/);
  assert.doesNotMatch(src, /target: 'a\[href\*="\/explore\/"\]'/);
  assert.match(src, /type: 'click_strategy_miss'/);
  assert.match(src, /Click strategy failed: strategy=\$\{strategy\} reason=\$\{errText\}/);
  assert.match(src, /Click strategy no-open: strategy=container_protocol/);
  assert.match(src, /recoverFromPreClickStall\('click_no_xsec_retry'/);
});
