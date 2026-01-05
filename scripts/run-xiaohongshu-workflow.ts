import { WorkflowExecutor } from '../modules/workflow/blocks/WorkflowExecutor';
import * as StartBrowserService from '../modules/workflow/blocks/StartBrowserService';
import * as EnsureSession from '../modules/workflow/blocks/EnsureSession';
import * as XiaohongshuCrawlerBlock from '../modules/workflow/blocks/XiaohongshuCrawlerBlock';
import { xiaohongshuCollectWorkflow } from '../modules/workflow/definitions/xiaohongshu-collect-workflow';
import minimist from 'minimist';

async function main() {
  const args = minimist(process.argv.slice(2));
  const keyword = args.keyword || 'oppo小平板';
  const targetCount = args.count || 50;
  const sessionId = 'xiaohongshu_fresh';

  console.log(`[WorkflowRunner] Starting workflow for "${keyword}", count: ${targetCount}`);

  // 初始化 Executor
  const executor = new WorkflowExecutor();
  executor.registerBlock('StartBrowserService', { execute: StartBrowserService.execute });
  executor.registerBlock('EnsureSession', { execute: EnsureSession.execute });
  executor.registerBlock('XiaohongshuCrawlerBlock', { execute: XiaohongshuCrawlerBlock.execute });

  // 动态注入参数
  // 深拷贝 definition 以免修改原对象
  const workflowDef = JSON.parse(JSON.stringify(xiaohongshuCollectWorkflow));
  
  // 遍历步骤，替换变量
  // 注意：WorkflowExecutor 的 context 是逐步累积的，但第一步通常需要外部输入。
  // 这里我们在 Step Input 中直接填入值。
  
  workflowDef.steps.forEach((step: any) => {
    if (step.input) {
      if (step.input.profileId === '$sessionId') step.input.profileId = sessionId;
      if (step.input.sessionId === '$sessionId') step.input.sessionId = sessionId;
      if (step.input.keyword === '$keyword') step.input.keyword = keyword;
      if (step.input.targetCount === '$targetCount') step.input.targetCount = Number(targetCount);
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
