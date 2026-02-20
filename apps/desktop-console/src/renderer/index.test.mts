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

test('main tabs use onboarding flow and keep logs before settings', async () => {
  const src = await getSrc();
  assert.match(src, /type TabId = 'setup-wizard' \| 'tasks' \| 'dashboard' \| 'scheduler' \| 'account-manager' \| 'preflight' \| 'logs' \| 'settings';/);
  assert.match(src, /\{ id: 'setup-wizard', label: '[^']+', render: renderSetupWizard \}/);
  assert.match(src, /\{ id: 'tasks', label: '[^']+', render: renderTasksPanel \}/);
  assert.match(src, /\{ id: 'dashboard', label: '[^']+', render: renderDashboard \}/);
  assert.match(src, /\{ id: 'scheduler', label: '[^']+', render: renderSchedulerPanel \}/);
  assert.match(src, /\{ id: 'account-manager', label: '[^']+', render: renderAccountManager \}/);
  assert.match(src, /\{ id: 'preflight', label: '[^']+', render: renderPreflight, hidden: true \}/);
  assert.match(src, /\{ id: 'logs', label: '[^']+', render: renderLogs \}/);
  assert.match(src, /\{ id: 'settings', label: '[^']+', render: renderSettings \}/);
  assert.doesNotMatch(src, /id: 'xiaohongshu'/);

  const logsIdx = src.indexOf("{ id: 'logs'");
  const settingsIdx = src.indexOf("{ id: 'settings'");
  assert.ok(logsIdx > -1 && settingsIdx > logsIdx, 'logs tab should render before settings tab');
  assert.match(src, /const startupTab = await detectStartupTab\(\);/);
  assert.match(src, /if \(envReady\) return 'tasks';/);
  assert.match(src, /return 'setup-wizard';/);
});

test('renderer context exposes setActiveTab for cross-tab onboarding navigation', async () => {
  const src = await getSrc();
  assert.match(src, /setActiveTab\(id: TabId\) \{/);
  assert.match(src, /setActiveTab\(id\);/);
});
