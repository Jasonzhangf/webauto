// 新浪微博专用操作基类
import { BaseOperation, OperationCategory, OperationResult, OperationStatus, OperationError } from '../base-operation';
import { IExecutionContext } from '../../interfaces/core';
import { WeiboPageType, WeiboPageContext, WeiboPageDetector, WeiboSelectors } from './weibo-page-types';
import { WeiboPost, WeiboUser, WeiboComment, WeiboOperationError, WeiboOperationConfig } from './weibo-data-models';

export abstract class WeiboBaseOperation extends BaseOperation {
  protected pageContext: WeiboPageContext | null = null;
  protected config: WeiboOperationConfig;
  
  constructor(config: Partial<WeiboOperationConfig> = {}) {
    super({
      id: 'weibo_base',
      name: 'Weibo Base Operation',
      version: '1.0.0',
      type: 'weibo-operation'
    });
    
    this.config = this.getDefaultConfig();
    this.config = { ...this.config, ...config };
  }
  
  protected getDefaultConfig(): WeiboOperationConfig {
    return {
      retry: {
        maxAttempts: 3,
        delay: 1000,
        backoffFactor: 2
      },
      timeout: {
        default: 30000,
        navigation: 10000,
        elementWait: 5000,
        ajax: 8000
      },
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        burstLimit: 10
      },
      userAgent: {
        mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
        desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      proxy: {
        enabled: false,
        servers: [],
        rotation: 'random'
      },
      cache: {
        enabled: true,
        ttl: 300000, // 5分钟
        maxSize: 1000
      },
      logging: {
        level: 'info',
        enableConsole: true,
        enableFile: false,
        filePath: './logs/weibo-operations.log'
      }
    };
  }
  
  // 初始化页面上下文
  protected async initializePageContext(context: IExecutionContext): Promise<WeiboPageContext> {
    if (!this.pageContext) {
      const url = context.page?.url() || '';
      const title = await context.page?.title() || '';
      this.pageContext = WeiboPageDetector.getPageContext(url, title);
    }
    return this.pageContext;
  }
  
  // 获取当前页面的选择器
  protected getSelectors(): any {
    if (!this.pageContext) {
      throw new Error('Page context not initialized');
    }
    return WeiboSelectors[this.pageContext.pageType];
  }
  
  // 等待元素出现
  protected async waitForElement(
    context: IExecutionContext, 
    selector: string, 
    timeout: number = this.config.timeout.elementWait
  ): Promise<any> {
    try {
      const element = await context.page?.waitForSelector(selector, { timeout });
      return element;
    } catch (error) {
      throw new Error(`Element not found: ${selector}`);
    }
  }
  
