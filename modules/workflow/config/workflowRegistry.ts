import type { WorkflowDefinitionInput } from '../blocks/WorkflowExecutor';
import { xiaohongshuCollectWorkflowV2 } from '../definitions/xiaohongshu-collect-workflow-v2';
import { xiaohongshuCollectWorkflow } from '../definitions/xiaohongshu-collect-workflow';
import { xiaohongshuNoteCollectWorkflow } from '../definitions/xiaohongshu-note-collect';

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

export function getWorkflowDefinition(id: string): WorkflowDefinitionInput | undefined {
  return registry.get(id);
}

export function listWorkflowIds(): string[] {
  return Array.from(registry.keys());
}
