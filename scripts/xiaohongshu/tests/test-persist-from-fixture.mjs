#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 使用 fixture JSON 测试 PersistXhsNoteBlock（单块持久化测试）
 *
 * 用法：
 *   node scripts/xiaohongshu/tests/test-persist-from-fixture.mjs --noteId <noteId> [--env debug] [--keyword 关键词]
 *
 * 依赖：
 *   - 预先存在 fixture：~/.webauto/fixtures/xiaohongshu/note-<noteId>.json
 *     由 RecordFixtureBlock 录制：
 *       platform: 'xiaohongshu', category: 'note', id: noteId
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import minimist from 'minimist';
import { execute as persistXhsNote } from '../../../modules/workflow/blocks/PersistXhsNoteBlock.ts';

async function main() {
  const args = minimist(process.argv.slice(2));
  const noteId = args.noteId || args.id;
  const env = args.env || 'debug';
  const keywordArg = args.keyword;

  if (!noteId) {
    console.error(
      'Usage: test-persist-from-fixture.mjs --noteId <noteId> [--env debug] [--keyword 关键词]',
    );
    process.exit(1);
  }

  const homeDir = os.homedir();
  const fixturesDir = path.join(homeDir, '.webauto', 'fixtures', 'xiaohongshu');
  const fixturePath = path.join(fixturesDir, `note-${noteId}.json`);

  let raw;
  try {
    raw = await fs.readFile(fixturePath, 'utf-8');
  } catch (err) {
    console.error(`[PersistTest] Fixture not found: ${fixturePath}`);
    process.exit(1);
  }

  let fixture;
  try {
    fixture = JSON.parse(raw);
  } catch (err) {
    console.error(
      `[PersistTest] Invalid JSON in fixture: ${
        err && err.message ? err.message : String(err)
      }`,
    );
    process.exit(1);
  }

  const data = fixture.data || fixture;
  const keyword = keywordArg || data.keyword || 'UT_离线测试';
  const detailUrl = data.detailUrl || '';
  const detail = data.detail || {};
  const commentsResult = data.commentsResult || {};

  console.log(
    `[PersistTest] Persist note from fixture\n  noteId=${noteId}\n  env=${env}\n  keyword=${keyword}`,
  );

  const res = await persistXhsNote({
    sessionId: 'offline-fixture',
    env,
    platform: 'xiaohongshu',
    keyword,
    noteId,
    detailUrl,
    detail,
    commentsResult,
  });

  if (!res.success) {
    console.error('[PersistTest] PersistXhsNoteBlock failed:', res.error);
    process.exit(1);
  }

  console.log('[PersistTest] Persist success');
  if (res.outputDir) {
    console.log(`  outputDir: ${res.outputDir}`);
  }
  if (res.contentPath) {
    console.log(`  contentPath: ${res.contentPath}`);
  }
  if (res.imagesDir) {
    console.log(`  imagesDir: ${res.imagesDir}`);
  }
}

main().catch((err) => {
  console.error('[PersistTest] Unexpected error:', err);
  process.exit(1);
});

