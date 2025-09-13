/**
 * CamoufoxManager 单元测试
 */

import { CamoufoxManager } from '../../src/browser/CamoufoxManager';
import { SimpleCookieManager } from '../../src/browser/SimpleCookieManager';
import { BrowserAssistantError, BrowserConnectionError } from '../../src/errors';
import { createAsyncMock, createAsyncErrorMock, createMockConfig, expectError, expectCalledTimes, createLogSpy } from '../test-utils';

// Mock SimpleCookieManager
jest.mock('../../src/browser/SimpleCookieManager', () => {
  return {
    SimpleCookieManager: jest.fn().mockImplementation(() => ({
      loadCookies: jest.fn().mockResolvedValue(undefined),
      saveCookies: jest.fn().mockResolvedValue(undefined),
      clearAllCookies: jest.fn().mockResolvedValue(undefined),
      getCookieStats: jest.fn().mockReturnValue({
        totalDomains: 0,
        totalCookies: 0,
        domainStats: {}
      })
    }))
  };
});

describe('CamoufoxManager', () => {
  let camoufoxManager: CamoufoxManager;
  let mockConfig: any;
  let mockChromium: any;
  let mockBrowser: any;
  let mockContext: any;
  let mockPage: any;

  beforeEach(() => {
    mockConfig = createMockConfig();
    
    // 创建模拟的Playwright对象
    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com'),
      title: jest.fn().mockResolvedValue('Test Page'),
      goto: jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('test-screenshot')),
      evaluate: jest.fn().mockResolvedValue({ userAgent: 'test-agent' }),
      setDefaultTimeout: jest.fn(),
      context: jest.fn().mockReturnValue({
        cookies: jest.fn().mockResolvedValue([])
      }),
      close: jest.fn()
    };

    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      cookies: jest.fn().mockResolvedValue([]),
      clearCookies: jest.fn(),
      addCookies: jest.fn(),
      close: jest.fn()
    };

    mockBrowser = {
      newContext: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn()
    };

    mockChromium = {
      launch: jest.fn().mockResolvedValue(mockBrowser)
    };

    // Mock playwright import
    jest.doMock('playwright', () => ({
      chromium: mockChromium
    }));

    camoufoxManager = new CamoufoxManager(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('构造函数', () => {
    test('应该正确初始化CamoufoxManager', () => {
      expect(camoufoxManager).toBeInstanceOf(CamoufoxManager);
      expect(camoufoxManager.getConfig()).toEqual(mockConfig);
    });

    test('应该使用默认配置', () => {
      const manager = new CamoufoxManager();
      const defaultConfig = manager.getConfig();
      expect(defaultConfig.headless).toBe(true);
      expect(defaultConfig.viewport).toEqual({ width: 1920, height: 1080 });
    });

    test('应该合并用户配置', () => {
      const customConfig = { headless: false, viewport: { width: 800, height: 600 } };
      const manager = new CamoufoxManager(customConfig);
      const config = manager.getConfig();
      expect(config.headless).toBe(false);
      expect(config.viewport).toEqual({ width: 800, height: 600 });
      // 其他默认值应该保持不变
      expect(config.launchTimeout).toBe(30000);
    });
  });

  describe('初始化', () => {
    test('应该成功初始化浏览器', async () => {
      await camoufoxManager.initialize();
      expect(mockChromium.launch).toHaveBeenCalledWith({
        headless: true,
        timeout: 30000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        ignoreDefaultArgs: ['--disable-extensions']
      });
      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(10000);
    });

    test('应该处理初始化失败', async () => {
      const error = new Error('Browser launch failed');
      mockChromium.launch.mockRejectedValue(error);

      await expect(camoufoxManager.initialize()).rejects.toThrow(BrowserConnectionError);
    });

    test('不应该重复初始化', async () => {
      await camoufoxManager.initialize();
      await camoufoxManager.initialize();

      expect(mockChromium.launch).toHaveBeenCalledTimes(1);
    });

    test('应该使用自定义超时配置', async () => {
      const customConfig = { launchTimeout: 60000, defaultTimeout: 20000 };
      const manager = new CamoufoxManager(customConfig);
      
      await manager.initialize();
      
      expect(mockChromium.launch).toHaveBeenCalledWith({
        headless: true,
        timeout: 60000,
        args: expect.any(Array),
        ignoreDefaultArgs: expect.any(Array)
      });
      expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(20000);
    });
  });

  describe('页面操作', () => {
    beforeEach(async () => {
      await camoufoxManager.initialize();
    });

    test('应该获取当前页面', async () => {
      const page = await camoufoxManager.getCurrentPage();
      expect(page).toBe(mockPage);
    });

    test('应该在没有初始化时抛出错误', async () => {
      const uninitializedManager = new CamoufoxManager();
      await expect(uninitializedManager.getCurrentPage()).rejects.toThrow(BrowserAssistantError);
    });

    test('应该导航到指定URL', async () => {
      await camoufoxManager.navigate('https://example.com');
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        timeout: 10000,
        waitUntil: 'domcontentloaded'
      });
    });

    test('应该获取页面标题', async () => {
      const title = await camoufoxManager.getPageTitle();
      expect(title).toBe('Test Page');
      expect(mockPage.title).toHaveBeenCalled();
    });

    test('应该获取页面URL', async () => {
      const url = await camoufoxManager.getPageUrl();
      expect(url).toBe('https://example.com');
      expect(mockPage.url).toHaveBeenCalled();
    });

    test('应该执行JavaScript', async () => {
      const script = 'return document.title';
      const result = await camoufoxManager.evaluate(script);
      expect(result).toEqual({ userAgent: 'test-agent' });
      expect(mockPage.evaluate).toHaveBeenCalledWith(script);
    });

    test('应该截图', async () => {
      const screenshot = await camoufoxManager.screenshot();
      expect(screenshot).toEqual(Buffer.from('test-screenshot'));
      expect(mockPage.screenshot).toHaveBeenCalled();
    });

    test('应该检查连接状态', () => {
      expect(camoufoxManager.isConnected()).toBe(true);
    });
  });

  describe('页面创建', () => {
    beforeEach(async () => {
      await camoufoxManager.initialize();
    });

    test('应该创建新页面', async () => {
      const newPage = await camoufoxManager.createFreshPage();
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(newPage.setDefaultTimeout).toHaveBeenCalledWith(10000);
    });

    test('应该在没有上下文时抛出错误', async () => {
      // 模拟没有上下文的情况
      const manager = new CamoufoxManager();
      await expect(manager.createFreshPage()).rejects.toThrow(BrowserAssistantError);
    });
  });

  describe('重启功能', () => {
    test('应该成功重启浏览器', async () => {
      await camoufoxManager.initialize();
      await camoufoxManager.restart();
      
      expect(mockBrowser.close).toHaveBeenCalled();
      expect(mockChromium.launch).toHaveBeenCalledTimes(2);
    });

    test('应该处理重启失败', async () => {
      const error = new Error('Restart failed');
      mockBrowser.close.mockRejectedValue(error);
      
      await camoufoxManager.initialize();
      await expect(camoufoxManager.restart()).rejects.toThrow(BrowserAssistantError);
    });
  });

  describe('配置管理', () => {
    test('应该更新配置', () => {
      const newConfig = { headless: false };
      camoufoxManager.updateConfig(newConfig);
      
      const config = camoufoxManager.getConfig();
      expect(config.headless).toBe(false);
    });

    test('应该部分更新配置', () => {
      camoufoxManager.updateConfig({ viewport: { width: 1024, height: 768 } });
      
      const config = camoufoxManager.getConfig();
      expect(config.viewport).toEqual({ width: 1024, height: 768 });
      expect(config.headless).toBe(true); // 保持不变
    });
  });

  describe('清理', () => {
    test('应该正确清理资源', async () => {
      await camoufoxManager.initialize();
      await camoufoxManager.cleanup();
      
      expect(mockPage.close).toHaveBeenCalled();
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    test('应该处理清理失败', async () => {
      const error = new Error('Cleanup failed');
      mockPage.close.mockRejectedValue(error);
      
      await camoufoxManager.initialize();
      await expect(camoufoxManager.cleanup()).rejects.toThrow(error);
    });

    test('应该可以多次清理', async () => {
      await camoufoxManager.initialize();
      await camoufoxManager.cleanup();
      await camoufoxManager.cleanup();
      
      expect(mockPage.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('错误处理', () => {
    test('应该处理导航失败', async () => {
      await camoufoxManager.initialize();
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));
      
      await expect(camoufoxManager.navigate('https://example.com')).rejects.toThrow(BrowserAssistantError);
    });

    test('应该处理截图失败', async () => {
      await camoufoxManager.initialize();
      mockPage.screenshot.mockRejectedValue(new Error('Screenshot failed'));
      
      await expect(camoufoxManager.screenshot()).rejects.toThrow(BrowserAssistantError);
    });

    test('应该处理页面操作失败', async () => {
      await camoufoxManager.initialize();
      mockPage.title.mockRejectedValue(new Error('Title failed'));
      
      await expect(camoufoxManager.getPageTitle()).rejects.toThrow();
    });
  });

  describe('Cookie管理集成', () => {
    test('应该初始化Cookie管理器', () => {
      expect(SimpleCookieManager).toHaveBeenCalled();
    });

    test('应该在初始化时加载Cookie', async () => {
      await camoufoxManager.initialize();
      // 验证Cookie管理器的方法被调用
      const cookieManager = (camoufoxManager as any).cookieManager;
      expect(cookieManager.loadCookies).toHaveBeenCalled();
    });
  });
});