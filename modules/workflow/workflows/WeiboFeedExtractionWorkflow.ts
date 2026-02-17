/**
 * 微博 Feed 提取 Workflow (标准化版本)
 * 
 * 功能：
 * 1. 事件驱动的帖子提取
 * 2. 自动点击"展开"按钮
 * 3. 捕获点击后的完整文本
 * 4. 标准化接口，可作为 Workflow Chain 的一部分
 */

import { EventEmitter } from 'events';

const MSG_CONTAINER_APPEAR = 'MSG_CONTAINER_APPEAR';
const MSG_CONTAINER_OPERATION_COMPLETE = 'MSG_CONTAINER_OPERATION_COMPLETE';
const MSG_CONTAINER_CLICK = 'MSG_CONTAINER_CLICK';

export interface WeiboPost {
  id: string;
  author?: string;
  content?: string;
  url?: string;
  authorUrl?: string;
  timestamp?: string;
}

export interface WorkflowConfig {
  targetCount: number;
  maxScrolls?: number;
  scrollDistance?: number;
  waitAfterScroll?: number;
  profile: string;
  url: string;
}

export interface WorkflowContext {
  messageBus: any;
  apiClient: any;   // API client for unified API calls
}

export interface WorkflowResult {
  success: boolean;
  posts: WeiboPost[];
  totalExtracted: number;
  error?: string;
}

/**
 * 微博 Feed 提取 Workflow
 * 标准化的事件驱动实现
 */
export class WeiboFeedExtractionWorkflow extends EventEmitter {
  private config: WorkflowConfig;
  private context: WorkflowContext;
  private extractedPosts: WeiboPost[] = [];
  private processedPostKeys: Set<string> = new Set();
  private isRunning: boolean = false;
  private scrollCount: number = 0;
  private expandButtonClicks: number = 0;
  
  constructor(config: WorkflowConfig, context: WorkflowContext) {
    super();
    this.config = config;
    this.context = context;
  }

