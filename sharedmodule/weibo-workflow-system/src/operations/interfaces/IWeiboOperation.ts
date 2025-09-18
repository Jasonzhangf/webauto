/**
 * Weibo Workflow Operation Interfaces
 * 微博工作流操作子接口
 */

// Local interfaces to avoid import issues
export interface OperationConfig {
  [key: string]: any;
}

export interface OperationResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  executionTime?: number;
  metadata?: any;
}

export interface OperationContext {
  id?: string;
  type?: string;
  startTime?: number;
  metadata?: any;
  request?: any;
}

export abstract class BaseOperation {
  protected successCount: number = 0;
  protected failureCount: number = 0;
  protected executionTime: number = 0;
  protected startTime: number = Date.now();

  // Operation metadata
  abstract name: string;
  abstract description: string;
  abstract version: string;
  abstract abstractCategories: string[];
  abstract supportedContainers: string[];
  abstract capabilities: string[];
  protected requiredParameters: string[] = [];
  protected optionalParameters: Record<string, any> = {};

  // Simple logger
  protected logger = {
    info: (message: string, data?: any) => console.log(`[${this.name}] ${message}`, data || ''),
    error: (message: string, data?: any) => console.error(`[${this.name}] ${message}`, data || ''),
    warn: (message: string, data?: any) => console.warn(`[${this.name}] ${message}`, data || ''),
    debug: (message: string, data?: any) => console.debug(`[${this.name}] ${message}`, data || '')
  };

  /**
   * Execute operation with validation
   */
  async execute(context: OperationContext, params?: OperationConfig): Promise<OperationResult> {
    try {
      const result = await this.executeOperation(context, params);

      if (result.success) {
        this.successCount++;
      } else {
        this.failureCount++;
      }

      this.executionTime += result.executionTime || 0;

      return result;
    } catch (error) {
      this.failureCount++;
      this.logger.error('Operation execution failed', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - (context.startTime || Date.now())
      };
    }
  }

  /**
   * Abstract method for actual operation execution
   */
  protected abstract executeOperation(context: OperationContext, params?: OperationConfig): Promise<OperationResult>;

