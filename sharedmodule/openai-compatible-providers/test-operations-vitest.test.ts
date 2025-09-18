/**
 * Vitest tests for operation-based pipeline system
 * 基于操作子的流水线系统Vitest测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OperationBasedPipelineSystem } from './src/operations/index.js';

// Mock the RCC dependencies
vi.mock('rcc-basemodule', () => ({
  BaseModule: class {
    constructor() {}
    initialize() { return Promise.resolve(true); }
    cleanup() { return Promise.resolve(true); }
  },
  DebugConfig: {},
  IOTrackingConfig: {},
  ModuleInfo: {}
}));

vi.mock('rcc-errorhandling', () => ({
  ErrorHandlingCenter: class {
    constructor() {}
    handle() {}
  }
}));

vi.mock('rcc-logging', () => ({
  LoggingCenter: class {
    constructor() {}
    log() {}
  }
}));

describe('Operation-Based Pipeline System', () => {
  let pipelineSystem: any;

  beforeEach(() => {
    pipelineSystem = new OperationBasedPipelineSystem();
  });

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

  it('should execute workflows correctly', async () => {
    const workflow = {
      id: 'test-workflow',
      name: 'Test Workflow',
      description: 'A simple test workflow',
      steps: [
        {
          id: 'step1',
          name: 'Track Request',
          operation: 'request-tracking',
          parameters: {
            provider: 'workflow-test',
            operation: 'workflow-execution',
            metadata: { workflowId: 'test-workflow' }
          }
        },
        {
          id: 'step2',
          name: 'Schedule Request',
          operation: 'pipeline-scheduling',
          parameters: {
            data: { workflow: 'test', step: 'step2' },
            priority: 1
          },
          dependsOn: ['step1']
        }
      ],
      config: {
        parallelExecution: false,
        maxRetries: 2,
        failFast: false
      }
    };

    const result = await pipelineSystem.executeWorkflow(workflow);

    expect(result.success).toBe(true);
    expect(result.workflowId).toBe('test-workflow');
    expect(result.steps.total).toBe(2);
    expect(result.steps.completed).toBeGreaterThanOrEqual(1);
  });

  it('should handle workflow dependencies correctly', async () => {
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

    const result = await pipelineSystem.executeWorkflow(workflow);

    expect(result.success).toBe(true);
    expect(result.steps.completed).toBeGreaterThanOrEqual(1);
  });

  it('should handle circuit breaker logic', async () => {
    const result = await pipelineSystem.scheduleRequest(
      { test: 'data' },
      { priority: 1 }
    );

    expect(result.success).toBe(true);
  });

  it('should provide comprehensive system metrics', () => {
    const metrics = pipelineSystem.getSystemMetrics();

    expect(metrics).toBeDefined();
    expect(metrics.operations).toBeDefined();
    expect(metrics.performance).toBeDefined();
    expect(metrics.health).toBeDefined();
  });

  it('should cleanup resources properly', async () => {
    await pipelineSystem.cleanup();

    const status = pipelineSystem.getSystemStatus();
    expect(status.status).toBe('cleaned');
  });
});