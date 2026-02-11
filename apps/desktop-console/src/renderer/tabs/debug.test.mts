import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugPath = path.join(__dirname, 'debug.mts');

async function getSrc() {
  return readFile(debugPath, 'utf8');
}

test('debug tab aggregates run/results and keeps lightweight switcher', async () => {
  const src = await getSrc();
  assert.match(src, /import \{ renderRun \} from '\.\/run\.mts';/);
  assert.match(src, /import \{ renderResults \} from '\.\/results\.mts';/);
  assert.match(src, /type DebugViewId = 'run' \| 'results';/);
  assert.match(src, /setView\('run'\)/);
  assert.match(src, /setView\('results'\)/);
  assert.match(src, /“调用”和“结果”已整合到 Debug 页；Runtime 已从主导航移除。/);
});
