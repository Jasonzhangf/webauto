/**
 * SimplePageOperationCenter 单元测试
 */

import { SimplePageOperationCenter } from '../../src/operations/SimplePageOperationCenter';
import { BrowserAssistantError, TimeoutError, ElementNotFoundError } from '../../src/errors';
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
  scrollIntoView: jest.Mock;
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
  scrollIntoView: jest.Mock;
}

describe('SimplePageOperationCenter', () => {
  let operationCenter: SimplePageOperationCenter;
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
      scrollIntoView: createAsyncMock<void>(undefined),
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
      scrollIntoView: createAsyncMock<void>(undefined)
    };

    operationCenter = new SimplePageOperationCenter();
  });

  describe('点击操作', () => {
    test('应该通过选择器点击元素', async () => {
      await operationCenter.click(mockPage, '#submit-button', { timeout: 5000 });
      
      expect(mockPage.click).toHaveBeenCalledWith('#submit-button', {
        timeout: 5000,
        force: false,
        position: undefined
      });
    });

    test('应该通过ElementHandle点击元素', async () => {
      await operationCenter.click(mockPage, mockElement, { force: true });
      
      expect(mockElement.click).toHaveBeenCalledWith({
        timeout: 10000,
        force: true,
        position: undefined
      });
      expect(mockPage.click).not.toHaveBeenCalled();
    });

    test('应该处理点击超时', async () => {
      mockPage.click.mockRejectedValue(new Error('Timeout: 5000ms exceeded'));
      
      await expect(operationCenter.click(mockPage, '#slow-button', { timeout: 1000 }))
        .rejects.toThrow(TimeoutError);
    });

    test('应该处理元素不存在错误', async () => {
      mockPage.click.mockRejectedValue(new Error('Element not found'));
      
      await expect(operationCenter.click(mockPage, '#non-existent'))
        .rejects.toThrow(ElementNotFoundError);
    });

    test('应该使用自定义点击位置', async () => {
      const position = { x: 100, y: 200 };
      await operationCenter.click(mockPage, '#button', { position });
      
      expect(mockPage.click).toHaveBeenCalledWith('#button', {
        timeout: 10000,
        force: false,
        position
      });
    });
  });

  describe('输入操作', () => {
    test('应该向选择器元素输入文本', async () => {
      await operationCenter.type(mockPage, '#input-field', 'test text', { timeout: 8000 });
      
      expect(mockPage.type).toHaveBeenCalledWith('#input-field', 'test text', {
        timeout: 8000,
        delay: 50
      });
    });

    test('应该向ElementHandle输入文本', async () => {
      await operationCenter.type(mockPage, mockElement, 'element text', { delay: 100 });
      
      expect(mockElement.type).toHaveBeenCalledWith('element text', {
        timeout: 10000,
        delay: 100
      });
      expect(mockPage.type).not.toHaveBeenCalled();
    });

    test('应该处理输入超时', async () => {
      mockPage.type.mockRejectedValue(new Error('Timeout while typing'));
      
      await expect(operationCenter.type(mockPage, '#input', 'long text'))
        .rejects.toThrow(TimeoutError);
    });

    test('应该处理输入焦点错误', async () => {
      mockPage.type.mockRejectedValue(new Error('Element is not visible'));
      
      await expect(operationCenter.type(mockPage, '#hidden-input', 'text'))
        .rejects.toThrow(ElementNotFoundError);
    });

    test('应该支持清空现有内容', async () => {
      await operationCenter.type(mockPage, '#input', 'new text', { clear: true });
      
      expect(mockPage.type).toHaveBeenCalledWith('#input', 'new text', {
        timeout: 10000,
        delay: 50,
        clear: true
      });
    });
  });

  describe('滚动操作', () => {
    test('应该滚动到指定位置', async () => {
      await operationCenter.scrollTo(mockPage, 'bottom');
      
      expect(mockPage.evaluate).toHaveBeenCalledWith('window.scrollTo(0, document.body.scrollHeight)');
    });

    test('应该滚动到顶部', async () => {
      await operationCenter.scrollTo(mockPage, 'top');
      
      expect(mockPage.evaluate).toHaveBeenCalledWith('window.scrollTo(0, 0)');
    });

    test('应该滚动到指定元素', async () => {
      const targetElement = createMockElementHandle();
      mockPage.$.mockResolvedValue(targetElement);
      
      await operationCenter.scrollTo(mockPage, '#target-element');
      
      expect(mockPage.$).toHaveBeenCalledWith('#target-element');
      expect(targetElement.scrollIntoView).toHaveBeenCalled();
    });

    test('应该处理滚动元素不存在', async () => {
      mockPage.$.mockResolvedValue(null);
      
      await expect(operationCenter.scrollTo(mockPage, '#non-existent'))
        .rejects.toThrow(ElementNotFoundError);
    });

    test('应该处理滚动失败', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Scroll failed'));
      
      await expect(operationCenter.scrollTo(mockPage, 'bottom'))
        .rejects.toThrow(BrowserAssistantError);
    });
  });

  describe('内容提取操作', () => {
    test('应该提取选择器文本内容', async () => {
      mockPage.evaluate.mockResolvedValue('Extracted text content');
      
      const result = await operationCenter.extractText(mockPage, '#content');
      
      expect(result).toBe('Extracted text content');
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        'const el = document.querySelector("#content"); return el ? el.textContent.trim() : "";'
      );
    });

    test('应该提取ElementHandle文本内容', async () => {
      mockElement.evaluate.mockResolvedValue('Element text content');
      
      const result = await operationCenter.extractText(mockPage, mockElement);
      
      expect(result).toBe('Element text content');
      expect(mockElement.evaluate).toHaveBeenCalledWith(
        'return this.textContent.trim();'
      );
    });

    test('应该提取HTML内容', async () => {
      mockPage.evaluate.mockResolvedValue('<div>HTML content</div>');
      
      const result = await operationCenter.extractHTML(mockPage, '#content');
      
      expect(result).toBe('<div>HTML content</div>');
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        'const el = document.querySelector("#content"); return el ? el.outerHTML : "";'
      );
    });

    test('应该提取元素属性', async () => {
      mockPage.evaluate.mockResolvedValue('https://example.com/image.jpg');
      
      const result = await operationCenter.extractAttribute(mockPage, '#img', 'src');
      
      expect(result).toBe('https://example.com/image.jpg');
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        'const el = document.querySelector("#img"); return el ? el.getAttribute("src") : null;'
      );
    });

    test('应该提取多个元素内容', async () => {
      const elements = [
        createMockElementHandle({ textContent: 'Item 1' }),
        createMockElementHandle({ textContent: 'Item 2' })
      ];
      mockPage.$$.mockResolvedValue(elements);
      
      const result = await operationCenter.extractMultiple(mockPage, '.item', 'text');
      
      expect(result).toEqual(['Item 1', 'Item 2']);
      expect(mockPage.$$).toHaveBeenCalledWith('.item');
    });

    test('应该处理元素不存在时的内容提取', async () => {
      mockPage.evaluate.mockResolvedValue('');
      
      const result = await operationCenter.extractText(mockPage, '#non-existent');
      
      expect(result).toBe('');
    });
  });

  describe('截图操作', () => {
    test('应该对整个页面截图', async () => {
      const screenshot = await operationCenter.screenshot(mockPage);
      
      expect(screenshot).toEqual(Buffer.from('screenshot'));
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        fullPage: true,
        animations: 'disabled'
      });
    });

    test('应该对指定元素截图', async () => {
      await operationCenter.screenshot(mockPage, '#target-element');
      
      expect(mockPage.evaluate).toHaveBeenCalledWith('return document.querySelector("#target-element")?.getBoundingClientRect()');
    });

    test('应该处理截图失败', async () => {
      mockPage.screenshot.mockRejectedValue(new Error('Screenshot failed'));
      
      await expect(operationCenter.screenshot(mockPage))
        .rejects.toThrow(BrowserAssistantError);
    });

    test('应该使用自定义截图选项', async () => {
      const options = { type: 'jpeg', quality: 80 } as any;
      await operationCenter.screenshot(mockPage, null, options);
      
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        ...options,
        fullPage: true,
        animations: 'disabled'
      });
    });
  });

  describe('页面信息获取', () => {
    test('应该获取页面URL', async () => {
      const url = await operationCenter.getPageUrl(mockPage);
      
      expect(url).toBe('https://example.com');
      expect(mockPage.url).toHaveBeenCalled();
    });

    test('应该获取页面标题', async () => {
      const title = await operationCenter.getPageTitle(mockPage);
      
      expect(title).toBe('Test Page');
      expect(mockPage.title).toHaveBeenCalled();
    });

    test('应该获取页面HTML内容', async () => {
      const html = await operationCenter.getPageHTML(mockPage);
      
      expect(html).toBe('<html>content</html>');
      expect(mockPage.content).toHaveBeenCalled();
    });

    test('应该执行JavaScript代码', async () => {
      const script = 'return document.title';
      const result = await operationCenter.executeScript(mockPage, script);
      
      expect(result).toBe('result');
      expect(mockPage.evaluate).toHaveBeenCalledWith(script);
    });

    test('应该处理JavaScript执行错误', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Script execution failed'));
      
      await expect(operationCenter.executeScript(mockPage, 'invalid script'))
        .rejects.toThrow(BrowserAssistantError);
    });
  });

  describe('等待操作', () => {
    test('应该等待选择器出现', async () => {
      await operationCenter.waitForSelector(mockPage, '#dynamic-element', { timeout: 5000 });
      
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#dynamic-element', {
        timeout: 5000,
        state: 'visible'
      });
    });

    test('应该等待条件满足', async () => {
      const condition = '() => document.readyState === "complete"';
      await operationCenter.waitForCondition(mockPage, condition, { timeout: 3000 });
      
      expect(mockPage.waitForFunction).toHaveBeenCalledWith(condition, {
        timeout: 3000
      });
    });

    test('应该处理等待超时', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout exceeded'));
      
      await expect(operationCenter.waitForSelector(mockPage, '#slow-element'))
        .rejects.toThrow(TimeoutError);
    });

    test('应该等待指定时间', async () => {
      const start = Date.now();
      await operationCenter.wait(mockPage, 100);
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(200); // 允许一些误差
    });
  });

  describe('文件下载和上传', () => {
    test('应该触发文件下载', async () => {
      await operationCenter.triggerDownload(mockPage, '#download-link');
      
      expect(mockPage.click).toHaveBeenCalledWith('#download-link', {
        timeout: 10000,
        force: false,
        position: undefined
      });
    });

    test('应该处理文件上传', async () => {
      mockPage.waitForSelector.mockResolvedValue(mockElement);
      mockElement.setInputFiles = createAsyncMock<void>(undefined);
      
      await operationCenter.uploadFile(mockPage, '#file-input', '/path/to/file.txt');
      
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#file-input', { timeout: 10000 });
      expect(mockElement.setInputFiles).toHaveBeenCalledWith('/path/to/file.txt');
    });
  });

  describe('导航操作', () => {
    test('应该刷新页面', async () => {
      await operationCenter.refresh(mockPage);
      
      expect(mockPage.evaluate).toHaveBeenCalledWith('window.location.reload()');
    });

    test('应该导航到新URL', async () => {
      await operationCenter.navigate(mockPage, 'https://new.example.com');
      
      expect(mockPage.evaluate).toHaveBeenCalledWith('window.location.href = "https://new.example.com"');
    });

    test('应该获取页面历史', async () => {
      mockPage.evaluate.mockResolvedValue({ length: 3, current: 1 });
      
      const history = await operationCenter.getNavigationHistory(mockPage);
      
      expect(history).toEqual({ length: 3, current: 1 });
      expect(mockPage.evaluate).toHaveBeenCalledWith('return { length: history.length, current: history.length - history.current }');
    });
  });

  describe('表单操作', () => {
    test('应该提交表单', async () => {
      await operationCenter.submitForm(mockPage, '#login-form');
      
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        'document.querySelector("#login-form")?.submit()'
      );
    });

    test('应该重置表单', async () => {
      await operationCenter.resetForm(mockPage, '#login-form');
      
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        'document.querySelector("#login-form")?.reset()'
      );
    });

    test('应该获取表单数据', async () => {
      mockPage.evaluate.mockResolvedValue({
        username: 'testuser',
        password: 'testpass'
      });
      
      const formData = await operationCenter.getFormData(mockPage, '#login-form');
      
      expect(formData).toEqual({
        username: 'testuser',
        password: 'testpass'
      });
    });
  });

  describe('错误处理和恢复', () => {
    test('应该处理一般性浏览器错误', async () => {
      mockPage.click.mockRejectedValue(new Error('General browser error'));
      
      await expect(operationCenter.click(mockPage, '#button'))
        .rejects.toThrow(BrowserAssistantError);
    });

    test('应该验证输入参数', () => {
      expect(() => operationCenter.click(null as any, '#button'))
        .toThrow(BrowserAssistantError);
      
      expect(() => operationCenter.type(mockPage, '', 'text'))
        .toThrow(BrowserAssistantError);
    });

    test('应该处理网络连接错误', async () => {
      const networkError = new Error('Network connection failed');
      mockPage.evaluate.mockRejectedValue(networkError);
      
      await expect(operationCenter.executeScript(mockPage, 'some script'))
        .rejects.toThrow(BrowserAssistantError);
    });

    test('应该处理页面已关闭错误', async () => {
      mockPage.click.mockRejectedValue(new Error('Target closed'));
      
      await expect(operationCenter.click(mockPage, '#button'))
        .rejects.toThrow(BrowserAssistantError);
    });
  });

  describe('高级操作', () => {
    test('应该获取元素位置和尺寸', async () => {
      mockPage.evaluate.mockResolvedValue({
        x: 100,
        y: 200,
        width: 300,
        height: 400
      });
      
      const rect = await operationCenter.getElementRect(mockPage, '#element');
      
      expect(rect).toEqual({ x: 100, y: 200, width: 300, height: 400 });
    });

    test('应该检查元素可见性', async () => {
      mockPage.evaluate.mockResolvedValue(true);
      
      const isVisible = await operationCenter.isElementVisible(mockPage, '#element');
      
      expect(isVisible).toBe(true);
    });

    test('应该检查元素是否可点击', async () => {
      mockPage.evaluate.mockResolvedValue(true);
      
      const isClickable = await operationCenter.isElementClickable(mockPage, '#element');
      
      expect(isClickable).toBe(true);
    });

    test('应该获取所有匹配元素的计数', async () => {
      mockPage.evaluate.mockResolvedValue(5);
      
      const count = await operationCenter.getElementCount(mockPage, '.item');
      
      expect(count).toBe(5);
    });
  });

  describe('批量操作', () => {
    test('应该执行批量点击操作', async () => {
      const elements = [
        createMockElementHandle(),
        createMockElementHandle()
      ];
      mockPage.$$.mockResolvedValue(elements);
      
      await operationCenter.batchClick(mockPage, '.button');
      
      expect(mockPage.$$).toHaveBeenCalledWith('.button');
      expect(elements[0].click).toHaveBeenCalled();
      expect(elements[1].click).toHaveBeenCalled();
    });

    test('应该收集批量操作结果', async () => {
      const elements = [
        createMockElementHandle({ textContent: 'Text 1' }),
        createMockElementHandle({ textContent: 'Text 2' })
      ];
      mockPage.$$.mockResolvedValue(elements);
      
      const results = await operationCenter.batchExtract(mockPage, '.item', 'textContent');
      
      expect(results).toEqual(['Text 1', 'Text 2']);
    });
  });
});