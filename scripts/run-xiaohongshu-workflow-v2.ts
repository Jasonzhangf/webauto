import { runWorkflowById } from '../modules/workflow/src/runner';
import minimist from 'minimist';

async function main() {
  const args = minimist(process.argv.slice(2));
  const keyword = args.keyword || '手机膜';
  const targetCount = Number(args.count || 10);
  const sessionId = 'xiaohongshu_fresh';

  console.log(`[WorkflowRunner] Starting XHS workflow v2 for "${keyword}", count: ${targetCount}`);

  try {
    const result = await runWorkflowById('xiaohongshu-collect-v2', {
      sessionId,
      keyword,
      targetCount,
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
