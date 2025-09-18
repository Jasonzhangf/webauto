import { WeiboJSONBatchProcessor } from '../../src/micro-operations/WeiboOperations';
import { OperationContext, OperationConfig } from '../../src/types';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('WeiboJSONBatchProcessor', () => {
  let processor: WeiboJSONBatchProcessor;
  let mockContext: OperationContext;

  // Mock Weibo data
  const mockWeiboData = {
    posts: [
      {
        id: '123456789',
        text: '这是一条测试微博 #测试# @testuser',
        created_at: '2024-01-15T10:30:00Z',
        user: {
          id: 'user123',
          screen_name: '测试用户',
          profile_image_url: 'https://example.com/avatar.jpg',
          verified: false,
          followers_count: 1000,
          friends_count: 500,
          statuses_count: 200
        },
        source: 'iPhone客户端',
        reposts_count: 10,
        comments_count: 5,
        attitudes_count: 20,
        pic_urls: [
          { url: 'https://example.com/image1.jpg' },
          { url: 'https://example.com/image2.jpg' }
        ],
        comments: [
          {
            id: 'comment1',
            text: '评论内容',
            created_at: '2024-01-15T11:00:00Z',
            user: {
              id: 'commenter1',
              screen_name: '评论用户',
              profile_image_url: 'https://example.com/commenter.jpg'
            },
            like_count: 3
          }
        ]
      }
    ]
  };

  beforeEach(() => {
    processor = new WeiboJSONBatchProcessor();
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

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Parameter Validation', () => {
    it('should validate parameters successfully with required inputPath', () => {
      const params = { inputPath: './test-data' };
      const result = processor.validateParameters(params);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return validation error for missing inputPath', () => {
      const params = {};
      const result = processor.validateParameters(params);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Required parameter \'inputPath\' is missing or empty');
    });

    it('should apply default optional parameters', () => {
      const params = { inputPath: './test-data' };
      const result = processor.validateParameters(params);

      expect(result.finalParams.batchSize).toBe(100);
      expect(result.finalParams.outputPath).toBe('./processed-weibo-data/');
      expect(result.finalParams.recursive).toBe(true);
    });

    it('should merge custom parameters with defaults', () => {
      const params = {
        inputPath: './test-data',
        batchSize: 50,
        outputFormat: 'csv'
      };
      const result = processor.validateParameters(params);

      expect(result.finalParams.batchSize).toBe(50);
      expect(result.finalParams.outputFormat).toBe('csv');
      expect(result.finalParams.recursive).toBe(true); // default value
    });
  });

  describe('File Discovery', () => {
    it('should find JSON files in directory recursively', async () => {
      const mockFiles = [
        'file1.json',
        'file2.json',
        'subdir/file3.json',
        'subdir/subsubdir/file4.json',
        'not_json.txt'
      ];

      mockFs.readdir.mockImplementation(async (dirPath: string, options: any) => {
        if (dirPath === './test-data') {
          return [
            { name: 'file1.json', isFile: () => true, isDirectory: () => false },
            { name: 'file2.json', isFile: () => true, isDirectory: () => false },
            { name: 'subdir', isFile: () => false, isDirectory: () => true }
          ];
        } else if (dirPath === './test-data/subdir') {
          return [
            { name: 'file3.json', isFile: () => true, isDirectory: () => false },
            { name: 'subsubdir', isFile: () => false, isDirectory: () => true }
          ];
        } else if (dirPath === './test-data/subdir/subsubdir') {
          return [
            { name: 'file4.json', isFile: () => true, isDirectory: () => false }
          ];
        }
        return [];
      });

      mockFs.access.mockResolvedValue(undefined);

      const params = { inputPath: './test-data', recursive: true };
      const files = await (processor as any).findJSONFiles(params);

      expect(files).toHaveLength(4);
      expect(files).toContain(path.join('./test-data', 'file1.json'));
      expect(files).toContain(path.join('./test-data', 'subdir', 'file3.json'));
      expect(files).toContain(path.join('./test-data', 'subdir', 'subsubdir', 'file4.json'));
    });

    it('should respect maxFiles limit', async () => {
      const mockFiles = Array.from({ length: 150 }, (_, i) => `file${i + 1}.json`);

      mockFs.readdir.mockImplementation(async () => {
        return mockFiles.map(name => ({
          name,
          isFile: () => true,
          isDirectory: () => false
        }));
      });

      mockFs.access.mockResolvedValue(undefined);

      const params = { inputPath: './test-data', maxFiles: 100 };
      const files = await (processor as any).findJSONFiles(params);

      expect(files).toHaveLength(100);
    });

    it('should handle file access errors gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

      const params = { inputPath: './test-data' };
      const files = await (processor as any).findJSONFiles(params);

      expect(files).toHaveLength(0);
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'Cannot scan directory: ./test-data',
        { error: 'Permission denied' }
      );
    });
  });

  describe('Batch Processing', () => {
    it('should process files in batches correctly', async () => {
      const mockFiles = ['file1.json', 'file2.json', 'file3.json', 'file4.json', 'file5.json'];
      const params = { batchSize: 2, outputPath: './output' };

      // Mock file reading
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockWeiboData));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined);

      const result = await (processor as any).processFilesInBatches(mockFiles, params);

      expect(result.batchesProcessed).toBe(3); // 5 files in batches of 2 = 3 batches
      expect(result.filesProcessed).toBe(5);
      expect(result.recordsProcessed).toBe(5); // 1 record per file
      expect(mockFs.writeFile).toHaveBeenCalledTimes(5); // 5 files processed
    });

    it('should handle batch processing errors with continue mode', async () => {
      const mockFiles = ['file1.json', 'file2.json', 'file3.json'];
      const params = {
        batchSize: 2,
        outputPath: './output',
        errorHandling: 'continue'
      };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockWeiboData))
        .mockRejectedValueOnce(new Error('File read error'))
        .mockResolvedValueOnce(JSON.stringify(mockWeiboData));

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined);

      const result = await (processor as any).processFilesInBatches(mockFiles, params);

      expect(result.filesProcessed).toBe(2);
      expect(result.filesFailed).toBe(1);
      expect(result.processingErrors).toHaveLength(1);
      expect(result.processingErrors[0].type).toBe('file_error');
    });

    it('should stop processing on error with stop mode', async () => {
      const mockFiles = ['file1.json', 'file2.json', 'file3.json'];
      const params = {
        batchSize: 2,
        outputPath: './output',
        errorHandling: 'stop'
      };

      mockFs.readFile.mockRejectedValue(new Error('File read error'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined);

      await expect(
        (processor as any).processFilesInBatches(mockFiles, params)
      ).rejects.toThrow('File read error');
    });

    it('should report progress at intervals', async () => {
      const mockFiles = Array.from({ length: 250 }, (_, i) => `file${i + 1}.json`);
      const params = {
        batchSize: 50,
        outputPath: './output',
        progressReporting: true,
        reportInterval: 100
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockWeiboData));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined);

      await (processor as any).processFilesInBatches(mockFiles, params);

      // Should report progress at 0, 100, 200 files
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'Progress update',
        expect.objectContaining({
          processedFiles: 250,
          totalFiles: 250,
          progress: 100
        })
      );
    });
  });

  describe('Post Processing', () => {
    it('should process post data correctly', async () => {
      const post = mockWeiboData.posts[0];
      const params = {
        processingOptions: {
          extractImages: true,
          extractVideos: true,
          extractComments: true,
          normalizeText: true,
          enrichData: true
        }
      };

      const processedPost = await (processor as any).processPost(post, params);

      expect(processedPost.id).toBe('123456789');
      expect(processedPost.text).toBe('这是一条测试微博 #测试# @testuser');
      expect(processedPost.user).toBeDefined();
      expect(processedPost.images).toHaveLength(2);
      expect(processedPost.comments).toHaveLength(1);
      expect(processedPost.normalizedText).toBe('这是一条测试微博 [TOPIC] [USER]');
      expect(processedPost.enrichedData).toBeDefined();
    });

    it('should extract images correctly', () => {
      const post = {
        pic_urls: [{ url: 'https://example.com/image1.jpg' }],
        thumbnail_pic: 'https://example.com/thumb.jpg',
        bmiddle_pic: 'https://example.com/middle.jpg',
        original_pic: 'https://example.com/original.jpg'
      };

      const images = (processor as any).extractImages(post);

      expect(images).toHaveLength(4);
      expect(images).toContainEqual({ url: 'https://example.com/thumb.jpg', size: 'thumbnail' });
      expect(images).toContainEqual({ url: 'https://example.com/middle.jpg', size: 'medium' });
      expect(images).toContainEqual({ url: 'https://example.com/original.jpg', size: 'original' });
      expect(images).toContainEqual({ url: 'https://example.com/image1.jpg', size: 'original' });
    });

    it('should normalize text correctly', () => {
      const text = '这是一条测试微博 @用户名 #话题标签# https://example.com';
      const normalized = (processor as any).normalizeText(text);

      expect(normalized).toBe('这是一条测试微博 [USER] [TOPIC] [URL]');
    });

    it('should analyze sentiment correctly', () => {
      const positiveText = '这个产品很好，我很喜欢';
      const negativeText = '这个产品很差，我很失望';
      const neutralText = '这是一个产品';

      expect((processor as any).analyzeSentiment(positiveText)).toBe('positive');
      expect((processor as any).analyzeSentiment(negativeText)).toBe('negative');
      expect((processor as any).analyzeSentiment(neutralText)).toBe('neutral');
    });

    it('should apply post filters correctly', () => {
      const post = {
        id: '123',
        createdAt: '2024-01-15T10:30:00Z',
        attitudesCount: 50,
        commentsCount: 10,
        repostsCount: 5,
        user: { id: 'user123' },
        text: '包含关键词的内容'
      };

      const filters = {
        minLikes: 10,
        minComments: 5,
        minReposts: 3,
        userFilters: ['user123'],
        contentFilters: ['关键词'],
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-12-31T23:59:59Z'
        }
      };

      expect((processor as any).postPassesFilters(post, filters)).toBe(true);

      // Test failing filters
      post.attitudesCount = 5;
      expect((processor as any).postPassesFilters(post, filters)).toBe(false);
    });
  });

  describe('User Processing', () => {
    it('should process user data correctly', () => {
      const user = {
        id: 'user123',
        screen_name: '测试用户',
        profile_image_url: 'https://example.com/avatar.jpg',
        verified: true,
        verified_type: 1,
        followers_count: 5000,
        friends_count: 1000,
        statuses_count: 2000,
        description: '用户简介',
        gender: 'm',
        location: '北京'
      };

      const processedUser = (processor as any).processUser(user);

      expect(processedUser.id).toBe('user123');
      expect(processedUser.screenName).toBe('测试用户');
      expect(processedUser.verified).toBe(true);
      expect(processedUser.verifiedType).toBe(1);
      expect(processedUser.followersCount).toBe(5000);
      expect(processedUser.friendsCount).toBe(1000);
      expect(processedUser.statusesCount).toBe(2000);
      expect(processedUser.raw).toBe(user);
    });
  });

  describe('Comment Processing', () => {
    it('should process comments correctly', async () => {
      const comments = [{
        id: 'comment1',
        text: '评论内容 #话题#',
        created_at: '2024-01-15T11:00:00Z',
        user: {
          id: 'commenter1',
          screen_name: '评论用户',
          profile_image_url: 'https://example.com/commenter.jpg'
        },
        like_count: 5,
        reply_count: 2
      }];

      const params = {
        processingOptions: {
          normalizeText: true
        }
      };

      const processedComments = await (processor as any).processComments(comments, params);

      expect(processedComments).toHaveLength(1);
      expect(processedComments[0].id).toBe('comment1');
      expect(processedComments[0].text).toBe('评论内容 #话题#');
      expect(processedComments[0].normalizedText).toBe('评论内容 [TOPIC]');
      expect(processedComments[0].user).toBeDefined();
      expect(processedComments[0].likeCount).toBe(5);
    });

    it('should handle comment processing errors gracefully', async () => {
      const comments = [{
        id: 'comment1',
        text: '评论内容',
        // Missing created_at which could cause error
        user: {
          id: 'commenter1',
          screen_name: '评论用户'
        }
      }];

      const params = {
        processingOptions: {
          normalizeText: true
        }
      };

      const processedComments = await (processor as any).processComments(comments, params);

      expect(processedComments).toHaveLength(1); // Should still process valid data
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'Comment processing failed',
        expect.objectContaining({
          commentId: 'comment1'
        })
      );
    });
  });

  describe('Data Enrichment', () => {
    it('should enrich post data with analysis', () => {
      const post = {
        id: '123',
        text: '今天天气很好，适合出去玩 #生活#',
        createdAt: '2024-01-15T14:30:00Z',
        attitudesCount: 25,
        commentsCount: 8,
        repostsCount: 3,
        user: { id: 'user123' }
      };

      const enrichedData = (processor as any).enrichPostData(post);

      expect(enrichedData.sentiment).toBeDefined();
      expect(enrichedData.topics).toContain('生活');
      expect(enrichedData.hashtags).toContain('#生活#');
      expect(enrichedData.language).toBe('zh');
      expect(enrichedData.engagementScore).toBe(25 + 8 * 2 + 3 * 3); // 25 + 16 + 9 = 50
      expect(enrichedData.timeOfDay).toBe('afternoon');
      expect(enrichedData.dayOfWeek).toBe('Monday');
    });

    it('should calculate engagement score correctly', () => {
      const post1 = { attitudesCount: 100, commentsCount: 50, repostsCount: 25 };
      const post2 = { attitudesCount: 0, commentsCount: 0, repostsCount: 0 };

      const score1 = (processor as any).calculateEngagementScore(post1);
      const score2 = (processor as any).calculateEngagementScore(post2);

      expect(score1).toBe(100 + 50 * 2 + 25 * 3); // 100 + 100 + 75 = 275
      expect(score2).toBe(0);
    });

    it('should detect time of day correctly', () => {
      const morningPost = { createdAt: '2024-01-15T09:30:00Z' };
      const afternoonPost = { createdAt: '2024-01-15T15:30:00Z' };
      const eveningPost = { createdAt: '2024-01-15T20:30:00Z' };
      const nightPost = { createdAt: '2024-01-15T02:30:00Z' };

      expect((processor as any).getTimeOfDay(morningPost.createdAt)).toBe('morning');
      expect((processor as any).getTimeOfDay(afternoonPost.createdAt)).toBe('afternoon');
      expect((processor as any).getTimeOfDay(eveningPost.createdAt)).toBe('evening');
      expect((processor as any).getTimeOfDay(nightPost.createdAt)).toBe('night');
    });
  });

  describe('Output Generation', () => {
    it('should save processed data correctly', async () => {
      const processedData = {
        posts: [{ id: '123', text: '测试内容' }],
        metadata: {
          sourceFile: 'test.json',
          processedAt: '2024-01-15T10:30:00Z',
          totalPosts: 1
        }
      };

      const params = { outputPath: './output' };

      mockFs.writeFile.mockResolvedValue(undefined);

      await (processor as any).saveProcessedData('/path/to/test.json', processedData, params);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('./output', 'test_processed.json'),
        JSON.stringify(processedData, null, 2)
      );
    });

    it('should convert data to CSV format', () => {
      const processedData = {
        posts: [
          {
            id: '123',
            text: '测试内容，包含"引号"',
            createdAt: '2024-01-15T10:30:00Z',
            user: { id: 'user123', screenName: '测试用户' },
            repostsCount: 10,
            commentsCount: 5,
            attitudesCount: 20
          }
        ]
      };

      const csv = (processor as any).convertToCSV(processedData);

      expect(csv).toContain('id,text,createdAt,userId,userName,repostsCount,commentsCount,attitudesCount');
      expect(csv).toContain('123,"测试内容，包含""引号""",2024-01-15T10:30:00Z,user123,测试用户,10,5,20');
    });

    it('should generate summary report with recommendations', async () => {
      const processingResult = {
        filesProcessed: 100,
        filesFailed: 2,
        recordsProcessed: 5000,
        dataSummary: {
          totalPosts: 5000,
          totalImages: 3000,
          totalVideos: 200,
          totalComments: 1500
        },
        processingErrors: []
      };

      const params = {
        inputPath: './input',
        outputPath: './output',
        batchSize: 50,
        outputFormat: 'json'
      };

      mockFs.writeFile.mockResolvedValue(undefined);

      const report = await (processor as any).generateSummaryReport(processingResult, params);

      expect(report.summary.totalFilesFound).toBe(102);
      expect(report.summary.filesSuccessfullyProcessed).toBe(100);
      expect(report.summary.filesFailed).toBe(2);
      expect(report.summary.successRate).toBe(100 / 102);
      expect(report.recommendations).toBeDefined();
      expect(report.configuration).toBeDefined();
    });
  });

  describe('Full Execution Flow', () => {
    it('should execute complete batch processing workflow', async () => {
      const params = {
        inputPath: './test-data',
        outputPath: './output',
        batchSize: 2,
        createBackup: true,
        backupPath: './backup'
      };

      // Mock file system operations
      mockFs.access.mockImplementation(async (path: string) => {
        if (path === './test-data') {
          throw new Error('Directory does not exist');
        }
        return undefined;
      });

      mockFs.readdir.mockResolvedValue([
        { name: 'file1.json', isFile: () => true, isDirectory: () => false },
        { name: 'file2.json', isFile: () => true, isDirectory: () => false }
      ]);

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockWeiboData));
      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await processor.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.result.processingResult.filesProcessed).toBe(2);
      expect(result.result.processingResult.recordsProcessed).toBe(2);
      expect(result.result.summary).toBeDefined();
      expect(result.metadata.filesProcessed).toBe(2);
      expect(result.metadata.executionTime).toBeGreaterThan(0);

      // Verify directory creation
      expect(mockFs.mkdir).toHaveBeenCalledWith('./output', { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith('./backup', { recursive: true });

      // Verify file operations
      expect(mockFs.writeFile).toHaveBeenCalledTimes(3); // 2 processed files + 1 summary report
    });

    it('should handle execution errors gracefully', async () => {
      const params = {
        inputPath: './test-data',
        outputPath: './output'
      };

      mockFs.access.mockRejectedValue(new Error('Permission denied'));

      const result = await processor.execute(mockContext, params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
      expect(result.metadata).toBeDefined();
      expect(mockContext.logger.error).toHaveBeenCalledWith(
        'Weibo JSON batch processing failed',
        expect.objectContaining({
          inputPath: './test-data',
          error: 'Permission denied'
        })
      );
    });

    it('should update statistics correctly', async () => {
      const params = {
        inputPath: './test-data',
        outputPath: './output'
      };

      mockFs.readdir.mockResolvedValue([
        { name: 'file1.json', isFile: () => true, isDirectory: () => false }
      ]);

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockWeiboData));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined);

      await processor.execute(mockContext, params);

      const stats = processor.getStats();

      expect(stats.totalExecutions).toBe(1);
      expect(stats.successfulExecutions).toBe(1);
      expect(stats.failedExecutions).toBe(0);
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large datasets efficiently', async () => {
      // Create large mock dataset
      const largeDataset = {
        posts: Array.from({ length: 10000 }, (_, i) => ({
          id: `post${i}`,
          text: `测试内容 ${i}`,
          created_at: '2024-01-15T10:30:00Z',
          user: {
            id: `user${i % 100}`, // Reuse users to simulate real data
            screen_name: `用户${i % 100}`,
            followers_count: Math.floor(Math.random() * 10000)
          },
          reposts_count: Math.floor(Math.random() * 100),
          comments_count: Math.floor(Math.random() * 50),
          attitudes_count: Math.floor(Math.random() * 200)
        }))
      };

      const mockFiles = ['large_file.json'];
      const params = {
        inputPath: './test-data',
        outputPath: './output',
        batchSize: 1
      };

      mockFs.readdir.mockResolvedValue([
        { name: 'large_file.json', isFile: () => true, isDirectory: () => false }
      ]);

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(largeDataset));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined);

      const startTime = Date.now();
      const result = await processor.execute(mockContext, params);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.result.processingResult.recordsProcessed).toBe(10000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify memory efficiency by checking that processed data is correct
      expect(result.result.processingResult.dataSummary.totalPosts).toBe(10000);
    });

    it('should handle memory cleanup correctly', () => {
      const processor = new WeiboJSONBatchProcessor();

      // Simulate multiple executions
      for (let i = 0; i < 10; i++) {
        processor.updateStats(true, 100 + i);
      }

      const statsBefore = processor.getStats();
      expect(statsBefore.totalExecutions).toBe(10);
      expect(statsBefore.averageExecutionTime).toBeGreaterThan(0);

      // Reset stats
      processor.resetStats();

      const statsAfter = processor.getStats();
      expect(statsAfter.totalExecutions).toBe(0);
      expect(statsAfter.averageExecutionTime).toBe(0);
    });
  });
});