  // 查找元素
  protected async findElement(context: IExecutionContext, selector: string): Promise<any> {
    try {
      const element = await context.page?.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }
      return element;
    } catch (error) {
      throw new Error(`Failed to find element: ${selector}`);
    }
  }
  
  // 查找多个元素
  protected async findElements(context: IExecutionContext, selector: string): Promise<any[]> {
    try {
      const elements = await context.page?.$$(selector);
      return elements || [];
    } catch (error) {
      throw new Error(`Failed to find elements: ${selector}`);
    }
  }
  
  // 点击元素
  protected async clickElement(
    context: IExecutionContext, 
    selector: string, 
    options: { timeout?: number; force?: boolean } = {}
  ): Promise<void> {
    try {
      const element = await this.waitForElement(context, selector, options.timeout);
      await element.click({ timeout: options.timeout || this.config.timeout.elementWait });
      await this.delay(500); // 等待响应
    } catch (error) {
      throw new Error(`Failed to click element: ${selector}`);
    }
  }
  
  // 输入文本
  protected async inputText(
    context: IExecutionContext, 
    selector: string, 
    text: string,
    options: { clear?: boolean; delay?: number } = {}
  ): Promise<void> {
    try {
      const element = await this.waitForElement(context, selector);
      if (options.clear) {
        await element.evaluate((el: any) => el.value = '');
      }
      await element.type(text, { delay: options.delay || 50 });
    } catch (error) {
      throw new Error(`Failed to input text: ${selector}`);
    }
  }
  
  // 获取元素文本
  protected async getElementText(context: IExecutionContext, selector: string): Promise<string> {
    try {
      const element = await this.findElement(context, selector);
      const text = await element.textContent();
      return text?.trim() || '';
    } catch (error) {
      throw new Error(`Failed to get element text: ${selector}`);
    }
  }
  
  // 获取元素属性
  protected async getElementAttribute(context: IExecutionContext, selector: string, attribute: string): Promise<string | null> {
    try {
      const element = await this.findElement(context, selector);
      const value = await element.getAttribute(attribute);
      return value;
    } catch (error) {
      throw new Error(`Failed to get element attribute: ${selector}`);
    }
  }
  
  // 滚动到元素
  protected async scrollToElement(context: IExecutionContext, selector: string): Promise<void> {
    try {
      const element = await this.findElement(context, selector);
      await element.evaluate((el: any) => el.scrollIntoView({ behavior: 'smooth' }));
      await this.delay(300);
    } catch (error) {
      throw new Error(`Failed to scroll to element: ${selector}`);
    }
  }
  
  // 滚动页面
  protected async scrollPage(context: IExecutionContext, direction: 'up' | 'down' = 'down', amount: number = 500): Promise<void> {
    try {
      await context.page?.evaluate((dir: string, amt: number) => {
        window.scrollBy({
          top: dir === 'down' ? amt : -amt,
          behavior: 'smooth'
        });
      }, direction, amount);
      await this.delay(300);
    } catch (error) {
      throw new Error('Failed to scroll page');
    }
  }
  
  // 等待页面加载
  protected async waitForPageLoad(context: IExecutionContext, timeout: number = this.config.timeout.navigation): Promise<void> {
    try {
      await context.page?.waitForNavigation({ waitUntil: 'networkidle', timeout });
      await this.delay(1000);
    } catch (error) {
      throw new Error('Page load timeout');
    }
  }
  
  // 导航到URL
  protected async navigateTo(context: IExecutionContext, url: string): Promise<void> {
    try {
      await context.page?.goto(url, { 
        waitUntil: 'networkidle',
        timeout: this.config.timeout.navigation 
      });
      await this.initializePageContext(context);
    } catch (error) {
      throw new Error(`Failed to navigate to: ${url}`);
    }
  }
  
  // 获取页面URL
  protected async getCurrentUrl(context: IExecutionContext): Promise<string> {
    try {
      return await context.page?.url() || '';
    } catch (error) {
      throw new Error('Failed to get current URL');
    }
  }
  
  // 获取页面标题
  protected async getPageTitle(context: IExecutionContext): Promise<string> {
    try {
      return await context.page?.title() || '';
    } catch (error) {
      throw new Error('Failed to get page title');
    }
  }
  
  // 执行JavaScript
  protected async executeScript(context: IExecutionContext, script: string, ...args: any[]): Promise<any> {
    try {
      const result = await context.page?.evaluate(script, ...args);
      return result;
    } catch (error) {
      throw new Error('Failed to execute script');
    }
  }
  
  // 检查元素是否存在
  protected async elementExists(context: IExecutionContext, selector: string): Promise<boolean> {
    try {
      const element = await context.page?.$(selector);
      return !!element;
    } catch (error) {
      return false;
    }
  }
  
  // 等待条件满足
  protected async waitForCondition(
    condition: () => Promise<boolean>, 
    timeout: number = this.config.timeout.elementWait,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.delay(interval);
    }
    
    throw new Error('Condition timeout');
  }
  
  // 重试机制
  protected async withRetry<T>(
    operation: () => Promise<T>, 
    maxAttempts: number = this.config.retry.maxAttempts,
    delay: number = this.config.retry.delay
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        this.warn(`Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxAttempts) {
          await this.delay(delay * Math.pow(this.config.retry.backoffFactor, attempt - 1));
        }
      }
    }
    
    throw lastError!;
  }
  
  // 创建微博操作错误
  protected createWeiboError(
    code: string, 
    message: string, 
    details?: any,
    retryable: boolean = true
  ): WeiboOperationError {
    return {
      code,
      message,
      details,
      timestamp: new Date(),
      retryable
    };
  }
  
  // 验证页面类型
  protected validatePageType(expectedTypes: WeiboPageType[]): boolean {
    if (!this.pageContext) {
      return false;
    }
    return expectedTypes.includes(this.pageContext.pageType);
  }
  
  // 检查登录状态
  protected async checkLoginStatus(context: IExecutionContext): Promise<boolean> {
    try {
      // 检查登录相关元素是否存在
      const loginButton = await this.elementExists(context, 'a[href*="login"]');
      if (loginButton) {
        return false;
      }
      
      // 检查用户信息元素
      const userInfo = await this.elementExists(context, 'div[class*="userinfo"]');
      return userInfo;
    } catch (error) {
      return false;
    }
  }
  
  // 延迟函数
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // 日志记录
  protected logWeiboOperation(operation: string, data: any): void {
    this.logInfo(`Weibo operation: ${operation}`, {
      pageType: this.pageContext?.pageType,
      url: this.pageContext?.url,
      ...data
    });
  }
  
  // 重写父类方法以支持微博特定的错误处理
  protected async doExecute(context: IExecutionContext, params: any): Promise<any> {
    try {
      // 初始化页面上下文
      await this.initializePageContext(context);
      
      // 检查登录状态（如果需要）
      if (this.requiresLogin() && !(await this.checkLoginStatus(context))) {
        throw this.createWeiboError('LOGIN_REQUIRED', 'User login required for this operation');
      }
      
      // 验证页面类型
      if (!this.validatePageType(this.getSupportedPageTypes())) {
        throw this.createWeiboError('INVALID_PAGE_TYPE', `Operation not supported on page type: ${this.pageContext?.pageType}`);
      }
      
      // 执行具体操作
      return await this.executeWeiboOperation(context, params);
    } catch (error) {
      if (error instanceof WeiboOperationError) {
        throw error;
      }
      
      // 转换为微博操作错误
      throw this.createWeiboError(
        'OPERATION_FAILED',
        `Weibo operation failed: ${error.message}`,
        { originalError: error.message }
      );
    }
  }
  
  // 子类需要实现的方法
  protected abstract executeWeiboOperation(context: IExecutionContext, params: any): Promise<any>;
  protected abstract requiresLogin(): boolean;
  protected abstract getSupportedPageTypes(): WeiboPageType[];
}