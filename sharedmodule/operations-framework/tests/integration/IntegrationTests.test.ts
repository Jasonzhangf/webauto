import { OperationRegistry } from '../../src/core/OperationRegistry';
import { WorkflowEngine } from '../../src/WorkflowEngine';
import { TaskOrchestrator } from '../../src/core/TaskOrchestrator';
import { ExecutionContext } from '../../src/execution/ExecutionContext';
import { BrowserOperations } from '../../src/micro-operations/BrowserOperations';
import { FileSystemOperations } from '../../src/micro-operations/FileSystemOperations';
import { AIOperations } from '../../src/micro-operations/AIOperations';
import { CommunicationOperations } from '../../src/micro-operations/CommunicationOperations';
import { WeiboOperations } from '../../src/micro-operations/WeiboOperations';
import { OperationContext, TaskDefinition, WorkflowDefinition } from '../../src/types/operationTypes';
import { EventEmitter } from 'events';

// Mock implementations for integration testing
class MockBrowser {
  newPage = jest.fn().mockResolvedValue({
    screenshot: jest.fn().mockResolvedValue(Buffer.from('screenshot')),
    evaluate: jest.fn().mockImplementation((fn) => fn()),
    content: jest.fn().mockResolvedValue('<html><body>Test</body></html>'),
    $$: jest.fn().mockResolvedValue([]),
    $eval: jest.fn().mockResolvedValue('Test Title'),
    goto: jest.fn().mockResolvedValue({ status: 200 })
  });
}

class MockAIProvider {
  async generateContent(prompt: string) {
    return {
      response: {
        text: () => `AI response for: ${prompt.substring(0, 50)}...`
      }
    };
  }
}

