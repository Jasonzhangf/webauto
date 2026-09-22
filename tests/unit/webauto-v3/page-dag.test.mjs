import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { EventStore } from '../../../modules/webauto-v3/src/event-store.mjs';
import { PageDagRuntime } from '../../../modules/webauto-v3/src/page-dag.mjs';

function makeRuntime({
  mode = 'execute',
  guards = {},
  executor = null,
  observer = null,
  postAnchorTimeoutMs = 15_000,
  postAnchorPollMs = 250,
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-page-'));
  const eventStore = new EventStore({ runId: 'run_page', dir });
  let revision = 0;
  const runtime = new PageDagRuntime({
    pageDagId: 'fixture',
    eventStore,
    mode,
    postAnchorTimeoutMs,
    postAnchorPollMs,
    observer: observer || (async () => ({
      revision: `rev_${++revision}`,
      url: 'https://example.test',
      title: 'fixture',
      viewport: { width: 390, height: 844 },
      scroll: { x: 0, y: 0 },
      text_digest: 'fixture',
    })),
    guards: {
      Act: () => ({ verdict: 'allow', guard_id: 'act', diagnostics: {} }),
      Extract: () => ({ verdict: 'allow', guard_id: 'extract', diagnostics: {} }),
      postAnchor: () => ({ verdict: 'allow', guard_id: 'post', diagnostics: {} }),
      extract: async ({ node }) => ({ value: node.node_id }),
      ...guards,
    },
    executor: executor || (async () => ({ ok: true, outputs: { clicked: true } })),
    nodes: [
      { node_id: 'act', kind: 'Act', operation_kind: 'click', post_anchors: ['root'] },
      { node_id: 'extract', kind: 'Extract' },
    ],
  });
  return { runtime, eventStore };
}

test('page DAG executes typed nodes and emits page events', async () => {
  const { runtime, eventStore } = makeRuntime();
  const result = await runtime.run({
    workflow_run_id: 'run_page',
    workflow_node_id: 'node_1',
    binding_id: 'binding_1',
    item_key: 'post_1',
    invocation_id: 'inv_1',
  });
  assert.equal(result.status, 'succeeded');
  const types = eventStore.events().map((event) => event.type);
  assert.equal(types.includes('PageNodeCompleted'), true);
  assert.equal(types.includes('OperationSucceeded'), true);
  assert.equal(types.includes('GuardVerdictIssued'), true);
});

test('page DAG fails closed when a guard is missing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-page-fail-'));
  const eventStore = new EventStore({ runId: 'run_page_fail', dir });
  const runtime = new PageDagRuntime({
    pageDagId: 'fixture',
    eventStore,
    observer: async () => ({ revision: 'rev_1' }),
    nodes: [{ node_id: 'missing_guard', kind: 'Extract' }],
  });
  const result = await runtime.run({ invocation_id: 'inv_fail' });
  assert.equal(result.status, 'failed');
  assert.equal(result.verdict, 'unknown');
  assert.equal(result.reason_code, 'guard_missing');
});

test('page DAG waits for a delayed post anchor', async () => {
  let observations = 0;
  const { runtime } = makeRuntime({
    postAnchorTimeoutMs: 100,
    postAnchorPollMs: 1,
    observer: async () => {
      observations++;
      return {
        revision: `rev_${observations}`,
        anchors: observations >= 2 ? { root: { count: 1, visible: true } } : {},
      };
    },
    guards: {
      postAnchor: ({ anchorName, observation }) => ({
        verdict: observation?.anchors?.[anchorName]?.count > 0 ? 'allow' : 'deny',
        guard_id: 'post',
        diagnostics: {},
      }),
    },
  });
  const result = await runtime.run({ invocation_id: 'inv_delayed_anchor' });
  assert.equal(result.status, 'succeeded');
  assert.equal(observations >= 2, true);
});

test('page DAG fails when a post anchor never appears before timeout', async () => {
  const { runtime } = makeRuntime({
    postAnchorTimeoutMs: 10,
    postAnchorPollMs: 1,
    guards: {
      postAnchor: () => ({ verdict: 'deny', guard_id: 'post', diagnostics: {} }),
    },
  });
  const result = await runtime.run({ invocation_id: 'inv_missing_anchor' });
  assert.equal(result.status, 'failed');
  assert.equal(result.anchor, 'root');
  assert.equal(result.verdict, 'deny');
});

