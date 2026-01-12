import { WorkflowExecutor, type WorkflowExecutionResult } from './WorkflowExecutor.js';
import { getWorkflowDefinition } from '../config/workflowRegistry.js';

export interface CallWorkflowInput {
  workflowId: string;
  context?: any;
  mergeMode?: 'merge' | 'namespace';
  stopOnFailure?: boolean;
}

export interface CallWorkflowOutput {
  success: boolean;
  error?: string;
  childResult?: WorkflowExecutionResult;
  contextPatch?: any;
}

export async function execute(input: CallWorkflowInput): Promise<CallWorkflowOutput> {
  const { workflowId, context, mergeMode = 'merge', stopOnFailure = true } = input;
  if (!workflowId) {
    return { success: false, error: 'workflowId is required' };
  }

  const def = getWorkflowDefinition(workflowId);
  if (!def) {
    return { success: false, error: `Workflow not found: ${workflowId}` };
  }

  const executor = new WorkflowExecutor();
  // 由上层统一注册 Block 集（这里不做默认注册），只负责执行定义
  const initialContext = context || {};
  const childResult = await executor.execute(def, initialContext);

  if (!childResult.success && stopOnFailure) {
    return {
      success: false,
      error: `Child workflow failed: ${workflowId}`,
      childResult,
    };
  }

  let contextPatch: any = {};
  if (mergeMode === 'namespace') {
    contextPatch = { [workflowId]: childResult };
  } else {
    // merge 模式：简单暴露最后一步输出（如果存在），否则只暴露 success
    const lastStep = childResult.results[childResult.results.length - 1] || {};
    contextPatch = { ...lastStep };
  }

  return {
    success: true,
    childResult,
    contextPatch,
  };
}
