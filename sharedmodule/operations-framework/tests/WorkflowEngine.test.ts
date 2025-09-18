import { WorkflowEngine } from '../src/WorkflowEngine';
import { ExecutionContext } from '../src/execution/ExecutionContext';
import { OperationRegistry } from '../src/core/OperationRegistry';
import { BaseOperation } from '../src/core/BaseOperation';
import { OperationContext, OperationConfig, WorkflowDefinition, WorkflowStep } from '../src/types/operationTypes';
import { EventEmitter } from 'events';

// Mock operation for testing
class MockOperation extends BaseOperation {
  constructor(private readonly result: any = { success: true }) {
    super();
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<any> {
    return {
      success: true,
      data: this.result,
      metadata: { executionTime: 10 }
    };
  }

  protected validateParametersImpl(params: OperationConfig): any {
    return { isValid: true };
  }
}

class MockFailingOperation extends BaseOperation {
  constructor(private readonly error: string = 'Operation failed') {
    super();
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<any> {
    throw new Error(this.error);
  }

  protected validateParametersImpl(params: OperationConfig): any {
    return { isValid: true };
  }
}

describe('WorkflowEngine', () => {
  let workflowEngine: WorkflowEngine;
  let registry: OperationRegistry;
  let executionContext: ExecutionContext;
  let mockContext: OperationContext;

  beforeEach(() => {
    registry = new OperationRegistry();
    executionContext = new ExecutionContext();
    workflowEngine = new WorkflowEngine(registry, executionContext);

    mockContext = {
      id: 'test-context',
      browser: null,
      page: null,
      metadata: {
        startTime: new Date(),
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 }
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      },
      eventBus: new EventEmitter()
    };

    // Register mock operations
    registry.register('test-operation', new MockOperation({ data: 'test-result' }));
    registry.register('failing-operation', new MockFailingOperation());
    registry.register('conditional-operation', new MockOperation({ shouldProceed: true }));
  });

  describe('Workflow Definition', () => {
    it('should define a simple workflow successfully', () => {
      const workflow: WorkflowDefinition = {
        name: 'Simple Workflow',
        description: 'A simple test workflow',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation',
            parameters: { param1: 'value1' }
          }
        ]
      };

      const result = workflowEngine.defineWorkflow('simple-workflow', workflow);

      expect(result).toBe(true);
      expect(workflowEngine.hasWorkflow('simple-workflow')).toBe(true);
    });

    it('should not allow duplicate workflow names', () => {
      const workflow: WorkflowDefinition = {
        name: 'Duplicate Workflow',
        description: 'A duplicate workflow',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation'
          }
        ]
      };

      workflowEngine.defineWorkflow('duplicate', workflow);
      const result = workflowEngine.defineWorkflow('duplicate', workflow);

      expect(result).toBe(false);
    });

