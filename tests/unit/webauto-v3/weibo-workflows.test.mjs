import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readJsonl, resolveDetailContext, resolveTimelineContext } from '../../../apps/webauto/weibo-v3/artifacts.mjs';
import { createWeiboRuntime } from '../../../apps/webauto/weibo-v3/runtime.mjs';
import { runConsumer, runProducer } from '../../../apps/webauto/weibo-v3/workflows.mjs';

function makeRuntime(prefix) {
  const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-events-`));
  return createWeiboRuntime({
    runId: `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    eventDir,
  });
}

function makeBrowser() {
  return {
    async setViewport() {},
    async goto() {},
    async pageInfo() {
      return {
        url: 'https://m.weibo.cn/detail/AbC123',
        title: 'fixture',
        viewport: { width: 1440, height: 900 },
        scroll: { x: 0, y: 0 },
        textDigest: 'fixture',
      };
    },
    async observeAnchors() {
      return {
        'profile.root': { selector: '.wbpro-scroller-item', count: 1, visible: true },
        'post.root': { selector: '.card9', count: 1, visible: true },
      };
    },
    async evaluate() {
      return {
        posts: [{
          mid: 'AbC123',
          url: 'https://weibo.com/1/AbC123',
          authorName: 'fixture',
          content: 'fixture body',
        }],
      };
    },
    async fetchJson() {
      return {
        data: {
          id: 'AbC123',
          text: 'fixture body',
          user: { id: 1, screen_name: 'fixture' },
        },
      };
    },
    async scroll() {},
  };
}

test('producer writes the links queue consumed by the consumer', async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-producer-consumer-'));
  const date = '2026-09-20';
  const browser = makeBrowser();
  const producerRuntime = makeRuntime('producer');
  const producer = await runProducer({
    runtime: producerRuntime,
    browser,
    taskType: 'timeline',
    outputRoot,
    date,
    maxLinksPerScan: 1,
    maxScans: 2,
    scanIntervalMs: 1,
  });
  assert.equal(producer.ok, true);
  assert.equal(producer.scans, 2);
  assert.equal(producer.added, 1);

  const context = resolveTimelineContext({ date, outputRoot });
  const links = await readJsonl(context.linksPath);
  assert.deepEqual(links.map((link) => link.url), ['https://weibo.com/1/AbC123']);

  const consumerRuntime = makeRuntime('consumer');
  const consumer = await runConsumer({
    runtime: consumerRuntime,
    browser,
    taskType: 'timeline',
    outputRoot,
    date,
    maxPosts: 1,
    commentsEnabled: false,
  });
  assert.equal(consumer.ok, true);
  assert.equal(consumer.processed, 1);
});

test('JSONL reads fail closed unless a missing file is explicitly allowed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-jsonl-'));
  const missing = path.join(root, 'missing.jsonl');

  await assert.rejects(() => readJsonl(missing), (error) => error?.code === 'ENOENT');
  assert.deepEqual(await readJsonl(missing, { missingOk: true }), []);

  const malformed = path.join(root, 'malformed.jsonl');
  fs.writeFileSync(malformed, '{"ok":true}\n{broken}\n', 'utf8');
  await assert.rejects(
    () => readJsonl(malformed),
    /invalid JSONL .*:2:/,
  );
});

test('consumer continues after one detail fails and records the failure', async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-consumer-partial-'));
  const date = '2026-09-20';
  const context = resolveTimelineContext({ date, outputRoot });
  const links = [
    { url: 'https://m.weibo.cn/detail/FirstFail' },
    { url: 'https://m.weibo.cn/detail/SecondOk' },
  ];
  fs.mkdirSync(path.dirname(context.linksPath), { recursive: true });
  fs.writeFileSync(context.linksPath, `${links.map((link) => JSON.stringify(link)).join('\n')}\n`, 'utf8');

  const browser = makeBrowser();
  const originalGoto = browser.goto;
  browser.goto = async (url) => {
    if (String(url).includes('FirstFail')) throw new Error('fixture navigation failed');
    return originalGoto(url);
  };

  const result = await runConsumer({
    runtime: makeRuntime('consumer_partial'),
    browser,
    taskType: 'timeline',
    outputRoot,
    date,
    maxPosts: 2,
    commentsEnabled: false,
  });

  // A failed detail must make the run fail: the scheduler keys task success
  // off `ok`, so reporting ok here would record a successful task for a queue
  // that did not drain.
  assert.equal(result.ok, false);
  assert.equal(result.processed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.lastError, 'detail page DAG failed for FirstFail: node_exception');

  const detailContext = resolveDetailContext({ keyword: 'timeline:2026-09-20', outputRoot });
  assert.equal(fs.existsSync(path.join(detailContext.keywordDir, 'FirstFail', 'detail-meta.json')), false);
  assert.equal(fs.existsSync(path.join(detailContext.keywordDir, 'SecondOk', 'detail-meta.json')), true);
});

test('a failed consumer link is retried and completed links are not re-collected', async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-consumer-retry-'));
  const date = '2026-09-20';
  const context = resolveTimelineContext({ date, outputRoot });
  const links = [
    { url: 'https://m.weibo.cn/detail/FirstFail' },
    { url: 'https://m.weibo.cn/detail/SecondOk' },
  ];
  fs.mkdirSync(path.dirname(context.linksPath), { recursive: true });
  fs.writeFileSync(context.linksPath, `${links.map((link) => JSON.stringify(link)).join('\n')}\n`, 'utf8');

  const browser = makeBrowser();
  const originalGoto = browser.goto;
  let failFirstTimes = 1;
  const visited = [];
  browser.goto = async (url) => {
    visited.push(String(url));
    if (String(url).includes('FirstFail') && failFirstTimes > 0) {
      failFirstTimes--;
      throw new Error('fixture navigation failed');
    }
    return originalGoto(url);
  };

  const result = await runConsumer({
    runtime: makeRuntime('consumer_retry'),
    browser,
    taskType: 'timeline',
    outputRoot,
    date,
    maxPosts: 0,
    commentsEnabled: false,
    idleIntervalMs: 10,
    stopWhenIdle: true,
  });
  // FirstFail failed once and then succeeded on the retry; SecondOk was
  // collected exactly once. A positional cursor would have skipped FirstFail
  // for the rest of the process and never written its detail.
  assert.equal(result.failed, 1);
  const detailContext = resolveDetailContext({ keyword: 'timeline:2026-09-20', outputRoot });
  assert.equal(fs.existsSync(path.join(detailContext.keywordDir, 'FirstFail', 'detail-meta.json')), true);
  assert.equal(fs.existsSync(path.join(detailContext.keywordDir, 'SecondOk', 'detail-meta.json')), true);
  assert.equal(
    visited.filter((url) => url.includes('SecondOk')).length,
    1,
    'a completed link must not be collected twice',
  );
});
