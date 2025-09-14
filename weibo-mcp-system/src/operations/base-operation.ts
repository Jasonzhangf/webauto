// Base Operation - Operation base class for all container operations
import { BaseModule } from '../utils/rcc-basemodule';
import { SystemStateCenter, ISubscription } from '../core/system-state-center';
import { IExecutionContext, IOperation } from '../interfaces/core';

// Operation interfaces
export interface OperationResult {
  success: boolean;
  status: OperationStatus;
  data?: any;
  error?: OperationError;
  performance: {
    startTime: number;
    endTime: number;
    duration: number;
    memory: number;
  };
}

export enum OperationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface OperationError {
  message: string;
  stack?: string;
  code: string;
  timestamp: number;
}

export enum OperationCategory {
  EXTRACTION = 'extraction',
  NAVIGATION = 'navigation',
  INTERACTION = 'interaction',
  VALIDATION = 'validation',
  PROCESSING = 'processing'
}

export interface UserProfile {
  userId: string;
  username: string;
  nickname: string;
  avatar: string;
  description: string;
  location: string;
  followCount: number;
  fansCount: number;
  postCount: number;
  verified: boolean;
  verifiedType: string;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  content: string;
  publishTime: Date;
  images?: string[];
  likeCount: number;
  commentCount: number;
  repostCount: number;
}

export abstract class BaseOperation extends BaseModule implements IOperation {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: OperationCategory;
  
  protected stateCenter: SystemStateCenter;
  
  constructor(config: any = {}) {
    super({
      id: config.id,
      name: config.name,
      version: '1.0.0',
      type: 'operation',
      ...config
    });
    
    this.stateCenter = SystemStateCenter.getInstance();
  }
  
  async execute(context: IExecutionContext, params: any): Promise<OperationResult> {
    const startTime = Date.now();
    
    try {
      // 执行前检查
      await this.onBeforeExecute(context, params);
      
      // 执行核心操作
      const result = await this.doExecute(context, params);
      
      // 执行后处理
      await this.onAfterExecute(context, params, result);
      
      return {
        success: true,
        status: OperationStatus.COMPLETED,
        data: result,
        performance: {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          memory: process.memoryUsage().heapUsed
        }
      };
      
    } catch (error) {
      // 错误处理
      await this.onError(error as Error, context, params);
      
      return {
        success: false,
        status: OperationStatus.FAILED,
        error: this.normalizeError(error as Error),
        performance: {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          memory: process.memoryUsage().heapUsed
        }
      };
    }
  }
  
  // 抽象方法 - 子类必须实现
  protected abstract doExecute(context: IExecutionContext, params: any): Promise<any>;
  
  // 生命周期方法 - 子类可重写
  protected async onBeforeExecute(context: IExecutionContext, params: any): Promise<void> {
    this.logInfo(`Executing operation: ${this.name}`, { 
      container: context.container.containerId,
      params 
    });
    
    // 验证参数
    await this.validateParams(params);
    
    // 检查依赖
    await this.checkDependencies(context);
  }
  
  protected async onAfterExecute(context: IExecutionContext, params: any, result: any): Promise<void> {
    this.logInfo(`Operation completed: ${this.name}`, { 
      result,
      duration: Date.now() - context.timestamp 
    });
    
    // 更新操作统计
    await this.updateOperationMetrics(context.container.id, true);
    
    // 记录操作结果
    await this.recordOperationResult(context, params, result);
  }
  
  protected async onError(error: Error, context: IExecutionContext, params: any): Promise<void> {
    this.error(`Operation failed: ${this.name}`, { 
      error: error.message,
      stack: error.stack,
      container: context.container.containerId,
      params
    });
    
    // 更新操作统计
    await this.updateOperationMetrics(context.container.id, false);
    
    // 记录错误
    await this.recordOperationError(context, params, error);
  }
  
  // 参数验证
  protected async validateParams(params: any): Promise<void> {
    // 子类可以重写此方法来实现特定的参数验证逻辑
    this.logDebug('Validating parameters', { params });
  }
  
  // 依赖检查
  protected async checkDependencies(context: IExecutionContext): Promise<void> {
    // 检查容器是否已初始化
    const containerState = context.container.getContainerState();
    if (!containerState || containerState.status !== 'active') {
      throw new Error(`Container not ready: ${context.container.containerId}`);
    }
    
    // 检查页面对象
    if (!context.page) {
      throw new Error('Page object not available in context');
    }
  }
  
