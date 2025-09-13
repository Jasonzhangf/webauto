/**
 * 页面操作处理中心
 * 处理点击、滚动、内容提取、键盘输入、拷贝粘贴等操作
 * 参考 AIstudioProxyAPI 中的操作实现
 */

import { Page, Locator, Frame, ElementHandle } from 'playwright';
import { BaseBrowserModule } from '../core/BaseModule';
import { BrowserAssistantError, ElementNotFoundError, NavigationTimeoutError } from '../errors';
import { Logger } from '@webauto/rcc-core';

export interface OperationOptions {
  timeout?: number;
  retryCount?: number;
  force?: boolean;
  scrollIntoView?: boolean;
  waitAfter?: number;
}

export interface ClickOptions extends OperationOptions {
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  position?: { x: number; y: number };
  modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[];
}

export interface ScrollOptions extends OperationOptions {
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  smooth?: boolean;
  element?: string | Locator | ElementHandle;
}

export interface TypeOptions extends OperationOptions {
  delay?: number;
  clearFirst?: boolean;
  pressEnter?: boolean;
}

export interface ContentExtractionOptions {
  includeImages?: boolean;
  includeLinks?: boolean;
  includeTables?: boolean;
  includeForms?: boolean;
  maxDepth?: number;
  selectorFilter?: string;
}

export interface CopyPasteOptions extends OperationOptions {
  format?: 'text' | 'html' | 'markdown';
  useSystemClipboard?: boolean;
}

export interface ExtractedContent {
  text: string;
  html?: string;
  links: Array<{ text: string; url: string }>;
  images: Array<{ src: string; alt: string }>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  forms: Array<{ fields: Array<{ name: string; value: string; type: string }> }>;
  metadata: {
    title: string;
    description?: string;
    wordCount: number;
    elementCount: number;
  };
}

/**
 * 页面操作处理中心
 * 提供完整的页面交互操作功能
 */
export class PageOperationCenter extends BaseBrowserModule {
  private logger: Logger;
  private defaultTimeout: number = 30000;
  private retryAttempts: number = 3;

  constructor(logger?: Logger) {
    super('PageOperationCenter');
    this.logger = logger || this.getLogger();
  }

  /**
   * 初始化操作中心
   */
  async initialize(): Promise<void> {
    await super.initialize();
    this.logger.info('页面操作处理中心已初始化');
  }