    it('should validate workflow structure', () => {
      const invalidWorkflow: WorkflowDefinition = {
        name: 'Invalid Workflow',
        description: 'An invalid workflow',
        steps: [] as any
      };

      expect(() => {
        workflowEngine.defineWorkflow('invalid', invalidWorkflow);
      }).toThrow('Invalid workflow definition');
    });
  });

  describe('Workflow Execution', () => {
    it('should execute a simple workflow successfully', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Simple Workflow',
        description: 'A simple test workflow',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation',
            parameters: { param1: 'value1' }
          }
        ]
      };

      workflowEngine.defineWorkflow('simple-workflow', workflow);
      const result = await workflowEngine.executeWorkflow('simple-workflow', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].data).toEqual({ data: 'test-result' });
    });

    it('should execute workflow with multiple steps', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Multi-step Workflow',
        description: 'A workflow with multiple steps',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation',
            parameters: { step: 1 }
          },
          {
            name: 'step2',
            operation: 'test-operation',
            parameters: { step: 2 }
          },
          {
            name: 'step3',
            operation: 'test-operation',
            parameters: { step: 3 }
          }
        ]
      };

      workflowEngine.defineWorkflow('multi-step', workflow);
      const result = await workflowEngine.executeWorkflow('multi-step', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].parameters).toEqual({ step: 1 });
      expect(result.results[1].parameters).toEqual({ step: 2 });
      expect(result.results[2].parameters).toEqual({ step: 3 });
    });

    it('should handle workflow execution errors', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Failing Workflow',
        description: 'A workflow that fails',
        steps: [
          {
            name: 'step1',
            operation: 'failing-operation'
          }
        ]
      };

      workflowEngine.defineWorkflow('failing-workflow', workflow);
      const result = await workflowEngine.executeWorkflow('failing-workflow', mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operation failed');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
    });

    it('should handle non-existent workflow', async () => {
      await expect(workflowEngine.executeWorkflow('non-existent', mockContext))
        .rejects
        .toThrow('Workflow non-existent not found');
    });
  });

  describe('Conditional Execution', () => {
    it('should execute steps based on conditions', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Conditional Workflow',
        description: 'A workflow with conditional steps',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation',
            parameters: { data: 'initial' }
          },
          {
            name: 'step2',
            operation: 'test-operation',
            parameters: { data: 'conditional' },
            condition: {
              type: 'data',
              field: 'data',
              operator: 'equals',
              value: 'initial'
            }
          }
        ]
      };

      workflowEngine.defineWorkflow('conditional-workflow', workflow);
      const result = await workflowEngine.executeWorkflow('conditional-workflow', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[1].parameters.data).toBe('conditional');
    });

    it('should skip steps when conditions are not met', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Skip Workflow',
        description: 'A workflow that skips steps',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation',
            parameters: { data: 'different' }
          },
          {
            name: 'step2',
            operation: 'test-operation',
            parameters: { data: 'conditional' },
            condition: {
              type: 'data',
              field: 'data',
              operator: 'equals',
              value: 'initial'
            }
          }
        ]
      };

      workflowEngine.defineWorkflow('skip-workflow', workflow);
      const result = await workflowEngine.executeWorkflow('skip-workflow', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].parameters.data).toBe('different');
    });

    it('should support multiple condition types', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Multi-condition Workflow',
        description: 'A workflow with different condition types',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation',
            parameters: { data: 'test' }
          },
          {
            name: 'step2',
            operation: 'test-operation',
            parameters: { data: 'success' },
            condition: {
              type: 'success',
              step: 'step1'
            }
          }
        ]
      };

      workflowEngine.defineWorkflow('multi-condition-workflow', workflow);
      const result = await workflowEngine.executeWorkflow('multi-condition-workflow', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });
  });

  describe('Parallel Execution', () => {
    it('should execute steps in parallel when specified', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Parallel Workflow',
        description: 'A workflow with parallel steps',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation',
            parameters: { data: 'parallel1' },
            parallel: true
          },
          {
            name: 'step2',
            operation: 'test-operation',
            parameters: { data: 'parallel2' },
            parallel: true
          }
        ]
      };

      workflowEngine.defineWorkflow('parallel-workflow', workflow);
      const result = await workflowEngine.executeWorkflow('parallel-workflow', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].parameters.data).toBe('parallel1');
      expect(result.results[1].parameters.data).toBe('parallel2');
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed steps according to retry policy', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Retry Workflow',
        description: 'A workflow with retry logic',
        steps: [
          {
            name: 'step1',
            operation: 'failing-operation',
            retry: {
              maxAttempts: 3,
              delay: 100
            }
          }
        ]
      };

      workflowEngine.defineWorkflow('retry-workflow', workflow);
      const result = await workflowEngine.executeWorkflow('retry-workflow', mockContext);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].attempts).toBe(3);
    });
  });

  describe('Workflow Management', () => {
    it('should list all defined workflows', () => {
      const workflow1: WorkflowDefinition = {
        name: 'Workflow 1',
        description: 'First workflow',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation'
          }
        ]
      };

      const workflow2: WorkflowDefinition = {
        name: 'Workflow 2',
        description: 'Second workflow',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation'
          }
        ]
      };

      workflowEngine.defineWorkflow('workflow1', workflow1);
      workflowEngine.defineWorkflow('workflow2', workflow2);

      const workflows = workflowEngine.listWorkflows();

      expect(workflows).toHaveLength(2);
      expect(workflows).toContain('workflow1');
      expect(workflows).toContain('workflow2');
    });

    it('should remove workflows', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation'
          }
        ]
      };

      workflowEngine.defineWorkflow('test-workflow', workflow);
      expect(workflowEngine.hasWorkflow('test-workflow')).toBe(true);

      workflowEngine.removeWorkflow('test-workflow');
      expect(workflowEngine.hasWorkflow('test-workflow')).toBe(false);
    });

    it('should get workflow definition', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation'
          }
        ]
      };

      workflowEngine.defineWorkflow('test-workflow', workflow);
      const retrieved = workflowEngine.getWorkflow('test-workflow');

      expect(retrieved).toEqual(workflow);
    });
  });

  describe('Workflow Events', () => {
    it('should emit workflow events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();
      const stepSpy = jest.fn();

      workflowEngine.on('workflowStarted', startSpy);
      workflowEngine.on('workflowCompleted', completeSpy);
      workflowEngine.on('stepCompleted', stepSpy);

      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation'
          }
        ]
      };

      workflowEngine.defineWorkflow('test-workflow', workflow);
      await workflowEngine.executeWorkflow('test-workflow', mockContext);

      expect(startSpy).toHaveBeenCalledWith({
        workflowName: 'test-workflow',
        timestamp: expect.any(Date)
      });

      expect(completeSpy).toHaveBeenCalledWith({
        workflowName: 'test-workflow',
        result: expect.objectContaining({ success: true }),
        executionTime: expect.any(Number)
      });

      expect(stepSpy).toHaveBeenCalledWith({
        workflowName: 'test-workflow',
        stepName: 'step1',
        result: expect.objectContaining({ success: true })
      });
    });
  });
});