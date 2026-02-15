import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blockSourcePath = path.resolve(__dirname, '..', '..', '..', 'modules', 'xiaohongshu', 'app', 'src', 'blocks', 'Phase3InteractBlock.ts');

test('phase3 interact supports real like-evidence dir in non-dryrun', async () => {
  const src = await readFile(blockSourcePath, 'utf8');
  assert.match(src, /evidenceDir\?: string;/);
  assert.match(src, /const likeEvidenceBaseDir = String\(evidenceDir \|\| ''\)\.trim\(\) \|\| path\.join\(/);
  assert.match(src, /dryRun \? 'virtual-like' : 'like-evidence'/);
  assert.match(src, /const ensureLikeEvidenceDir = async \(\) => \{/);
  assert.match(src, /evidenceDir: likeEvidenceDir \|\| ''/);
  assert.match(src, /let totalClickAttempts = 0;/);
  assert.match(src, /if \(didClick\) \{[\s\S]*writeHitMeta/);
  assert.match(src, /if \(totalClickAttempts > 0\)/);
});

test('phase3 interact persists signatures for already-liked comments', async () => {
  const src = await readFile(blockSourcePath, 'utf8');
  assert.match(src, /if \(beforeLiked\) \{/);
  assert.match(src, /saveLikedSignature\(keyword, env, sigKey\)/);
  assert.match(src, /alreadyLikedSkipped: totalAlreadyLikedSkipped/);
  assert.match(src, /dedupSkipped: totalDedupSkipped/);
});

test('phase3 like gate counts only real like attempts', async () => {
  const src = await readFile(blockSourcePath, 'utf8');
  assert.ok(src.includes('if (!dryRun) {'));
  assert.ok(src.includes('const likePermit = await requestLikeGate(sessionId);'));
  assert.ok(src.includes('const clickRes = await clickLikeButtonByIndex('));
  const gateIdx = src.indexOf('const likePermit = await requestLikeGate(sessionId);');
  const alreadyLikedIdx = src.indexOf('if (beforeLiked) {');
  assert.ok(gateIdx > alreadyLikedIdx, 'gate permit should be requested after already-liked skip checks');
});

test('phase3 likes newest replies first and skips nested parents', async () => {
  const src = await readFile(blockSourcePath, 'utf8');
  assert.ok(src.includes('candidates.sort'), 'should sort candidates by DOM order');
  assert.ok(src.includes('domIndex !== b.domIndex'), 'should compare domIndex for newest-first order');
  assert.ok(src.includes('reason=nested_parent'), 'should skip nested parent comments');
});

test('phase3 only highlights in dry-run', async () => {
  const src = await readFile(blockSourcePath, 'utf8');
  assert.ok(src.includes('if (dryRun) {'));
  assert.ok(src.includes('highlightCommentRow'));
  assert.ok(src.includes('highlightLikeButton'));
  assert.ok(src.includes('inViewport = await isLikeButtonInViewport'));
});