describe('Integration Tests', () => {
  let registry: OperationRegistry;
  let workflowEngine: WorkflowEngine;
  let taskOrchestrator: TaskOrchestrator;
  let executionContext: ExecutionContext;
  let mockContext: OperationContext;
  let tempDir: string;

  beforeEach(() => {
    registry = new OperationRegistry();
    executionContext = new ExecutionContext();
    workflowEngine = new WorkflowEngine(registry, executionContext);
    taskOrchestrator = new TaskOrchestrator(registry, executionContext);

    tempDir = '/tmp/webauto-integration-test';
    mockContext = {
      id: 'integration-test-context',
      browser: new MockBrowser() as any,
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
      eventBus: new EventEmitter(),
      aiProvider: new MockAIProvider() as any,
      tempDir: tempDir
    };

    // Register all operations
    registerAllOperations();
  });

  const registerAllOperations = () => {
    // Register browser operations
    const screenshotOp = new BrowserOperations.ScreenshotOperation();
    const scrollOp = new BrowserOperations.ScrollOperation();
    const structureOp = new BrowserOperations.PageStructureOperation();

    registry.register('screenshot', screenshotOp);
    registry.register('scroll', scrollOp);
    registry.register('page-structure', structureOp);

    // Register file system operations
    const fileReadOp = new FileSystemOperations.FileReadOperation();
    const fileWriteOp = new FileSystemOperations.FileWriteOperation();
    const directoryOp = new FileSystemOperations.DirectoryOperation();
    const fileSearchOp = new FileSystemOperations.FileSearchOperation();

    registry.register('file-read', fileReadOp);
    registry.register('file-write', fileWriteOp);
    registry.register('directory', directoryOp);
    registry.register('file-search', fileSearchOp);

    // Register AI operations
    const textProcessingOp = new AIOperations.TextProcessingOperation();
    const contentAnalysisOp = new AIOperations.ContentAnalysisOperation();

    registry.register('text-processing', textProcessingOp);
    registry.register('content-analysis', contentAnalysisOp);

    // Register communication operations
    const httpRequestOp = new CommunicationOperations.HttpRequestOperation();
    const apiClientOp = new CommunicationOperations.APIClientOperation();
    const webSocketOp = new CommunicationOperations.WebSocketOperation();

    registry.register('http-request', httpRequestOp);
    registry.register('api-client', apiClientOp);
    registry.register('websocket', webSocketOp);

    // Register Weibo operations
    const jsonBatchProcessorOp = new WeiboOperations.WeiboJSONBatchProcessor();
    const userProfileAnalyzerOp = new WeiboOperations.WeiboUserProfileAnalyzer();

    registry.register('weibo-json-batch', jsonBatchProcessorOp);
    registry.register('weibo-profile-analysis', userProfileAnalyzerOp);
  };

  describe('Full System Integration', () => {
    it('should execute a complete web scraping workflow', async () => {
      // Define a comprehensive web scraping workflow
      const workflow: WorkflowDefinition = {
        name: 'Web Scraping Workflow',
        description: 'Complete web scraping and analysis workflow',
        steps: [
          {
            name: 'screenshot',
            operation: 'screenshot',
            parameters: {
              type: 'png',
              fullPage: true
            }
          },
          {
            name: 'extract-content',
            operation: 'page-structure',
            parameters: {
              extractContent: true,
              extractLinks: true,
              analyzeMetadata: true
            }
          },
          {
            name: 'save-content',
            operation: 'file-write',
            parameters: {
              filePath: `${tempDir}/scraped-content.json`,
              content: '${extract-content.data}',
              format: 'json'
            }
          }
        ]
      };

      // Register and execute workflow
      workflowEngine.defineWorkflow('web-scraping', workflow);
      const result = await workflowEngine.executeWorkflow('web-scraping', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].success).toBe(true); // screenshot
      expect(result.results[1].success).toBe(true); // extract-content
      expect(result.results[2].success).toBe(true); // save-content
    });

    it('should handle data processing pipeline', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Data Processing Pipeline',
        description: 'Process data through multiple stages',
        steps: [
          {
            name: 'read-input',
            operation: 'file-read',
            parameters: {
              filePath: `${tempDir}/input.json`,
              format: 'json'
            }
          },
          {
            name: 'analyze-content',
            operation: 'content-analysis',
            parameters: {
              content: '${read-input.data.content}',
              analysisTypes: ['sentiment', 'readability', 'keywords']
            },
            condition: {
              type: 'success',
              step: 'read-input'
            }
          },
          {
            name: 'generate-report',
            operation: 'text-processing',
            parameters: {
              prompt: 'Generate a summary report based on this analysis: ${analyze-content.data}',
              operationType: 'content-generation'
            }
          },
          {
            name: 'save-report',
            operation: 'file-write',
            parameters: {
              filePath: `${tempDir}/report.txt`,
              content: '${generate-report.data.processedText}'
            }
          }
        ]
      };

      workflowEngine.defineWorkflow('data-pipeline', workflow);
      const result = await workflowEngine.executeWorkflow('data-pipeline', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(4);
    });

    it('should execute task with scheduling', async () => {
      const taskDefinition: TaskDefinition = {
        name: 'Scheduled Analysis Task',
        description: 'A task that performs scheduled analysis',
        workflow: {
          name: 'scheduled-analysis-workflow',
          description: 'Scheduled analysis workflow',
          steps: [
            {
              name: 'collect-data',
              operation: 'file-read',
              parameters: {
                filePath: `${tempDir}/data.json`,
                format: 'json'
              }
            },
            {
              name: 'analyze-data',
              operation: 'content-analysis',
              parameters: {
                content: '${collect-data.data.content}',
                analysisTypes: ['comprehensive']
              }
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      taskOrchestrator.registerTask('scheduled-analysis', taskDefinition);
      const execution = await taskOrchestrator.executeTask('scheduled-analysis');

      expect(execution.status).toBe('completed');
      expect(execution.result.success).toBe(true);
    });

    it('should handle Weibo batch processing workflow', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Weibo Batch Processing',
        description: 'Process Weibo JSON data in batches',
        steps: [
          {
            name: 'batch-process',
            operation: 'weibo-json-batch',
            parameters: {
              sourceDirectory: `${tempDir}/weibo-data`,
              outputFormat: 'json',
              batchSize: 100,
              includeStats: true
            }
          },
          {
            name: 'analyze-profiles',
            operation: 'weibo-profile-analysis',
            parameters: {
              inputPath: '${batch-process.data.outputPath}',
              analysisTypes: ['engagement', 'influence', 'activity'],
              generateReport: true
            }
          },
          {
            name: 'save-results',
            operation: 'file-write',
            parameters: {
              filePath: `${tempDir}/weibo-analysis-results.json`,
              content: '${analyze-profiles.data}',
              format: 'json'
            }
          }
        ]
      };

      workflowEngine.defineWorkflow('weibo-processing', workflow);
      const result = await workflowEngine.executeWorkflow('weibo-processing', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle workflow failures gracefully', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Error Handling Workflow',
        description: 'Test error handling in workflows',
        steps: [
          {
            name: 'read-nonexistent',
            operation: 'file-read',
            parameters: {
              filePath: `${tempDir}/nonexistent.json`
            }
          },
          {
            name: 'fallback-operation',
            operation: 'text-processing',
            parameters: {
              prompt: 'Handle the missing file scenario',
              operationType: 'content-generation'
            },
            condition: {
              type: 'failure',
              step: 'read-nonexistent'
            }
          }
        ]
      };

      workflowEngine.defineWorkflow('error-handling', workflow);
      const result = await workflowEngine.executeWorkflow('error-handling', mockContext);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(false); // read-nonexistent should fail
      expect(result.results[1].success).toBe(true); // fallback should succeed
    });

    it('should retry failed operations', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Retry Workflow',
        description: 'Test retry logic for operations',
        steps: [
          {
            name: 'flaky-operation',
            operation: 'http-request',
            parameters: {
              url: 'https://example.com/api',
              method: 'GET'
            },
            retry: {
              maxAttempts: 3,
              delay: 100
            }
          }
        ]
      };

      workflowEngine.defineWorkflow('retry-workflow', workflow);
      const result = await workflowEngine.executeWorkflow('retry-workflow', mockContext);

      // The HTTP request might fail due to mock limitations, but we test the retry structure
      expect(result.results).toHaveLength(1);
      expect(result.results[0].attempts).toBeLessThanOrEqual(3);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle parallel operations efficiently', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Parallel Operations',
        description: 'Test parallel execution performance',
        steps: [
          {
            name: 'parallel-screenshot-1',
            operation: 'screenshot',
            parameters: { type: 'png' },
            parallel: true
          },
          {
            name: 'parallel-screenshot-2',
            operation: 'screenshot',
            parameters: { type: 'jpeg' },
            parallel: true
          },
          {
            name: 'parallel-screenshot-3',
            operation: 'screenshot',
            parameters: { type: 'png', fullPage: true },
            parallel: true
          }
        ]
      };

      const startTime = Date.now();
      workflowEngine.defineWorkflow('parallel-test', workflow);
      const result = await workflowEngine.executeWorkflow('parallel-test', mockContext);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);

      // Parallel execution should be faster than sequential
      // (allowing some margin for overhead)
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(500); // Should complete in under 500ms
    });

    it('should handle large data processing', async () => {
      // Create a large data processing workflow
      const workflow: WorkflowDefinition = {
        name: 'Large Data Processing',
        description: 'Test processing of large datasets',
        steps: [
          {
            name: 'batch-process-large',
            operation: 'weibo-json-batch',
            parameters: {
              sourceDirectory: `${tempDir}/large-dataset`,
              outputFormat: 'json',
              batchSize: 1000,
              includeStats: true,
              progressInterval: 100
            }
          }
        ]
      };

      workflowEngine.defineWorkflow('large-data-test', workflow);
      const result = await workflowEngine.executeWorkflow('large-data-test', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
    });
  });

  describe('Cross-Module Communication', () => {
    it('should pass data between different operation types', async () => {
      const workflow: WorkflowDefinition = {
        name: 'Cross-Module Communication',
        description: 'Test data passing between different operation types',
        steps: [
          {
            name: 'web-scrape',
            operation: 'page-structure',
            parameters: {
              extractContent: true,
              extractLinks: true
            }
          },
          {
            name: 'ai-analysis',
            operation: 'content-analysis',
            parameters: {
              content: '${web-scrape.data.content}',
              analysisTypes: ['sentiment', 'keywords']
            }
          },
          {
            name: 'api-call',
            operation: 'http-request',
            parameters: {
              url: 'https://api.example.com/analyze',
              method: 'POST',
              data: {
                sentiment: '${ai-analysis.data.sentiment}',
                keywords: '${ai-analysis.data.keywords}'
              }
            }
          },
          {
            name: 'save-results',
            operation: 'file-write',
            parameters: {
              filePath: `${tempDir}/cross-module-results.json`,
              content: {
                webContent: '${web-scrape.data}',
                aiAnalysis: '${ai-analysis.data}',
                apiResponse: '${api-call.data}'
              },
              format: 'json'
            }
          }
        ]
      };

      workflowEngine.defineWorkflow('cross-module', workflow);
      const result = await workflowEngine.executeWorkflow('cross-module', mockContext);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(4);

      // Verify data was passed correctly between operations
      const webScrapeResult = result.results[0];
      const aiAnalysisResult = result.results[1];
      const apiCallResult = result.results[2];
      const saveResultsResult = result.results[3];

      expect(webScrapeResult.success).toBe(true);
      expect(aiAnalysisResult.success).toBe(true);
      expect(apiCallResult.success).toBe(true);
      expect(saveResultsResult.success).toBe(true);
    });
  });

  describe('System Monitoring and Metrics', () => {
    it('should track execution metrics across all components', async () => {
      // Execute multiple workflows to generate metrics
      const workflow1: WorkflowDefinition = {
        name: 'Metrics Test 1',
        description: 'First workflow for metrics testing',
        steps: [
          {
            name: 'screenshot',
            operation: 'screenshot'
          },
          {
            name: 'file-save',
            operation: 'file-write',
            parameters: {
              filePath: `${tempDir}/metrics-test-1.txt`,
              content: 'Metrics test data 1'
            }
          }
        ]
      };

      const workflow2: WorkflowDefinition = {
        name: 'Metrics Test 2',
        description: 'Second workflow for metrics testing',
        steps: [
          {
            name: 'content-analysis',
            operation: 'content-analysis',
            parameters: {
              content: 'Test content for metrics',
              analysisTypes: ['sentiment']
            }
          }
        ]
      };

      // Register and execute workflows
      workflowEngine.defineWorkflow('metrics-1', workflow1);
      workflowEngine.defineWorkflow('metrics-2', workflow2);

      await workflowEngine.executeWorkflow('metrics-1', mockContext);
      await workflowEngine.executeWorkflow('metrics-2', mockContext);

      // Check operation statistics
      const screenshotStats = registry.get('screenshot')?.getStatistics();
      const fileWriteStats = registry.get('file-write')?.getStatistics();
      const contentAnalysisStats = registry.get('content-analysis')?.getStatistics();

      expect(screenshotStats).toBeDefined();
      expect(screenshotStats!.totalExecutions).toBe(1);
      expect(screenshotStats!.successfulExecutions).toBe(1);

      expect(fileWriteStats).toBeDefined();
      expect(fileWriteStats!.totalExecutions).toBe(1);
      expect(fileWriteStats!.successfulExecutions).toBe(1);

      expect(contentAnalysisStats).toBeDefined();
      expect(contentAnalysisStats!.totalExecutions).toBe(1);
      expect(contentAnalysisStats!.successfulExecutions).toBe(1);

      // Check workflow engine statistics
      const workflowStats = workflowEngine.getWorkflowStatistics();
      expect(workflowStats.totalWorkflows).toBe(2);
      expect(workflowStats.executedWorkflows).toBe(2);
    });

    it('should handle system events properly', async () => {
      const eventSpy = jest.fn();

      // Listen to events from all components
      workflowEngine.on('workflowStarted', eventSpy);
      workflowEngine.on('workflowCompleted', eventSpy);
      taskOrchestrator.on('taskStarted', eventSpy);
      taskOrchestrator.on('taskCompleted', eventSpy);

      const workflow: WorkflowDefinition = {
        name: 'Event Test',
        description: 'Test event system',
        steps: [
          {
            name: 'test-operation',
            operation: 'screenshot'
          }
        ]
      };

      const taskDefinition: TaskDefinition = {
        name: 'Event Test Task',
        description: 'Test task events',
        workflow: workflow,
        schedule: {
          type: 'immediate'
        }
      };

      workflowEngine.defineWorkflow('event-test', workflow);
      taskOrchestrator.registerTask('event-test-task', taskDefinition);

      // Execute both workflow and task
      await workflowEngine.executeWorkflow('event-test', mockContext);
      await taskOrchestrator.executeTask('event-test-task');

      // Verify events were emitted
      expect(eventSpy).toHaveBeenCalledTimes(4);
    });
  });
});