  // 重试机制
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        this.warn(`Operation attempt ${attempt} failed`, { error: (error as Error).message });
        
        if (attempt < maxRetries) {
          await this.delay(retryDelay);
        }
      }
    }
    
    throw lastError!;
  }
  
  // 超时处理
  protected async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timeout after ${timeout}ms`)), timeout);
      })
    ]);
  }
  
  // 条件等待
  protected async waitForCondition(
    condition: () => Promise<boolean>,
    timeout: number = 10000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.delay(interval);
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }
  
  // 工具方法
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  protected parseSelector(selector: string): { type: string; value: string } {
    // 解析选择器类型（css, xpath, text等）
    if (selector.startsWith('//')) {
      return { type: 'xpath', value: selector };
    } else if (selector.startsWith('text=')) {
      return { type: 'text', value: selector.substring(5) };
    } else {
      return { type: 'css', value: selector };
    }
  }
  
  protected extractElementData(element: any): any {
    // 提取元素数据的基本实现
    return {
      tag: element?.tagName?.toLowerCase() || 'unknown',
      text: element?.textContent?.trim() || '',
      visible: element?.offsetWidth > 0 && element?.offsetHeight > 0,
      attributes: this.extractAttributes(element)
    };
  }
  
  protected extractAttributes(element: any): Record<string, string> {
    const attributes: Record<string, string> = {};
    if (element?.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attributes[attr.name] = attr.value;
      }
    }
    return attributes;
  }
  
  // 私有方法
  private async updateOperationMetrics(containerId: string, success: boolean): Promise<void> {
    const currentState = this.stateCenter.getEntityState(containerId);
    const successCount = Number(currentState?.metrics.get('successCount') || 0) + (success ? 1 : 0);
    const failureCount = Number(currentState?.metrics.get('failureCount') || 0) + (success ? 0 : 1);
    
    await this.stateCenter.updateEntityState(containerId, {
      metrics: new Map([
        ['successCount', successCount],
        ['failureCount', failureCount]
      ])
    });
  }
  
  private async recordOperationResult(context: IExecutionContext, params: any, result: any): Promise<void> {
    // 记录操作结果到状态中心
    const operationHistory = context.container.getContainerState()?.properties.get('operationHistory') || [];
    operationHistory.push({
      operation: this.id,
      name: this.name,
      params,
      result,
      success: true,
      timestamp: Date.now()
    });
    
    await context.container.updateContainerState({
      properties: new Map([['operationHistory', operationHistory]])
    });
  }
  
  private async recordOperationError(context: IExecutionContext, params: any, error: Error): Promise<void> {
    // 记录操作错误到状态中心
    const errorHistory = context.container.getContainerState()?.properties.get('errorHistory') || [];
    errorHistory.push({
      operation: this.id,
      name: this.name,
      params,
      error: error.message,
      timestamp: Date.now()
    });
    
    await context.container.updateContainerState({
      properties: new Map([['errorHistory', errorHistory]])
    });
  }
  
  private normalizeError(error: Error): OperationError {
    return {
      message: error.message,
      stack: error.stack,
      code: error.name,
      timestamp: Date.now()
    };
  }
}

// 具体操作实现示例

export class ExtractUserInfoOperation extends BaseOperation {
  readonly id = 'extract_user_info';
  readonly name = 'Extract User Info';
  readonly description = 'Extract user profile information from weibo user page';
  readonly category = OperationCategory.EXTRACTION;
  
  protected async doExecute(context: IExecutionContext, params: any): Promise<UserProfile> {
    const container = context.container;
    
    // 等待用户信息元素加载
    await this.waitForUserInfoElements(context);
    
    // 提取用户信息
    const userInfo = await this.extractUserInfoData(context);
    
    // 验证提取的数据
    this.validateUserInfo(userInfo);
    
    return userInfo;
  }
  
  private async waitForUserInfoElements(context: IExecutionContext): Promise<void> {
    // 等待用户信息区域加载
    await this.waitForCondition(async () => {
      // 这里需要根据实际的页面结构实现
      return true; // 简化实现
    }, 10000);
  }
  
  private async extractUserInfoData(context: IExecutionContext): Promise<UserProfile> {
    // 这里需要根据微博页面的实际结构实现用户信息提取
    // 现在返回模拟数据
    
    return {
      userId: '1234567890',
      username: 'example_user',
      nickname: '示例用户',
      avatar: 'https://example.com/avatar.jpg',
      description: '这是一个示例用户简介',
      location: '北京',
      followCount: 1000,
      fansCount: 500,
      postCount: 200,
      verified: true,
      verifiedType: 'personal'
    };
  }
  
  private validateUserInfo(userInfo: UserProfile): void {
    if (!userInfo.userId || !userInfo.username) {
      throw new Error('Invalid user info: missing required fields');
    }
  }
}

export class ExtractPostsOperation extends BaseOperation {
  readonly id = 'extract_posts';
  readonly name = 'Extract Posts';
  readonly description = 'Extract user posts from weibo user page';
  readonly category = OperationCategory.EXTRACTION;
  
  protected async doExecute(context: IExecutionContext, params: any): Promise<Post[]> {
    const { limit = 20 } = params;
    
    // 等待微博列表加载
    await this.waitForPostListElements(context);
    
    // 提取微博列表
    const posts = await this.extractPostsData(context, limit);
    
    // 验证提取的数据
    this.validatePosts(posts);
    
    return posts;
  }
  
  private async waitForPostListElements(context: IExecutionContext): Promise<void> {
    await this.waitForCondition(async () => {
      // 这里需要根据实际的页面结构实现
      return true; // 简化实现
    }, 10000);
  }
  
  private async extractPostsData(context: IExecutionContext, limit: number): Promise<Post[]> {
    // 这里需要根据微博页面的实际结构实现微博提取
    // 现在返回模拟数据
    
    const posts: Post[] = [];
    for (let i = 0; i < Math.min(limit, 5); i++) {
      posts.push({
        id: `post_${i}`,
        userId: '1234567890',
        username: 'example_user',
        content: `这是第${i + 1}条微博内容示例...`,
        publishTime: new Date(Date.now() - i * 3600000),
        images: i % 2 === 0 ? ['https://example.com/image.jpg'] : undefined,
        likeCount: Math.floor(Math.random() * 100),
        commentCount: Math.floor(Math.random() * 50),
        repostCount: Math.floor(Math.random() * 20)
      });
    }
    
    return posts;
  }
  
  private validatePosts(posts: Post[]): void {
    if (!Array.isArray(posts)) {
      throw new Error('Invalid posts: expected array');
    }
    
    for (const post of posts) {
      if (!post.id || !post.content) {
        throw new Error('Invalid post: missing required fields');
      }
    }
  }
}

export class NextPageOperation extends BaseOperation {
  readonly id = 'next_page';
  readonly name = 'Next Page';
  readonly description = 'Navigate to next page of posts';
  readonly category = OperationCategory.NAVIGATION;
  
  protected async doExecute(context: IExecutionContext, params: any): Promise<boolean> {
    // 查找并点击下一页按钮
    const nextPageButton = await this.findNextPageButton(context);
    
    if (!nextPageButton) {
      return false;
    }
    
    // 点击下一页按钮
    await this.clickNextPageButton(nextPageButton);
    
    // 等待页面加载
    await this.waitForPageLoad(context);
    
    return true;
  }
  
  private async findNextPageButton(context: IExecutionContext): Promise<any> {
    // 这里需要根据实际的页面结构实现
    // 现在返回模拟结果
    return { element: 'next_page_button' };
  }
  
  private async clickNextPageButton(button: any): Promise<void> {
    // 这里需要根据具体的页面操作框架实现
    this.logDebug('Clicking next page button');
  }
  
  private async waitForPageLoad(context: IExecutionContext): Promise<void> {
    await this.delay(2000); // 简化实现
  }
}

export class HasMoreOperation extends BaseOperation {
  readonly id = 'has_more';
  readonly name = 'Has More';
  readonly description = 'Check if there are more pages available';
  readonly category = OperationCategory.VALIDATION;
  
  protected async doExecute(context: IExecutionContext, params: any): Promise<boolean> {
    // 检查是否还有更多页面
    const nextPageButton = await this.findNextPageButton(context);
    
    return nextPageButton !== null;
  }
  
  private async findNextPageButton(context: IExecutionContext): Promise<any> {
    // 这里需要根据实际的页面结构实现
    // 现在返回模拟结果
    return Math.random() > 0.5 ? { element: 'next_page_button' } : null;
  }
}