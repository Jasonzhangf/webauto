// The collected queue has two files that must describe the same set:
// posts.jsonl is the append-only record and links.jsonl is the work list the
// detail/consumer edges drain. A rerun that only writes the newest batch would
// leave posts.jsonl holding history while links.jsonl silently dropped the
// pending backlog, so the merge, not the batch, owns the links rewrite.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { updateQueue } from '../../../apps/webauto/weibo-v3/artifacts.mjs';
import {
  resolveDetailContext,
  resolveKeywordContext,
  resolveTimelineContext,
} from '../../../apps/webauto/weibo-v3/artifacts.mjs';

function tmpPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-queue-'));
  return {
    dir,
    postsPath: path.join(dir, 'posts.jsonl'),
    linksPath: path.join(dir, 'links.jsonl'),
  };
}

function post(url) {
  return { url, id: url, authorName: 'author', content: `content ${url}` };
}

test('first collection writes queue and work list from one set', async () => {
  const { dir, postsPath, linksPath } = tmpPaths();
  try {
    const result = await updateQueue({
      postsPath,
      linksPath,
      posts: [post('https://weibo.com/1'), post('https://weibo.com/2')],
    });

    assert.equal(result.added, 2);
    assert.equal(result.total, 2);
    assert.equal(result.linksWritten, 2);
    assert.equal(fs.readFileSync(postsPath, 'utf8').trim().split('\n').length, 2);
    assert.equal(fs.readFileSync(linksPath, 'utf8').trim().split('\n').length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rerun preserves the pending backlog in the work list', async () => {
  const { dir, postsPath, linksPath } = tmpPaths();
  try {
    await updateQueue({
      postsPath,
      linksPath,
      posts: [post('https://weibo.com/1'), post('https://weibo.com/2')],
    });
    // Second run sees only one fresh row.
    const second = await updateQueue({
      postsPath,
      linksPath,
      posts: [post('https://weibo.com/3')],
    });

    assert.equal(second.added, 1);
    assert.equal(second.total, 3);
    const links = fs.readFileSync(linksPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(
      links.map((row) => row.url),
      ['https://weibo.com/1', 'https://weibo.com/2', 'https://weibo.com/3'],
      'prior queue rows must survive a rerun',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('duplicate rows are not appended twice', async () => {
  const { dir, postsPath, linksPath } = tmpPaths();
  try {
    await updateQueue({ postsPath, linksPath, posts: [post('https://weibo.com/1')] });
    const second = await updateQueue({ postsPath, linksPath, posts: [post('https://weibo.com/1')] });

    assert.equal(second.added, 0);
    assert.equal(second.total, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dot segments cannot escape the artifact root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-dotseg-'));
  try {
    for (const env of ['..', '.', '../..']) {
      const ctx = resolveKeywordContext({ keyword: 'AI', env, outputRoot: root });
      assert.ok(
        ctx.keywordDir.startsWith(path.join(root, 'weibo') + path.sep),
        `env ${env} escaped the root: ${ctx.keywordDir}`,
      );
      assert.ok(!ctx.env.includes('/'), `env ${env} produced a traversing segment`);
      assert.equal(ctx.keywordDir, path.join(root, 'weibo', ctx.env, 'AI'));
    }
    for (const keyword of ['..', '.', '../../etc']) {
      const ctx = resolveKeywordContext({ keyword, env: 'prod', outputRoot: root });
      assert.ok(
        ctx.keywordDir.startsWith(path.join(root, 'weibo') + path.sep),
        `keyword ${keyword} escaped the root: ${ctx.keywordDir}`,
      );
      // "../.." has no alphanumeric content and falls back, while "../../etc"
      // collapses to the harmless single segment ".._.._etc".
      assert.ok(
        !ctx.keyword.includes('/') && !/^\.+$/.test(ctx.keyword),
        `keyword ${keyword} produced a traversing segment: ${ctx.keyword}`,
      );
      assert.equal(ctx.keywordDir, path.join(root, 'weibo', 'prod', ctx.keyword));
    }
    const date = resolveTimelineContext({ date: '..', outputRoot: root });
    assert.ok(date.keywordDir.startsWith(path.join(root, 'weibo') + path.sep));

    const detail = resolveDetailContext({
      keyword: 'AI',
      env: 'prod',
      outputRoot: root,
      postId: '..',
    });
    assert.ok(detail.postDir.startsWith(path.join(root, 'weibo') + path.sep));
    assert.ok(!detail.postId.includes('/') && !/^\.+$/.test(detail.postId));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('distinct non-ASCII keywords keep distinct artifact directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-cjk-'));
  try {
    const first = resolveKeywordContext({ keyword: '人工智能', outputRoot: root });
    const second = resolveKeywordContext({ keyword: '机器学习', outputRoot: root });

    assert.equal(first.keyword, '人工智能');
    assert.equal(second.keyword, '机器学习');
    assert.notEqual(first.keywordDir, second.keywordDir, 'CJK keywords must not collapse into one directory');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unusable path values stay distinct instead of sharing one directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-dotunique-'));
  try {
    const dirs = new Set();
    for (const keyword of ['..', '.', '...']) {
      const ctx = resolveKeywordContext({ keyword, outputRoot: root });
      assert.ok(!ctx.keywordDir.includes('..' + path.sep), 'must not traverse');
      dirs.add(ctx.keywordDir);
    }
    assert.equal(dirs.size, 3, 'rejected values must not share artifacts');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
