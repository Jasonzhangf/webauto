import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createWeiboRuntime } from '../../../apps/webauto/weibo-v3/runtime.mjs';
import { collectDetail } from '../../../apps/webauto/weibo-v3/detail.mjs';

function makeRuntime() {
  const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-runtime-'));
  return createWeiboRuntime({
    runId: `run_weibo_integration_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    profileId: 'fixture-profile',
    eventDir,
  });
}

function makeBrowser() {
  return {
    async goto() {},
    async pageInfo() {
      return {
        url: 'https://m.weibo.cn/detail/AbC123',
        title: 'fixture',
        viewport: { width: 390, height: 844 },
        scroll: { x: 0, y: 0 },
        textDigest: 'fixture',
      };
    },
    async observeAnchors() {
      return { 'post.root': { selector: '.card9', count: 1, visible: true } };
    },
    async fetchJson() {
      return { data: { id: 'AbC123', text: 'fixture body', user: { id: 1, screen_name: 'fixture' } } };
    },
    async evaluate() {
      return { ok: true, maxId: null, rows: [] };
    },
  };
}

test('Weibo runtime emits page, guard, operation, workflow, and artifact events', async () => {
  const runtime = makeRuntime();
  const browser = makeBrowser();
  const page = await runtime.runPage({
    pageDagId: 'weibo.mobile.detail',
    browser,
    selectors: { 'post.root': '.card9' },
    binding: {
      workflow_run_id: runtime.runId,
      workflow_node_id: 'open_detail',
      binding_id: 'weibo.detail',
      item_key: 'AbC123',
    },
    nodes: [
      { node_id: 'open', kind: 'Act', operation_kind: 'goto', post_anchors: ['post.root'] },
      { node_id: 'extract', kind: 'Extract', post_anchors: ['post.root'] },
    ],
    executor: async () => ({ ok: true, outputs: { opened: true } }),
    extractors: { extract: async () => ({ body: 'fixture' }) },
  });
  assert.equal(page.status, 'succeeded');

  const artifact = runtime.recordArtifact({
    artifactType: 'weibo-detail',
    artifactId: 'detail:AbC123',
    payload: { mid: 'AbC123', comments: 0 },
  });
  runtime.validateArtifact({ artifact, validationSpecId: 'weibo.detail.v1', result: 'pass', observedCount: 0 });
  runtime.finish('succeeded', { task_type: 'detail' });

  const types = runtime.eventStore.events().map((event) => event.type);
  for (const type of [
    'PageNodeCompleted',
    'GuardVerdictIssued',
    'OperationSucceeded',
    'ArtifactProduced',
    'ArtifactValidated',
    'RunCompleted',
  ]) {
    assert.equal(types.includes(type), true, `missing ${type}`);
  }
});

test('collectDetail passes the shared runtime through page extraction and persistence', async () => {
  const runtime = makeRuntime();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-detail-'));
  const result = await collectDetail({
    runtime,
    browser: makeBrowser(),
    url: 'https://m.weibo.cn/detail/AbC123',
    keyword: 'fixture',
    outputRoot: root,
    commentsEnabled: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.mid, 'AbC123');
  assert.equal(fs.existsSync(result.context.metaPath), true);
  const types = runtime.eventStore.events().map((event) => event.type);
  assert.equal(types.includes('ArtifactProduced'), true);
  assert.equal(types.includes('ArtifactValidated'), true);
});

test('page anchor guard rejects a present but invisible anchor', async () => {
  const runtime = makeRuntime();
  const browser = makeBrowser();
  browser.observeAnchors = async () => ({
    'post.root': { selector: '.card9', count: 1, visible: false },
  });
  const page = await runtime.runPage({
    pageDagId: 'weibo.mobile.detail',
    browser,
    selectors: { 'post.root': '.card9' },
    binding: {
      workflow_run_id: runtime.runId,
      workflow_node_id: 'open_detail',
      binding_id: 'weibo.detail',
      item_key: 'AbC123',
    },
    nodes: [
      { node_id: 'open', kind: 'Act', operation_kind: 'goto', post_anchors: ['post.root'] },
    ],
    executor: async () => ({ ok: true, outputs: { opened: true } }),
    postAnchorTimeoutMs: 0,
  });
  assert.equal(page.status, 'failed');
  assert.equal(page.verdict, 'deny');
  assert.equal(page.reason_code, 'anchor_not_visible');
});
