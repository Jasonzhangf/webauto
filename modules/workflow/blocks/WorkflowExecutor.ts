/**
 * Workflow Block Executor
 *
 * 编排和执行 workflow blocks
 */

export interface BlockExecutor {
  execute(input: any): Promise<any>;
}

export interface WorkflowStep {
  blockName: string;
  input: any;
}

export interface WorkflowDefinitionInput {
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

    for (const step of definition.steps) {
      const block = this.blocks.get(step.blockName);

      if (!block) {
        const error = `Block not found: ${step.blockName}`;
        errors.push(error);
        continue;
      }

      try {
        const input = this.resolveInput(step.input, context);
        const result = await block.execute(input);

        if (result.error) {
          errors.push(`${step.blockName}: ${result.error}`);
        }

        results.push(result);
        context = { ...context, ...result };
      } catch (error: any) {
        const errorMsg = `${step.blockName} execution failed: ${error.message}`;
        errors.push(errorMsg);
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
