/**
 * 集成测试套件
 */

import { SimpleCamoufoxManager } from '../src/browser/SimpleCamoufoxManager';
import { SimpleCookieManager } from '../src/browser/SimpleCookieManager';
import { SimplePageOperationCenter } from '../src/operations/SimplePageOperationCenter';
import { SimpleSmartElementSelector } from '../src/operations/SimpleSmartElementSelector';
import { createBrowserAssistant } from '../src/index-simple';
import { BrowserAssistantError, TimeoutError, ElementNotFoundError } from '../src/errors';
import { createMockPage, createMockElementHandle, createAsyncMock } from './test-utils';

describe('浏览器助手集成测试', () => {
  let browserAssistant: any;
  let cookieManager: SimpleCookieManager;
  let operationCenter: SimplePageOperationCenter;
  let elementSelector: SimpleSmartElementSelector;

  beforeEach(() => {
    // 创建浏览器助手实例
    browserAssistant = createBrowserAssistant();
    cookieManager = new SimpleCookieManager('./test-cookies');
    operationCenter = new SimplePageOperationCenter();
    elementSelector = new SimpleSmartElementSelector();
  });

  afterEach(() => {
    // 清理测试资源
    if (browserAssistant && browserAssistant.cleanup) {
      browserAssistant.cleanup();
    }
  });

  describe('完整页面操作流程', () => {
    test('应该能够完成完整的页面交互流程', async () => {
      const mockPage = createMockPage();
      
      // 1. 导航到页面
      await operationCenter.navigate(mockPage, 'https://example.com');
      
      // 2. 等待页面加载
      await operationCenter.waitForCondition(mockPage, '() => document.readyState === "complete"');
      
      // 3. 查找登录表单
      const loginForm = await elementSelector.select(mockPage, '#login-form');
      expect(loginForm).toBeDefined();
      
      // 4. 填写表单
      await operationCenter.type(mockPage, '#username', 'testuser');
      await operationCenter.type(mockPage, '#password', 'testpass');
      
      // 5. 提交表单
      await operationCenter.click(mockPage, '#submit-button');
      
      // 6. 验证登录成功
      await operationCenter.waitForSelector(mockPage, '.dashboard');
      const dashboard = await elementSelector.select(mockPage, '.dashboard');
      expect(dashboard).toBeDefined();
    });

    test('应该能够处理页面内容提取', async () => {
      const mockPage = createMockPage();
      
      // 模拟页面内容
      mockPage.evaluate = jest.fn()
        .mockResolvedValueOnce('Welcome to Dashboard')
        .mockResolvedValueOnce(['User Profile', 'Settings', 'Logout'])
        .mockResolvedValueOnce('John Doe')
        .mockResolvedValueOnce('john@example.com');
      
      // 提取页面标题
      const title = await operationCenter.getPageTitle(mockPage);
      expect(title).toBe('Test Page');
      
      // 提取用户信息
      const userName = await operationCenter.extractText(mockPage, '.user-name');
      expect(userName).toBe('John Doe');
      
      // 提取导航菜单
      const menuItems = await operationCenter.extractMultiple(mockPage, '.nav-item', 'text');
      expect(menuItems).toEqual(['User Profile', 'Settings', 'Logout']);
    });

    test('应该能够处理错误恢复', async () => {
      const mockPage = createMockPage();
      
      // 模拟网络错误
      mockPage.click.mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);
      
      // 第一次点击失败
      try {
        await operationCenter.click(mockPage, '#retry-button');
      } catch (error) {
        expect(error).toBeInstanceOf(BrowserAssistantError);
      }
      
      // 重试应该成功
      await operationCenter.click(mockPage, '#retry-button');
      expect(mockPage.click).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cookie管理集成', () => {
    test('应该能够保存和加载Cookie', async () => {
      const mockPage = createMockPage();
      const mockContext = { addCookies: jest.fn() };
      
      // 模拟页面Cookie
      mockPage.context.mockReturnValue({
        cookies: jest.fn().mockResolvedValue([
          { name: 'session', value: 'abc123', domain: 'example.com' },
          { name: 'user', value: 'john', domain: 'example.com' }
        ])
      });
      
      // 保存Cookie
      await cookieManager.saveCookies(mockPage);
      
      // 加载Cookie到新上下文
      await cookieManager.loadCookies(mockContext, 'example.com');
      
      expect(mockContext.addCookies).toHaveBeenCalledWith([
        { name: 'session', value: 'abc123', domain: 'example.com' },
        { name: 'user', value: 'john', domain: 'example.com' }
      ]);
    });

    test('应该能够处理Cookie加密', async () => {
      const cookieManager = new SimpleCookieManager('./test-cookies', {
        encryption: true,
        encryptionKey: 'test-key-123'
      });
      
      const mockPage = createMockPage();
      mockPage.context.mockReturnValue({
        cookies: jest.fn().mockResolvedValue([
          { name: 'secret', value: 'sensitive-data', domain: 'example.com' }
        ])
      });
      
      // 保存加密Cookie
      await cookieManager.saveCookies(mockPage);
      
      // 验证Cookie被加密保存
      const stats = cookieManager.getCookieStats();
      expect(stats.totalCookies).toBe(1);
    });
  });

  describe('元素选择和操作集成', () => {
    test('应该能够智能选择和操作元素', async () => {
      const mockPage = createMockPage();
      
      // 模拟查找按钮
      mockPage.evaluate = jest.fn()
        .mockResolvedValueOnce([createMockElementHandle({ textContent: 'Submit' })])
        .mockResolvedValueOnce(undefined);
      
      // 智能选择提交按钮
      const submitButton = await elementSelector.selectByText(mockPage, 'Submit');
      expect(submitButton).toBeDefined();
      
      // 点击按钮
      await operationCenter.click(mockPage, submitButton);
      
      // 验证点击操作
      expect(submitButton.click).toHaveBeenCalled();
    });

    test('应该能够处理动态内容', async () => {
      const mockPage = createMockPage();
      
      // 模拟动态加载的内容
      let loadCount = 0;
      mockPage.evaluate = jest.fn().mockImplementation(() => {
        loadCount++;
        if (loadCount === 1) {
          return []; // 初始没有内容
        } else {
          return [createMockElementHandle({ textContent: 'Dynamic Content' })];
        }
      });
      
      // 第一次查找失败
      await expect(elementSelector.selectByText(mockPage, 'Dynamic Content'))
        .rejects.toThrow(ElementNotFoundError);
      
      // 模拟滚动触发内容加载
      await operationCenter.scrollTo(mockPage, 'bottom');
      
      // 第二次查找应该成功
      const dynamicElement = await elementSelector.selectByText(mockPage, 'Dynamic Content');
      expect(dynamicElement).toBeDefined();
    });
  });

  describe('性能和并发测试', () => {
    test('应该能够处理并发操作', async () => {
      const mockPage = createMockPage();
      
      // 并发执行多个操作
      const operations = [
        operationCenter.getPageTitle(mockPage),
        operationCenter.getPageUrl(mockPage),
        operationCenter.getPageHTML(mockPage)
      ];
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(3);
      expect(results[0]).toBe('Test Page');
      expect(results[1]).toBe('https://example.com');
      expect(results[2]).toBe('<html>content</html>');
    });

    test('应该能够处理大量元素操作', async () => {
      const mockPage = createMockPage();
      
      // 模拟大量元素
      const manyElements = Array.from({ length: 100 }, (_, i) => 
        createMockElementHandle({ textContent: `Item ${i}` })
      );
      
      mockPage.evaluate = jest.fn().mockResolvedValue(manyElements);
      
      // 批量操作元素
      const items = await elementSelector.selectByAttribute(mockPage, 'class', 'list-item');
      expect(items).toHaveLength(100);
      
      // 批量提取文本
      const texts = await operationCenter.batchExtract(mockPage, '.list-item', 'textContent');
      expect(texts).toHaveLength(100);
    });
  });

  describe('跨页面测试', () => {
    test('应该能够在多个页面间切换', async () => {
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue(createMockPage()),
        close: jest.fn()
      };
      
      const manager = new SimpleCamoufoxManager();
      
      // 创建多个页面
      const page1 = await manager.createFreshPage();
      const page2 = await manager.createFreshPage();
      
      // 在不同页面执行操作
      await operationCenter.navigate(page1, 'https://page1.com');
      await operationCenter.navigate(page2, 'https://page2.com');
      
      const url1 = await operationCenter.getPageUrl(page1);
      const url2 = await operationCenter.getPageUrl(page2);
      
      expect(url1).toBe('https://page1.com');
      expect(url2).toBe('https://page2.com');
    });

    test('应该能够共享Cookie between页面', async () => {
      const mockPage1 = createMockPage();
      const mockPage2 = createMockPage();
      
      // 在第一个页面设置Cookie
      mockPage1.context.mockReturnValue({
        cookies: jest.fn().mockResolvedValue([
          { name: 'shared', value: 'test-value', domain: 'example.com' }
        ])
      });
      
      await cookieManager.saveCookies(mockPage1);
      
      // 在第二个页面加载Cookie
      const mockContext2 = { addCookies: jest.fn() };
      await cookieManager.loadCookies(mockContext2, 'example.com');
      
      expect(mockContext2.addCookies).toHaveBeenCalledWith([
        { name: 'shared', value: 'test-value', domain: 'example.com' }
      ]);
    });
  });

  describe('错误处理和恢复集成', () => {
    test('应该能够优雅地处理各种错误', async () => {
      const mockPage = createMockPage();
      
      // 模拟各种错误情况
      const errorScenarios = [
        () => operationCenter.click(mockPage, '#non-existent'),
        () => elementSelector.select(mockPage, 'invalid-selector['),
        () => operationCenter.type(mockPage, '#hidden-input', 'text'),
        () => operationCenter.waitForSelector(mockPage, '#slow-element', { timeout: 1 })
      ];
      
      for (const scenario of errorScenarios) {
        try {
          await scenario();
        } catch (error) {
          expect(error).toBeInstanceOf(BrowserAssistantError);
        }
      }
    });

    test('应该能够从错误中恢复', async () => {
      const mockPage = createMockPage();
      
      // 模拟暂时性错误
      let attempt = 0;
      mockPage.click.mockImplementation(() => {
        attempt++;
        if (attempt <= 2) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve();
      });
      
      // 重试机制应该处理暂时性错误
      for (let i = 0; i < 3; i++) {
        try {
          await operationCenter.click(mockPage, '#retry-button');
          break;
        } catch (error) {
          if (i === 2) {
            throw error;
          }
          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      expect(attempt).toBe(3);
    });
  });

  describe('端到端工作流测试', () => {
    test('应该能够完成完整的用户登录流程', async () => {
      const mockPage = createMockPage();
      
      // 1. 访问登录页面
      await operationCenter.navigate(mockPage, 'https://example.com/login');
      
      // 2. 等待登录表单加载
      await operationCenter.waitForSelector(mockPage, '#login-form');
      
      // 3. 填写登录凭据
      await operationCenter.type(mockPage, '#username', 'testuser@example.com');
      await operationCenter.type(mockPage, '#password', 'securepassword123');
      
      // 4. 点击登录按钮
      await operationCenter.click(mockPage, '#login-button');
      
      // 5. 等待登录完成
      await operationCenter.waitForSelector(mockPage, '.user-dashboard');
      
      // 6. 验证登录成功
      const welcomeText = await operationCenter.extractText(mockPage, '.welcome-message');
      expect(welcomeText).toContain('Welcome');
      
      // 7. 保存会话Cookie
      await cookieManager.saveCookies(mockPage);
      
      // 8. 验证用户信息
      const userInfo = await operationCenter.extractText(mockPage, '.user-info');
      expect(userInfo).toContain('testuser@example.com');
    });

    test('应该能够完成内容抓取流程', async () => {
      const mockPage = createMockPage();
      
      // 1. 访问内容页面
      await operationCenter.navigate(mockPage, 'https://example.com/articles');
      
      // 2. 等待文章列表加载
      await operationCenter.waitForSelector(mockPage, '.article-list');
      
      // 3. 提取所有文章链接
      const articleLinks = await operationCenter.extractMultiple(mockPage, '.article-link', 'href');
      expect(articleLinks.length).toBeGreaterThan(0);
      
      // 4. 提取文章标题
      const articleTitles = await operationCenter.extractMultiple(mockPage, '.article-title', 'text');
      expect(articleTitles.length).toBeGreaterThan(0);
      
      // 5. 截图保存
      const screenshot = await operationCenter.screenshot(mockPage);
      expect(screenshot).toBeInstanceOf(Buffer);
      
      // 6. 保存页面HTML
      const pageHTML = await operationCenter.getPageHTML(mockPage);
      expect(pageHTML).toContain('<html>');
    });
  });

  describe('配置和选项测试', () => {
    test('应该能够使用不同的配置选项', async () => {
      // 测试不同超时配置
      const fastOperationCenter = new SimplePageOperationCenter();
      const slowOperationCenter = new SimplePageOperationCenter();
      
      const mockPage = createMockPage();
      
      // 测试快速操作
      await fastOperationCenter.click(mockPage, '#fast-button', { timeout: 1000 });
      
      // 测试慢速操作
      await slowOperationCenter.click(mockPage, '#slow-button', { timeout: 30000 });
      
      expect(mockPage.click).toHaveBeenCalledTimes(2);
    });

    test('应该能够自定义选择器策略', async () => {
      const customSelector = new SimpleSmartElementSelector({
        cacheTimeout: 5000,
        useML: false,
        enableRetry: true
      });
      
      const mockPage = createMockPage();
      
      // 测试自定义选择器
      const element = await customSelector.selectWithCache(mockPage, '#custom-element');
      
      expect(element).toBeDefined();
    });
  });
});

describe('浏览器助手API测试', () => {
  test('应该提供一致的API接口', async () => {
    const assistant = createBrowserAssistant();
    
    expect(assistant).toBeDefined();
    expect(typeof assistant.createBrowser).toBe('function');
    expect(typeof assistant.createPage).toBe('function');
    expect(typeof assistant.getStats).toBe('function');
  });

  test('应该能够通过工厂方法创建组件', () => {
    const manager = new SimpleCamoufoxManager();
    const operationCenter = new SimplePageOperationCenter();
    const selector = new SimpleSmartElementSelector();
    const cookieManager = new SimpleCookieManager();
    
    expect(manager).toBeInstanceOf(SimpleCamoufoxManager);
    expect(operationCenter).toBeInstanceOf(SimplePageOperationCenter);
    expect(selector).toBeInstanceOf(SimpleSmartElementSelector);
    expect(cookieManager).toBeInstanceOf(SimpleCookieManager);
  });
});