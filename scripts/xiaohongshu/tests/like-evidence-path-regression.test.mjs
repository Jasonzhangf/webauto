import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const blockSourcePath = path.resolve(__dirname, '..', '..', '..', 'modules', 'xiaohongshu', 'app', 'src', 'blocks', 'Phase3InteractBlock.ts');

test('phase3 interact supports real like-evidence dir in non-dryrun', async () => {
  const src = await readFile(blockSourcePath, 'utf8');
  assert.match(src, /evidenceDir\?: string;/);
  assert.match(src, /const traceDir = String\(evidenceDir \|\| ''\)\.trim\(\) \|\| path\.join\(/);
  assert.match(src, /dryRun \? 'virtual-like' : 'like-evidence'/);
  assert.match(src, /evidenceDir: traceDir/);
});

test('phase3 interact persists signatures for already-liked comments', async () => {
  const src = await readFile(blockSourcePath, 'utf8');
  assert.match(src, /if \(beforeLiked\) \{/);
  assert.match(src, /saveLikedSignature\(keyword, env, sigKey\)/);
  assert.match(src, /alreadyLikedSkipped: totalAlreadyLikedSkipped/);
  assert.match(src, /dedupSkipped: totalDedupSkipped/);
});
