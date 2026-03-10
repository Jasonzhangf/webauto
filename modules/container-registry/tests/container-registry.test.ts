import test from 'node:test';
import assert from 'node:assert/strict';
import { ContainerRegistry } from '../src/index.js';

test('getContainersForUrl returns known container', () => {
  const registry = new ContainerRegistry();
  const containers = registry.getContainersForUrl('https://xiaohongshu.com/');
  assert.ok(Object.keys(containers).length > 0, 'should include xiaohongshu containers');
});

test('listSites contains xiaohongshu entry', () => {
  const registry = new ContainerRegistry();
  const sites = registry.listSites();
  const hasXhs = sites.some((site) => site.key.includes('xiaohongshu'));
  assert.ok(hasXhs, 'should list xiaohongshu site');
});
