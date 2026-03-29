import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  resolveWeiboOutputContext,
  readJsonlRows,
  mergeWeiboPosts,
  writeWeiboLinks,
  writeCollectionMeta,
  appendLog,
  weiboPostDedupKey,
} from '../../../modules/camo-runtime/src/autoscript/action-providers/weibo/persistence.mjs';

let tmpDir;

describe('weibo persistence', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'weibo-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('resolveWeiboOutputContext', () => {
    it('resolves to ~/.webauto/download/weibo/<env>/search:<keyword> by default', () => {
      const ctx = resolveWeiboOutputContext({ params: { keyword: 'AI', env: 'prod' } });
      assert.ok(ctx.keywordDir.endsWith(path.join('weibo', 'prod', 'search:AI')));
      assert.ok(ctx.postsPath.endsWith('posts.jsonl'));
      assert.ok(ctx.linksPath.endsWith('links.jsonl'));
      assert.ok(ctx.metaPath.endsWith('collection-meta.json'));
      assert.ok(ctx.logPath.endsWith('run.log'));
    });

    it('uses outputRoot when provided', () => {
      const ctx = resolveWeiboOutputContext({ params: { keyword: 'test', env: 'debug', outputRoot: '/tmp/weibo-out' } });
      assert.equal(ctx.root, '/tmp/weibo-out');
      assert.ok(ctx.keywordDir.startsWith('/tmp/weibo-out'));
    });

    it('sanitizes keyword for filesystem safety', () => {
      const ctx = resolveWeiboOutputContext({ params: { keyword: 'A/B:C', env: 'prod' } });
      assert.ok(!ctx.keywordDir.includes('A/B:C'));
      assert.ok(ctx.keywordDir.includes('A_B_C'));
    });

    it('defaults to "unknown" keyword when empty', () => {
      const ctx = resolveWeiboOutputContext({ params: {} });
      assert.ok(ctx.keywordDir.includes('search:unknown'));
    });

    it('defaults env to "prod"', () => {
      const ctx = resolveWeiboOutputContext({ params: { keyword: 'test' } });
      assert.ok(ctx.keywordDir.includes(path.join('weibo', 'prod')));
    });
  });

  describe('readJsonlRows', () => {
    it('returns empty array for non-existent file', async () => {
      const rows = await readJsonlRows(path.join(tmpDir, 'nonexistent.jsonl'));
      assert.deepEqual(rows, []);
    });

    it('parses valid jsonl', async () => {
      const filePath = path.join(tmpDir, 'test.jsonl');
      await fs.writeFile(filePath, '{"a":1}\n{"b":2}\n');
      const rows = await readJsonlRows(filePath);
      assert.deepEqual(rows, [{ a: 1 }, { b: 2 }]);
    });

    it('skips invalid lines', async () => {
      const filePath = path.join(tmpDir, 'test.jsonl');
      await fs.writeFile(filePath, '{"a":1}\nbad line\n{"b":2}\n');
      const rows = await readJsonlRows(filePath);
      assert.equal(rows.length, 2);
    });
  });

  describe('mergeWeiboPosts', () => {
    it('appends new posts to empty file', async () => {
      const filePath = path.join(tmpDir, 'posts.jsonl');
      const posts = [
        { url: 'https://weibo.com/123/post1', author: 'user1', content: 'hello' },
        { url: 'https://weibo.com/456/post2', author: 'user2', content: 'world' },
      ];
      const result = await mergeWeiboPosts({ filePath, posts });
      assert.equal(result.added, 2);
      assert.equal(result.existing, 0);
      assert.equal(result.total, 2);
    });

    it('deduplicates by url', async () => {
      const filePath = path.join(tmpDir, 'posts.jsonl');
      const posts1 = [{ url: 'https://weibo.com/123/post1', author: 'user1' }];
      await mergeWeiboPosts({ filePath, posts: posts1 });

      const posts2 = [
        { url: 'https://weibo.com/123/post1', author: 'user1' },
        { url: 'https://weibo.com/456/post2', author: 'user2' },
      ];
      const result = await mergeWeiboPosts({ filePath, posts: posts2 });
      assert.equal(result.added, 1);
      assert.equal(result.existing, 1);
      assert.equal(result.total, 2);
    });

    it('handles empty posts array', async () => {
      const filePath = path.join(tmpDir, 'posts.jsonl');
      const result = await mergeWeiboPosts({ filePath, posts: [] });
      assert.equal(result.added, 0);
    });
  });

  describe('writeWeiboLinks', () => {
    it('writes one url per line', async () => {
      const filePath = path.join(tmpDir, 'links.jsonl');
      const posts = [
        { url: 'https://weibo.com/123/post1' },
        { url: 'https://weibo.com/456/post2' },
      ];
      const result = await writeWeiboLinks({ filePath, posts });
      assert.equal(result.count, 2);

      const content = await fs.readFile(filePath, 'utf8');
      assert.ok(content.includes('https://weibo.com/123/post1'));
      assert.ok(content.includes('https://weibo.com/456/post2'));
    });

    it('handles empty posts', async () => {
      const filePath = path.join(tmpDir, 'links.jsonl');
      const result = await writeWeiboLinks({ filePath, posts: [] });
      assert.equal(result.count, 0);
    });
  });

  describe('writeCollectionMeta', () => {
    it('writes json meta file', async () => {
      const filePath = path.join(tmpDir, 'meta.json');
      const meta = { runId: 'wb_test', keyword: 'AI', collected: 10 };
      await writeCollectionMeta({ filePath, meta });

      const content = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);
      assert.equal(parsed.runId, 'wb_test');
      assert.equal(parsed.collected, 10);
    });
  });

  describe('appendLog', () => {
    it('appends timestamped log lines', async () => {
      const filePath = path.join(tmpDir, 'run.log');
      await appendLog({ filePath, message: 'run_start keyword=AI' });
      await appendLog({ filePath, message: 'run_done collected=5' });

      const content = await fs.readFile(filePath, 'utf8');
      assert.ok(content.includes('run_start keyword=AI'));
      assert.ok(content.includes('run_done collected=5'));
      assert.ok(content.match(/\[\d{4}-\d{2}-\d{2}T/)); // ISO timestamp present
    });
  });

  describe('weiboPostDedupKey', () => {
    it('returns url as dedup key', () => {
      assert.equal(weiboPostDedupKey({ url: 'https://weibo.com/123/post1' }), 'https://weibo.com/123/post1');
    });

    it('returns empty string for null/undefined', () => {
      assert.equal(weiboPostDedupKey(null), '');
      assert.equal(weiboPostDedupKey(undefined), '');
      assert.equal(weiboPostDedupKey({}), '');
    });
  });
});
