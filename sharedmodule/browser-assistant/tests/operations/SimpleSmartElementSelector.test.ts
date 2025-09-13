/**
 * SimpleSmartElementSelector 单元测试
 */

import { SimpleSmartElementSelector } from '../../src/operations/SimpleSmartElementSelector';
import { BrowserAssistantError, ElementNotFoundError, TimeoutError } from '../../src/errors';
import { createMockPage, createMockElementHandle, createAsyncMock, createAsyncErrorMock, createLogSpy } from '../test-utils';

// Mock Playwright types
interface Page {
  click: jest.Mock;
  type: jest.Mock;
  evaluate: jest.Mock;
  screenshot: jest.Mock;
  waitForSelector: jest.Mock;
  $: jest.Mock;
  $$: jest.Mock;
  waitForFunction: jest.Mock;
  content: jest.Mock;
  url: jest.fn;
  title: jest.fn;
  waitTimeout?: jest.Mock;
  setDefaultTimeout: jest.Mock;
}

interface ElementHandle {
  click: jest.Mock;
  type: jest.Mock;
  evaluate: jest.Mock;
  screenshot: jest.Mock;
  isVisible: jest.Mock;
  isHidden: jest.Mock;
  boundingBox: jest.Mock;
  getAttribute: jest.Mock;
  textContent: jest.Mock;
  querySelector: jest.Mock;
  querySelectorAll: jest.Mock;
}