  /**
   * Get operation statistics
   */
  getPipelineStats() {
    return {
      successCount: this.successCount,
      failureCount: this.failureCount,
      totalExecutions: this.successCount + this.failureCount,
      successRate: this.successCount / Math.max(1, this.successCount + this.failureCount) * 100,
      averageExecutionTime: this.executionTime / Math.max(1, this.successCount + this.failureCount),
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Reset operation statistics
   */
  reset() {
    this.successCount = 0;
    this.failureCount = 0;
    this.executionTime = 0;
    this.startTime = Date.now();
  }
}

/**
 * Weibo-specific operation context
 * 微博特定操作上下文
 */
export interface WeiboOperationContext extends OperationContext {
  weibo?: {
    sessionId?: string;
    pageType?: 'homepage' | 'profile' | 'post' | 'search' | 'comments';
    loginStatus?: 'logged-out' | 'logged-in' | 'qr-required' | 'expired';
    currentUrl?: string;
    pageTitle?: string;
  };
  browser?: {
    page?: any;
    context?: any;
    browser?: any;
  };
}

/**
 * Weibo post data structure
 * 微博帖子数据结构
 */
export interface WeiboPost {
  id: string;
  author: {
    id: string;
    name: string;
    screenName?: string;
    verified?: boolean;
  };
  content: {
    text: string;
    images?: string[];
    videos?: string[];
    links?: string[];
  };
  metadata: {
    publishTime: Date;
    likes: number;
    comments: number;
    reposts: number;
    isOriginal: boolean;
    source?: string;
  };
}

/**
 * Weibo comment data structure
 * 微博评论数据结构
 */
export interface WeiboComment {
  id: string;
  postId: string;
  author: {
    id: string;
    name: string;
    verified?: boolean;
  };
  content: string;
  metadata: {
    publishTime: Date;
    likes: number;
    replies?: number;
  };
}

/**
 * Weibo user profile data structure
 * 微博用户资料数据结构
 */
export interface WeiboUserProfile {
  id: string;
  screenName: string;
  name: string;
  description?: string;
  verified?: boolean;
  stats: {
    followers: number;
    following: number;
    posts: number;
  };
  metadata?: {
    location?: string;
    gender?: 'male' | 'female' | 'unknown';
    joinDate?: Date;
  };
}

/**
 * Weibo navigation operation interface
 * 微博导航操作子接口
 */
export interface WeiboNavigationOperation {
  navigateToHomepage(context: WeiboOperationContext): Promise<OperationResult>;
  navigateToProfile(context: WeiboOperationContext, userId: string): Promise<OperationResult>;
  navigateToPost(context: WeiboOperationContext, postId: string): Promise<OperationResult>;
  navigateToSearch(context: WeiboOperationContext, query: string): Promise<OperationResult>;
}

/**
 * Weibo content extraction operation interface
 * 微博内容提取操作子接口
 */
export interface WeiboContentExtractionOperation {
  extractPosts(context: WeiboOperationContext): Promise<OperationResult<WeiboPost[]>>;
  extractComments(context: WeiboOperationContext, postId: string): Promise<OperationResult<WeiboComment[]>>;
  extractUserProfile(context: WeiboOperationContext, userId: string): Promise<OperationResult<WeiboUserProfile>>;
}

/**
 * Weibo login operation interface
 * 微博登录操作子接口
 */
export interface WeiboLoginOperation {
  checkLoginStatus(context: WeiboOperationContext): Promise<OperationResult<boolean>>;
  performQRLogin(context: WeiboOperationContext): Promise<OperationResult<boolean>>;
  loadCookies(context: WeiboOperationContext, cookiePath: string): Promise<OperationResult<boolean>>;
  saveCookies(context: WeiboOperationContext, cookiePath: string): Promise<OperationResult<boolean>>;
}

/**
 * Weibo workflow operation base class
 * 微博工作流操作子基类
 */
export abstract class WeiboBaseOperation extends BaseOperation {
  protected sessionId?: string;
  protected currentPageType?: 'homepage' | 'profile' | 'post' | 'search' | 'comments';

  constructor() {
    super();
    this.requiredParameters = [];
    this.optionalParameters = {
      timeout: 30000,
      retries: 3,
      saveCookies: true
    };
    this.abstractCategories = ['weibo', 'social-media', 'automation'];
    this.supportedContainers = ['browser', 'social-media'];
    this.capabilities = ['weibo-automation', 'content-extraction', 'social-media-scraping'];
  }

  /**
   * Validate weibo-specific context
   * 验证微博特定上下文
   */
  protected validateWeiboContext(context: WeiboOperationContext): boolean {
    if (!context.browser?.page) {
      this.logger.error('Browser page is required for weibo operations');
      return false;
    }
    return true;
  }

  /**
   * Get current weibo page type
   * 获取当前微博页面类型
   */
  protected async detectPageType(context: WeiboOperationContext): Promise<'homepage' | 'profile' | 'post' | 'search' | 'comments'> {
    const url = context.browser?.page?.url() || '';

    if (url.includes('weibo.com') && url.includes('/u/')) {
      return 'profile';
    } else if (url.includes('weibo.com') && url.includes('/detail/')) {
      return 'post';
    } else if (url.includes('weibo.com') && url.includes('/search')) {
      return 'search';
    } else if (url.includes('weibo.com') && url.includes('/comment/')) {
      return 'comments';
    } else {
      return 'homepage';
    }
  }

  /**
   * Wait for weibo page to load
   * 等待微博页面加载
   */
  protected async waitForWeiboPage(context: WeiboOperationContext): Promise<void> {
    const page = context.browser?.page;
    if (!page) {
      throw new Error('Browser page not available');
    }

    // Wait for main content area
    await page.waitForSelector('.Main', { timeout: 10000 }).catch(() => {
      this.logger.warn('Main content area not found, page might be different');
    });
  }
}