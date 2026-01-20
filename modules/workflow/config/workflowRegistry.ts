import type { WorkflowDefinitionInput } from '../blocks/WorkflowExecutor.js';
import { xiaohongshuCollectWorkflowV2 } from '../definitions/xiaohongshu-collect-workflow-v2.js';
import { xiaohongshuCollectWorkflow } from '../definitions/xiaohongshu-collect-workflow.js';
import { xiaohongshuNoteCollectWorkflow } from '../definitions/xiaohongshu-note-collect.js';
import { xiaohongshuFullCollectWorkflowV3 } from '../definitions/xiaohongshu-full-collect-workflow-v3.js';
import { xiaohongshuPhase3CollectWorkflowV1 } from '../definitions/xiaohongshu-phase3-collect-workflow-v1.js';

const registry = new Map<string, WorkflowDefinitionInput>();

function register(def: WorkflowDefinitionInput, idOverride?: string) {
  const id = idOverride || def.id;
  if (!id) {
    throw new Error('Workflow definition missing id');
  }
  registry.set(id, { ...def, id });
}

// 注册已有的小红书相关 workflow 定义
register(xiaohongshuCollectWorkflowV2, 'xiaohongshu-collect-v2');
register(xiaohongshuCollectWorkflow, 'xiaohongshu-collect-v1');
register(xiaohongshuNoteCollectWorkflow, 'xiaohongshu-note-collect');
register(xiaohongshuFullCollectWorkflowV3, 'xiaohongshu-collect-full-v3');
register(xiaohongshuPhase3CollectWorkflowV1, 'xiaohongshu-collect-phase3-v1');

export function getWorkflowDefinition(id: string): WorkflowDefinitionInput | undefined {
  return registry.get(id);
}

export function listWorkflowIds(): string[] {
  return Array.from(registry.keys());
}
