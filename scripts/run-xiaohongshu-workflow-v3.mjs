import minimist from 'minimist';
import { runWorkflowById } from '../dist/modules/workflow/src/runner.js';

async function main() {
  // 开发阶段默认开启结构化 debug 日志（写入 ~/.webauto/logs/debug.jsonl），便于事后回放。
  if (!process.env.DEBUG) process.env.DEBUG = '1';
  const args = minimist(process.argv.slice(2));
  const keyword = args.keyword || '手机膜';
  const targetCount = Number(args.count || 10);
  const env = args.env || 'debug';
  const workflowId = args.workflow || 'xiaohongshu-collect-full-v3';
  const ocrLanguages =
    typeof args.ocrLanguages === 'string' && args.ocrLanguages.trim() ? String(args.ocrLanguages).trim() : undefined;
  const maxWarmupRounds =
    typeof args.warmup === 'number' || typeof args.warmup === 'string' ? Number(args.warmup) : undefined;
  const allowClickCommentButton =
    typeof args.allowClickCommentButton === 'undefined'
      ? undefined
      : ['1', 'true', 'yes', 'y'].includes(String(args.allowClickCommentButton).toLowerCase());
  const sessionId = 'xiaohongshu_fresh';

  console.log(
    `[WorkflowRunner] Starting XHS workflow "${workflowId}" for "${keyword}", count: ${targetCount}, env: ${env}`,
  );

  const result = await runWorkflowById(String(workflowId), {
    sessionId,
    keyword,
    targetCount,
    env,
    ...(typeof ocrLanguages === 'string' ? { ocrLanguages } : {}),
    ...(Number.isFinite(maxWarmupRounds) ? { maxWarmupRounds } : {}),
    ...(typeof allowClickCommentButton === 'boolean' ? { allowClickCommentButton } : {}),
  });

  if (result.success) {
    console.log('[WorkflowRunner] Workflow executed successfully');
    return;
  }

  console.error('[WorkflowRunner] Workflow failed with errors:', result.errors);
  process.exit(1);
}

main().catch((err) => {
  console.error('[WorkflowRunner] Unexpected error:', err);
  process.exit(1);
});
