import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBranch } from '../src/fetchBranch.js';

test('fetchBranch returns placeholder node', async () => {
  const res = await fetchBranch({ profile: 'p', url: 'https://example.com', path: 'root' });
  assert.equal(res.node.path, 'root');
});
