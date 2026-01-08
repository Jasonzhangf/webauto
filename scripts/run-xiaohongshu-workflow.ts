import { runWorkflowById } from '../modules/workflow/src/runner';
import minimist from 'minimist';

async function main() {
  const args = minimist(process.argv.slice(2));
  const keyword = args.keyword || 'oppo小平板';
  const targetCount = args.count || 50;
  const sessionId = 'xiaohongshu_fresh';

  console.log(`[WorkflowRunner] Starting workflow for "${keyword}", count: ${targetCount}`);

  try {
    const result = await runWorkflowById('xiaohongshu-collect-v1', {
      sessionId,
      keyword,
      targetCount: Number(targetCount),
    });
    if (result.success) {
      console.log('[WorkflowRunner] Workflow executed successfully');
    } else {
      console.error('[WorkflowRunner] Workflow failed with errors:', result.errors);
      process.exit(1);
    }
  } catch (err) {
    console.error('[WorkflowRunner] Unexpected error:', err);
    process.exit(1);
  }
}

main().catch(console.error);
