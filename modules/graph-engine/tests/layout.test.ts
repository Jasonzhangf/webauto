import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../src/layout.js';

test('computeLayout separates containers and dom nodes', () => {
  const nodes = [
    { id: 'c1', type: 'container', label: 'C1', parentId: null, depth: 0 },
    { id: 'd1', type: 'dom', label: '<div>', parentId: 'c1', depth: 1 },
  ];
  const positioned = computeLayout(nodes as any, 300, 40);
  const container = positioned.find((node) => node.id === 'c1');
  const dom = positioned.find((node) => node.id === 'd1');
  assert.ok(container);
  assert.ok(dom);
  assert.notEqual(container?.x, dom?.x);
});
