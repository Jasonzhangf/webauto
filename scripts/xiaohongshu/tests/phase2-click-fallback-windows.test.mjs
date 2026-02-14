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

test('phase2 collect soft-passes hit-test fail and retries click strategies', async () => {
  const src = await readFile(phase2CollectPath, 'utf8');
  assert.match(src, /const softHitTestPass = !preClickVerify\?\.ok && preClickReason === 'hit_test_fail';/);
  assert.match(src, /Rigid gate soft-pass index=\$\{domIndex\}/);
  assert.match(src, /waitForSafeExploreUrl/);
  assert.match(src, /performOpenDetailClick/);
  assert.match(src, /\['container_system', 'mouse_center', 'container_protocol'\]/);
  assert.match(src, /target: 'a\[href\*="\/explore\/"\]'/);
  assert.match(src, /type: 'click_strategy_miss'/);
  assert.match(src, /Click strategy failed: strategy=\$\{strategy\} reason=\$\{errText\}/);
  assert.match(src, /Click strategy no-open: strategy=\$\{strategy\}/);
  assert.match(src, /recoverFromPreClickStall\('click_no_xsec_retry'/);
});
