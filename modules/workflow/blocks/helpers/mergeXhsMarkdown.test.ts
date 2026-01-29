import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { mergeNotesMarkdown } from './mergeXhsMarkdown.js';

async function createNote(dir: string, files: Record<string, string>) {
  await fs.mkdir(dir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      const target = path.join(dir, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, 'utf-8');
    }),
  );
}

test('mergeNotesMarkdown merges notes and rewrites relative image paths', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-merge-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'phone-film');
  const note1 = path.join(keywordDir, 'note1');
  const note2 = path.join(keywordDir, 'note2');
  const note3 = path.join(keywordDir, 'note3');
  const debugDir = path.join(keywordDir, '_debug');

  await createNote(note1, {
    'content.md': [
      '# Title 1',
      '',
      '![img](./images/01.jpg)',
      '![img2](images/02.jpg)',
      '![abs](https://example.com/a.jpg)',
      '![data](data:image/png;base64,abc)',
      '![hash](#section)',
      '![root](/images/root.jpg)',
    ].join('\n'),
    'comments.md': ['# Comments', '', '- ok'].join('\n'),
    'images/01.jpg': 'fake',
  });

  await createNote(note2, {
    'README.md': ['# Title 2', '', '![img](./images/0.jpg)'].join('\n'),
  });

  await createNote(note3, {});
  await createNote(debugDir, { 'content.md': '# debug' });

  const result = await mergeNotesMarkdown({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'phone-film',
    downloadRoot: root,
  });

  assert.equal(result.success, true);
  assert.equal(result.totalNotes, 3);
  assert.equal(result.mergedNotes, 2);
  assert.deepEqual(result.skippedNotes, ['note3']);

  const mergedText = await fs.readFile(result.outputPath, 'utf-8');
  assert.match(mergedText, /# phone-film/);
  assert.match(mergedText, /## note1/);
  assert.match(mergedText, /## note2/);
  assert.match(mergedText, /!\[img]\(\.\/note1\/images\/01\.jpg\)/);
  assert.match(mergedText, /!\[img2]\(\.\/note1\/images\/02\.jpg\)/);
  assert.match(mergedText, /!\[abs]\(https:\/\/example\.com\/a\.jpg\)/);
  assert.match(mergedText, /!\[data]\(data:image\/png;base64,abc\)/);
  assert.match(mergedText, /!\[hash]\(#section\)/);
  assert.match(mergedText, /!\[root]\(\/images\/root\.jpg\)/);
  assert.match(mergedText, /!\[img]\(\.\/note2\/images\/0\.jpg\)/);
  assert.match(mergedText, /### Comments/);
});

test('mergeNotesMarkdown reports missing keyword directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-merge-missing-'));
  try {
    const result = await mergeNotesMarkdown({
      platform: 'xiaohongshu',
      env: 'debug',
      keyword: 'missing-keyword',
      downloadRoot: root,
    });

    assert.equal(result.success, false);
    assert.equal(result.totalNotes, 0);
    assert.equal(result.mergedNotes, 0);
    assert.match(result.error || '', /keyword_dir_missing/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('mergeNotesMarkdown writes header when no notes exist', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webauto-merge-empty-'));
  try {
    const keywordDir = path.join(root, 'xiaohongshu', 'debug', 'empty-case');
    await fs.mkdir(keywordDir, { recursive: true });

    const result = await mergeNotesMarkdown({
      platform: 'xiaohongshu',
      env: 'debug',
      keyword: 'empty-case',
      downloadRoot: root,
    });

    assert.equal(result.success, true);
    assert.equal(result.totalNotes, 0);
    assert.equal(result.mergedNotes, 0);

    const mergedText = await fs.readFile(result.outputPath, 'utf-8');
    assert.match(mergedText, /# empty-case/);
    assert.doesNotMatch(mergedText, /## note/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
