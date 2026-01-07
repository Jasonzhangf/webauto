/**
 * Workflow Block Executor
 *
 * 编排和执行 workflow blocks
 */

import { logWorkflowEvent } from '../../logging/src/index.js';

export interface BlockExecutor {
  execute(input: any): Promise<any>;
}

export interface WorkflowStep {
  blockName: string;
  input: any;
}

export interface WorkflowDefinitionInput {
  id?: string;
  name?: string;
  steps: WorkflowStep[];
}

export interface WorkflowExecutionResult {
  results: any[];
  errors: string[];
  success: boolean;
}

/**
 * Workflow 执行器
 */
export class WorkflowExecutor {
  private blocks: Map<string, BlockExecutor> = new Map();

  registerBlock(name: string, executor: BlockExecutor) {
    this.blocks.set(name, executor);
  }

  async execute(definition: WorkflowDefinitionInput): Promise<WorkflowExecutionResult> {
    const results: any[] = [];
    const errors: string[] = [];
    let context: any = {};
    const workflowId = definition.id || 'anonymous-workflow';
    const workflowName = definition.name || workflowId;

    for (let index = 0; index < definition.steps.length; index += 1) {
      const step = definition.steps[index];
      const block = this.blocks.get(step.blockName);

      if (!block) {
        const error = `Block not found: ${step.blockName}`;
        errors.push(error);
        logWorkflowEvent({
          workflowId,
          workflowName,
          stepIndex: index,
          stepName: step.blockName,
          status: 'error',
          error,
        });
        continue;
      }

      const resolvedInput = this.resolveInput(step.input, context);
      const sessionId = resolvedInput.sessionId || resolvedInput.profileId || context.sessionId;

      logWorkflowEvent({
        workflowId,
        workflowName,
        stepIndex: index,
        stepName: step.blockName,
        status: 'start',
        sessionId,
        profileId: resolvedInput.profileId,
      });

      try {
        const result = await block.execute(resolvedInput);

        if (result?.error) {
          errors.push(`${step.blockName}: ${result.error}`);
        }

        results.push(result);
        context = { ...context, ...result };

        logWorkflowEvent({
          workflowId,
          workflowName,
          stepIndex: index,
          stepName: step.blockName,
          status: result?.error ? 'error' : 'success',
          sessionId,
          profileId: resolvedInput.profileId,
          error: result?.error,
          anchor: result?.anchor,
          meta: {
            success: !result?.error,
          },
        });
      } catch (error: any) {
        const errorMsg = `${step.blockName} execution failed: ${error.message}`;
        errors.push(errorMsg);
        logWorkflowEvent({
          workflowId,
          workflowName,
          stepIndex: index,
          stepName: step.blockName,
          status: 'error',
          sessionId,
          profileId: resolvedInput.profileId,
          error: errorMsg,
        });
      }
    }

    return {
      results,
      errors,
      success: errors.length === 0
    };
  }

  private resolveInput(input: any, context: any): any {
    if (typeof input === 'string' && input.startsWith('$')) {
      const key = input.substring(1);
      return context[key];
    }

    if (typeof input === 'object' && input !== null) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(input)) {
        resolved[key] = this.resolveInput(value, context);
      }
      return resolved;
    }

    return input;
  }
}
