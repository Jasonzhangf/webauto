import test from 'node:test';
import assert from 'node:assert/strict';

import {
  makeArtifactDigest,
  makeInvocationId,
} from '../../../modules/webauto-v3/src/ids.mjs';

test('invocation id is stable across key order and input order is significant', () => {
  const a = makeInvocationId({
    workflowRunId: 'run_1',
    workflowNodeId: 'node_1',
    bindingId: 'binding_1',
    itemKey: 'post_1',
    attempt: 1,
  });
  const b = makeInvocationId({
    attempt: 1,
    itemKey: 'post_1',
    bindingId: 'binding_1',
    workflowNodeId: 'node_1',
    workflowRunId: 'run_1',
  });
  assert.equal(a, b);
  assert.notEqual(a, makeInvocationId({
    workflowRunId: 'run_1',
    workflowNodeId: 'node_1',
    bindingId: 'binding_1',
    itemKey: 'post_2',
    attempt: 1,
  }));
});

test('artifact digest canonicalizes object key order', () => {
  assert.equal(
    makeArtifactDigest({ a: 1, b: { c: 2, d: 3 } }),
    makeArtifactDigest({ b: { d: 3, c: 2 }, a: 1 }),
  );
});
