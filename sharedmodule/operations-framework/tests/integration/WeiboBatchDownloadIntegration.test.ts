import { WeiboJSONBatchProcessor } from '../../src/micro-operations/WeiboOperations';
import { WorkflowEngine } from '../../src/core/WorkflowEngine';
import { TaskOrchestrator } from '../../src/core/TaskOrchestrator';
import { OperationRegistry } from '../../src/core/OperationRegistry';
import { OperationContext, OperationConfig, WorkflowDefinition, TaskDefinition } from '../../src/types';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Weibo Batch Download Integration Tests', () => {
  let workflowEngine: WorkflowEngine;
  let taskOrchestrator: TaskOrchestrator;
  let operationRegistry: OperationRegistry;
  let weiboProcessor: WeiboJSONBatchProcessor;
  let mockContext: OperationContext;

  // Test data setup
  const testWeiboData = {
    posts: Array.from({ length: 50 }, (_, i) => ({
      id: `post${i + 1}`,
      text: `这是第${i + 1}条测试微博 #测试# @用户${i % 10}`,
      created_at: `2024-01-${String(Math.floor(i / 2) + 1).padStart(2, '0')}T${String((i % 24)).padStart(2, '0')}:${String((i % 60)).padStart(2, '0')}:00Z`,
      user: {
        id: `user${i % 10}`,
        screen_name: `测试用户${i % 10}`,
        profile_image_url: `https://example.com/avatar${i % 10}.jpg`,
        verified: i % 5 === 0,
        followers_count: 1000 + (i * 100),
        friends_count: 500 + (i * 50),
        statuses_count: 200 + (i * 20)
      },
      source: 'iPhone客户端',
      reposts_count: Math.floor(Math.random() * 100),
      comments_count: Math.floor(Math.random() * 50),
      attitudes_count: Math.floor(Math.random() * 200),
      pic_urls: i % 3 === 0 ? [
        { url: `https://example.com/image${i}_1.jpg` },
        { url: `https://example.com/image${i}_2.jpg` }
      ] : [],
      comments: i % 4 === 0 ? Array.from({ length: Math.floor(Math.random() * 10) + 1 }, (_, j) => ({
        id: `comment${i}_${j}`,
        text: `评论${j}内容`,
        created_at: `2024-01-${String(Math.floor(i / 2) + 1).padStart(2, '0')}T${String((i % 24) + 1).padStart(2, '0')}:${String((j % 60)).padStart(2, '0')}:00Z`,
        user: {
          id: `commenter${j % 5}`,
          screen_name: `评论用户${j % 5}`,
          profile_image_url: `https://example.com/commenter${j % 5}.jpg`
        },
        like_count: Math.floor(Math.random() * 20)
      })) : []
    }))
  };

  beforeEach(() => {
    // Initialize components
    operationRegistry = new OperationRegistry();
    weiboProcessor = new WeiboJSONBatchProcessor();
    workflowEngine = new WorkflowEngine();
    taskOrchestrator = new TaskOrchestrator();

    // Register operations
    operationRegistry.register('weibo-json-batch-processor', weiboProcessor);

    mockContext = {
      id: 'integration-test-context',
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

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default file system mocks
    mockFs.access.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
  });

  describe('Complete Batch Processing Workflow', () => {
    it('should process complete batch download workflow successfully', async () => {
      // Setup test files
      const testFiles = [
        'weibo_data_batch1.json',
        'weibo_data_batch2.json',
        'weibo_data_batch3.json'
      ];

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        if (dirPath === './test-input') {
          return testFiles.map(name => ({
            name,
            isFile: () => true,
            isDirectory: () => false
          }));
        }
        return [];
      });

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        // Create slightly different data for each file
        const fileIndex = testFiles.indexOf(path.basename(filePath));
        const fileData = {
          ...testWeiboData,
          posts: testWeiboData.posts.slice(fileIndex * 15, (fileIndex + 1) * 15)
        };
        return JSON.stringify(fileData);
      });

      // Create workflow definition
      const workflowDefinition: WorkflowDefinition = {
        id: 'weibo-batch-download-workflow',
        name: 'Weibo Batch Download Workflow',
        description: 'Complete batch download and processing workflow',
        steps: [
          {
            id: 'step1',
            name: 'Batch Process Weibo Data',
            operationId: 'weibo-json-batch-processor',
            parameters: {
              inputPath: './test-input',
              outputPath: './test-output',
              batchSize: 2,
              processingOptions: {
                extractImages: true,
                extractVideos: true,
                extractComments: true,
                normalizeText: true,
                enrichData: true
              },
              dataFilters: {
                minLikes: 10,
                minComments: 5,
                dateRange: {
                  start: '2024-01-01T00:00:00Z',
                  end: '2024-01-31T23:59:59Z'
                }
              },
              progressReporting: true
            },
            dependencies: [],
            onError: 'continue'
          }
        ]
      };

      // Execute workflow
      const result = await workflowEngine.executeWorkflow(
        workflowDefinition,
        mockContext,
        operationRegistry
      );

      // Verify workflow execution
      expect(result.success).toBe(true);
      expect(result.completedSteps).toHaveLength(1);
      expect(result.completedSteps[0].stepId).toBe('step1');
      expect(result.completedSteps[0].status).toBe('completed');

      // Verify file system operations
      expect(mockFs.readdir).toHaveBeenCalledWith('./test-input');
      expect(mockFs.mkdir).toHaveBeenCalledWith('./test-output', { recursive: true });
      expect(mockFs.readFile).toHaveBeenCalledTimes(3); // 3 files read
      expect(mockFs.writeFile).toHaveBeenCalledTimes(4); // 3 processed files + 1 summary report

      // Verify logging
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'Starting Weibo JSON batch processing',
        expect.objectContaining({
          inputPath: './test-input',
          batchSize: 2
        })
      );
    });

    it('should handle workflow with multiple processing steps', async () => {
      // Setup test files
      const testFiles = ['weibo_data.json'];
      mockFs.readdir.mockResolvedValue([
        { name: 'weibo_data.json', isFile: () => true, isDirectory: () => false }
      ]);
      mockFs.readFile.mockResolvedValue(JSON.stringify(testWeiboData));

      // Create multi-step workflow
      const workflowDefinition: WorkflowDefinition = {
        id: 'multi-step-weibo-workflow',
        name: 'Multi-Step Weibo Processing Workflow',
        description: 'Workflow with multiple processing steps',
        steps: [
          {
            id: 'batch-process',
            name: 'Batch Process Data',
            operationId: 'weibo-json-batch-processor',
            parameters: {
              inputPath: './input',
              outputPath: './processed',
              batchSize: 1,
              dataFilters: { minLikes: 50 }
            },
            dependencies: [],
            onError: 'continue'
          },
          {
            id: 'generate-report',
            name: 'Generate Summary Report',
            operationId: 'weibo-json-batch-processor',
            parameters: {
              inputPath: './processed',
              outputPath: './reports',
              processingOptions: { generateReport: true }
            },
            dependencies: ['batch-process'],
            onError: 'continue'
          }
        ]
      };

      const result = await workflowEngine.executeWorkflow(
        workflowDefinition,
        mockContext,
        operationRegistry
      );

      expect(result.success).toBe(true);
      expect(result.completedSteps).toHaveLength(2);
      expect(result.completedSteps[0].stepId).toBe('batch-process');
      expect(result.completedSteps[1].stepId).toBe('generate-report');
    });

    it('should handle workflow errors gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Directory not found'));

      const workflowDefinition: WorkflowDefinition = {
        id: 'error-handling-workflow',
        name: 'Error Handling Workflow',
        description: 'Test error handling in workflow',
        steps: [
          {
            id: 'failing-step',
            name: 'Failing Step',
            operationId: 'weibo-json-batch-processor',
            parameters: { inputPath: './nonexistent' },
            dependencies: [],
            onError: 'continue'
          }
        ]
      };

      const result = await workflowEngine.executeWorkflow(
        workflowDefinition,
        mockContext,
        operationRegistry
      );

      expect(result.success).toBe(false);
      expect(result.failedSteps).toHaveLength(1);
      expect(result.failedSteps[0].stepId).toBe('failing-step');
      expect(result.failedSteps[0].error).toBeDefined();

      expect(mockContext.logger.error).toHaveBeenCalledWith(
        'Step failed: failing-step',
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('should handle step dependencies correctly', async () => {
      let executionOrder: string[] = [];

      // Mock operation that tracks execution order
      const trackingOperation = new WeiboJSONBatchProcessor();
      const originalExecute = trackingOperation.execute.bind(trackingOperation);

      trackingOperation.execute = async function(context, params) {
        executionOrder.push(params.stepName || 'unknown');
        return originalExecute(context, params);
      };

      operationRegistry.register('tracking-processor', trackingOperation);

      mockFs.readdir.mockResolvedValue([
        { name: 'data.json', isFile: () => true, isDirectory: () => false }
      ]);
      mockFs.readFile.mockResolvedValue(JSON.stringify(testWeiboData));

      const workflowDefinition: WorkflowDefinition = {
        id: 'dependency-workflow',
        name: 'Dependency Workflow',
        description: 'Test step dependencies',
        steps: [
          {
            id: 'step1',
            name: 'First Step',
            operationId: 'tracking-processor',
            parameters: {
              inputPath: './input',
              outputPath: './output1',
              stepName: 'step1'
            },
            dependencies: [],
            onError: 'continue'
          },
          {
            id: 'step2',
            name: 'Second Step',
            operationId: 'tracking-processor',
            parameters: {
              inputPath: './output1',
              outputPath: './output2',
              stepName: 'step2'
            },
            dependencies: ['step1'],
            onError: 'continue'
          },
          {
            id: 'step3',
            name: 'Third Step',
            operationId: 'tracking-processor',
            parameters: {
              inputPath: './output2',
              outputPath: './output3',
              stepName: 'step3'
            },
            dependencies: ['step2'],
            onError: 'continue'
          }
        ]
      };

      const result = await workflowEngine.executeWorkflow(
        workflowDefinition,
        mockContext,
        operationRegistry
      );

      expect(result.success).toBe(true);
      expect(executionOrder).toEqual(['step1', 'step2', 'step3']);
    });
  });

  describe('Task Orchestration Integration', () => {
    it('should execute batch processing as a scheduled task', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'scheduled_data.json', isFile: () => true, isDirectory: () => false }
      ]);
      mockFs.readFile.mockResolvedValue(JSON.stringify(testWeiboData));

      const taskDefinition: TaskDefinition = {
        id: 'scheduled-batch-task',
        name: 'Scheduled Batch Processing Task',
        description: 'Batch processing task with scheduling',
        workflowId: 'weibo-batch-workflow',
        parameters: {
          inputPath: './scheduled-input',
          outputPath: './scheduled-output',
          batchSize: 5,
          schedule: '0 2 * * *' // Daily at 2 AM
        },
        priority: 'high',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Submit task to orchestrator
      const taskId = await taskOrchestrator.submitTask(taskDefinition);

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');

      // Execute task
      const executionResult = await taskOrchestrator.executeTask(taskId);

      expect(executionResult.taskId).toBe(taskId);
      expect(executionResult.status).toBe('completed');
      expect(executionResult.result).toBeDefined();
    });

    it('should handle task execution with dependencies', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'dependency_data.json', isFile: () => true, isDirectory: () => false }
      ]);
      mockFs.readFile.mockResolvedValue(JSON.stringify(testWeiboData));

      const parentTask: TaskDefinition = {
        id: 'parent-task',
        name: 'Parent Task',
        description: 'Parent processing task',
        workflowId: 'weibo-batch-workflow',
        parameters: {
          inputPath: './parent-input',
          outputPath: './parent-output'
        },
        priority: 'high',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const childTask: TaskDefinition = {
        id: 'child-task',
        name: 'Child Task',
        description: 'Child processing task',
        workflowId: 'weibo-batch-workflow',
        parameters: {
          inputPath: './parent-output',
          outputPath: './child-output'
        },
        priority: 'medium',
        status: 'pending',
        dependencies: ['parent-task'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const parentTaskId = await taskOrchestrator.submitTask(parentTask);
      const childTaskId = await taskOrchestrator.submitTask(childTask);

      // Execute parent task first
      const parentResult = await taskOrchestrator.executeTask(parentTaskId);
      expect(parentResult.status).toBe('completed');

      // Then execute child task
      const childResult = await taskOrchestrator.executeTask(childTaskId);
      expect(childResult.status).toBe('completed');

      // Verify file operations for both tasks
      expect(mockFs.writeFile).toHaveBeenCalledTimes(4); // 2 for each task (1 processed + 1 summary)
    });

    it('should handle task queueing and prioritization', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'queue_data.json', isFile: () => true, isDirectory: () => false }
      ]);
      mockFs.readFile.mockResolvedValue(JSON.stringify(testWeiboData));

      const highPriorityTask: TaskDefinition = {
        id: 'high-priority-task',
        name: 'High Priority Task',
        description: 'High priority processing task',
        workflowId: 'weibo-batch-workflow',
        parameters: {
          inputPath: './high-input',
          outputPath: './high-output'
        },
        priority: 'high',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const lowPriorityTask: TaskDefinition = {
        id: 'low-priority-task',
        name: 'Low Priority Task',
        description: 'Low priority processing task',
        workflowId: 'weibo-batch-workflow',
        parameters: {
          inputPath: './low-input',
          outputPath: './low-output'
        },
        priority: 'low',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Submit tasks in reverse priority order
      const lowPriorityId = await taskOrchestrator.submitTask(lowPriorityTask);
      const highPriorityId = await taskOrchestrator.submitTask(highPriorityTask);

      // Get task queue
      const queue = await taskOrchestrator.getTaskQueue();

      // High priority task should be first in queue
      expect(queue[0].taskId).toBe(highPriorityId);
      expect(queue[0].priority).toBe('high');
      expect(queue[1].taskId).toBe(lowPriorityId);
      expect(queue[1].priority).toBe('low');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from transient file system errors', async () => {
      let callCount = 0;

      mockFs.readdir.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary file system error');
        }
        return [
          { name: 'recovery_data.json', isFile: () => true, isDirectory: () => false }
        ];
      });

      mockFs.readFile.mockResolvedValue(JSON.stringify(testWeiboData));

      const workflowDefinition: WorkflowDefinition = {
        id: 'recovery-workflow',
        name: 'Recovery Workflow',
        description: 'Test recovery from transient errors',
        steps: [
          {
            id: 'recovery-step',
            name: 'Recovery Step',
            operationId: 'weibo-json-batch-processor',
            parameters: {
              inputPath: './recovery-input',
              outputPath: './recovery-output',
              maxRetries: 3,
              retryDelay: 100
            },
            dependencies: [],
            onError: 'retry'
          }
        ]
      };

      const result = await workflowEngine.executeWorkflow(
        workflowDefinition,
        mockContext,
        operationRegistry
      );

      expect(result.success).toBe(true);
      expect(callCount).toBe(2); // Initial call + retry
    });

    it('should handle data corruption gracefully', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'corrupt_data.json', isFile: () => true, isDirectory: () => false }
      ]);

      // First file is corrupted, second is valid
      mockFs.readFile
        .mockRejectedValueOnce(new Error('Invalid JSON'))
        .mockResolvedValueOnce(JSON.stringify(testWeiboData));

      const workflowDefinition: WorkflowDefinition = {
        id: 'corruption-workflow',
        name: 'Corruption Handling Workflow',
        description: 'Test handling of corrupted data',
        steps: [
          {
            id: 'corruption-step',
            name: 'Corruption Step',
            operationId: 'weibo-json-batch-processor',
            parameters: {
              inputPath: './corruption-input',
              outputPath: './corruption-output',
              errorHandling: 'continue',
              batchSize: 1
            },
            dependencies: [],
            onError: 'continue'
          }
        ]
      };

      const result = await workflowEngine.executeWorkflow(
        workflowDefinition,
        mockContext,
        operationRegistry
      );

      expect(result.success).toBe(true);
      expect(result.completedSteps[0].result.processingResult.filesFailed).toBe(1);
      expect(result.completedSteps[0].result.processingResult.filesProcessed).toBe(1);

      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'File processing failed',
        expect.objectContaining({
          error: 'Invalid JSON'
        })
      );
    });

    it('should handle resource exhaustion scenarios', async () => {
      // Mock memory pressure by slowing down processing
      let processingDelay = 0;

      const slowProcessor = new WeiboJSONBatchProcessor();
      const originalExecute = slowProcessor.execute.bind(slowProcessor);

      slowProcessor.execute = async function(context, params) {
        processingDelay += 50; // Increase delay for each call
        await new Promise(resolve => setTimeout(resolve, processingDelay));
        return originalExecute(context, params);
      };

      operationRegistry.register('slow-processor', slowProcessor);

      mockFs.readdir.mockResolvedValue([
        { name: 'slow_data1.json', isFile: () => true, isDirectory: () => false },
        { name: 'slow_data2.json', isFile: () => true, isDirectory: () => false }
      ]);

      mockFs.readFile.mockResolvedValue(JSON.stringify(testWeiboData));

      const workflowDefinition: WorkflowDefinition = {
        id: 'resource-workflow',
        name: 'Resource Exhaustion Workflow',
        description: 'Test resource exhaustion handling',
        steps: [
          {
            id: 'resource-step',
            name: 'Resource Step',
            operationId: 'slow-processor',
            parameters: {
              inputPath: './resource-input',
              outputPath: './resource-output',
              batchSize: 1,
              timeout: 1000
            },
            dependencies: [],
            onError: 'continue'
          }
        ]
      };

      const startTime = Date.now();
      const result = await workflowEngine.executeWorkflow(
        workflowDefinition,
        mockContext,
        operationRegistry
      );
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThan(100); // Should account for delays
    });
  });

  describe('Data Processing Validation', () => {
    it('should maintain data integrity across processing stages', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'integrity_data.json', isFile: () => true, isDirectory: () => false }
      ]);
      mockFs.readFile.mockResolvedValue(JSON.stringify(testWeiboData));

      const workflowDefinition: WorkflowDefinition = {
        id: 'integrity-workflow',
        name: 'Data Integrity Workflow',
        description: 'Test data integrity across processing',
        steps: [
          {
            id: 'integrity-step',
            name: 'Integrity Step',
            operationId: 'weibo-json-batch-processor',
            parameters: {
              inputPath: './integrity-input',
              outputPath: './integrity-output',
              processingOptions: {
                extractImages: true,
                extractComments: true,
                enrichData: true
              },
              dataFilters: {
                minLikes: 0, // No filtering to get all data
                minComments: 0
              }
            },
            dependencies: [],
            onError: 'continue'
          }
        ]
      };

      const result = await workflowEngine.executeWorkflow(
        workflowDefinition,
        mockContext,
        operationRegistry
      );

      expect(result.success).toBe(true);

      const processingResult = result.completedSteps[0].result.processingResult;
      expect(processingResult.filesProcessed).toBe(1);
      expect(processingResult.recordsProcessed).toBe(50); // All 50 posts should be processed

      // Verify data integrity
      expect(processingResult.dataSummary.totalPosts).toBe(50);
      expect(processingResult.dataSummary.totalUsers).toBeGreaterThan(0);
      expect(processingResult.dataSummary.totalImages).toBeGreaterThan(0);
      expect(processingResult.dataSummary.totalComments).toBeGreaterThan(0);
    });

    it('should handle complex data filtering scenarios', async () => {
      // Create test data with varying engagement metrics
      const variedData = {
        posts: [
          {
            id: 'high_engagement',
            text: '高互动内容',
            created_at: '2024-01-15T10:30:00Z',
            attitudesCount: 500,
            commentsCount: 100,
            repostsCount: 50,
            user: { id: 'user1', screenName: '用户1' }
          },
          {
            id: 'low_engagement',
            text: '低互动内容',
            created_at: '2024-01-15T10:30:00Z',
            attitudesCount: 5,
            commentsCount: 1,
            repostsCount: 0,
            user: { id: 'user2', screenName: '用户2' }
          },
          {
            id: 'medium_engagement',
            text: '中等互动内容',
            created_at: '2024-01-15T10:30:00Z',
            attitudesCount: 50,
            commentsCount: 25,
            repostsCount: 10,
            user: { id: 'user3', screenName: '用户3' }
          }
        ]
      };

      mockFs.readdir.mockResolvedValue([
        { name: 'filter_test.json', isFile: () => true, isDirectory: () => false }
      ]);
      mockFs.readFile.mockResolvedValue(JSON.stringify(variedData));

      const workflowDefinition: WorkflowDefinition = {
        id: 'filter-workflow',
        name: 'Complex Filtering Workflow',
        description: 'Test complex data filtering scenarios',
        steps: [
          {
            id: 'filter-step',
            name: 'Filter Step',
            operationId: 'weibo-json-batch-processor',
            parameters: {
              inputPath: './filter-input',
              outputPath: './filter-output',
              dataFilters: {
                minLikes: 10,
                minComments: 5,
                minReposts: 2,
                userFilters: ['user1', 'user3']
              }
            },
            dependencies: [],
            onError: 'continue'
          }
        ]
      };

      const result = await workflowEngine.executeWorkflow(
        workflowDefinition,
        mockContext,
        operationRegistry
      );

      expect(result.success).toBe(true);

      const processingResult = result.completedSteps[0].result.processingResult;
      expect(processingResult.recordsProcessed).toBe(2); // Only high and medium engagement posts
    });
  });
});