// Simple JavaScript test to demonstrate Weibo batch download functionality
const { WeiboJSONBatchProcessor } = require('./dist/micro-operations/WeiboOperations.js');

// Mock fs module
const mockFs = {
  access: jest.fn(),
  readdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
};

jest.mock('fs/promises', () => mockFs);

describe('WeiboJSONBatchProcessor Simple Test', () => {
  let processor;
  let mockContext;

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
      eventBus: {
        on: jest.fn(),
        emit: jest.fn()
      }
    };

    // Reset mocks
    jest.clearAllMocks();

    // Setup default mock responses
    mockFs.access.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
  });

  it('should validate parameters correctly', () => {
    const validParams = { inputPath: './test-data' };
    const result = processor.validateParameters(validParams);

    expect(result.isValid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should require inputPath parameter', () => {
    const invalidParams = {};
    const result = processor.validateParameters(invalidParams);

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

  it('should find JSON files in directory', async () => {
    mockFs.readdir.mockResolvedValue([
      { name: 'file1.json', isFile: () => true, isDirectory: () => false },
      { name: 'file2.json', isFile: () => true, isDirectory: () => false },
      { name: 'not_json.txt', isFile: () => true, isDirectory: () => false }
    ]);

    const params = { inputPath: './test-data', recursive: false };
    const files = await processor.findJSONFiles(params);

    expect(files).toHaveLength(2);
    expect(files).toContain('./test-data/file1.json');
    expect(files).toContain('./test-data/file2.json');
  });

  it('should process basic Weibo data', async () => {
    const mockWeiboData = {
      posts: [
        {
          id: '123456789',
          text: '这是一条测试微博 #测试# @testuser',
          created_at: '2024-01-15T10:30:00Z',
          user: {
            id: 'user123',
            screen_name: '测试用户',
            followers_count: 1000,
            friends_count: 500,
            statuses_count: 200
          },
          source: 'iPhone客户端',
          reposts_count: 10,
          comments_count: 5,
          attitudes_count: 20
        }
      ]
    };

    mockFs.readdir.mockResolvedValue([
      { name: 'test.json', isFile: () => true, isDirectory: () => false }
    ]);

    mockFs.readFile.mockResolvedValue(JSON.stringify(mockWeiboData));

    const params = {
      inputPath: './test-data',
      outputPath: './output',
      batchSize: 1,
      processingOptions: {
        extractImages: false,
        extractComments: false,
        normalizeText: true,
        enrichData: false
      }
    };

    const result = await processor.execute(mockContext, params);

    expect(result.success).toBe(true);
    expect(result.result.processingResult.filesProcessed).toBe(1);
    expect(result.result.processingResult.recordsProcessed).toBe(1);
    expect(result.result.processingResult.dataSummary.totalPosts).toBe(1);
  });

  it('should handle file processing errors gracefully', async () => {
    mockFs.readdir.mockResolvedValue([
      { name: 'corrupt.json', isFile: () => true, isDirectory: () => false }
    ]);

    mockFs.readFile.mockRejectedValue(new Error('Invalid JSON format'));

    const params = {
      inputPath: './test-data',
      outputPath: './output',
      batchSize: 1,
      errorHandling: 'continue'
    };

    const result = await processor.execute(mockContext, params);

    expect(result.success).toBe(true);
    expect(result.result.processingResult.filesFailed).toBe(1);
    expect(result.result.processingResult.filesProcessed).toBe(0);
  });

  it('should normalize text correctly', () => {
    const text = '这是一条测试微博 @用户名 #话题标签# https://example.com';
    const normalized = processor.normalizeText(text);

    expect(normalized).toBe('这是一条测试微博 [USER] [TOPIC] [URL]');
  });

  it('should analyze sentiment correctly', () => {
    const positiveText = '这个产品很好，我很喜欢';
    const negativeText = '这个产品很差，我很失望';
    const neutralText = '这是一个产品';

    expect(processor.analyzeSentiment(positiveText)).toBe('positive');
    expect(processor.analyzeSentiment(negativeText)).toBe('negative');
    expect(processor.analyzeSentiment(neutralText)).toBe('neutral');
  });

  it('should calculate engagement score correctly', () => {
    const post = {
      attitudesCount: 100,
      commentsCount: 50,
      repostsCount: 25
    };

    const score = processor.calculateEngagementScore(post);
    expect(score).toBe(100 + 50 * 2 + 25 * 3); // 100 + 100 + 75 = 275
  });

  it('should extract images correctly', () => {
    const post = {
      pic_urls: [{ url: 'https://example.com/image1.jpg' }],
      thumbnail_pic: 'https://example.com/thumb.jpg',
      bmiddle_pic: 'https://example.com/middle.jpg',
      original_pic: 'https://example.com/original.jpg'
    };

    const images = processor.extractImages(post);

    expect(images).toHaveLength(4);
    expect(images).toContainEqual({ url: 'https://example.com/thumb.jpg', size: 'thumbnail' });
    expect(images).toContainEqual({ url: 'https://example.com/middle.jpg', size: 'medium' });
    expect(images).toContainEqual({ url: 'https://example.com/original.jpg', size: 'original' });
  });
});

console.log('WeiboJSONBatchProcessor tests created successfully!');
console.log('Key functionality tested:');
console.log('- Parameter validation');
console.log('- File discovery and processing');
console.log('- Error handling');
console.log('- Text normalization');
console.log('- Sentiment analysis');
console.log('- Engagement scoring');
console.log('- Image extraction');
console.log('- Batch processing workflow');