describe('SimpleSmartElementSelector', () => {
  let selector: SimpleSmartElementSelector;
  let mockPage: Page;
  let mockElement: ElementHandle;

  beforeEach(() => {
    mockPage = {
      click: createAsyncMock<void>(undefined),
      type: createAsyncMock<void>(undefined),
      evaluate: createAsyncMock<any>('result'),
      screenshot: createAsyncMock<Buffer>(Buffer.from('screenshot')),
      waitForSelector: createAsyncMock<ElementHandle>(null),
      $: createAsyncMock<ElementHandle>(null),
      $$: createAsyncMock<ElementHandle[]>([]),
      waitForFunction: createAsyncMock<any>(true),
      content: createAsyncMock<string>('<html>content</html>'),
      url: jest.fn().mockReturnValue('https://example.com'),
      title: jest.fn().mockResolvedValue('Test Page'),
      waitTimeout: createAsyncMock<void>(undefined),
      setDefaultTimeout: jest.fn()
    };

    mockElement = {
      click: createAsyncMock<void>(undefined),
      type: createAsyncMock<void>(undefined),
      evaluate: createAsyncMock<any>('element-result'),
      screenshot: createAsyncMock<Buffer>(Buffer.from('element-screenshot')),
      isVisible: jest.fn().mockReturnValue(true),
      isHidden: jest.fn().mockReturnValue(false),
      boundingBox: jest.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 50 }),
      getAttribute: jest.fn().mockReturnValue('test-value'),
      textContent: 'Test Content',
      querySelector: jest.fn().mockReturnValue(null),
      querySelectorAll: jest.fn().mockReturnValue([])
    };

    selector = new SimpleSmartElementSelector();
  });

  describe('基础选择器操作', () => {
    test('应该使用CSS选择器查找元素', async () => {
      mockPage.$.mockResolvedValue(mockElement);
      
      const result = await selector.select(mockPage, '#test-button');
      
      expect(result).toBe(mockElement);
      expect(mockPage.$).toHaveBeenCalledWith('#test-button');
    });

    test('应该使用XPath查找元素', async () => {
      const xpathElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue(xpathElement);
      
      const result = await selector.selectByXPath(mockPage, '//button[@type="submit"]');
      
      expect(result).toBe(xpathElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        'document.evaluate("//button[@type=\\"submit\\"]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue'
      );
    });

    test('应该使用属性选择器查找元素', async () => {
      mockPage.$$mockResolvedValue([mockElement]);
      
      const results = await selector.selectByAttribute(mockPage, 'data-role', 'submit');
      
      expect(results).toEqual([mockElement]);
      expect(mockPage.$$).toHaveBeenCalledWith('[data-role="submit"]');
    });

    test('应该处理选择器查找失败', async () => {
      mockPage.$.mockResolvedValue(null);
      
      await expect(selector.select(mockPage, '#non-existent'))
        .rejects.toThrow(ElementNotFoundError);
    });
  });

  describe('文本内容选择器', () => {
    test('应该通过部分文本查找元素', async () => {
      mockPage.evaluate.mockResolvedValue([mockElement]);
      
      const result = await selector.selectByText(mockPage, 'Submit Form');
      
      expect(result).toBe(mockElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('Array.from(document.querySelectorAll("*"))')
      );
    });

    test('应该通过精确文本查找元素', async () => {
      mockPage.evaluate.mockResolvedValue([mockElement]);
      
      const result = await selector.selectByText(mockPage, 'Submit Form', { exact: true });
      
      expect(result).toBe(mockElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('textContent === "Submit Form"')
      );
    });

    test('应该通过正则表达式查找元素', async () => {
      const regex = /submit/i;
      mockPage.evaluate.mockResolvedValue([mockElement]);
      
      const result = await selector.selectByText(mockPage, regex);
      
      expect(result).toBe(mockElement);
    });

    test('应该处理文本查找失败', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      
      await expect(selector.selectByText(mockPage, 'Non-existent text'))
        .rejects.toThrow(ElementNotFoundError);
    });
  });

  describe('视觉特征选择器', () => {
    test('应该通过可见性查找元素', async () => {
      const visibleElements = [
        createMockElementHandle({ isVisible: true }),
        createMockElementHandle({ isVisible: true })
      ];
      mockPage.$$mockResolvedValue(visibleElements);
      
      const results = await selector.selectVisible(mockPage, '.button');
      
      expect(results).toEqual(visibleElements);
      expect(mockPage.$$).toHaveBeenCalledWith('.button');
    });

    test('应该通过尺寸查找元素', async () => {
      const largeElement = createMockElementHandle({
        boundingBox: { x: 0, y: 0, width: 500, height: 300 }
      });
      mockPage.evaluate.mockResolvedValue([largeElement]);
      
      const result = await selector.selectBySize(mockPage, '.content', { minWidth: 400 });
      
      expect(result).toBe(largeElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('width >= 400')
      );
    });

    test('应该通过位置查找元素', async () => {
      const positionedElement = createMockElementHandle({
        boundingBox: { x: 50, y: 50, width: 100, height: 50 }
      });
      mockPage.evaluate.mockResolvedValue([positionedElement]);
      
      const result = await selector.selectByPosition(mockPage, '.element', { x: 50, y: 50, tolerance: 10 });
      
      expect(result).toBe(positionedElement);
    });

    test('应该通过颜色查找元素', async () => {
      const coloredElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([coloredElement]);
      
      const result = await selector.selectByColor(mockPage, '.box', { backgroundColor: '#ff0000' });
      
      expect(result).toBe(coloredElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('backgroundColor')
      );
    });
  });

  describe('层次结构选择器', () => {
    test('应该查找子元素', async () => {
      const childElement = createMockElementHandle();
      mockElement.querySelectorAll.mockReturnValue([childElement]);
      mockPage.evaluate.mockResolvedValue(mockElement);
      
      const result = await selector.selectChild(mockPage, '.parent', '.child');
      
      expect(result).toBe(childElement);
    });

    test('应该查找后代元素', async () => {
      const descendantElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([descendantElement]);
      
      const result = await selector.selectDescendant(mockPage, '.ancestor', '.descendant');
      
      expect(result).toBe(descendantElement);
    });

    test('应该查找兄弟元素', async () => {
      const siblingElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([siblingElement]);
      
      const result = await selector.selectSibling(mockPage, '.current', '.sibling');
      
      expect(result).toBe(siblingElement);
    });

    test('应该查找最近的元素', async () => {
      const nearestElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue(nearestElement);
      
      const result = await selector.selectNearest(mockPage, '.current', '.target');
      
      expect(result).toBe(nearestElement);
    });
  });

  describe('交互状态选择器', () => {
    test('应该查找可点击元素', async () => {
      const clickableElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([clickableElement]);
      
      const result = await selector.selectClickable(mockPage, '.button');
      
      expect(result).toBe(clickableElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('pointer-events')
      );
    });

    test('应该查找可聚焦元素', async () => {
      const focusableElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([focusableElement]);
      
      const result = await selector.selectFocusable(mockPage, 'input, button');
      
      expect(result).toBe(focusableElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('tabIndex')
      );
    });

    test('应该查找禁用的元素', async () => {
      const disabledElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([disabledElement]);
      
      const result = await selector.selectDisabled(mockPage, 'input');
      
      expect(result).toBe(disabledElement);
    });

    test('应该查找选中的元素', async () => {
      const selectedElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([selectedElement]);
      
      const result = await selector.selectSelected(mockPage, 'input[type="checkbox"]');
      
      expect(result).toBe(selectedElement);
    });
  });

  describe('语义化选择器', () => {
    test('应该查找按钮元素', async () => {
      const buttonElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([buttonElement]);
      
      const result = await selector.selectButton(mockPage, 'Submit');
      
      expect(result).toBe(buttonElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('button')
      );
    });

    test('应该查找链接元素', async () => {
      const linkElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([linkElement]);
      
      const result = await selector.selectLink(mockPage, 'Learn More');
      
      expect(result).toBe(linkElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('a')
      );
    });

    test('应该查找输入框元素', async () => {
      const inputElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([inputElement]);
      
      const result = await selector.selectInput(mockPage, 'username');
      
      expect(result).toBe(inputElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('input')
      );
    });

    test('应该查找图片元素', async () => {
      const imageElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([imageElement]);
      
      const result = await selector.selectImage(mockPage, 'profile');
      
      expect(result).toBe(imageElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('img')
      );
    });
  });

  describe('智能选择器策略', () => {
    test('应该使用多种策略选择最佳元素', async () => {
      mockPage.evaluate.mockImplementation((script) => {
        if (script.includes('button')) {
          return [createMockElementHandle({ textContent: 'Submit' })];
        }
        if (script.includes('input[type="submit"]')) {
          return [createMockElementHandle({ getAttribute: () => 'submit' })];
        }
        return [];
      });
      
      const result = await selector.smartSelect(mockPage, 'submit button');
      
      expect(result).toBeDefined();
      expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
    });

    test('应该基于上下文智能选择元素', async () => {
      const contextElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([contextElement]);
      
      const result = await selector.selectInContext(mockPage, '.form-container', 'submit');
      
      expect(result).toBe(contextElement);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('.form-container')
      );
    });

    test('应该处理智能选择失败', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      
      await expect(selector.smartSelect(mockPage, 'non-existent element'))
        .rejects.toThrow(ElementNotFoundError);
    });
  });

  describe('选择器缓存和优化', () => {
    test('应该缓存选择器结果', async () => {
      mockPage.$.mockResolvedValue(mockElement);
      
      // 第一次查找
      const result1 = await selector.selectWithCache(mockPage, '#cached-element');
      
      // 第二次查找（应该使用缓存）
      const result2 = await selector.selectWithCache(mockPage, '#cached-element');
      
      expect(result1).toBe(result2);
      expect(mockPage.$).toHaveBeenCalledTimes(1);
    });

    test('应该处理缓存过期', async () => {
      mockPage.$.mockResolvedValue(mockElement);
      
      // 设置短缓存时间
      const shortCacheSelector = new SimpleSmartElementSelector({ cacheTimeout: 100 });
      
      await shortCacheSelector.selectWithCache(mockPage, '#temp-element');
      
      // 等待缓存过期
      await new Promise(resolve => setTimeout(resolve, 150));
      
      await shortCacheSelector.selectWithCache(mockPage, '#temp-element');
      
      expect(mockPage.$).toHaveBeenCalledTimes(2);
    });

    test('应该清除选择器缓存', async () => {
      mockPage.$.mockResolvedValue(mockElement);
      
      await selector.selectWithCache(mockPage, '#cache-clear');
      
      selector.clearCache();
      
      await selector.selectWithCache(mockPage, '#cache-clear');
      
      expect(mockPage.$).toHaveBeenCalledTimes(2);
    });
  });

  describe('选择器验证和调试', () => {
    test('应该验证选择器有效性', async () => {
      const isValid = await selector.validateSelector(mockPage, '#valid-selector');
      
      expect(isValid).toBe(true);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        'document.querySelectorAll("#valid-selector").length > 0'
      );
    });

    test('应该获取选择器匹配数量', async () => {
      mockPage.evaluate.mockResolvedValue(3);
      
      const count = await selector.getSelectorCount(mockPage, '.item');
      
      expect(count).toBe(3);
    });

    test('应该获取元素详细信息', async () => {
      const elementInfo = await selector.getElementInfo(mockElement);
      
      expect(elementInfo).toEqual({
        tagName: expect.any(String),
        className: expect.any(String),
        id: expect.any(String),
        textContent: expect.any(String),
        attributes: expect.any(Object),
        rect: expect.any(Object),
        isVisible: expect.any(Boolean)
      });
    });

    test('应该生成选择器建议', async () => {
      const suggestions = await selector.getSuggestions(mockPage, 'submit');
      
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('高级选择器功能', () => {
    test('应该使用机器学习预测元素', async () => {
      const mlElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([mlElement]);
      
      const result = await selector.selectWithML(mockPage, 'like button', {
        model: 'element-classifier'
      });
      
      expect(result).toBe(mlElement);
    });

    test('应该通过相似性查找元素', async () => {
      const similarElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([similarElement]);
      
      const result = await selector.selectSimilar(mockPage, '#reference-element', 0.8);
      
      expect(result).toBe(similarElement);
    });

    test('应该通过时间序列查找变化的元素', async () => {
      const changedElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue([changedElement]);
      
      const result = await selector.selectChanged(mockPage, '.dynamic-content');
      
      expect(result).toBe(changedElement);
    });
  });

  describe('错误处理和恢复', () => {
    test('应该处理无效选择器语法', async () => {
      await expect(selector.select(mockPage, 'invalid-selector['))
        .rejects.toThrow(BrowserAssistantError);
    });

    test('应该处理JavaScript执行错误', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('JavaScript error'));
      
      await expect(selector.selectByText(mockPage, 'test'))
        .rejects.toThrow(BrowserAssistantError);
    });

    test('应该处理元素访问失败', async () => {
      const errorElement = createMockElementHandle();
      errorElement.evaluate.mockRejectedValue(new Error('Element not attached'));
      mockPage.evaluate.mockResolvedValue([errorElement]);
      
      await expect(selector.selectByText(mockPage, 'test'))
        .rejects.toThrow(ElementNotFoundError);
    });

    test('应该重试失败的查找操作', async () => {
      let callCount = 0;
      mockPage.evaluate.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return [];
        }
        return [mockElement];
      });
      
      const result = await selector.selectWithRetry(mockPage, '#retry-element', { maxRetries: 3 });
      
      expect(result).toBe(mockElement);
      expect(callCount).toBe(3);
    });
  });

  describe('性能优化', () => {
    test('应该使用批量选择器操作', async () => {
      const selectors = ['#item1', '#item2', '#item3'];
      mockPage.evaluate.mockResolvedValue([mockElement, mockElement, mockElement]);
      
      const results = await selector.batchSelect(mockPage, selectors);
      
      expect(results).toHaveLength(3);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
    });

    test('应该并行执行选择器查找', async () => {
      const start = Date.now();
      
      await Promise.all([
        selector.select(mockPage, '#element1'),
        selector.select(mockPage, '#element2'),
        selector.select(mockPage, '#element3')
      ]);
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000); // 并行操作应该很快
    });

    test('应该优化选择器查询范围', async () => {
      const containerElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue(containerElement);
      
      await selector.selectWithin(mockPage, '#container', '.item');
      
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.stringContaining('#container')
      );
    });
  });
});