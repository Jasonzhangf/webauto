import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { countPersistedNotes } from './persistedNotes.js';

async function writeNote(keywordDir: string, noteId: string, files: Record<string, string>) {
  const base = path.join(keywordDir, noteId);
  await fs.mkdir(base, { recursive: true });
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      const full = path.join(base, name);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, 'utf-8');
    }),
  );
}

test('countPersistedNotes accepts stoppedByMaxComments as done', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-notes-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'limit-case');
  await writeNote(keywordDir, 'note1', {
    'content.md': '# Note 1',
    'comments.md': ['reachedEnd=否', 'stoppedByMaxComments=yes', '评论统计: 抓取=10, header=200'].join('\n'),
  });

  const out = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'limit-case',
    downloadRoot: root,
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
    minCommentsCoverageRatio: 0.9,
  });

  assert.equal(out.count, 1);
  assert.deepEqual(out.noteIds, ['note1']);
});

test('countPersistedNotes accepts comments.done.json marker', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-notes-done-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'done-case');
  await writeNote(keywordDir, 'note1', {
    'content.md': '# Note 1',
    'comments.md': ['reachedEnd=鍚?', 'empty=鍚?'].join('\n'),
    'comments.done.json': JSON.stringify({ done: true }),
  });

  const out = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'done-case',
    downloadRoot: root,
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
  });

  assert.equal(out.count, 1);
  assert.deepEqual(out.noteIds, ['note1']);
});

test('countPersistedNotes returns empty when keyword dir missing', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-notes-missing-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const out = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'missing-keyword',
    downloadRoot: root,
  });

  assert.equal(out.count, 0);
  assert.deepEqual(out.noteIds, []);
});

test('countPersistedNotes skips when required file missing', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-notes-missing-file-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'missing-file');
  await writeNote(keywordDir, 'note1', {
    'content.md': '# Note 1',
  });

  const out = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'missing-file',
    downloadRoot: root,
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
  });

  assert.equal(out.count, 0);
});

test('countPersistedNotes treats unreadable comments as not done', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-notes-unreadable-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'unreadable');
  await writeNote(keywordDir, 'note1', {
    'content.md': '# Note 1',
  });
  await fs.mkdir(path.join(keywordDir, 'note1', 'comments.md'), { recursive: true });

  const out = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'unreadable',
    downloadRoot: root,
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
  });

  assert.equal(out.count, 0);
});

test('countPersistedNotes skips comments checks when requireCommentsDone=false', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-notes-simple-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'simple-case');
  await writeNote(keywordDir, 'note1', {
    'content.md': '# Note 1',
  });

  const out = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'simple-case',
    downloadRoot: root,
  });

  assert.equal(out.count, 1);
});

test('countPersistedNotes allows unknown header when empty=是', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-notes-empty-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'empty-case');
  await writeNote(keywordDir, 'note1', {
    'content.md': '# Note 1',
    'comments.md': ['empty=是', '评论统计: 抓取=1, header=unknown'].join('\n'),
  });

  const out = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'empty-case',
    downloadRoot: root,
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
    minCommentsCoverageRatio: 0.9,
  });

  assert.equal(out.count, 1);
});

test('countPersistedNotes skips coverage when ratio not provided', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-notes-ratio-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'ratio-case');
  await writeNote(keywordDir, 'note1', {
    'content.md': '# Note 1',
    'comments.md': ['reachedEnd=是', '评论统计: 抓取=1, header=10'].join('\n'),
  });

  const out = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'ratio-case',
    downloadRoot: root,
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
  });

  assert.equal(out.count, 1);
});

test('countPersistedNotes handles coverage read errors', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-notes-coverage-err-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'coverage-err');
  await writeNote(keywordDir, 'note1', {
    'content.md': '# Note 1',
    'comments.md': ['reachedEnd=是', '评论统计: 抓取=9, header=10'].join('\n'),
  });

  const originalReadFile = fs.readFile.bind(fs);
  let readCount = 0;
  fs.readFile = (async (...args: Parameters<typeof originalReadFile>) => {
    readCount += 1;
    if (readCount >= 2) {
      throw new Error('mock read error');
    }
    return originalReadFile(...args);
  }) as typeof fs.readFile;

  try {
    const out = await countPersistedNotes({
      platform: 'xiaohongshu',
      env: 'debug',
      keyword: 'coverage-err',
      downloadRoot: root,
      requiredFiles: ['content.md', 'comments.md'],
      requireCommentsDone: true,
      minCommentsCoverageRatio: 0.9,
    });

    assert.equal(out.count, 0);
  } finally {
    fs.readFile = originalReadFile;
  }
});

test('countPersistedNotes enforces coverage when not stoppedByMaxComments', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-notes-coverage-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'coverage-case');
  await writeNote(keywordDir, 'note1', {
    'content.md': '# Note 1',
    'comments.md': ['reachedEnd=是', '评论统计: 抓取=5, header=10'].join('\n'),
  });

  const out = await countPersistedNotes({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'coverage-case',
    downloadRoot: root,
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
    minCommentsCoverageRatio: 0.9,
  });

  assert.equal(out.count, 0);
});