  /**
   * 点击操作 - 智能点击元素
   */
  async click(
    page: Page,
    selector: string | Locator | ElementHandle,
    options: ClickOptions = {}
  ): Promise<void> {
    const operationId = this.generateOperationId('click');
    this.logger.info(`[${operationId}] 开始点击操作: ${typeof selector === 'string' ? selector : 'Locator/ElementHandle'}`);

    try {
      const {
        timeout = this.defaultTimeout,
        retryCount = this.retryAttempts,
        force = false,
        scrollIntoView = true,
        button = 'left',
        clickCount = 1,
        position,
        modifiers = [],
        waitAfter = 500
      } = options;

      let locator: Locator;
      if (typeof selector === 'string') {
        locator = page.locator(selector);
      } else if (selector instanceof ElementHandle) {
        locator = page.locator(selector);
      } else {
        locator = selector;
      }

      // 智能重试机制
      for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
          // 等待元素可交互
          await locator.waitFor({ state: 'attached', timeout: timeout / retryCount });
          
          if (scrollIntoView) {
            await locator.scrollIntoViewIfNeeded();
            await this.sleep(100);
          }

          // 执行点击
          const clickOptions: any = {
            timeout: timeout / retryCount,
            force,
            button,
            clickCount,
            delay: clickCount > 1 ? 100 : 0
          };

          if (position) {
            clickOptions.position = position;
          }

          if (modifiers.length > 0) {
            clickOptions.modifiers = modifiers;
          }

          await locator.click(clickOptions);
          
          if (waitAfter > 0) {
            await this.sleep(waitAfter);
          }

          this.logger.info(`[${operationId}] ✅ 点击操作成功 (尝试 ${attempt}/${retryCount})`);
          return;

        } catch (error) {
          if (attempt === retryCount) {
            throw new ElementNotFoundError(
              `点击操作失败: ${error.message}`,
              { selector: typeof selector === 'string' ? selector : 'unknown', operationId }
            );
          }
          
          this.logger.warn(`[${operationId}] 点击操作失败 (尝试 ${attempt}/${retryCount}): ${error.message}`);
          await this.sleep(1000 * attempt); // 指数退避
        }
      }

    } catch (error) {
      this.logger.error(`[${operationId}] ❌ 点击操作失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 滚动操作 - 支持多种滚动方式
   */
  async scroll(
    page: Page,
    options: ScrollOptions = {}
  ): Promise<void> {
    const operationId = this.generateOperationId('scroll');
    this.logger.info(`[${operationId}] 开始滚动操作`);

    try {
      const {
        direction = 'down',
        amount = 500,
        smooth = true,
        element,
        timeout = this.defaultTimeout,
        waitAfter = 300
      } = options;

      if (element) {
        // 滚动到指定元素
        let targetLocator: Locator;
        if (typeof element === 'string') {
          targetLocator = page.locator(element);
        } else if (element instanceof ElementHandle) {
          targetLocator = page.locator(element);
        } else {
          targetLocator = element;
        }

        await targetLocator.waitFor({ state: 'attached', timeout });
        await targetLocator.scrollIntoViewIfNeeded();
        this.logger.info(`[${operationId}] ✅ 已滚动到元素: ${typeof element === 'string' ? element : 'Element'}`);
      } else {
        // 页面滚动
        const scrollScript = `
          window.scrollTo({
            top: window.scrollY + ${direction === 'down' || direction === 'right' ? amount : -amount},
            left: window.scrollX + ${direction === 'right' || direction === 'down' ? amount : -amount},
            behavior: '${smooth ? 'smooth' : 'auto'}'
          });
        `;
        
        await page.evaluate(scrollScript);
        this.logger.info(`[${operationId}] ✅ 页面滚动完成: ${direction} ${amount}px`);
      }

      if (waitAfter > 0) {
        await this.sleep(waitAfter);
      }

    } catch (error) {
      this.logger.error(`[${operationId}] ❌ 滚动操作失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 输入文本操作 - 智能文本输入
   */
  async type(
    page: Page,
    selector: string | Locator,
    text: string,
    options: TypeOptions = {}
  ): Promise<void> {
    const operationId = this.generateOperationId('type');
    this.logger.info(`[${operationId}] 开始输入文本操作: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

    try {
      const {
        timeout = this.defaultTimeout,
        delay = 50,
        clearFirst = true,
        pressEnter = false,
        waitAfter = 300
      } = options;

      let locator: Locator;
      if (typeof selector === 'string') {
        locator = page.locator(selector);
      } else {
        locator = selector;
      }

      await locator.waitFor({ state: 'visible', timeout });
      await locator.scrollIntoViewIfNeeded();

      if (clearFirst) {
        await locator.clear();
        await this.sleep(100);
      }

      await locator.type(text, { delay });
      
      if (pressEnter) {
        await locator.press('Enter');
      }

      if (waitAfter > 0) {
        await this.sleep(waitAfter);
      }

      this.logger.info(`[${operationId}] ✅ 文本输入完成`);

    } catch (error) {
      this.logger.error(`[${operationId}] ❌ 文本输入失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 内容提取 - 智能页面内容提取
   */
  async extractContent(
    page: Page,
    options: ContentExtractionOptions = {}
  ): Promise<ExtractedContent> {
    const operationId = this.generateOperationId('extract');
    this.logger.info(`[${operationId}] 开始内容提取操作`);

    try {
      const {
        includeImages = true,
        includeLinks = true,
        includeTables = true,
        includeForms = false,
        maxDepth = 3,
        selectorFilter
      } = options;

      // 执行页面内容提取脚本
      const extractionScript = this.buildContentExtractionScript({
        includeImages,
        includeLinks,
        includeTables,
        includeForms,
        maxDepth,
        selectorFilter
      });

      const result: ExtractedContent = await page.evaluate(extractionScript);
      
      this.logger.info(`[${operationId}] ✅ 内容提取完成: ${result.metadata.wordCount} 词, ${result.links.length} 链接`);
      return result;

    } catch (error) {
      this.logger.error(`[${operationId}] ❌ 内容提取失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 复制操作 - 智能内容复制
   */
  async copy(
    page: Page,
    selector?: string | Locator,
    options: CopyPasteOptions = {}
  ): Promise<string> {
    const operationId = this.generateOperationId('copy');
    this.logger.info(`[${operationId}] 开始复制操作`);

    try {
      const { format = 'text', useSystemClipboard = true } = options;

      let textContent = '';

      if (selector) {
        // 复制指定元素内容
        let locator: Locator;
        if (typeof selector === 'string') {
          locator = page.locator(selector);
        } else {
          locator = selector;
        }

        await locator.waitFor({ state: 'visible' });
        
        if (format === 'html') {
          textContent = await locator.innerHTML();
        } else {
          textContent = await locator.textContent() || '';
        }
      } else {
        // 复制选中的文本或整个页面
        textContent = await page.evaluate(() => {
          const selection = window.getSelection();
          return selection?.toString() || document.body.innerText || '';
        });
      }

      // 使用系统剪贴板
      if (useSystemClipboard) {
        await page.evaluate((text) => {
          navigator.clipboard.writeText(text);
        }, textContent);
      }

      this.logger.info(`[${operationId}] ✅ 复制操作完成: ${textContent.length} 字符`);
      return textContent;

    } catch (error) {
      this.logger.error(`[${operationId}] ❌ 复制操作失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 粘贴操作 - 智能内容粘贴
   */
  async paste(
    page: Page,
    selector: string | Locator,
    text?: string,
    options: CopyPasteOptions = {}
  ): Promise<void> {
    const operationId = this.generateOperationId('paste');
    this.logger.info(`[${operationId}] 开始粘贴操作`);

    try {
      const { useSystemClipboard = true, waitAfter = 300 } = options;

      let locator: Locator;
      if (typeof selector === 'string') {
        locator = page.locator(selector);
      } else {
        locator = selector;
      }

      await locator.waitFor({ state: 'visible' });
      await locator.scrollIntoViewIfNeeded();
      await locator.click();

      let pasteText = text;
      if (!pasteText && useSystemClipboard) {
        pasteText = await page.evaluate(() => {
          return navigator.clipboard.readText();
        });
      }

      if (pasteText) {
        await page.evaluate((text) => {
          document.execCommand('insertText', false, text);
        }, pasteText);
      }

      if (waitAfter > 0) {
        await this.sleep(waitAfter);
      }

      this.logger.info(`[${operationId}] ✅ 粘贴操作完成`);

    } catch (error) {
      this.logger.error(`[${operationId}] ❌ 粘贴操作失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 截图操作 - 支持多种截图模式
   */
  async screenshot(
    page: Page,
    options: {
      fullPage?: boolean;
      selector?: string | Locator | ElementHandle;
      path?: string;
      format?: 'png' | 'jpeg';
      quality?: number;
    } = {}
  ): Promise<Buffer> {
    const operationId = this.generateOperationId('screenshot');
    this.logger.info(`[${operationId}] 开始截图操作`);

    try {
      const {
        fullPage = false,
        selector,
        path,
        format = 'png',
        quality
      } = options;

      const screenshotOptions: any = {
        fullPage,
        type: format,
        path
      };

      if (quality && format === 'jpeg') {
        screenshotOptions.quality = quality;
      }

      let screenshot: Buffer;
      
      if (selector) {
        // 截图指定元素
        let element: ElementHandle;
        if (typeof selector === 'string') {
          element = await page.waitForSelector(selector, { state: 'attached' });
        } else if (selector instanceof ElementHandle) {
          element = selector;
        } else {
          element = await selector.elementHandle();
        }
        
        screenshot = await element.screenshot(screenshotOptions);
      } else {
        // 截图整个页面或视口
        screenshot = await page.screenshot(screenshotOptions);
      }

      this.logger.info(`[${operationId}] ✅ 截图完成: ${screenshot.length} bytes`);
      return screenshot;

    } catch (error) {
      this.logger.error(`[${operationId}] ❌ 截图操作失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 等待操作 - 智能等待
   */
  async waitFor(
    page: Page,
    condition: string | (() => Promise<boolean>),
    options: OperationOptions = {}
  ): Promise<void> {
    const operationId = this.generateOperationId('wait');
    this.logger.info(`[${operationId}] 开始等待操作`);

    try {
      const { timeout = this.defaultTimeout } = options;

      if (typeof condition === 'string') {
        // 等待选择器
        await page.waitForSelector(condition, { timeout });
      } else {
        // 等待条件函数
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
          if (await condition()) {
            break;
          }
          await this.sleep(100);
        }
      }

      this.logger.info(`[${operationId}] ✅ 等待操作完成`);

    } catch (error) {
      this.logger.error(`[${operationId}] ❌ 等待操作失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 导航操作 - 智能页面导航
   */
  async navigate(
    page: Page,
    url: string,
    options: OperationOptions = {}
  ): Promise<void> {
    const operationId = this.generateOperationId('navigate');
    this.logger.info(`[${operationId}] 开始导航到: ${url}`);

    try {
      const { timeout = this.defaultTimeout, waitAfter = 1000 } = options;

      await page.goto(url, { 
        timeout,
        waitUntil: 'domcontentloaded'
      });

      if (waitAfter > 0) {
        await this.sleep(waitAfter);
      }

      this.logger.info(`[${operationId}] ✅ 导航完成: ${page.url()}`);

    } catch (error) {
      this.logger.error(`[${operationId}] ❌ 导航失败: ${error.message}`);
      throw new NavigationTimeoutError(`导航超时: ${error.message}`);
    }
  }

  /**
   * 执行脚本 - 安全的脚本执行
   */
  async evaluate<T>(
    page: Page,
    script: string | ((...args: any[]) => T),
    ...args: any[]
  ): Promise<T> {
    const operationId = this.generateOperationId('evaluate');
    this.logger.info(`[${operationId}] 开始执行脚本`);

    try {
      const result = await page.evaluate(script, ...args);
      this.logger.info(`[${operationId}] ✅ 脚本执行完成`);
      return result;
    } catch (error) {
      this.logger.error(`[${operationId}] ❌ 脚本执行失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 构建内容提取脚本
   */
  private buildContentExtractionScript(options: ContentExtractionOptions): string {
    const {
      includeImages,
      includeLinks,
      includeTables,
      includeForms,
      maxDepth,
      selectorFilter
    } = options;

    return `
      () => {
        const result = {
          text: '',
          html: '',
          links: [],
          images: [],
          tables: [],
          forms: [],
          metadata: {
            title: document.title,
            description: document.querySelector('meta[name="description"]')?.content || '',
            wordCount: 0,
            elementCount: 0
          }
        };

        // 获取页面文本内容
        result.text = document.body.innerText || '';
        result.html = document.documentElement.outerHTML || '';

        // 提取链接
        if (${includeLinks}) {
          document.querySelectorAll('a[href]').forEach(link => {
            if (link.href && link.href.startsWith('http')) {
              result.links.push({
                text: link.textContent?.trim() || '',
                url: link.href
              });
            }
          });
        }

        // 提取图片
        if (${includeImages}) {
          document.querySelectorAll('img[src]').forEach(img => {
            if (img.src) {
              result.images.push({
                src: img.src,
                alt: img.alt || ''
              });
            }
          });
        }

        // 提取表格
        if (${includeTables}) {
          document.querySelectorAll('table').forEach(table => {
            const headers = [];
            const rows = [];
            
            // 提取表头
            const headerRow = table.querySelector('tr');
            if (headerRow) {
              headerRow.querySelectorAll('th, td').forEach((cell, index) => {
                headers[index] = cell.textContent?.trim() || \`Header \${index + 1}\`;
              });
            }

            // 提取表格行
            table.querySelectorAll('tr').forEach((row, rowIndex) => {
              if (rowIndex === 0 && headerRow) return; // 跳过表头行
              
              const rowData = [];
              row.querySelectorAll('td').forEach(cell => {
                rowData.push(cell.textContent?.trim() || '');
              });
              
              if (rowData.length > 0) {
                rows.push(rowData);
              }
            });

            if (headers.length > 0 || rows.length > 0) {
              result.tables.push({ headers, rows });
            }
          });
        }

        // 提取表单
        if (${includeForms}) {
          document.querySelectorAll('form').forEach(form => {
            const fields = [];
            form.querySelectorAll('input, textarea, select').forEach(field => {
              const fieldType = field.type || field.tagName.toLowerCase();
              const fieldName = field.name || field.id || '';
              const fieldValue = field.value || '';
              
              if (fieldName) {
                fields.push({
                  name: fieldName,
                  value: fieldValue,
                  type: fieldType
                });
              }
            });
            
            if (fields.length > 0) {
              result.forms.push({ fields });
            }
          });
        }

        // 计算词数
        result.metadata.wordCount = result.text.split(/\\s+/).filter(word => word.length > 0).length;
        result.metadata.elementCount = document.querySelectorAll('*').length;

        return result;
      }
    `;
  }

  /**
   * 生成操作ID
   */
  private generateOperationId(operation: string): string {
    return `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 休眠辅助方法
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await super.cleanup();
    this.logger.info('页面操作处理中心已清理');
  }
}