  /**
   * 启动 Workflow
   */
  async execute(): Promise<WorkflowResult> {
    try {
      this.isRunning = true;
      this.emit('workflow:start', { config: this.config });

      // Step 1: 订阅容器事件
      await this.setupEventListeners();

      // Step 2: 初始化会话
      await this.initializeSession();

      // Step 3: 匹配容器
      const feedListId = await this.matchContainers();

      // Step 4: 执行提取循环
      await this.extractionLoop(feedListId);

      // Step 5: 清理
      await this.cleanup();

      this.emit('workflow:complete', { 
        totalExtracted: this.extractedPosts.length,
        expandButtonClicks: this.expandButtonClicks
      });

      return {
        success: true,
        posts: this.extractedPosts,
        totalExtracted: this.extractedPosts.length
      };

    } catch (error: any) {
      this.emit('workflow:error', { error: error.message });
      return {
        success: false,
        posts: this.extractedPosts,
        totalExtracted: this.extractedPosts.length,
        error: error.message
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 设置事件监听器
   */
  private async setupEventListeners(): Promise<void> {
    const { messageBus } = this.context;

    // 监听容器出现事件
    messageBus.subscribe(MSG_CONTAINER_APPEAR, async (event: any) => {
      const { containerId, containerType } = event;
      
      this.emit('container:appeared', { containerId, containerType });

      // 如果是"展开"按钮，自动点击
      if (containerId.includes('expand_button')) {
        await this.handleExpandButtonAppear(event);
      }
    });

    // 监听容器点击完成事件
    messageBus.subscribe(MSG_CONTAINER_OPERATION_COMPLETE, async (event: any) => {
      const { containerId, operationId, result } = event;
      
      if (operationId === 'click' && containerId.includes('expand_button')) {
        this.emit('expand:clicked', { containerId });
        // 点击后需要重新提取父容器的内容
        await this.reExtractAfterExpand(containerId);
      }
    });
  }

  /**
   * 处理"展开"按钮出现
   */
  private async handleExpandButtonAppear(event: any): Promise<void> {
    const { containerId } = event;
    
    this.emit('expand:detected', { containerId });

    try {
      // 发送点击操作
      await this.context.apiClient.post('/v1/controller/action', {
        action: 'container:operation',
        payload: {
          containerId,
          operationId: 'click',
          config: { wait_after: 500 },
          sessionId: this.config.profile
        }
      });

      this.expandButtonClicks++;
      this.emit('expand:click-sent', { containerId, totalClicks: this.expandButtonClicks });

    } catch (error: any) {
      this.emit('expand:click-failed', { containerId, error: error.message });
    }
  }

  /**
   * 点击后重新提取内容
   */
  private async reExtractAfterExpand(expandButtonId: string): Promise<void> {
    // 获取父容器 ID (feed_post)
    const parentId = expandButtonId.replace('.expand_button', '');
    
    try {
      // 等待内容加载
      await new Promise(r => setTimeout(r, 1000));

      // 重新提取父容器内容
      const extractResult = await this.extractPost(parentId);
      
      if (extractResult) {
        // 更新已提取的帖子内容
        const existingIndex = this.extractedPosts.findIndex(p => p.id === parentId);
        if (existingIndex >= 0) {
          this.extractedPosts[existingIndex] = { ...this.extractedPosts[existingIndex], ...extractResult };
          this.emit('post:updated-after-expand', { postId: parentId, content: extractResult.content });
        }
      }
    } catch (error: any) {
      this.emit('extract:failed-after-expand', { parentId, error: error.message });
    }
  }

  /**
   * 初始化会话
   */
  private async initializeSession(): Promise<void> {
    this.emit('session:init-start');
    
    const sessions = await this.context.apiClient.post('/v1/controller/action', {
      action: 'session:list',
      payload: {}
    });

    const active = sessions.data?.data?.sessions?.find(
      (s: any) => s.profileId === this.config.profile
    );

    if (!active) {
      await this.context.apiClient.post('/v1/controller/action', {
        action: 'session:create',
        payload: { 
          profile: this.config.profile, 
          url: this.config.url 
        }
      });
      await new Promise(r => setTimeout(r, 5000));
    }

    this.emit('session:init-complete');
  }

  /**
   * 匹配容器
   */
  private async matchContainers(): Promise<string> {
    this.emit('match:start');

    const match = await this.context.apiClient.post('/v1/controller/action', {
      action: 'containers:match',
      payload: {
        profile: this.config.profile,
        url: this.config.url
      }
    });

    if (!match.data?.matched) {
      throw new Error('Root container not matched');
    }

    const rootId = match.data.container.id;
    this.emit('match:root-found', { rootId });

    // 查找 feed_list
    const inspect = await this.context.apiClient.post('/v1/controller/action', {
      action: 'containers:inspect-container',
      payload: { 
        profile: this.config.profile, 
        containerId: rootId 
      }
    });

    const feedList = inspect.data?.data?.snapshot?.children?.find((c: any) =>
      c.id?.includes('feed_list') || c.defId?.includes('feed_list')
    );

    if (!feedList) {
      throw new Error('Feed list container not found');
    }

    this.emit('match:feed-list-found', { feedListId: feedList.id });
    return feedList.id;
  }

  /**
   * 提取循环
   */
  private async extractionLoop(listId: string): Promise<void> {
    const maxScrolls = this.config.maxScrolls || 120;
    let heightUnchangedCount = 0;
    let lastHeight = 0;

    this.emit('extraction:loop-start', { targetCount: this.config.targetCount });

    while (
      this.extractedPosts.length < this.config.targetCount &&
      this.scrollCount < maxScrolls &&
      heightUnchangedCount < 3
    ) {
      this.emit('extraction:cycle', {
        extracted: this.extractedPosts.length,
        target: this.config.targetCount,
        scroll: this.scrollCount,
        maxScrolls
      });

      // 获取当前可见的帖子
      const posts = await this.getVisiblePosts(listId);

      // 提取每个帖子
      for (const post of posts) {
        if (this.extractedPosts.length >= this.config.targetCount) break;

        const postKey = this.generatePostKey(post);
        if (this.processedPostKeys.has(postKey)) continue;

        const extracted = await this.extractPost(post.id);
        if (extracted && extracted.content) {
          this.extractedPosts.push(extracted);
          this.processedPostKeys.add(postKey);
          this.emit('post:extracted', { 
            postId: post.id, 
            total: this.extractedPosts.length 
          });
        }

        await new Promise(r => setTimeout(r, 500));
      }

      // 检查页面高度
      const currentHeight = await this.getPageHeight();
      if (currentHeight === lastHeight) {
        heightUnchangedCount++;
      } else {
        heightUnchangedCount = 0;
      }
      lastHeight = currentHeight;

      // 滚动加载更多
      if (this.extractedPosts.length < this.config.targetCount && heightUnchangedCount < 3) {
        await this.scrollPage(listId);
        this.scrollCount++;
        await new Promise(r => setTimeout(r, this.config.waitAfterScroll || 3000));
      }
    }

    this.emit('extraction:loop-complete', { 
      totalExtracted: this.extractedPosts.length 
    });
  }

  /**
   * 获取可见帖子
   */
  private async getVisiblePosts(listId: string): Promise<any[]> {
    const inspect = await this.context.apiClient.post('/v1/controller/action', {
      action: 'containers:inspect-container',
      payload: {
        profile: this.config.profile,
        containerId: listId,
        maxChildren: 50
      }
    });

    return inspect.data?.data?.snapshot?.children || [];
  }

  /**
   * 提取单个帖子
   */
  private async extractPost(postId: string): Promise<WeiboPost | null> {
    try {
      const res = await this.context.apiClient.post('/v1/controller/action', {
        action: 'container:operation',
        payload: {
          containerId: postId,
          operationId: 'extract',
          config: {
            fields: {
              author: "header a[href*='weibo.com']",
              content: "div[class*='detail_wbtext']",
              timestamp: "time",
              url: "a[href*='weibo.com'][href*='/status/']",
              authorUrl: "a[href*='weibo.com/u/']"
            },
            include_text: true
          },
          sessionId: this.config.profile
        }
      });

      const extracted = res.data?.data?.extracted?.[0];
      if (extracted) {
        return {
          id: postId,
          author: extracted.author,
          content: extracted.text || extracted.content,
          url: extracted.url,
          authorUrl: extracted.authorUrl,
          timestamp: extracted.timestamp
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 生成帖子唯一标识
   */
  private generatePostKey(post: any): string {
    return post.id || post.defId || `post-${Date.now()}`;
  }

  /**
   * 获取页面高度
   */
  private async getPageHeight(): Promise<number> {
    const res = await this.context.apiClient.post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        sessionId: this.config.profile,
        script: 'document.documentElement.scrollHeight'
      }
    });
    return res.data?.result || 0;
  }

  /**
   * 滚动页面
   */
  private async scrollPage(listId: string): Promise<void> {
    await this.context.apiClient.post('/v1/controller/action', {
      action: 'container:operation',
      payload: {
        containerId: listId,
        operationId: 'scroll',
        config: {
          direction: 'down',
          distance: this.config.scrollDistance || 800
        },
        sessionId: this.config.profile
      }
    });
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    // 取消订阅等清理工作
    this.emit('workflow:cleanup');
  }

  /**
   * 停止 Workflow
   */
  stop(): void {
    this.isRunning = false;
    this.emit('workflow:stopped');
  }
}
