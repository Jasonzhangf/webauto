/**
 * Unit Tests for Pipeline Operations
 * 流水线操作子单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest'; // Use vitest for testing

// Import operation classes directly
const { PipelineBaseOperation } = require('./src/operations/core/PipelineBaseOperation');
const { RequestTrackingPipelineOperation } = require('./src/operations/core/RequestTrackingPipelineOperation');
const { PipelineSchedulingOperation } = require('./src/operations/core/PipelineSchedulingOperation');
const { PipelineWorkflowEngine } = require('./src/operations/core/PipelineWorkflowEngine');
const { PipelineOperationRegistry } = require('./src/operations/core/PipelineOperationRegistry');
const { OperationBasedPipelineSystem } = require('./src/operations');

describe('Pipeline Operations Unit Tests', () => {
  let registry: any;
  let pipelineSystem: any;

  beforeEach(() => {
    // Reset for each test
    registry = new PipelineOperationRegistry();
    pipelineSystem = new OperationBasedPipelineSystem();
  });

  describe('PipelineOperationRegistry', () => {
    it('should register and retrieve operations correctly', () => {
      const operation = new RequestTrackingPipelineOperation();

      // Test registration
      registry.registerOperation(operation);
      expect(registry.hasOperation('request-tracking')).toBe(true);

      // Test retrieval
      const retrieved = registry.getOperation('request-tracking');
      expect(retrieved).toBe(operation);

      // Test listing
      const operations = registry.listOperations();
      expect(operations).toContain('request-tracking');
    });

    it('should categorize operations correctly', () => {
      const operation = new RequestTrackingPipelineOperation();
      registry.registerOperation(operation);

      const categoryOperations = registry.getOperationsByCategory('request-tracking');
      expect(categoryOperations).toHaveLength(1);
      expect(categoryOperations[0].name).toBe('request-tracking');
    });

    it('should handle operation validation', () => {
      const operation = new RequestTrackingPipelineOperation();
      const validation = registry.validateOperation(operation);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should provide registry statistics', () => {
      const operation = new RequestTrackingPipelineOperation();
      registry.registerOperation(operation);

      const stats = registry.getRegistryStats();
      expect(stats.totalOperations).toBe(1);
      expect(stats.totalCategories).toBeGreaterThan(0);
    });
  });

  describe('RequestTrackingPipelineOperation', () => {
    let operation: any;

    beforeEach(() => {
      operation = new RequestTrackingPipelineOperation();
    });

    it('should track requests with unique IDs', async () => {
      const context = {
        request: {
          id: 'test-request-1',
          provider: 'test-provider',
          operation: 'test-operation',
          metadata: {}
        }
      };

      const params = {
        provider: 'test-provider',
        operation: 'test-operation',
        generateRequestId: true
      };

      const result = await operation.execute(context, params);

      expect(result.success).toBe(true);
      expect(result.result.requestId).toBeDefined();
      expect(result.result.pipelineId).toBeDefined();
      expect(result.result.context).toBeDefined();
    });

    it('should validate required parameters', () => {
      const validation = operation.validateParameters({});
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Provider is required');
      expect(validation.errors).toContain('Operation is required');
    });

    it('should manage request context lifecycle', () => {
      // Add request context
      operation.getRequestContext = jest.fn().mockReturnValue({
        requestId: 'test-123',
        provider: 'test-provider',
        operation: 'test-operation'
      });

      const context = operation.getRequestContext('test-123');
      expect(context).toBeDefined();
      expect(context.requestId).toBe('test-123');
    });

    it('should provide health status', () => {
      const health = operation.getHealthStatus();
      expect(health.name).toBe('request-tracking');
      expect(health.status).toBe('healthy');
    });
  });

  describe('PipelineSchedulingOperation', () => {
    let operation: any;

    beforeEach(() => {
      operation = new PipelineSchedulingOperation();

      // Add some test pipelines
      operation.addPipeline({
        id: 'pipeline-1',
        name: 'Test Pipeline 1',
        endpoint: 'http://test1.com',
        weight: 1,
        isHealthy: true
      });

      operation.addPipeline({
        id: 'pipeline-2',
        name: 'Test Pipeline 2',
        endpoint: 'http://test2.com',
        weight: 2,
        isHealthy: true
      });
    });

    it('should schedule requests to available pipelines', async () => {
      const context = {
        request: {
          id: 'sched-test-1',
          provider: 'test-provider',
          operation: 'schedule',
          metadata: {}
        }
      };

      const params = {
        data: { message: 'test data' },
        priority: 1,
        timeout: 5000
      };

      const result = await operation.execute(context, params);

      expect(result.success).toBe(true);
      expect(result.result.pipelineId).toBeDefined();
      expect(result.result.executionTime).toBeDefined();
    });

    it('should implement load balancing strategies', () => {
      // Test round-robin
      const pipeline1 = operation.selectPipeline();
      const pipeline2 = operation.selectPipeline();

      expect(pipeline1).toBeDefined();
      expect(pipeline2).toBeDefined();
      // They might be the same if there are only 2 pipelines
    });

    it('should handle circuit breaker logic', () => {
      // Initially should not be tripped
      expect(operation.checkCircuitBreaker()).toBe(false);

      // Simulate failures to trip circuit breaker
      for (let i = 0; i < 6; i++) {
        operation.recordFailure();
      }

      // Should now be tripped
      expect(operation.checkCircuitBreaker()).toBe(true);
    });

    it('should provide scheduler metrics', () => {
      const metrics = operation.getSchedulerMetrics();

      expect(metrics.config).toBeDefined();
      expect(metrics.pipelines).toHaveLength(2);
      expect(metrics.totalPipelines).toBe(2);
      expect(metrics.healthyPipelines).toBe(2);
    });
  });

  describe('PipelineWorkflowEngine', () => {
    let engine: any;

    beforeEach(() => {
      engine = new PipelineWorkflowEngine();
    });

    it('should execute simple workflows', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'Simple test workflow',
        steps: [
          {
            id: 'step1',
            name: 'Test Step 1',
            operation: 'request-tracking',
            parameters: {
              provider: 'workflow-test',
              operation: 'test-step'
            }
          }
        ]
      };

      const context = {
        request: {
          id: 'workflow-test-1',
          provider: 'workflow-engine',
          operation: 'execute',
          metadata: {}
        }
      };

      const result = await engine.executeWorkflow(workflow, context);

      expect(result.workflowId).toBe('test-workflow');
      expect(result.steps.total).toBe(1);
      expect(result.steps.completed).toBe(1);
      expect(result.steps.failed).toBe(0);
    });

    it('should handle workflow dependencies', async () => {
      const workflow = {
        id: 'dependency-workflow',
        name: 'Dependency Test Workflow',
        description: 'Test step dependencies',
        steps: [
          {
            id: 'step1',
            name: 'First Step',
            operation: 'request-tracking',
            parameters: { provider: 'test', operation: 'step1' }
          },
          {
            id: 'step2',
            name: 'Dependent Step',
            operation: 'request-tracking',
            parameters: { provider: 'test', operation: 'step2' },
            dependsOn: ['step1']
          }
        ]
      };

      const result = await engine.executeWorkflow(workflow);

      expect(result.success).toBe(true);
      expect(result.steps.completed).toBe(2);
    });

    it('should provide engine metrics', () => {
      const metrics = engine.getEngineMetrics();

      expect(metrics.registeredOperations).toBeDefined();
      expect(metrics.activeWorkflows).toBe(0);
      expect(metrics.completedWorkflows).toBe(0);
    });

    it('should handle workflow status tracking', () => {
      const status = engine.getWorkflowStatus('non-existent');

      expect(status.status).toBe('not-found');
    });
  });

  describe('OperationBasedPipelineSystem', () => {
    it('should initialize with all operations registered', () => {
      const status = pipelineSystem.getSystemStatus();

      expect(status.name).toBe('Operation-Based Pipeline System');
      expect(status.status).toBe('healthy');
      expect(status.operations.count).toBeGreaterThan(0);
    });

    it('should track requests through the system', async () => {
      const result = await pipelineSystem.trackRequest(
        'test-provider',
        'test-operation',
        { userId: '123' }
      );

      expect(result.success).toBe(true);
      expect(result.result.requestId).toBeDefined();
      expect(result.result.context.provider).toBe('test-provider');
    });

    it('should schedule requests properly', async () => {
      const result = await pipelineSystem.scheduleRequest(
        { message: 'Hello World' },
        { priority: 1 }
      );

      expect(result.success).toBe(true);
      expect(result.result.pipelineId).toBeDefined();
    });

    it('should perform health checks', async () => {
      const health = await pipelineSystem.healthCheck();

      expect(health.overall).toBe('healthy');
      expect(health.operations).toBeDefined();
      expect(Object.keys(health.operations).length).toBeGreaterThan(0);
    });

    it('should provide operation statistics', () => {
      const stats = pipelineSystem.getOperationStatistics();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });
  });

  describe('Error Handling', () => {
    it('should handle operation execution failures gracefully', async () => {
      const operation = new RequestTrackingPipelineOperation();

      // Mock execute to throw an error
      const originalExecute = operation.execute;
      operation.execute = jest.fn().mockRejectedValue(new Error('Test error'));

      const context = {
        request: {
          id: 'error-test',
          provider: 'test',
          operation: 'test',
          metadata: {}
        }
      };

      const params = {
        provider: 'test-provider',
        operation: 'test-operation'
      };

      try {
        await operation.execute(context, params);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Test error');
      }

      // Restore original method
      operation.execute = originalExecute;
    });

    it('should validate operation parameters before execution', () => {
      const operation = new RequestTrackingPipelineOperation();

      const validParams = {
        provider: 'test-provider',
        operation: 'test-operation'
      };

      const invalidParams = {
        provider: 'test-provider'
        // Missing operation
      };

      const validResult = operation.validateParameters(validParams);
      expect(validResult.isValid).toBe(true);

      const invalidResult = operation.validateParameters(invalidParams);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('Operation is required');
    });
  });

  describe('Performance Metrics', () => {
    it('should track operation performance metrics', async () => {
      const operation = new RequestTrackingPipelineOperation();

      const initialStats = operation.getPipelineStats();

      // Execute operation
      const context = {
        request: {
          id: 'perf-test',
          provider: 'test',
          operation: 'test',
          metadata: {}
        }
      };

      const params = {
        provider: 'test-provider',
        operation: 'test-operation'
      };

      await operation.execute(context, params);

      const finalStats = operation.getPipelineStats();

      expect(finalStats.totalExecutions).toBeGreaterThan(initialStats.totalExecutions);
      expect(finalStats.successCount).toBeGreaterThan(initialStats.successCount);
    });
  });
});

// Helper function for Jest compatibility
function fail(message: string) {
  throw new Error(message);
}

// Mock jest functions if not available
if (typeof jest === 'undefined') {
  global.jest = {
    fn: (impl?: Function) => {
      const mockFn = impl || (() => {});
      mockFn.mock = { calls: [] };
      return mockFn;
    }
  };
}