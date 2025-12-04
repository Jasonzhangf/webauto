import test from 'node:test';
import assert from 'node:assert/strict';
import { ContainerRegistry } from '../src/index.js';
import { run as runCli } from '../src/cli.js';

test('getContainersForUrl returns known container', () => {
  const registry = new ContainerRegistry();
  const containers = registry.getContainersForUrl('https://weibo.com/');
  assert.ok(containers.weibo_main_page, 'should include weibo_main_page');
});

test('listSites contains weibo entry', () => {
  const registry = new ContainerRegistry();
  const sites = registry.listSites();
  const hasWeibo = sites.some((site) => site.key.includes('weibo'));
  assert.ok(hasWeibo, 'should list weibo site');
});

test('cli list command produces ids for url', async () => {
  const result = await runCli(['list', '--url', 'https://weibo.com/']);
  assert.equal(result.success, true);
  assert.ok(result.data.ids.includes('weibo_main_page'));
});

test('cli show returns container definition', async () => {
  const result = await runCli(['show', '--url', 'https://weibo.com/', '--id', 'weibo_main_page']);
  assert.equal(result.success, true);
  assert.equal(result.data.container.id, 'weibo_main_page');
});

test('cli test verifies fixture snapshot', async () => {
  const fixture = new URL('../../container-matcher/tests/fixtures/weibo.html', import.meta.url).pathname;
  const result = await runCli(['test', '--url', 'https://weibo.com/', '--fixture', fixture]);
  assert.equal(result.success, true);
  assert.equal(result.data.root_container, 'weibo_main_page');
});
