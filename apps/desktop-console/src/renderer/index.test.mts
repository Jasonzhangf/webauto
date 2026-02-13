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

test('main tabs keep xiaohongshu home and logs before settings', async () => {
  const src = await getSrc();
  assert.match(src, /type TabId = 'xiaohongshu' \| 'preflight' \| 'logs' \| 'settings';/);
  assert.match(src, /\{ id: 'xiaohongshu', label: '[^']+', render: renderXiaohongshuTab \}/);
  assert.match(src, /\{ id: 'preflight', label: '[^']+', render: renderPreflight \}/);
  assert.match(src, /\{ id: 'logs', label: '[^']+', render: renderLogs \}/);
  assert.match(src, /\{ id: 'settings', label: '[^']+', render: renderSettings \}/);
  assert.doesNotMatch(src, /id: 'debug'/);
  assert.doesNotMatch(src, /'runtime'/);

  const logsIdx = src.indexOf("{ id: 'logs'");
  const settingsIdx = src.indexOf("{ id: 'settings'");
  assert.ok(logsIdx > -1 && settingsIdx > logsIdx, 'logs tab should render before settings tab');
  assert.match(src, /setActiveTab\('xiaohongshu'\);/);
});

test('renderer context exposes setActiveTab for cross-tab onboarding navigation', async () => {
  const src = await getSrc();
  assert.match(src, /setActiveTab\(id: TabId\) \{/);
  assert.match(src, /setActiveTab\(id\);/);
});
