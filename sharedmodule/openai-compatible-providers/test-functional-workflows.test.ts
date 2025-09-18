/**
 * Functional Tests for Operation-Based Pipeline System
 * 基于操作子的流水线系统功能测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OperationBasedPipelineSystem } from './src/operations/index.js';

// Mock the RCC dependencies
const mockRCC = () => {
  global.rcc = {
    basemodule: {
      BaseModule: class {
        constructor() {}
        initialize() { return Promise.resolve(true); }
        cleanup() { return Promise.resolve(true); }
      },
      DebugConfig: {},
      IOTrackingConfig: {},
      ModuleInfo: {}
    },
    errorhandling: {
      ErrorHandlingCenter: class {
        constructor() {}
        handle() {}
      }
    },
    logging: {
      LoggingCenter: class {
        constructor() {}
        log() {}
      }
    }
  };
};

describe('Functional Pipeline Workflows', () => {
  let pipelineSystem: OperationBasedPipelineSystem;

  beforeEach(() => {
    mockRCC();
    pipelineSystem = new OperationBasedPipelineSystem();
  });

  describe('End-to-End Request Processing', () => {
    it('should process complete request lifecycle', async () => {
      // Track initial request
      const trackingResult = await pipelineSystem.trackRequest(
        'functional-test-provider',
        'lifecycle-test',
        { userId: 'user-123', action: 'complete-lifecycle' }
      );

      expect(trackingResult.success).toBe(true);
      const requestId = trackingResult.result.requestId;

      // Schedule processing of tracked request
      const schedulingResult = await pipelineSystem.scheduleRequest(
        {
          requestId,
          data: { message: 'Processing tracked request' },
          timestamp: Date.now()
        },
        { priority: 1, timeout: 10000 }
      );

      expect(schedulingResult.success).toBe(true);
      expect(schedulingResult.result.pipelineId).toBeDefined();

      // Verify system health after processing
      const health = await pipelineSystem.healthCheck();
      expect(health.overall).toBe('healthy');
      expect(health.operations['request-tracking'].status).toBe('healthy');
      expect(health.operations['pipeline-scheduling'].status).toBe('healthy');
    });

    it('should handle complex multi-step workflows', async () => {
      const complexWorkflow = {
        id: 'complex-functional-workflow',
        name: 'Complex Functional Workflow',
        description: 'Multi-step workflow with dependencies and parallel processing',
        steps: [
          {
            id: 'init',
            name: 'Initialize Request',
            operation: 'request-tracking',
            parameters: {
              provider: 'complex-workflow',
              operation: 'initialization',
              metadata: { workflowType: 'complex', phase: 'init' }
            }
          },
          {
            id: 'process-1',
            name: 'Process Data Step 1',
            operation: 'pipeline-scheduling',
            parameters: {
              data: { step: 1, data: 'sample-data-1' },
              priority: 2
            },
            dependsOn: ['init']
          },
          {
            id: 'process-2',
            name: 'Process Data Step 2',
            operation: 'pipeline-scheduling',
            parameters: {
              data: { step: 2, data: 'sample-data-2' },
              priority: 1
            },
            dependsOn: ['init']
          },
          {
            id: 'finalize',
            name: 'Finalize Request',
            operation: 'request-tracking',
            parameters: {
              provider: 'complex-workflow',
              operation: 'finalization',
              metadata: { workflowType: 'complex', phase: 'complete' }
            },
            dependsOn: ['process-1', 'process-2']
          }
        ],
        config: {
          parallelExecution: true,
          maxRetries: 3,
          failFast: false
        }
      };

      const result = await pipelineSystem.executeWorkflow(complexWorkflow);

      expect(result.success).toBe(true);
      expect(result.workflowId).toBe('complex-functional-workflow');
      expect(result.steps.total).toBe(4);
      expect(result.steps.completed).toBe(4);
      expect(result.steps.failed).toBe(0);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle error recovery in workflows', async () => {
      const errorRecoveryWorkflow = {
        id: 'error-recovery-workflow',
        name: 'Error Recovery Workflow',
        description: 'Workflow with error handling and recovery',
        steps: [
          {
            id: 'setup',
            name: 'Setup Phase',
            operation: 'request-tracking',
            parameters: {
              provider: 'error-recovery',
              operation: 'setup',
              metadata: { recoveryMode: true }
            }
          },
          {
            id: 'simulate-failure',
            name: 'Simulate Failure',
            operation: 'pipeline-scheduling',
            parameters: {
              data: { shouldFail: true },
              priority: 1
            },
            dependsOn: ['setup']
          },
          {
            id: 'recovery',
            name: 'Recovery Step',
            operation: 'request-tracking',
            parameters: {
              provider: 'error-recovery',
              operation: 'recovery',
              metadata: { recoveryAttempt: 1 }
            },
            dependsOn: ['simulate-failure']
          }
        ],
        config: {
          parallelExecution: false,
          maxRetries: 2,
          failFast: false
        }
      };

      const result = await pipelineSystem.executeWorkflow(errorRecoveryWorkflow);

      // Should complete even with some step failures due to retry logic
      expect(result.workflowId).toBe('error-recovery-workflow');
      expect(result.steps.total).toBe(3);
      expect(result.steps.completed).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent request processing', async () => {
      const concurrentRequests = 10;
      const promises = [];

      // Launch multiple concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          pipelineSystem.scheduleRequest(
            { requestId: `concurrent-${i}`, data: { index: i } },
            { priority: i % 3 + 1 }
          )
        );
      }

      // Wait for all requests to complete
      const results = await Promise.allSettled(promises);

      // Verify all requests were processed
      const successfulRequests = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      expect(successfulRequests).toBeGreaterThan(0);

      // Check system metrics after load
      const metrics = pipelineSystem.getSystemMetrics();
      expect(metrics.operations).toBeDefined();
      expect(metrics.performance).toBeDefined();
    });

    it('should maintain performance under sustained load', async () => {
      const loadTestDuration = 2000; // 2 seconds (reduced from 5)
      const requestInterval = 100; // Request every 100ms
      const startTime = Date.now();
      let requestCount = 0;

      // Sustained load test
      const loadTestInterval = setInterval(async () => {
        if (Date.now() - startTime < loadTestDuration) {
          await pipelineSystem.trackRequest(
            'load-test-provider',
            `load-test-operation-${requestCount++}`,
            { loadTest: true, timestamp: Date.now() }
          );
        }
      }, requestInterval);

      // Wait for load test to complete
      await new Promise(resolve => setTimeout(resolve, loadTestDuration));
      clearInterval(loadTestInterval);

      // Verify system remains healthy
      const health = await pipelineSystem.healthCheck();
      expect(health.overall).toBe('healthy');

      // Check statistics
      const stats = pipelineSystem.getOperationStatistics();
      expect(stats['request-tracking']).toBeDefined();
      expect(stats['request-tracking'].totalExecutions).toBeGreaterThan(0);
    }, 5000); // 5 second timeout for this test
  });

  describe('System Integration', () => {
    it('should provide comprehensive system monitoring', async () => {
      // Execute various operations to generate monitoring data
      await pipelineSystem.trackRequest('monitor-test', 'operation-1', { test: true });
      await pipelineSystem.scheduleRequest({ test: 'data' }, { priority: 1 });

      const monitoringWorkflow = {
        id: 'monitoring-workflow',
        name: 'Monitoring Test Workflow',
        steps: [
          {
            id: 'monitor-step',
            name: 'Monitoring Step',
            operation: 'request-tracking',
            parameters: { provider: 'monitor', operation: 'test' }
          }
        ]
      };

      await pipelineSystem.executeWorkflow(monitoringWorkflow);

      // Check comprehensive monitoring capabilities
      const status = pipelineSystem.getSystemStatus();
      expect(status.name).toBe('Operation-Based Pipeline System');
      expect(status.operations.count).toBeGreaterThan(0);
      expect(status.performance.uptime).toBeGreaterThan(0);

      const metrics = pipelineSystem.getSystemMetrics();
      expect(metrics.operations.count).toBeGreaterThan(0);
      expect(metrics.performance.uptime).toBeGreaterThan(0);
      expect(metrics.health.overall).toBe('healthy');

      const stats = pipelineSystem.getOperationStatistics();
      expect(Object.keys(stats).length).toBeGreaterThan(0);
    });

    it('should handle graceful system cleanup', async () => {
      // Generate some activity
      await pipelineSystem.trackRequest('cleanup-test', 'pre-cleanup', { cleanup: true });
      await pipelineSystem.scheduleRequest({ cleanup: 'data' }, { priority: 1 });

      // Perform system cleanup
      await pipelineSystem.cleanup();

      // Verify cleanup status
      const status = pipelineSystem.getSystemStatus();
      expect(status.status).toBe('cleaned');

      // System should still be operational after cleanup
      const postCleanupResult = await pipelineSystem.trackRequest(
        'post-cleanup-test',
        'validation',
        { postCleanup: true }
      );

      expect(postCleanupResult.success).toBe(true);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should simulate real API request processing', async () => {
      const apiRequestWorkflow = {
        id: 'api-request-workflow',
        name: 'API Request Processing Workflow',
        description: 'Simulate real-world API request processing pipeline',
        steps: [
          {
            id: 'auth',
            name: 'Authentication',
            operation: 'request-tracking',
            parameters: {
              provider: 'api-gateway',
              operation: 'authenticate',
              metadata: {
                userId: 'user-456',
                apiKey: 'masked-api-key',
                requestPath: '/api/v1/process'
              }
            }
          },
          {
            id: 'validation',
            name: 'Request Validation',
            operation: 'pipeline-scheduling',
            parameters: {
              data: {
                endpoint: '/api/v1/process',
                method: 'POST',
                payload: { data: 'sample-payload' }
              },
              priority: 2
            },
            dependsOn: ['auth']
          },
          {
            id: 'processing',
            name: 'Data Processing',
            operation: 'pipeline-scheduling',
            parameters: {
              data: {
                processingStep: 'transform',
                inputData: { sample: 'data' }
              },
              priority: 1
            },
            dependsOn: ['validation']
          },
          {
            id: 'response',
            name: 'Response Generation',
            operation: 'request-tracking',
            parameters: {
              provider: 'api-gateway',
              operation: 'generate-response',
              metadata: {
                statusCode: 200,
                responseTime: 45,
                processed: true
              }
            },
            dependsOn: ['processing']
          }
        ],
        config: {
          parallelExecution: false,
          maxRetries: 1,
          failFast: true
        }
      };

      const result = await pipelineSystem.executeWorkflow(apiRequestWorkflow);

      expect(result.success).toBe(true);
      expect(result.workflowId).toBe('api-request-workflow');
      expect(result.steps.total).toBe(4);
      expect(result.steps.completed).toBe(4);
      expect(result.executionTime).toBeGreaterThan(0);
    });
  });
});