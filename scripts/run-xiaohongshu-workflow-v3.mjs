import minimist from 'minimist';
import { runWorkflowById } from '../dist/modules/workflow/src/runner.js';

async function main() {
  const args = minimist(process.argv.slice(2));
  const keyword = args.keyword || '手机膜';
  const targetCount = Number(args.count || 10);
  const env = args.env || 'debug';
  const workflowId = args.workflow || 'xiaohongshu-collect-full-v3';
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
