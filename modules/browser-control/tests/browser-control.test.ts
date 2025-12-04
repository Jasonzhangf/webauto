import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as runCli } from '../src/cli.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixture = path.join(__dirname, '..', '..', 'container-matcher', 'tests', 'fixtures', 'weibo.html');

test('dom-dump cli returns html from fixture', async () => {
  const result = await runCli(['dom-dump', '--fixture', fixture, '--url', 'https://weibo.com/']);
  assert.equal(result.success, true);
  assert.ok(result.data.html.includes('<div id="app"'));
});

test('dom-tree cli builds tree from fixture', async () => {
  const result = await runCli(['dom-tree', '--fixture', fixture, '--url', 'https://weibo.com/', '--selector', '#app']);
  assert.equal(result.success, true);
  assert.equal(result.data.tree?.tag, 'DIV');
  assert.equal(result.data.tree?.id, 'app');
});

test('launch cli works in test mode', async () => {
  process.env.BROWSER_CONTROL_TEST_MODE = '1';
  const result = await runCli(['launch', '--profile', 'demo', '--url', 'https://example.com', '--no-dev']);
  assert.equal(result.success, true);
  assert.equal(result.data.profile, 'demo');
  assert.equal(result.data.sessionId, 'demo');
  delete process.env.BROWSER_CONTROL_TEST_MODE;
});

test('status cli works in test mode', async () => {
  process.env.BROWSER_CONTROL_TEST_MODE = '1';
  const result = await runCli(['status']);
  assert.equal(result.success, true);
  assert.equal(result.data.healthy, true);
  delete process.env.BROWSER_CONTROL_TEST_MODE;
});
