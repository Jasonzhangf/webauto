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
  continueOnError?: boolean;
}

export interface WorkflowDefinitionInput {
  id?: string;
  name?: string;
  steps: WorkflowStep[];
}

export interface WorkflowStepTrace {
  index: number;
  blockName: string;
  input: any;
  output: any;
  error?: string;
  contextAfterStep: any;
}

export interface WorkflowExecutionResult {
  results: any[];
  errors: string[];
  success: boolean;
  steps: WorkflowStepTrace[];
}

/**
 * Workflow 执行器
 */
export class WorkflowExecutor {
  private blocks: Map<string, BlockExecutor> = new Map();

  registerBlock(name: string, executor: BlockExecutor) {
    this.blocks.set(name, executor);
  }

  async execute(definition: WorkflowDefinitionInput, initialContext: any = {}): Promise<WorkflowExecutionResult> {
    const results: any[] = [];
    const errors: string[] = [];
    const steps: WorkflowStepTrace[] = [];
    let context: any = { ...(initialContext || {}) };
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
      let stepOutput: any = undefined;
      let stepError: string | undefined;

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
        stepOutput = result;

        const hasError = Boolean(result?.error) || result?.success === false;
        if (hasError) {
          stepError = `${step.blockName}: ${result?.error || 'success=false'}`;
          errors.push(stepError);
        }

        results.push(result);
        context = { ...context, ...result };

        logWorkflowEvent({
          workflowId,
          workflowName,
          stepIndex: index,
          stepName: step.blockName,
          status: hasError ? 'error' : 'success',
          sessionId,
          profileId: resolvedInput.profileId,
          error: result?.error,
          anchor: result?.anchor,
          meta: {
            success: !hasError,
            inputSummary: this.buildInputSummary(resolvedInput),
          },
        });

        // 开发阶段：遇到 error 或 success=false 立即停止后续步骤，避免“错误后继续跑”导致污染/误操作。
        if (hasError && !step.continueOnError) {
          break;
        }
      } catch (error: any) {
        const errorMsg = `${step.blockName} execution failed: ${error?.message || String(error)}`;
        stepError = errorMsg;
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

        if (!step.continueOnError) {
          // fail-fast
          break;
        }
      } finally {
        steps.push({
          index,
          blockName: step.blockName,
          input: resolvedInput,
          output: stepOutput,
          error: stepError,
          contextAfterStep: { ...context },
        });
      }
    }

    return {
      results,
      errors,
      success: errors.length === 0,
      steps,
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

  private buildInputSummary(input: any): any {
    if (input == null || typeof input !== 'object') return input;
    const summary: any = {};
    for (const [key, value] of Object.entries(input)) {
      if (value == null) {
        summary[key] = value;
      } else if (Array.isArray(value)) {
        summary[key] = { type: 'array', length: value.length };
      } else if (typeof value === 'string') {
        summary[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
      } else if (typeof value === 'object') {
        summary[key] = { type: 'object', keys: Object.keys(value) };
      } else {
        summary[key] = value;
      }
    }
    return summary;
  }
}
