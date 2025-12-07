import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGraphStore,
  addNodes,
  setLinks,
  updateNode,
  getChildren,
  markExpanded,
  markLoading,
} from '../src/graphStore.js';

test('graph store can add nodes and links', () => {
  const store = createGraphStore();
  addNodes(store, [
    { id: 'c1', type: 'container', label: 'Container', parentId: null, depth: 0 },
    { id: 'd1', type: 'dom', label: '<div>', parentId: 'c1', depth: 1 },
  ]);
  setLinks(store, [{ from: 'c1', to: 'd1' }]);
  assert.equal(store.nodes.size, 2);
  assert.equal(store.links.length, 1);
  assert.equal(store.children.get('c1')?.has('d1'), true);
});

test('graph store can update nodes', () => {
  const store = createGraphStore();
  addNodes(store, [{ id: 'c1', type: 'container', label: 'C1', parentId: null, depth: 0 }]);
  updateNode(store, 'c1', { label: 'Updated', expanded: true });
  assert.equal(store.nodes.get('c1')?.label, 'Updated');
  assert.equal(store.nodes.get('c1')?.expanded, true);
});

test('graph store can mark expanded/children', () => {
  const store = createGraphStore();
  addNodes(store, [
    { id: 'c1', type: 'container', label: 'C1', parentId: null, depth: 0 },
    { id: 'd1', type: 'dom', label: '<div>', parentId: 'c1', depth: 1 },
  ]);
  assert.equal(getChildren(store, 'c1').length, 1);
  markExpanded(store, 'c1', true);
  assert.equal(store.nodes.get('c1')?.expanded, true);
  markLoading(store, 'd1', true);
  assert.equal(store.nodes.get('d1')?.loading, true);
});
