#!/usr/bin/env node
/**
 * 小红书单 Note Workflow 离线仿真运行脚本
 *
 * 假设：
 *   - Browser Service 已启动；
 *   - 指定 sessionId 的浏览器会话中，已打开本地仿真详情页
 *     （例如通过 generate-detail-mock-page.mjs 生成的 detail-<noteId>.html）；
 *
 * 本脚本只负责：
 *   - 调用 workflow: xiaohongshu-note-collect；
 *   - 打印每个步骤的执行结果和持久化输出路径。
 *
 * 用法：
 *   node scripts/xiaohongshu/tests/run-note-workflow-offline.mjs \\
 *     --sessionId xiaohongshu_fresh \\
 *     --noteId 67b84fb3000000002900cb99 \\
 *     --keyword "华为续签难" \\
 *     --env debug \\
 *     [--detailUrl file:///path/to/detail-note.html]
 */

import minimist from 'minimist';
import os from 'node:os';
import path from 'node:path';
import { runWorkflowById } from '../../../modules/workflow/src/runner.ts';

async function main() {
  const args = minimist(process.argv.slice(2));
  const sessionId = args.sessionId || 'xiaohongshu_fresh';
  const noteId = args.noteId || args.id;
  const keyword = args.keyword || 'UT_离线测试';
  const env = args.env || 'debug';
  let detailUrl = args.detailUrl;

  if (!noteId) {
    console.error(
      'Usage: run-note-workflow-offline.mjs --sessionId <id> --noteId <noteId> [--keyword 关键词] [--env debug] [--detailUrl file:///...]',
    );
    process.exit(1);
  }

  if (!detailUrl) {
    const homeDir = os.homedir();
    const fixturesDir = path.join(homeDir, '.webauto', 'fixtures', 'xiaohongshu');
    const htmlPath = path.join(fixturesDir, `detail-${noteId}.html`);
    detailUrl = `file://${htmlPath}`;
    console.log(`[NoteOffline] detailUrl 未指定，默认使用本地文件: ${detailUrl}`);
    console.log(
      '[NoteOffline] 请确保浏览器会话已手动打开该本地页面，然后再运行本脚本。',
    );
  }

  console.log(
    `[NoteOffline] Run workflow xiaohongshu-note-collect\n  sessionId=${sessionId}\n  noteId=${noteId}\n  keyword=${keyword}\n  env=${env}\n  detailUrl=${detailUrl}`,
  );

  const result = await runWorkflowById('xiaohongshu-note-collect', {
    sessionId,
    env,
    keyword,
    noteId,
    detailUrl,
  });

  if (!result.success) {
    console.error('[NoteOffline] Workflow failed with errors:', result.errors);
  } else {
    console.log('[NoteOffline] Workflow success');
  }

  if (Array.isArray(result.steps)) {
    for (const step of result.steps) {
      const status = step.error ? 'error' : 'ok';
      console.log(
        `  [step ${step.index}] ${step.blockName} -> ${status}${
          step.error ? ` (${step.error})` : ''
        }`,
      );
    }
  }
}

main().catch((err) => {
  console.error('[NoteOffline] Unexpected error:', err);
  process.exit(1);
});

