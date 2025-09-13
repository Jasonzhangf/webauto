/**
 * 智能元素选择器
 * 基于Stagehand的AI识别模式和xiaohongshu-mcp的多策略选择模式
 */

import { Page, ElementHandle } from 'playwright';
import { BaseBrowserModule } from '../core/SimpleBaseModule';
import { AIAssistant } from '../intelligence/AIAssistant';
import { ElementNotFoundError, BrowserAssistantError } from '../errors';

export interface ElementContext {
  type?: string;
  text?: string;
  attributes?: Record<string, string>;
  role?: string;
  context?: string;
  screenshot?: Buffer;
  accessibilityTree?: any;
}

export interface ElementSelection {
  element: ElementHandle | null;
  selector: string;
  confidence: number;
  method: 'ai' | 'css' | 'attributes' | 'text' | 'race' | 'fallback';
  alternativeSelectors?: string[];
}

/**
 * 智能元素选择器
 * 提供多策略元素识别和选择功能
 */
export class SmartElementSelector extends BaseBrowserModule {
  private aiAssistant: AIAssistant | null;
  private selectionCache: Map<string, ElementSelection> = new Map();

  constructor(aiAssistant: AIAssistant | null = null) {
    super('SmartElementSelector');
    this.aiAssistant = aiAssistant;
  }

  /**
   * 子类初始化逻辑
   */
  protected async onInitialize(): Promise<void> {
    this.logInfo('Initializing SmartElementSelector...');
  }

  /**
   * 注册模块能力
   */
  protected async registerCapabilities(): Promise<void> {
    this.logInfo('Registering SmartElementSelector capabilities...');
    // 简化实现，无需实际注册
  }

  /**
   * 健康检查
   */
  protected checkHealth(): boolean {
    return true;
  }

  /**
   * 子类清理逻辑
   */
  protected async onCleanup(): Promise<void> {
    this.selectionCache.clear();
    this.logInfo('SmartElementSelector cleaned up');
  }

  /**
   * 智能元素选择 - 多策略实现
   */
  async selectElement(page: Page, context: ElementContext): Promise<ElementSelection> {
    const cacheKey = this.generateCacheKey(page, context);
    
    // 检查缓存
    if (this.selectionCache.has(cacheKey)) {
      const cached = this.selectionCache.get(cacheKey)!;
      if (await this.validateCachedElement(page, cached)) {
        this.debug(`Using cached selection for: ${cacheKey}`);
        return cached;
      } else {
        this.selectionCache.delete(cacheKey);
      }
    }

    this.info(`Selecting element with context: ${JSON.stringify(context)}`);

    // 策略1: AI智能识别
    if (this.aiAssistant && context.screenshot) {
      try {
        const aiSelection = await this.selectWithAI(page, context);
        if (aiSelection.confidence > 0.8 && aiSelection.element) {
          await this.cacheSelection(cacheKey, aiSelection);
          return aiSelection;
        }
      } catch (error: any) {
        this.warn(`AI selection failed: ${error.message}`);
      }
    }

    // 策略2: 竞争式选择
    try {
      const raceSelection = await this.selectWithRace(page, context);
      if (raceSelection.element) {
        await this.cacheSelection(cacheKey, raceSelection);
        return raceSelection;
      }
    } catch (error: any) {
      this.warn(`Race selection failed: ${error.message}`);
    }

    // 策略3: 传统CSS选择器
    try {
      const cssSelection = await this.selectWithCSS(page, context);
      if (cssSelection.element) {
        await this.cacheSelection(cacheKey, cssSelection);
        return cssSelection;
      }
    } catch (error: any) {
      this.warn(`CSS selection failed: ${error.message}`);
    }

    // 策略4: 属性选择器
    try {
      const attrSelection = await this.selectWithAttributes(page, context);
      if (attrSelection.element) {
        await this.cacheSelection(cacheKey, attrSelection);
        return attrSelection;
      }
    } catch (error: any) {
      this.warn(`Attribute selection failed: ${error.message}`);
    }

    // 策略5: 文本内容匹配
    try {
      const textSelection = await this.selectWithText(page, context);
      if (textSelection.element) {
        await this.cacheSelection(cacheKey, textSelection);
        return textSelection;
      }
    } catch (error: any) {
      this.warn(`Text selection failed: ${error.message}`);
    }

    // 策略6: 通用回退策略
    try {
      const fallbackSelection = await this.selectWithFallback(page, context);
      if (fallbackSelection.element) {
        await this.cacheSelection(cacheKey, fallbackSelection);
        return fallbackSelection;
      }
    } catch (error: any) {
      this.warn(`Fallback selection failed: ${error.message}`);
    }

    throw new ElementNotFoundError(`Cannot find element for context: ${JSON.stringify(context)}`);
  }

