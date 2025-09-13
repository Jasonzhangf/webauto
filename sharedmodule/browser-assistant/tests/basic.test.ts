/**
 * 基础单元测试 - 验证简化版本组件
 */

import { SimpleCamoufoxManager } from '../src/browser/SimpleCamoufoxManager';
import { SimpleCookieManager } from '../src/browser/SimpleCookieManager';
import { SimplePageOperationCenter } from '../src/operations/SimplePageOperationCenter';
import { SimpleSmartElementSelector } from '../src/operations/SimpleSmartElementSelector';
import { createBrowserAssistant } from '../src/index-simple';
import { BrowserAssistantError } from '../src/errors';
import { createMockPage, createMockElementHandle } from './test-utils';

describe('基础组件测试', () => {
  let mockPage: any;

  beforeEach(() => {
    mockPage = createMockPage();
  });

  describe('SimpleCamoufoxManager', () => {
    test('应该能够创建实例', () => {
      const manager = new SimpleCamoufoxManager();
      expect(manager).toBeInstanceOf(SimpleCamoufoxManager);
    });

    test('应该能够获取配置', () => {
      const manager = new SimpleCamoufoxManager({ headless: false });
      const config = manager.getConfig();
      expect(config.headless).toBe(false);
    });

    test('应该能够更新配置', () => {
      const manager = new SimpleCamoufoxManager();
      manager.updateConfig({ headless: true });
      const config = manager.getConfig();
      expect(config.headless).toBe(true);
    });
  });

  describe('SimpleCookieManager', () => {
    test('应该能够创建实例', () => {
      const cookieManager = new SimpleCookieManager('./test-cookies');
      expect(cookieManager).toBeInstanceOf(SimpleCookieManager);
    });

    test('应该能够使用默认路径', () => {
      const cookieManager = new SimpleCookieManager();
      expect(cookieManager).toBeInstanceOf(SimpleCookieManager);
    });

    test('应该能够获取Cookie统计', () => {
      const cookieManager = new SimpleCookieManager();
      const stats = cookieManager.getCookieStats();
      expect(stats).toEqual({
        totalDomains: 0,
        totalCookies: 0,
        domainStats: {}
      });
    });
  });

  describe('SimplePageOperationCenter', () => {
    let operationCenter: SimplePageOperationCenter;

    beforeEach(() => {
      operationCenter = new SimplePageOperationCenter();
    });

    test('应该能够创建实例', () => {
      expect(operationCenter).toBeInstanceOf(SimplePageOperationCenter);
    });

    test('应该能够获取页面URL', async () => {
      const url = await operationCenter.getPageUrl(mockPage);
      expect(url).toBe('https://example.com');
    });

    test('应该能够获取页面标题', async () => {
      const title = await operationCenter.getPageTitle(mockPage);
      expect(title).toBe('Test Page');
    });

    test('应该能够执行JavaScript', async () => {
      mockPage.evaluate.mockResolvedValue('test-result');
      const result = await operationCenter.executeScript(mockPage, 'return "test"');
      expect(result).toBe('test-result');
    });

    test('应该能够处理页面等待', async () => {
      await operationCenter.wait(mockPage, 100);
      // 验证等待完成（没有抛出错误）
      expect(true).toBe(true);
    });
  });

  describe('SimpleSmartElementSelector', () => {
    let selector: SimpleSmartElementSelector;

    beforeEach(() => {
      selector = new SimpleSmartElementSelector();
    });

    test('应该能够创建实例', () => {
      expect(selector).toBeInstanceOf(SimpleSmartElementSelector);
    });

    test('应该能够选择元素', async () => {
      const mockElement = createMockElementHandle();
      mockPage.$.mockResolvedValue(mockElement);
      
      const result = await selector.select(mockPage, '#test-element');
      expect(result).toBe(mockElement);
    });

    test('应该能够验证选择器', async () => {
      mockPage.evaluate.mockResolvedValue(true);
      
      const isValid = await selector.validateSelector(mockPage, '#valid-selector');
      expect(isValid).toBe(true);
    });
  });

  describe('错误处理', () => {
    test('应该能够创建错误实例', () => {
      const error = new BrowserAssistantError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
    });

    test('应该能够处理操作失败', async () => {
      const operationCenter = new SimplePageOperationCenter();
      mockPage.evaluate.mockRejectedValue(new Error('Script failed'));
      
      await expect(operationCenter.executeScript(mockPage, 'invalid script'))
        .rejects.toThrow(BrowserAssistantError);
    });
  });

  describe('浏览器助手工厂', () => {
    test('应该能够创建浏览器助手', () => {
      const assistant = createBrowserAssistant();
      expect(assistant).toBeDefined();
      expect(typeof assistant.createBrowser).toBe('function');
    });
  });

  describe('类型安全', () => {
    test('应该正确处理类型检查', () => {
      const manager = new SimpleCamoufoxManager();
      const config = manager.getConfig();
      
      // 验证配置对象的结构
      expect(config).toHaveProperty('headless');
      expect(config).toHaveProperty('viewport');
      expect(config).toHaveProperty('timeout');
    });

    test('应该正确处理函数参数类型', async () => {
      const operationCenter = new SimplePageOperationCenter();
      
      // 测试不同类型的参数
      await expect(operationCenter.wait(mockPage, 100)).resolves.not.toThrow();
      await expect(operationCenter.wait(mockPage, '100')).resolves.not.toThrow();
    });
  });

  describe('异步操作', () => {
    test('应该正确处理异步操作', async () => {
      const operationCenter = new SimplePageOperationCenter();
      
      // 测试并行异步操作
      const results = await Promise.all([
        operationCenter.getPageUrl(mockPage),
        operationCenter.getPageTitle(mockPage),
        operationCenter.getPageHTML(mockPage)
      ]);
      
      expect(results).toHaveLength(3);
      expect(results[0]).toBe('https://example.com');
      expect(results[1]).toBe('Test Page');
    });

    test('应该正确处理异步错误', async () => {
      const operationCenter = new SimplePageOperationCenter();
      mockPage.title.mockRejectedValue(new Error('Page error'));
      
      await expect(operationCenter.getPageTitle(mockPage))
        .rejects.toThrow(BrowserAssistantError);
    });
  });

  describe('配置验证', () => {
    test('应该验证配置参数', () => {
      const manager = new SimpleCamoufoxManager();
      
      // 测试默认配置
      const defaultConfig = manager.getConfig();
      expect(defaultConfig.headless).toBe(true);
      
      // 测试配置更新
      manager.updateConfig({ headless: false });
      const updatedConfig = manager.getConfig();
      expect(updatedConfig.headless).toBe(false);
    });

    test('应该处理无效配置', () => {
      const manager = new SimpleCamoufoxManager();
      
      // 测试部分配置更新
      manager.updateConfig({ viewport: { width: 800, height: 600 } });
      const config = manager.getConfig();
      expect(config.viewport).toEqual({ width: 800, height: 600 });
      expect(config.headless).toBe(true); // 其他配置应保持不变
    });
  });
});