test('page DAG fails explicitly when maxSteps is exhausted', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-page-max-steps-'));
  const eventStore = new EventStore({ runId: 'run_page_max_steps', dir });
  const runtime = new PageDagRuntime({
    pageDagId: 'fixture',
    eventStore,
    maxSteps: 1,
    observer: async () => ({ revision: 'rev_1' }),
    guards: {
      Extract: () => ({ verdict: 'allow', guard_id: 'extract', diagnostics: {} }),
      extract: async ({ node }) => ({ value: node.node_id }),
    },
    nodes: [
      { node_id: 'first', kind: 'Extract' },
      { node_id: 'second', kind: 'Extract' },
    ],
  });
  const result = await runtime.run({ invocation_id: 'inv_max_steps' });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason_code, 'max_steps_exceeded');
  assert.equal(result.node_id, 'second');
});

test('a recorded operation failure is not replayed as a successful node', async () => {
  // The idempotency key for an Act node is derived from invocation_id +
  // node_id. When the first run recorded OperationFailed, a later run with the
  // same invocation must not treat the skipped browser operation as done: the
  // page DAG has to stay failed instead of reporting success for an action
  // that never succeeded.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-page-failed-replay-'));
  const eventStore = new EventStore({ runId: 'run_page_failed_replay', dir });
  let executed = 0;
  const runtime = new PageDagRuntime({
    pageDagId: 'fixture',
    eventStore,
    observer: async () => ({ revision: 'rev_1' }),
    guards: {
      Act: () => ({ verdict: 'allow', guard_id: 'act', diagnostics: {} }),
      Extract: () => ({ verdict: 'allow', guard_id: 'extract', diagnostics: {} }),
      postAnchor: () => ({ verdict: 'allow', guard_id: 'post', diagnostics: {} }),
      extract: async ({ node }) => ({ value: node.node_id }),
    },
    executor: async () => {
      executed++;
      return { ok: false, error: 'click target disappeared' };
    },
    nodes: [
      { node_id: 'act', kind: 'Act', operation_kind: 'click', post_anchors: ['root'] },
      { node_id: 'extract', kind: 'Extract' },
    ],
  });
  const binding = { invocation_id: 'inv_failed_replay' };

  const first = await runtime.run(binding);
  assert.equal(first.status, 'failed', 'first run must fail when the operation fails');
  assert.equal(executed, 1);

  // Replay the same invocation. The failed terminal must not become success.
  const replay = await runtime.run(binding);
  assert.equal(replay.status, 'failed', 'replaying a recorded failure must stay failed');
  assert.equal(replay.reason_code, 'operation_failed_replay');
  assert.equal(executed, 1, 'the failed operation must not be re-executed on replay');
});

test('a recorded operation success is still replayed without re-executing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-page-ok-replay-'));
  const eventStore = new EventStore({ runId: 'run_page_ok_replay', dir });
  let executed = 0;
  const runtime = new PageDagRuntime({
    pageDagId: 'fixture',
    eventStore,
    observer: async () => ({ revision: 'rev_1' }),
    guards: {
      Act: () => ({ verdict: 'allow', guard_id: 'act', diagnostics: {} }),
      Extract: () => ({ verdict: 'allow', guard_id: 'extract', diagnostics: {} }),
      postAnchor: () => ({ verdict: 'allow', guard_id: 'post', diagnostics: {} }),
      extract: async ({ node }) => ({ value: node.node_id }),
    },
    executor: async () => {
      executed++;
      return { ok: true, outputs: { clicked: true } };
    },
    nodes: [
      { node_id: 'act', kind: 'Act', operation_kind: 'click', post_anchors: ['root'] },
      { node_id: 'extract', kind: 'Extract' },
    ],
  });
  const binding = { invocation_id: 'inv_ok_replay' };

  const first = await runtime.run(binding);
  assert.equal(first.status, 'succeeded');
  assert.equal(executed, 1);

  const replay = await runtime.run(binding);
  assert.equal(replay.status, 'succeeded');
  assert.equal(executed, 1, 'the succeeded operation must not run twice');
});