  /**
   * 基于AI的元素选择
   */
  private async selectWithAI(page: Page, context: ElementContext): Promise<ElementSelection> {
    if (!this.aiAssistant) {
      throw new Error('AIAssistant not available');
    }

    // 简化的AI选择逻辑（实际实现会调用AI服务）
    this.debug('Attempting AI-based element selection');
    
    // 这里应该调用AIAssistant的识别方法
    // 现在返回一个模拟结果
    const mockSelector = this.generateCSSSelectors(context)[0] || '*';
    const element = await page.$(mockSelector);
    
    return {
      element,
      selector: mockSelector,
      confidence: 0.85,
      method: 'ai',
      alternativeSelectors: this.generateCSSSelectors(context)
    };
  }

  /**
   * 竞争式元素选择
   */
  private async selectWithRace(page: Page, context: ElementContext): Promise<ElementSelection> {
    const selectors = this.generateRaceSelectors(context);
    
    if (selectors.length === 0) {
      throw new Error('No selectors available for race selection');
    }

    const timeout = 5000;
    
    try {
      // 使用Promise.any来找到第一个可用的元素
      const elementPromises = selectors.map(async (selector) => {
        try {
          const element = await page.waitForSelector(selector, { timeout });
          return { element, selector, confidence: 0.9 };
        } catch {
          throw new Error(`Selector ${selector} not found`);
        }
      });

      const result = await Promise.any(elementPromises);
      
      return {
        element: result.element,
        selector: result.selector,
        confidence: result.confidence,
        method: 'race',
        alternativeSelectors: selectors.filter(s => s !== result.selector)
      };
    } catch (error: any) {
      throw new Error(`Race selection failed: ${error.message}`);
    }
  }

