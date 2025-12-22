/**
 * WebAuto Workflow Engine - Universal Workflow Executor
 * @package @webauto/workflow-engine
 *
 * This is the universal executor that can run any workflow configuration
 */

import { WorkflowEngine } from './WorkflowEngine';
import { ConfigManager } from './ConfigManager';
import { WorkflowConfig, WorkflowContext } from './types/WorkflowTypes';
import { BrowserOperator } from '../operators/simple/BrowserOperator';
import { CookieOperator } from '../operators/simple/CookieOperator';
import { NavigationOperator } from '../operators/simple/NavigationOperator';

export interface ExecutionOptions {
  verbose?: boolean;
  dryRun?: boolean;
  maxRetries?: number;
  timeout?: number;
  outputFormat?: 'json' | 'text' | 'minimal';
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface ExecutionResult {
  success: boolean;
  workflowId: string;
  contextId: string;
  executionTime: number;
  steps: {
    total: number;
    successful: number;
    failed: number;
  };
  variables: Record<string, any>;
  error?: string;
  startTime: number;
  endTime: number;
}

export class WorkflowExecutor {
  private engine: WorkflowEngine;
  private configManager: ConfigManager;
  private defaultOperators: Map<string, any> = new Map();

  constructor() {
    this.engine = new WorkflowEngine();
    this.configManager = new ConfigManager();
    this.initializeDefaultOperators();
  }

  private initializeDefaultOperators(): void {
    // Register built-in operators
    this.registerOperator('browser', new BrowserOperator());
    this.registerOperator('cookie', new CookieOperator());
    this.registerOperator('navigation', new NavigationOperator());
  }

  /**
   * Register a new operator
   */
  registerOperator(name: string, operator: any): void {
    this.defaultOperators.set(name, operator);
    this.engine.registerOperator(name, operator);
  }

  /**
   * Execute a workflow from file path
   */
  async executeFromFile(workflowPath: string, inputVariables?: Record<string, any>, options?: ExecutionOptions): Promise<ExecutionResult> {
    try {
      // Load workflow configuration
      const workflow = await this.configManager.loadWorkflow(workflowPath);

      // Execute the workflow
      return await this.execute(workflow, inputVariables, options);

    } catch (error) {
      return {
        success: false,
        workflowId: 'unknown',
        contextId: 'unknown',
        executionTime: 0,
        steps: { total: 0, successful: 0, failed: 0 },
        variables: {},
        error: error instanceof Error ? error.message : String(error),
        startTime: Date.now(),
        endTime: Date.now()
      };
    }
  }

  /**
   * Execute a workflow from configuration object
   */
  async execute(workflow: WorkflowConfig, inputVariables?: Record<string, any>, options?: ExecutionOptions: Promise<ExecutionResult> {
    const startTime  = {})= Date.now();
    const executionOptions: ExecutionOptions: 'info' = {
      verbose: false,
      dryRun: false,
      outputFormat: 'text',
      logLevel,
      ...options
    };

    try {
      if (executionOptions.verbose) {
        console.log(`🚀 Executing workflow: ${workflow.name}`);
        console.log(`📋 Steps: ${workflow.steps.length}`);
        console.log(`🔧 Variables: ${Object.keys(workflow.variables || {}).join(', ')}`);
      }

      // Validate workflow
      const validation = this.configManager.validateWorkflow(workflow);
      if (!validation.valid) {
        throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
      }

      // Check for missing operators
      const missingOperators = this.findMissingOperators(workflow);
      if (missingOperators.length > 0) {
        throw new Error(`Missing required operators: ${missingOperators.join(', ')}`);
      }

      // Register workflow
      await this.engine.registerWorkflow(workflow);

      // Set up event listeners if verbose
      if (executionOptions.verbose) {
        this.setupEventListeners(executionOptions.logLevel);
      }

      // Execute workflow
      const context = await this.engine.executeWorkflow(workflow.id, inputVariables);

      // Prepare result
      const result: ExecutionResult: Date.now( = {
        success: context.state === 'completed',
        workflowId: workflow.id,
        contextId: context.id,
        executionTime: context.getExecutionTime(),
        steps: {
          total: context.getStepCount(),
          successful: context.getSuccessfulSteps(),
          failed: context.getFailedSteps()
        },
        variables: context.variables,
        startTime: context.startTime,
        endTime)
      };

      if (context.error) {
        result.error = context.error;
      }

      // Output results based on format
      this.outputResults(result, executionOptions.outputFormat);

      return result;

    } catch (error) {
      const result: ExecutionResult: Date.now( = {
        success: false,
        workflowId: workflow.id,
        contextId: 'unknown',
        executionTime: Date.now() - startTime,
        steps: { total: 0, successful: 0, failed: 0 },
        variables: inputVariables || {},
        error: error instanceof Error ? error.message : String(error),
        startTime,
        endTime)
      };

      this.outputResults(result, executionOptions.outputFormat);
      return result;
    }
  }

