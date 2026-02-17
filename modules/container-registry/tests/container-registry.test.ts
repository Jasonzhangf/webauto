import test from 'node:test';
import assert from 'node:assert/strict';
import { ContainerRegistry } from '../src/index.js';

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
