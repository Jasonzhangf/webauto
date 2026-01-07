import { WorkflowExecutor } from '../modules/workflow/blocks/WorkflowExecutor';
import * as EnsureSession from '../modules/workflow/blocks/EnsureSession';
import * as EnsureLoginBlock from '../modules/workflow/blocks/EnsureLoginBlock';
import * as WaitSearchPermitBlock from '../modules/workflow/blocks/WaitSearchPermitBlock';
import * as GoToSearchBlock from '../modules/workflow/blocks/GoToSearchBlock';
import * as CollectSearchListBlock from '../modules/workflow/blocks/CollectSearchListBlock';
import * as OpenDetailBlock from '../modules/workflow/blocks/OpenDetailBlock';
import * as ExtractDetailBlock from '../modules/workflow/blocks/ExtractDetailBlock';
import * as ExpandCommentsBlock from '../modules/workflow/blocks/ExpandCommentsBlock';
import * as CloseDetailBlock from '../modules/workflow/blocks/CloseDetailBlock';
import { xiaohongshuCollectWorkflowV2 } from '../modules/workflow/definitions/xiaohongshu-collect-workflow-v2';
import minimist from 'minimist';

async function main() {
  const args = minimist(process.argv.slice(2));
  const keyword = args.keyword || '手机膜';
  const targetCount = Number(args.count || 10);
  const sessionId = 'xiaohongshu_fresh';

  console.log(`[WorkflowRunner] Starting XHS workflow v2 for "${keyword}", count: ${targetCount}`);

  const executor = new WorkflowExecutor();
  executor.registerBlock('EnsureSession', { execute: EnsureSession.execute });
  executor.registerBlock('EnsureLoginBlock', { execute: EnsureLoginBlock.execute });
  executor.registerBlock('WaitSearchPermitBlock', { execute: WaitSearchPermitBlock.execute });
  executor.registerBlock('GoToSearchBlock', { execute: GoToSearchBlock.execute });
  executor.registerBlock('CollectSearchListBlock', { execute: CollectSearchListBlock.execute });
  executor.registerBlock('OpenDetailBlock', { execute: OpenDetailBlock.execute });
  executor.registerBlock('ExtractDetailBlock', { execute: ExtractDetailBlock.execute });
  executor.registerBlock('ExpandCommentsBlock', { execute: ExpandCommentsBlock.execute });
  executor.registerBlock('CloseDetailBlock', { execute: CloseDetailBlock.execute });

  const workflowDef = JSON.parse(JSON.stringify(xiaohongshuCollectWorkflowV2));

  workflowDef.steps.forEach((step: any) => {
    if (step.input) {
      if (step.input.profileId === '$sessionId') step.input.profileId = sessionId;
      if (step.input.sessionId === '$sessionId') step.input.sessionId = sessionId;
      if (step.input.keyword === '$keyword') step.input.keyword = keyword;
      if (step.input.targetCount === '$targetCount') step.input.targetCount = targetCount;
    }
  });

  try {
    const result = await executor.execute(workflowDef);
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
