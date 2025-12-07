import test from 'node:test';
import assert from 'node:assert/strict';
import { FloatingOrchestrator } from '../orchestrator.js';
import { createGraphStore } from '../../../../modules/graph-engine/src/graphStore.js';

test('orchestrator loads snapshot via backend', async () => {
  const mockBackend = {
    async inspectContainers() {
      return { container_tree: { id: 'root' } };
    },
  };
  const orchestrator = new FloatingOrchestrator({
    graphStore: createGraphStore(),
    backend: mockBackend,
  });
  const res = await orchestrator.loadSnapshot('p', 'https://example.com');
  assert.equal(res.container_tree.id, 'root');
});
