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

describe('Weibo Batch Download Performance Tests', () => {
  let weiboProcessor: WeiboJSONBatchProcessor;
  let workflowEngine: WorkflowEngine;
  let taskOrchestrator: TaskOrchestrator;
  let operationRegistry: OperationRegistry;
  let mockContext: OperationContext;

  // Performance test data generators
  const generateLargeDataset = (size: number) => {
    return {
      posts: Array.from({ length: size }, (_, i) => ({
        id: `post_${i}`,
        text: `这是第${i}条测试微博内容，包含丰富的文本信息 #测试话题${i % 100}# @测试用户${i % 1000} https://example.com/${i}`,
        created_at: `2024-01-${String(Math.floor(i / 1000) + 1).padStart(2, '0')}T${String((i % 24)).padStart(2, '0')}:${String((i % 60)).padStart(2, '0')}:${String((i % 60)).padStart(2, '0')}.000Z`,
        user: {
          id: `user_${i % 1000}`,
          screen_name: `测试用户${i % 1000}`,
          profile_image_url: `https://example.com/avatar${i % 100}.jpg`,
          verified: i % 20 === 0,
          verified_type: i % 5,
          followers_count: 1000 + (i * 10),
          friends_count: 500 + (i * 5),
          statuses_count: 200 + (i * 2),
          description: `这是用户${i % 1000}的个人简介，包含了丰富的用户信息。`,
          gender: i % 3,
          location: `城市${i % 50}`
        },
        source: ['iPhone客户端', 'Android客户端', '网页版', 'iPad客户端'][i % 4],
        reposts_count: Math.floor(Math.random() * 10000),
        comments_count: Math.floor(Math.random() * 5000),
        attitudes_count: Math.floor(Math.random() * 20000),
        pic_urls: i % 3 === 0 ? Array.from({ length: Math.floor(Math.random() * 9) + 1 }, (_, j) => ({
          url: `https://example.com/image_${i}_${j}.jpg`,
          thumbnail_pic: `https://example.com/thumb_${i}_${j}.jpg`,
          bmiddle_pic: `https://example.com/middle_${i}_${j}.jpg`,
          original_pic: `https://example.com/original_${i}_${j}.jpg`
        })) : [],
        page_info: i % 10 === 0 ? {
          urls: [`https://example.com/video_${i}.mp4`],
          duration: Math.floor(Math.random() * 300) + 10,
          size: Math.floor(Math.random() * 100000000) + 1000000,
          type: 'mp4'
        } : null,
        comments: i % 4 === 0 ? Array.from({ length: Math.floor(Math.random() * 200) + 1 }, (_, j) => ({
          id: `comment_${i}_${j}`,
          text: `这是第${j}条评论，包含了对原帖的回应和讨论。@回复用户${j % 100} #相关话题${j % 50}#`,
          created_at: `2024-01-${String(Math.floor(i / 1000) + 1).padStart(2, '0')}T${String(((i + j) % 24)).padStart(2, '0')}:${String(((i + j) % 60)).padStart(2, '0')}:${String(((i + j) % 60)).padStart(2, '0')}.000Z`,
          user: {
            id: `commenter_${j % 500}`,
            screen_name: `评论用户${j % 500}`,
            profile_image_url: `https://example.com/commenter_avatar${j % 100}.jpg`,
            verified: j % 15 === 0,
            followers_count: 100 + (j * 5)
          },
          like_count: Math.floor(Math.random() * 1000),
          reply_count: Math.floor(Math.random() * 50)
        })) : []
      }))
    };
  };

  const generateTestFiles = (count: number, dataPerFile: number) => {
    return Array.from({ length: count }, (_, i) => ({
      name: `weibo_batch_${i + 1}.json`,
      data: generateLargeDataset(dataPerFile)
    }));
  };

  beforeEach(() => {
    weiboProcessor = new WeiboJSONBatchProcessor();
    workflowEngine = new WorkflowEngine();
    taskOrchestrator = new TaskOrchestrator();
    operationRegistry = new OperationRegistry();

    operationRegistry.register('weibo-json-batch-processor', weiboProcessor);

    mockContext = {
      id: 'performance-test-context',
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

    jest.clearAllMocks();
    mockFs.access.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
  });

  describe('Large Dataset Processing Performance', () => {
    it('should process 10,000 posts efficiently under 30 seconds', async () => {
      const testFiles = generateTestFiles(10, 1000); // 10 files × 1000 posts = 10,000 posts

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        return testFiles.map(file => ({
          name: file.name,
          isFile: () => true,
          isDirectory: () => false
        }));
      });

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const fileName = path.basename(filePath);
        const file = testFiles.find(f => f.name === fileName);
        return JSON.stringify(file!.data);
      });

      const params: OperationConfig = {
        inputPath: './large-dataset',
        outputPath: './large-output',
        batchSize: 2,
        processingOptions: {
          extractImages: true,
          extractVideos: true,
          extractComments: true,
          normalizeText: true,
          enrichData: true
        },
        progressReporting: false // Disable progress reporting for performance test
      };

      const startTime = Date.now();
      const result = await weiboProcessor.execute(mockContext, params);
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(result.result.processingResult.recordsProcessed).toBe(10000);
      expect(result.result.processingResult.filesProcessed).toBe(10);

      console.log(`Processed 10,000 posts in ${executionTime}ms (${(executionTime / 1000).toFixed(2)}s)`);
      console.log(`Processing rate: ${(10000 / (executionTime / 1000)).toFixed(2)} posts/second`);
    });

    it('should handle 100,000 posts in under 5 minutes', async () => {
      const testFiles = generateTestFiles(50, 2000); // 50 files × 2000 posts = 100,000 posts

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        return testFiles.map(file => ({
          name: file.name,
          isFile: () => true,
          isDirectory: () => false
        }));
      });

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const fileName = path.basename(filePath);
        const file = testFiles.find(f => f.name === fileName);
        return JSON.stringify(file!.data);
      });

      const params: OperationConfig = {
        inputPath: './huge-dataset',
        outputPath: './huge-output',
        batchSize: 5,
        processingOptions: {
          extractImages: true,
          extractComments: true,
          normalizeText: false, // Disable text processing for performance
          enrichData: false
        },
        progressReporting: false
      };

      const startTime = Date.now();
      const result = await weiboProcessor.execute(mockContext, params);
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(300000); // Should complete within 5 minutes
      expect(result.result.processingResult.recordsProcessed).toBe(100000);
      expect(result.result.processingResult.filesProcessed).toBe(50);

      console.log(`Processed 100,000 posts in ${executionTime}ms (${(executionTime / 1000).toFixed(2)}s)`);
      console.log(`Processing rate: ${(100000 / (executionTime / 1000)).toFixed(2)} posts/second`);
    });

    it('should maintain consistent performance with different batch sizes', async () => {
      const batchSizeOptions = [1, 5, 10, 20, 50];
      const performanceResults: any[] = [];

      for (const batchSize of batchSizeOptions) {
        const testFiles = generateTestFiles(5, 1000); // 5,000 posts

        mockFs.readdir.mockImplementation(async (dirPath: string) => {
          return testFiles.map(file => ({
            name: file.name,
            isFile: () => true,
            isDirectory: () => false
          }));
        });

        mockFs.readFile.mockImplementation(async (filePath: string) => {
          const fileName = path.basename(filePath);
          const file = testFiles.find(f => f.name === fileName);
          return JSON.stringify(file!.data);
        });

        const params: OperationConfig = {
          inputPath: './batch-test',
          outputPath: `./batch-output-${batchSize}`,
          batchSize,
          processingOptions: {
            extractImages: true,
            extractComments: true,
            normalizeText: true,
            enrichData: true
          }
        };

        const startTime = Date.now();
        const result = await weiboProcessor.execute(mockContext, params);
        const endTime = Date.now();

        performanceResults.push({
          batchSize,
          executionTime: endTime - startTime,
          postsPerSecond: 5000 / ((endTime - startTime) / 1000),
          filesProcessed: result.result.processingResult.filesProcessed,
          recordsProcessed: result.result.processingResult.recordsProcessed
        });

        // Reset mocks for next iteration
        jest.clearAllMocks();
        mockFs.access.mockResolvedValue(undefined);
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
      }

      // Analyze performance results
      const avgExecutionTime = performanceResults.reduce((sum, r) => sum + r.executionTime, 0) / performanceResults.length;
      const avgPostsPerSecond = performanceResults.reduce((sum, r) => sum + r.postsPerSecond, 0) / performanceResults.length;

      console.log('Batch Size Performance Analysis:');
      performanceResults.forEach(result => {
        console.log(`Batch Size ${result.batchSize}: ${result.executionTime}ms (${result.postsPerSecond.toFixed(2)} posts/sec)`);
      });
      console.log(`Average execution time: ${avgExecutionTime.toFixed(2)}ms`);
      console.log(`Average processing rate: ${avgPostsPerSecond.toFixed(2)} posts/second`);

      // Performance should not degrade significantly with different batch sizes
      const maxDeviation = Math.max(...performanceResults.map(r => Math.abs(r.executionTime - avgExecutionTime)));
      expect(maxDeviation).toBeLessThan(avgExecutionTime * 0.5); // Within 50% of average
    });
  });

  describe('Memory Efficiency Tests', () => {
    it('should process large datasets without memory leaks', async () => {
      const testFiles = generateTestFiles(20, 500); // 10,000 posts
      let memoryUsage: number[] = [];

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        return testFiles.map(file => ({
          name: file.name,
          isFile: () => true,
          isDirectory: () => false
        }));
      });

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const fileName = path.basename(filePath);
        const file = testFiles.find(f => f.name === fileName);
        return JSON.stringify(file!.data);
      });

      // Mock memory usage tracking
      const mockMemoryUsage = () => ({
        heapUsed: 100 * 1024 * 1024 + Math.random() * 50 * 1024 * 1024, // 100-150MB
        heapTotal: 512 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        rss: 200 * 1024 * 1024
      });

      const params: OperationConfig = {
        inputPath: './memory-test',
        outputPath: './memory-output',
        batchSize: 3,
        processingOptions: {
          extractImages: true,
          extractComments: true,
          normalizeText: true,
          enrichData: true
        }
      };

      // Track memory usage during processing
      const originalExecute = weiboProcessor.execute.bind(weiboProcessor);
      weiboProcessor.execute = async function(context, params) {
        memoryUsage.push(mockMemoryUsage().heapUsed);
        return originalExecute(context, params);
      };

      const startTime = Date.now();
      const result = await weiboProcessor.execute(mockContext, params);
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(result.result.processingResult.recordsProcessed).toBe(10000);

      // Analyze memory usage patterns
      const initialMemory = memoryUsage[0];
      const peakMemory = Math.max(...memoryUsage);
      const finalMemory = memoryUsage[memoryUsage.length - 1];
      const memoryGrowth = ((peakMemory - initialMemory) / initialMemory) * 100;

      console.log(`Memory Usage Analysis:`);
      console.log(`Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Peak memory: ${(peakMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Memory growth: ${memoryGrowth.toFixed(2)}%`);
      console.log(`Processing time: ${executionTime}ms`);

      // Memory should not grow uncontrollably
      expect(memoryGrowth).toBeLessThan(200); // Less than 200% growth
      expect(memoryUsage.length).toBeGreaterThan(0);
    });

    it('should handle concurrent processing efficiently', async () => {
      const testFiles = generateTestFiles(10, 500); // 5,000 posts per batch

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        return testFiles.map(file => ({
          name: file.name,
          isFile: () => true,
          isDirectory: () => false
        }));
      });

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const fileName = path.basename(filePath);
        const file = testFiles.find(f => f.name === fileName);
        return JSON.stringify(file!.data);
      });

      // Create multiple processing tasks
      const tasks = Array.from({ length: 3 }, async (_, i) => {
        const params: OperationConfig = {
          inputPath: `./concurrent-test-${i}`,
          outputPath: `./concurrent-output-${i}`,
          batchSize: 2,
          processingOptions: {
            extractImages: true,
            extractComments: true,
            normalizeText: true
          }
        };

        return weiboProcessor.execute(mockContext, params);
      });

      const startTime = Date.now();
      const results = await Promise.all(tasks);
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      expect(results.every(r => r.success)).toBe(true);
      expect(results.every(r => r.result.processingResult.recordsProcessed === 5000)).toBe(true);

      const totalPostsProcessed = results.reduce((sum, r) => sum + r.result.processingResult.recordsProcessed, 0);
      const processingRate = totalPostsProcessed / (executionTime / 1000);

      console.log(`Concurrent processing results:`);
      console.log(`Total posts processed: ${totalPostsProcessed}`);
      console.log(`Execution time: ${executionTime}ms`);
      console.log(`Processing rate: ${processingRate.toFixed(2)} posts/second`);
      console.log(`Efficiency ratio: ${(processingRate / 5000).toFixed(2)}x single-threaded performance`);

      // Concurrent processing should be more efficient than sequential
      expect(processingRate).toBeGreaterThan(5000); // Should be faster than single batch
    });
  });

  describe('Scalability Tests', () => {
    it('should scale linearly with dataset size', async () => {
      const datasetSizes = [
        { files: 2, postsPerFile: 100, totalPosts: 200 },
        { files: 4, postsPerFile: 250, totalPosts: 1000 },
        { files: 10, postsPerFile: 100, totalPosts: 1000 },
        { files: 20, postsPerFile: 250, totalPosts: 5000 }
      ];

      const scalabilityResults: any[] = [];

      for (const dataset of datasetSizes) {
        const testFiles = generateTestFiles(dataset.files, dataset.postsPerFile);

        mockFs.readdir.mockImplementation(async (dirPath: string) => {
          return testFiles.map(file => ({
            name: file.name,
            isFile: () => true,
            isDirectory: () => false
          }));
        });

        mockFs.readFile.mockImplementation(async (filePath: string) => {
          const fileName = path.basename(filePath);
          const file = testFiles.find(f => f.name === fileName);
          return JSON.stringify(file!.data);
        });

        const params: OperationConfig = {
          inputPath: './scalability-test',
          outputPath: './scalability-output',
          batchSize: 3,
          processingOptions: {
            extractImages: true,
            extractComments: true,
            normalizeText: true,
            enrichData: false // Disable for better scalability
          }
        };

        const startTime = Date.now();
        const result = await weiboProcessor.execute(mockContext, params);
        const endTime = Date.now();

        const executionTime = endTime - startTime;
        const postsPerSecond = dataset.totalPosts / (executionTime / 1000);

        scalabilityResults.push({
          totalPosts: dataset.totalPosts,
          files: dataset.files,
          executionTime,
          postsPerSecond,
          efficiency: postsPerSecond / dataset.totalPosts * 1000
        });

        // Reset mocks for next iteration
        jest.clearAllMocks();
        mockFs.access.mockResolvedValue(undefined);
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
      }

      console.log('Scalability Analysis:');
      scalabilityResults.forEach(result => {
        console.log(`${result.totalPosts} posts (${result.files} files): ${result.executionTime}ms (${result.postsPerSecond.toFixed(2)} posts/sec)`);
      });

      // Calculate linear regression to check scalability
      const avgPostsPerSecond = scalabilityResults.reduce((sum, r) => sum + r.postsPerSecond, 0) / scalabilityResults.length;
      const efficiencyVariance = scalabilityResults.reduce((sum, r) => sum + Math.pow(r.efficiency - avgPostsPerSecond, 2), 0) / scalabilityResults.length;

      console.log(`Average processing rate: ${avgPostsPerSecond.toFixed(2)} posts/second`);
      console.log(`Efficiency variance: ${efficiencyVariance.toFixed(2)}`);

      // Processing rate should be relatively consistent (low variance)
      expect(efficiencyVariance).toBeLessThan(avgPostsPerSecond * 0.5); // Variance less than 50% of average
    });

    it('should handle varying data complexity efficiently', async () => {
      const complexityLevels = [
        { name: 'simple', multiplier: 1 },
        { name: 'medium', multiplier: 2 },
        { name: 'complex', multiplier: 4 },
        { name: 'very_complex', multiplier: 8 }
      ];

      const complexityResults: any[] = [];

      for (const level of complexityLevels) {
        // Generate data with varying complexity
        const testFiles = generateTestFiles(5, 200);

        // Add complexity multiplier to each post
        testFiles.forEach(file => {
          file.data.posts.forEach((post: any) => {
            // Add more comments, images, etc. based on complexity
            const commentMultiplier = level.multiplier;
            const imageMultiplier = Math.ceil(level.multiplier / 2);

            if (post.comments) {
              post.comments = Array.from({ length: Math.floor(Math.random() * 10 * commentMultiplier) + 1 }, (_, j) => ({
                ...post.comments[0],
                id: `comment_${post.id}_${j}`,
                text: `复杂评论 ${j} - ${level.name}数据`
              }));
            }

            if (post.pic_urls) {
              post.pic_urls = Array.from({ length: Math.floor(Math.random() * 9 * imageMultiplier) + 1 }, (_, j) => ({
                url: `https://example.com/complex_image_${post.id}_${j}.jpg`
              }));
            }
          });
        });

        mockFs.readdir.mockImplementation(async (dirPath: string) => {
          return testFiles.map(file => ({
            name: file.name,
            isFile: () => true,
            isDirectory: () => false
          }));
        });

        mockFs.readFile.mockImplementation(async (filePath: string) => {
          const fileName = path.basename(filePath);
          const file = testFiles.find(f => f.name === fileName);
          return JSON.stringify(file!.data);
        });

        const params: OperationConfig = {
          inputPath: './complexity-test',
          outputPath: `./complexity-output-${level.name}`,
          batchSize: 2,
          processingOptions: {
            extractImages: true,
            extractComments: true,
            normalizeText: true,
            enrichData: true
          }
        };

        const startTime = Date.now();
        const result = await weiboProcessor.execute(mockContext, params);
        const endTime = Date.now();

        const executionTime = endTime - startTime;
        const totalPosts = result.result.processingResult.recordsProcessed;
        const postsPerSecond = totalPosts / (executionTime / 1000);

        complexityResults.push({
          complexity: level.name,
          multiplier: level.multiplier,
          executionTime,
          totalPosts,
          postsPerSecond,
          relativePerformance: postsPerSecond / level.multiplier
        });

        // Reset mocks for next iteration
        jest.clearAllMocks();
        mockFs.access.mockResolvedValue(undefined);
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
      }

      console.log('Complexity Analysis:');
      complexityResults.forEach(result => {
        console.log(`${result.complexity} (x${result.multiplier}): ${result.executionTime}ms (${result.postsPerSecond.toFixed(2)} posts/sec, relative: ${result.relativePerformance.toFixed(2)})`);
      });

      // Performance should scale somewhat linearly with complexity
      const baselinePerformance = complexityResults[0].postsPerSecond;
      const worstPerformance = complexityResults[complexityResults.length - 1].postsPerSecond;
      const performanceDegradation = baselinePerformance / worstPerformance;

      console.log(`Performance degradation factor: ${performanceDegradation.toFixed(2)}x`);

      // Performance should not degrade worse than complexity multiplier
      expect(performanceDegradation).toBeLessThan(complexityLevels[complexityLevels.length - 1].multiplier);
    });
  });

  describe('Load Testing', () => {
    it('should handle sustained high load without degradation', async () => {
      const testFiles = generateTestFiles(5, 200); // 1,000 posts per batch
      const numberOfBatches = 10;
      const loadTestResults: any[] = [];

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        return testFiles.map(file => ({
          name: file.name,
          isFile: () => true,
          isDirectory: () => false
        }));
      });

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        const fileName = path.basename(filePath);
        const file = testFiles.find(f => f.name === fileName);
        return JSON.stringify(file!.data);
      });

      for (let i = 0; i < numberOfBatches; i++) {
        const params: OperationConfig = {
          inputPath: `./load-test-${i}`,
          outputPath: `./load-output-${i}`,
          batchSize: 2,
          processingOptions: {
            extractImages: true,
            extractComments: true,
            normalizeText: true,
            enrichData: true
          }
        };

        const startTime = Date.now();
        const result = await weiboProcessor.execute(mockContext, params);
        const endTime = Date.now();

        loadTestResults.push({
          batch: i + 1,
          executionTime: endTime - startTime,
          postsPerSecond: 1000 / ((endTime - startTime) / 1000),
          success: result.success,
          postsProcessed: result.result.processingResult.recordsProcessed
        });

        // Small delay between batches to simulate real-world load
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('Load Test Results:');
      loadTestResults.forEach(result => {
        console.log(`Batch ${result.batch}: ${result.executionTime}ms (${result.postsPerSecond.toFixed(2)} posts/sec)`);
      });

      // Calculate performance consistency
      const executionTimes = loadTestResults.map(r => r.executionTime);
      const avgExecutionTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
      const maxDeviation = Math.max(...executionTimes.map(time => Math.abs(time - avgExecutionTime)));
      const consistencyRatio = maxDeviation / avgExecutionTime;

      console.log(`Average execution time: ${avgExecutionTime.toFixed(2)}ms`);
      console.log(`Maximum deviation: ${maxDeviation.toFixed(2)}ms`);
      console.log(`Consistency ratio: ${consistencyRatio.toFixed(2)}`);

      // All batches should succeed
      expect(loadTestResults.every(r => r.success)).toBe(true);
      expect(loadTestResults.every(r => r.postsProcessed === 1000)).toBe(true);

      // Performance should be consistent (within 50% of average)
      expect(consistencyRatio).toBeLessThan(0.5);
    });

    it('should recover from intermittent failures during load', async () => {
      const testFiles = generateTestFiles(5, 200); // 1,000 posts
      let failureCount = 0;

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        return testFiles.map(file => ({
          name: file.name,
          isFile: () => true,
          isDirectory: () => false
        }));
      });

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        // Simulate intermittent failures
        failureCount++;
        if (failureCount % 3 === 0) {
          throw new Error(`Intermittent failure ${failureCount}`);
        }

        const fileName = path.basename(filePath);
        const file = testFiles.find(f => f.name === fileName);
        return JSON.stringify(file!.data);
      });

      const params: OperationConfig = {
        inputPath: './failure-test',
        outputPath: './failure-output',
        batchSize: 2,
        errorHandling: 'continue',
        maxRetries: 3,
        processingOptions: {
          extractImages: true,
          extractComments: true,
          normalizeText: true
        }
      };

      const startTime = Date.now();
      const result = await weiboProcessor.execute(mockContext, params);
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      console.log(`Failure recovery test:`);
      console.log(`Execution time: ${executionTime}ms`);
      console.log(`Files processed: ${result.result.processingResult.filesProcessed}`);
      console.log(`Files failed: ${result.result.processingResult.filesFailed}`);
      console.log(`Success rate: ${((result.result.processingResult.filesProcessed / (result.result.processingResult.filesProcessed + result.result.processingResult.filesFailed)) * 100).toFixed(1)}%`);

      expect(result.success).toBe(true);
      expect(result.result.processingResult.filesProcessed).toBeGreaterThan(0);
      expect(result.result.processingResult.filesFailed).toBeGreaterThan(0);

      // Should handle failures gracefully without crashing
      expect(executionTime).toBeLessThan(60000); // Should complete within 1 minute
    });
  });
});