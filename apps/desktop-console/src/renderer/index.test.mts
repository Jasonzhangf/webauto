import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, 'index.mts');

async function getSrc() {
  return readFile(indexPath, 'utf8');
}

test('main tabs keep xiaohongshu home and debug consolidation', async () => {
  const src = await getSrc();
  assert.match(src, /type TabId = 'xiaohongshu' \| 'preflight' \| 'debug' \| 'settings' \| 'logs';/);
  assert.match(src, /\{ id: 'xiaohongshu', label: '小红书', render: renderXiaohongshuTab \}/);
  assert.match(src, /\{ id: 'debug', label: '调试', render: renderDebug \}/);
  assert.doesNotMatch(src, /'runtime'/);
  assert.doesNotMatch(src, /'profilepool'/);
  assert.match(src, /setActiveTab\('xiaohongshu'\);/);
  assert.match(src, /renderLogs/);
  assert.match(src, /\{ id: 'logs', label: '日志', render: renderLogs \}/);
});

test('renderer context exposes setActiveTab for cross-tab onboarding navigation', async () => {
  const src = await getSrc();
  assert.match(src, /setActiveTab\(id: TabId\) \{/);
  assert.match(src, /setActiveTab\(id\);/);
});
