import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tabPath = path.join(__dirname, 'preflight.mts');

async function getSrc() {
  return readFile(tabPath, 'utf8');
}

test('preflight includes onboarding and profilepool in same tab', async () => {
  const src = await getSrc();
  assert.match(src, /section\('首次引导（账号视角）'/);
  assert.match(src, /section\('预处理池（ProfilePool）'/);
  assert.match(src, /去小红书首页/);
  assert.match(src, /ctx\.setActiveTab\('xiaohongshu'\)/);
  assert.match(src, /账号名（alias，可选）/);
  assert.match(src, /toolbar\.children\[5\]/);
  assert.match(src, /toolbar\.children\[6\]/);
});