  /**
   * 基于CSS选择器的元素选择
   */
  private async selectWithCSS(page: Page, context: ElementContext): Promise<ElementSelection> {
    const selectors = this.generateCSSSelectors(context);
    
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          return {
            element,
            selector,
            confidence: this.calculateCSSConfidence(selector, context),
            method: 'css',
            alternativeSelectors: selectors.filter(s => s !== selector)
          };
        }
      } catch (error: any) {
        this.debug(`CSS selector ${selector} failed: ${error.message}`);
      }
    }

    throw new Error('No CSS selector found element');
  }

  /**
   * 基于属性的元素选择
   */
  private async selectWithAttributes(page: Page, context: ElementContext): Promise<ElementSelection> {
    if (!context.attributes) {
      throw new Error('No attributes provided for attribute selection');
    }

    const selector = this.buildAttributeSelector(context.attributes);
    
    try {
      const element = await page.$(selector);
      if (element) {
        return {
          element,
          selector,
          confidence: 0.8,
          method: 'attributes'
        };
      }
    } catch (error: any) {
      this.debug(`Attribute selector ${selector} failed: ${error.message}`);
    }

    throw new Error('No element found with provided attributes');
  }

  /**
   * 基于文本内容的元素选择
   */
  private async selectWithText(page: Page, context: ElementContext): Promise<ElementSelection> {
    if (!context.text) {
      throw new Error('No text provided for text selection');
    }

    const selectors = this.generateTextSelectors(context.text);
    
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          return {
            element,
            selector,
            confidence: 0.7,
            method: 'text',
            alternativeSelectors: selectors.filter(s => s !== selector)
          };
        }
      } catch (error: any) {
        this.debug(`Text selector ${selector} failed: ${error.message}`);
      }
    }

    throw new Error(`No element found with text: ${context.text}`);
  }

  /**
   * 通用回退策略
   */
  private async selectWithFallback(page: Page, context: ElementContext): Promise<ElementSelection> {
    const fallbackSelectors = this.getFallbackSelectors(context);
    
    for (const selector of fallbackSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          return {
            element,
            selector,
            confidence: 0.5,
            method: 'fallback'
          };
        }
      } catch (error: any) {
        this.debug(`Fallback selector ${selector} failed: ${error.message}`);
      }
    }

    throw new Error('No fallback selector found element');
  }

  /**
   * 查找所有匹配的元素
   */
  async selectAllElements(page: Page, context: ElementContext): Promise<ElementSelection[]> {
    const selectors = [
      ...this.generateCSSSelectors(context),
      ...this.generateTextSelectors(context.text || ''),
      ...this.getFallbackSelectors(context)
    ];

    const results: ElementSelection[] = [];
    
    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          results.push({
            element,
            selector,
            confidence: 0.6,
            method: 'css'
          });
        }
      } catch (error: any) {
        this.debug(`Selector ${selector} failed: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * 等待元素出现
   */
  async waitForElement(page: Page, context: ElementContext, options: {
    timeout?: number;
    state?: 'attached' | 'detached' | 'visible' | 'hidden';
  } = {}): Promise<ElementSelection> {
    const {
      timeout = 10000,
      state = 'attached'
    } = options;

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const selection = await this.selectElement(page, context);
        if (selection.element) {
          return selection;
        }
      } catch (error: any) {
        this.debug(`Element not ready: ${error.message}`);
      }
      
      await this.sleep(500);
    }

    throw new ElementNotFoundError(`Element not found within ${timeout}ms`);
  }

  /**
   * 生成竞争式选择器
   */
  private generateRaceSelectors(context: ElementContext): string[] {
    const selectors: string[] = [];

    if (context.type) {
      selectors.push(
        context.type,
        `[data-testid="${context.type}"]`,
        `[data-role="${context.type}"]`,
        `[aria-label*="${context.type}"]`,
        `[title*="${context.type}"]`
      );
    }

    if (context.text) {
      const text = context.text.trim();
      selectors.push(
        `text=${text}`,
        `[text="${text}"]`
      );
    }

    if (context.role) {
      selectors.push(
        `[role="${context.role}"]`,
        `[aria-role="${context.role}"]`
      );
    }

    return selectors;
  }

  /**
   * 生成CSS选择器
   */
  private generateCSSSelectors(context: ElementContext): string[] {
    const selectors: string[] = [];

    if (context.type) {
      selectors.push(
        context.type,
        `${context.type}[class*="${context.type}"]`,
        `.${context.type}`,
        `[class*="${context.type}"]`,
        `[id*="${context.type}"]`
      );
    }

    if (context.text) {
      selectors.push(
        `text=${context.text}`
      );
    }

    if (context.attributes) {
      for (const [key, value] of Object.entries(context.attributes)) {
        selectors.push(
          `[${key}="${value}"]`,
          `[${key}*="${value}"]`,
          `[${key}^="${value}"]`,
          `[${key}$="${value}"]`
        );
      }
    }

    return selectors;
  }

  /**
   * 生成文本选择器
   */
  private generateTextSelectors(text: string): string[] {
    const trimmed = text.trim();
    return [
      `text=${trimmed}`,
      `//*[text()="${trimmed}"]`,
      `//*[contains(text(), "${trimmed}")]`,
      `[aria-label*="${trimmed}"]`,
      `[title*="${trimmed}"]`,
      `[placeholder*="${trimmed}"]`
    ];
  }

  /**
   * 构建属性选择器
   */
  private buildAttributeSelector(attributes: Record<string, string>): string {
    const selectors = Object.entries(attributes).map(([key, value]) => {
      return `[${key}="${value}"]`;
    });
    
    return selectors.join('');
  }

  /**
   * 获取回退选择器
   */
  private getFallbackSelectors(context: ElementContext): string[] {
    const fallbacks: string[] = [];

    switch (context.type) {
      case 'button':
        fallbacks.push('button', '[type="button"]', '[role="button"]');
        break;
      case 'input':
        fallbacks.push('input', 'textarea', '[contenteditable="true"]');
        break;
      case 'link':
        fallbacks.push('a', '[role="link"]');
        break;
      case 'image':
        fallbacks.push('img', '[role="img"]');
        break;
      default:
        fallbacks.push('*', '[role="generic"]');
    }

    if (context.text) {
      fallbacks.push(`*:has-text("${context.text}")`);
    }

    return fallbacks;
  }

  /**
   * 计算CSS选择器的置信度
   */
  private calculateCSSConfidence(selector: string, context: ElementContext): number {
    let confidence = 0.5;

    if (context.type && selector.includes(context.type)) {
      confidence += 0.2;
    }

    if (context.text && selector.includes(context.text)) {
      confidence += 0.2;
    }

    if (context.attributes) {
      for (const [key, value] of Object.entries(context.attributes)) {
        if (selector.includes(key) && selector.includes(value)) {
          confidence += 0.1;
        }
      }
    }

    if (selector.includes('data-')) confidence += 0.1;
    if (selector.includes('aria-')) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(page: Page, context: ElementContext): string {
    const url = page.url() || 'about:blank';
    const contextStr = JSON.stringify(context);
    return `${url}:${contextStr}`;
  }

  /**
   * 验证缓存的元素
   */
  private async validateCachedElement(page: Page, cached: ElementSelection): Promise<boolean> {
    if (!cached.element) return false;
    
    try {
      const isVisible = await cached.element.isVisible();
      // 简化检查，避免 isConnected() 方法
      return isVisible;
    } catch {
      return false;
    }
  }

  /**
   * 缓存选择结果
   */
  private async cacheSelection(cacheKey: string, selection: ElementSelection): Promise<void> {
    if (this.selectionCache.size > 100) {
      const oldestKey = this.selectionCache.keys().next().value;
      this.selectionCache.delete(oldestKey);
    }
    
    this.selectionCache.set(cacheKey, selection);
  }

  /**
   * 辅助方法：休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}