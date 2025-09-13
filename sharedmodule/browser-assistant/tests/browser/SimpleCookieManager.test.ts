/**
 * SimpleCookieManager 单元测试
 */

import { SimpleCookieManager } from '../../src/browser/SimpleCookieManager';
import { createMockCookie, createTestDir, cleanupTestDir, mockFileSystem } from '../test-utils';

// Mock file system
const mockFs = mockFileSystem();

describe('SimpleCookieManager', () => {
  let cookieManager: SimpleCookieManager;
  let testStorageDir: string;

  beforeEach(() => {
    testStorageDir = './test-cookies';
    cookieManager = new SimpleCookieManager(testStorageDir);
    
    // 重置mock
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupTestDir(testStorageDir);
  });

  describe('构造函数', () => {
    test('应该使用默认存储路径', () => {
      const manager = new SimpleCookieManager();
      expect(manager).toBeInstanceOf(SimpleCookieManager);
    });

    test('应该使用自定义存储路径', () => {
      const customPath = './custom-cookies';
      const manager = new SimpleCookieManager(customPath);
      expect(manager).toBeInstanceOf(SimpleCookieManager);
    });

    test('应该在构造时创建存储目录', () => {
      new SimpleCookieManager(testStorageDir);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(testStorageDir, { recursive: true });
    });
  });

  describe('ensureStorageDirectory', () => {
    test('应该在目录不存在时创建目录', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const manager = new SimpleCookieManager(testStorageDir);
      
      expect(mockFs.existsSync).toHaveBeenCalledWith(testStorageDir);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(testStorageDir, { recursive: true });
    });

    test('应该在目录存在时不创建目录', () => {
      mockFs.existsSync.mockReturnValue(true);
      
      const manager = new SimpleCookieManager(testStorageDir);
      
      expect(mockFs.existsSync).toHaveBeenCalledWith(testStorageDir);
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('loadCookies', () => {
    let mockContext: any;

    beforeEach(() => {
      mockContext = {
        addCookies: jest.fn()
      };
    });

    test('应该从文件加载Cookie并添加到上下文', async () => {
      const testCookies = [
        createMockCookie({ name: 'test1', value: 'value1' }),
        createMockCookie({ name: 'test2', value: 'value2' })
      ];
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(testCookies));
      
      await cookieManager.loadCookies(mockContext, 'example.com');
      
      expect(mockFs.existsSync).toHaveBeenCalledWith(expect.stringContaining('example.com.json'));
      expect(mockFs.readFileSync).toHaveBeenCalled();
      expect(mockContext.addCookies).toHaveBeenCalledWith(testCookies);
    });

    test('应该在文件不存在时不做任何操作', async () => {
      mockFs.existsSync.mockReturnValue(false);
      
      await cookieManager.loadCookies(mockContext, 'example.com');
      
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
      expect(mockContext.addCookies).not.toHaveBeenCalled();
    });

    test('应该处理JSON解析错误', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid-json');
      
      await cookieManager.loadCookies(mockContext, 'example.com');
      
      expect(mockContext.addCookies).not.toHaveBeenCalled();
    });

    test('应该处理文件读取错误', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });
      
      await cookieManager.loadCookies(mockContext, 'example.com');
      
      expect(mockContext.addCookies).not.toHaveBeenCalled();
    });
  });

  describe('saveCookies', () => {
    let mockPage: any;

    beforeEach(() => {
      mockPage = {
        url: jest.fn().mockReturnValue('https://example.com'),
        context: jest.fn().mockReturnValue({
          cookies: jest.fn().mockResolvedValue([
            createMockCookie({ name: 'test1', value: 'value1' }),
            createMockCookie({ name: 'test2', value: 'value2' })
          ])
        })
      };
    });

    test('应该保存Cookie到文件', async () => {
      mockFs.existsSync.mockReturnValue(false);
      
      await cookieManager.saveCookies(mockPage);
      
      expect(mockPage.url).toHaveBeenCalled();
      expect(mockPage.context().cookies).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('example.com.json'),
        expect.stringContaining('"name":"test1"')
      );
    });

    test('不应该保存空Cookie列表', async () => {
      mockPage.context.mockReturnValue({
        cookies: jest.fn().mockResolvedValue([])
      });
      
      await cookieManager.saveCookies(mockPage);
      
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    test('应该处理无效URL', async () => {
      mockPage.url.mockReturnValue('about:blank');
      
      await cookieManager.saveCookies(mockPage);
      
      expect(mockPage.context().cookies).not.toHaveBeenCalled();
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    test('应该处理Cookie获取错误', async () => {
      mockPage.context.mockReturnValue({
        cookies: jest.fn().mockRejectedValue(new Error('Cookie error'))
      });
      
      await cookieManager.saveCookies(mockPage);
      
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('clearAllCookies', () => {
    beforeEach(() => {
      mockFs.readdirSync.mockReturnValue(['example.com.json', 'test.json', 'other.txt']);
    });

    test('应该清除所有Cookie文件', async () => {
      await cookieManager.clearAllCookies();
      
      expect(mockFs.readdirSync).toHaveBeenCalledWith(testStorageDir);
      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('example.com.json')
      );
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('test.json')
      );
    });

    test('应该只删除.json文件', async () => {
      mockFs.readdirSync.mockReturnValue(['example.com.json', 'test.json', 'other.txt', 'data.js']);
      
      await cookieManager.clearAllCookies();
      
      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(
        expect.stringContaining('other.txt')
      );
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(
        expect.stringContaining('data.js')
      );
    });

    test('应该处理目录读取错误', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Directory read error');
      });
      
      await cookieManager.clearAllCookies();
      
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('getCookieStats', () => {
    beforeEach(() => {
      // 模拟内部cookies Map
      (cookieManager as any).cookies = new Map([
        ['example.com', [
          createMockCookie({ name: 'cookie1' }),
          createMockCookie({ name: 'cookie2' })
        ]],
        ['test.com', [createMockCookie({ name: 'cookie3' })]]
      ]);
    });

    test('应该返回正确的统计信息', () => {
      const stats = cookieManager.getCookieStats();
      
      expect(stats.totalDomains).toBe(2);
      expect(stats.totalCookies).toBe(3);
      expect(stats.domainStats).toEqual({
        'example.com': 2,
        'test.com': 1
      });
    });

    test('应该处理空的cookies Map', () => {
      (cookieManager as any).cookies = new Map();
      
      const stats = cookieManager.getCookieStats();
      
      expect(stats.totalDomains).toBe(0);
      expect(stats.totalCookies).toBe(0);
      expect(stats.domainStats).toEqual({});
    });
  });

  describe('文件路径生成', () => {
    test('应该生成正确的Cookie文件路径', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue('[]');
      
      cookieManager.loadCookies({ addCookies: jest.fn() }, 'example.com');
      
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        expect.stringMatching(/example\.com\.json$/)
      );
    });

    test('应该处理域名中的特殊字符', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue('[]');
      
      cookieManager.loadCookies({ addCookies: jest.fn() }, 'sub.domain.example.com');
      
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        expect.stringMatching(/sub\.domain\.example\.com\.json$/)
      );
    });
  });

  describe('边界情况', () => {
    test('应该处理并发Cookie操作', async () => {
      const mockContext = { addCookies: jest.fn() };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('[]');
      
      // 并发加载Cookie
      await Promise.all([
        cookieManager.loadCookies(mockContext, 'example.com'),
        cookieManager.loadCookies(mockContext, 'test.com')
      ]);
      
      expect(mockContext.addCookies).toHaveBeenCalledTimes(2);
    });

    test('应该处理大量的Cookie', async () => {
      const manyCookies = Array.from({ length: 1000 }, (_, i) => 
        createMockCookie({ name: `cookie${i}`, value: `value${i}` })
      );
      
      mockPage = {
        url: jest.fn().mockReturnValue('https://example.com'),
        context: jest.fn().mockReturnValue({
          cookies: jest.fn().mockResolvedValue(manyCookies)
        })
      };
      
      mockFs.existsSync.mockReturnValue(false);
      
      await cookieManager.saveCookies(mockPage);
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"name":"cookie999"')
      );
    });
  });
});