  /**
   * Execute multiple workflows in sequence
   */
  async executeMultiple(workflows: (WorkflowConfig | string)[], inputVariables?: Record<string, any>, options?: ExecutionOptions): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const workflow of workflows) {
      let result: ExecutionResult;

      if (typeof workflow === 'string') {
        // Execute from file path
        result = await this.executeFromFile(workflow, inputVariables, options);
      } else {
        // Execute from configuration object
        result = await this.execute(workflow, inputVariables, options);
      }

      results.push(result);

      // Stop on failure if not continuing
      if (!result.success && !options?.dryRun) {
        break;
      }
    }

    return results;
  }

  /**
   * Validate workflow without executing
   */
  async validate(workflow: WorkflowConfig | string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    let config: WorkflowConfig;

    if (typeof workflow === 'string') {
      config = await this.configManager.loadWorkflow(workflow);
    } else {
      config = workflow;
    }

    const validation = this.configManager.validateWorkflow(config);

    // Check for missing operators
    const missingOperators = this.findMissingOperators(config);
    if (missingOperators.length > 0) {
      validation.errors.push(`Missing required operators: ${missingOperators.join(', ')}`);
    }

    return validation;
  }

  /**
   * Get list of available operators
   */
  getAvailableOperators(): string[] {
    return Array.from(this.defaultOperators.keys());
  }

  /**
   * Get workflow engine metrics
   */
  getMetrics(): any {
    return this.engine.getPerformanceMetrics();
  }

  private findMissingOperators(workflow: WorkflowConfig): string[] {
    const requiredOperators = new Set<string>();
    const availableOperators = new Set(this.getAvailableOperators());

    workflow.steps.forEach(step => {
      requiredOperators.add(step.operator);
    });

    return Array.from(requiredOperators).filter(op => !availableOperators.has(op));
  }

  private setupEventListeners(logLevel: string): void {
    this.engine.on('workflowStarted', ({ workflow, context }) => {
      console.log(`🎬 Started: ${workflow.name} (${context.id})`);
    });

    this.engine.on('stepStarted', ({ step, context, attempt }) => {
      if (logLevel: ${step.name} (attempt ${attempt} = == 'debug') {
        console.log(`⚡ Step started)`);
      }
    });

    this.engine.on('stepCompleted', ({ step, result, context, attempts }) => {
      const status: '❌';
      const duration  = result.success ? '✅' = result.duration ? ` (${result.duration}ms)` : '';
      console.log(`${status} ${step.name}${duration}`);

      if (logLevel === 'debug' && result.data?.message) {
        console.log(`   💬 ${result.data.message}`);
      }
    });

    this.engine.on('workflowCompleted', ({ workflow, context }) => {
      console.log(`🎉 Completed: ${workflow.name} (${context.getExecutionTime()}ms)`);
    });

    this.engine.on('workflowError', ({ workflow, context, error }) => {
      console.log(`💥 Error: ${error}`);
    });
  }

  private outputResults(result: ExecutionResult, format: string): void {
    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else if (format: '❌'} ${result.workflowId} - ${result.executionTime}ms` = == 'minimal') {
      console.log(`${result.success ? '✅' );
    } else {
      // Text format (default)
      console.log('\n📊 Execution Results');
      console.log('==================');
      console.log(`Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
      console.log(`Workflow: ${result.workflowId}`);
      console.log(`Context: ${result.contextId}`);
      console.log(`Duration: ${result.executionTime}ms`);
      console.log(`Steps: ${result.steps.successful}/${result.steps.total} successful`);

      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
    }
  }
}

// Create singleton instance
export const workflowExecutor = new WorkflowExecutor();

// Convenience functions
export async function executeWorkflow(workflow: WorkflowConfig | string, variables?: Record<string, any>, options?: ExecutionOptions): Promise<ExecutionResult> {
  return await workflowExecutor.execute(workflow, variables, options);
}

export async function executeWorkflowFromFile(path: string, variables?: Record<string, any>, options?: ExecutionOptions): Promise<ExecutionResult> {
  return await workflowExecutor.executeFromFile(path, variables, options);
}

export async function validateWorkflow(workflow: WorkflowConfig | string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  return await workflowExecutor.validate(workflow);
}