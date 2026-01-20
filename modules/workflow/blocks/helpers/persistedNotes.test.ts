import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';

import { countPersistedNotes } from './persistedNotes.js';

test('countPersistedNotes counts note dirs with required files', async () => {
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-persisted-'));

  const keyword = '自动驾驶/测试';
  const keywordDir = path.join(
    tmpHome,
    '.webauto',
    'download',
    'xiaohongshu',
    'debug',
    '自动驾驶_测试',
  );

  await fs.mkdir(path.join(keywordDir, 'n1'), { recursive: true });
  await fs.writeFile(path.join(keywordDir, 'n1', 'content.md'), 'ok', 'utf-8');

  await fs.mkdir(path.join(keywordDir, 'n2'), { recursive: true });

  const res = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword,
    homeDir: tmpHome,
    requiredFiles: ['content.md'],
  });

  assert.equal(res.keywordDir, keywordDir);
  assert.equal(res.count, 1);
  assert.deepEqual(res.noteIds.slice().sort(), ['n1']);
});

test('countPersistedNotes returns 0 when keyword dir absent', async () => {
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-persisted-'));

  const res = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: '不存在',
    homeDir: tmpHome,
    requiredFiles: ['content.md'],
  });

  assert.equal(res.count, 0);
  assert.deepEqual(res.noteIds, []);
});

test('countPersistedNotes can require comments done', async () => {
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-persisted-'));

  const keyword = '自动驾驶';
  const keywordDir = path.join(
    tmpHome,
    '.webauto',
    'download',
    'xiaohongshu',
    'debug',
    '自动驾驶',
  );

  await fs.mkdir(path.join(keywordDir, 'done1'), { recursive: true });
  await fs.writeFile(path.join(keywordDir, 'done1', 'content.md'), 'ok', 'utf-8');
  await fs.writeFile(
    path.join(keywordDir, 'done1', 'comments.md'),
    '- 评论统计: 抓取=1, header=1（reachedEnd=是, empty=否）\n',
    'utf-8',
  );

  await fs.mkdir(path.join(keywordDir, 'done2'), { recursive: true });
  await fs.writeFile(path.join(keywordDir, 'done2', 'content.md'), 'ok', 'utf-8');
  await fs.writeFile(
    path.join(keywordDir, 'done2', 'comments.md'),
    '- 评论统计: 抓取=0, header=未知（reachedEnd=否, empty=是）\n',
    'utf-8',
  );

  await fs.mkdir(path.join(keywordDir, 'partial'), { recursive: true });
  await fs.writeFile(path.join(keywordDir, 'partial', 'content.md'), 'ok', 'utf-8');
  await fs.writeFile(
    path.join(keywordDir, 'partial', 'comments.md'),
    '- 评论统计: 抓取=3, header=10（reachedEnd=否, empty=否）\n',
    'utf-8',
  );

  const res = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword,
    homeDir: tmpHome,
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
  });

  assert.equal(res.keywordDir, keywordDir);
  assert.equal(res.count, 2);
  assert.deepEqual(res.noteIds.slice().sort(), ['done1', 'done2']);
});
