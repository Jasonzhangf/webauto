/**
 * 微博评论容器实现
 * 继承自BaseSelfRefreshingContainer，专门处理微博评论的动态加载
 */

import { BaseSelfRefreshingContainer, ContainerConfig, ContainerState, ContainerSharedSpace, TaskCompletionCriteria } from './BaseSelfRefreshingContainer';
import { OperationResult } from '../core/types/OperatorTypes';
import { UniversalOperator, OperationResult } from '../core/UniversalOperator';

// ==================== 接口定义 ====================

export interface WeiboCommentConfig extends ContainerConfig {
  maxComments?: number;
  maxScrollAttempts?: number;
  scrollDelay?: number;
  enableAutoScroll?: boolean;
  commentSelectors?: string[];
  loadMoreSelectors?: string[];
  replyContainerTypes?: string[];
  autoExecuteLoadMore?: boolean;
  maxLoadMoreAttempts?: number;
}

export interface CommentData {
  id: string;
  content: string;
  author: {
    name: string;
    id: string;
    verified?: boolean;
    avatar?: string;
  };
  timestamp: string;
  statistics: {
    likes: number;
    replies: number;
  };
  hasReplies: boolean;
  depth: number;
  parentId?: string;
  replyTo?: string;
  element?: any; // DOM元素引用
}

export interface ReplyData extends CommentData {
  parentId: string;
  replyTo: string;
}

// ==================== 容器实现 ====================

export class WeiboCommentContainer extends BaseSelfRefreshingContainer {
  protected config: WeiboCommentConfig;
  protected extractedComments: Map<string, CommentData> = new Map();
  protected scrollAttempts = 0;
  protected isAutoScrolling = false;
  protected loadMoreAttempts = 0;
  protected lastCommentCount = 0;
  protected noNewCommentCount = 0;

  constructor(config: WeiboCommentConfig) {
    super({
      refreshInterval: 2000,
      enableAutoRefresh: true,
      enableMutationObserver: true,
      maxRefreshRetries: 3,
      debounceTime: 1000,
      childContainerTypes: ['reply'],
      taskCompletionCriteria: {
        type: 'count',
        targetCount: config.maxComments || 100
      },
      ...config
    });

    this.config = config;
    this.setupCommentSpecificHandlers();
  }
    loadMoreAttempts: any;
    noNewCommentCount: any;
    isAutoScrolling: any;
    lastCommentCount: any;
    scrollAttempts: any;

  private setupCommentSpecificHandlers(): void {
    // 监听评论数量变化
    this.on('refresh:completed', (data) => {
      const currentCount = this.extractedComments.size;
      console.log(`💬 评论数量更新: ${currentCount} (任务目标: ${this.config.maxComments})`);
    });

    // 监听新评论发现
    this.on('comments:discovered', (data) => {
      console.log(`🆕 发现新评论: ${data.comments.length} 条, 总计: ${data.totalCount} 条`);
    });

    // 监听自动操作执行
    this.on('auto-operation:executed', (data) => {
      console.log(`🤖 自动操作执行: ${data.operationId} - ${data.success ? '成功' : '失败'}`);
    });
  }

  // ==================== 抽象方法实现 ====================

  protected setPageContext(page: any): void {
    this.page = page;
  }

  protected async executeWithContext<T>(fn: (page: any) => Promise<T>): Promise<T> {
    if (!this.page) {
      throw new Error('页面上下文未设置');
    }
    return await fn(this.page);
  }

  protected async createChildContainer(childInfo: any): Promise<BaseSelfRefreshingContainer> {
    // 创建回复评论的子容器
    const ReplyContainer = (await import('./WeiboReplyContainer')).WeiboReplyContainer;
    return new ReplyContainer({
      id: childInfo.id,
      name: `回复容器-${childInfo.id}`,
      selector: childInfo.selector,
      parentCommentId: childInfo.parentCommentId,
      refreshInterval: 1500,
      enableAutoRefresh: true,
      maxComments: 50 // 每个回复容器最多50条回复
    });
  }

  protected async executeDynamicOperation(page: any, operation: any, params: any): Promise<OperationResult> {
    switch (operation.action) {
      case 'load_more':
        return await this.executeLoadMore(page, operation);
      case 'expand_replies':
        return await this.executeExpandReplies(page, operation);
      case 'scroll_to_load':
        return await this.executeScrollToLoad(page, operation);
      case 'click_button':
        return await this.executeButtonClick(page, operation);
      default:
        return OperationResult.failure(`不支持的操作: ${operation.action}`);
    }
  }

  // ==================== 核心刷新逻辑 ====================

  protected async performRefresh(trigger: RefreshTrigger): Promise<OperationResult> {
    console.log(`🔄 执行评论容器刷新 [${trigger.type}]: ${this.config.name}`);

    try {
      // 1. 检测容器状态
      const stateUpdate = await this.detectContainerState(this.page);
      this.updateState(stateUpdate);

      // 2. 如果容器不存在，跳过刷新
      if (!stateUpdate.exists) {
        return OperationResult.success({
          action: 'refresh',
          result: 'container_not_found',
          message: '评论容器不存在'
        });
      }

      // 3. 提取评论数据
      const commentsResult = await this.extractComments(this.page);
      if (commentsResult.success) {
        await this.updateCommentData(commentsResult.data);
      }

      // 4. 发现并注册子容器（回复）
      await this.discoverAndRegisterChildContainers(this.page);

      // 5. 注册动态操作
      await this.registerDynamicOperations(this.page);

      // 6. 根据触发源执行特定操作
      await this.handleTriggerSpecificActions(trigger);

      // 7. 自动滚动加载更多评论
      if (this.shouldAutoScroll(trigger)) {
        await this.performAutoScroll();
      }

      // 8. 自动执行"加载更多"操作
      if (this.shouldAutoExecuteLoadMore(trigger)) {
        await this.autoExecuteLoadMore();
      }

      return OperationResult.success({
        action: 'refresh',
        trigger: trigger.type,
        commentCount: this.extractedComments.size,
        containerState: this.state,
        taskProgress: this.taskProgress,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error(`评论容器刷新失败 [${trigger.type}]:`, error);
      return OperationResult.failure(`刷新失败: ${error.message}`, error);
    }
  }

  // ==================== 评论数据提取 ====================

  private async extractComments(page: any): Promise<OperationResult> {
    try {
      const selectors = this.config.commentSelectors || [
        '.Comment_item',
        '.Feed_body_comments .Comment_item',
        '[class*="comment-item"]',
        '.comment-item'
      ];

      const comments: CommentData[]  = await page.evaluate((selectors, maxComments) => {
        const allComments= [];

        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach((element, index) => {
            if (allComments.length >= maxComments) return;

            try {
              // 提取评论内容
              const contentEl = element.querySelector('.Comment_content, [class*="content"], .content');
              const content = contentEl?.textContent?.trim() || '';

              // 提取作者信息
              const authorEl = element.querySelector('.Comment_author, [class*="author"], .author');
              const authorName = authorEl?.textContent?.trim() || '';
              const authorId = authorEl?.getAttribute('data-user-id') || authorName;
              const avatarEl = element.querySelector('.Comment_avatar img, [class*="avatar"] img');
              const avatar = avatarEl?.getAttribute('src') || '';

              // 提取时间
              const timeEl = element.querySelector('.Comment_time, [class*="time"], .time');
              const timestamp = timeEl?.textContent?.trim() || '';

              // 提取统计数据
              const likesEl = element.querySelector('.Comment_likes [class*="count"], [class*="likes"] [class*="count"]');
              const likes = parseInt(likesEl?.textContent || '0') || 0;

              const repliesEl = element.querySelector('.Comment_replies [class*="count"], [class*="replies"] [class*="count"]');
              const replies = parseInt(repliesEl?.textContent || '0') || 0;

              // 检查是否有回复
              const hasReplies = element.querySelector('.Comment_replies, [class*="replies"], .replies') !== null;

              // 生成唯一ID
              const commentId = `comment_${Date.now()}_${index}_${authorId}`;

              const comment: CommentData: 0 = {
                id: commentId,
                content,
                author: {
                  name: authorName,
                  id: authorId,
                  verified: authorEl?.classList.contains('verified'),
                  avatar
                },
                timestamp,
                statistics: { likes, replies },
                hasReplies,
                depth,
                element
              };

              allComments.push(comment);

            } catch (error) {
              console.warn(`提取评论失败 ${index}:`, error);
            }
          });
        });

        return allComments;
      }, selectors, this.config.maxComments || 1000);

      return OperationResult.success(comments);

    } catch (error) {
      return OperationResult.failure(`评论提取失败: ${error.message}`, error);
    }
  }

  private async updateCommentData(newComments: CommentData[]): Promise<void> {
    let discoveredCount = 0;

    for (const comment of newComments) {
      if (!this.extractedComments.has(comment.id)) {
        this.extractedComments.set(comment.id, comment);
        discoveredCount++;
      }
    }

    if (discoveredCount > 0) {
      this.emit('comments:discovered', {
        comments: newComments.slice(-discoveredCount),
        totalCount: this.extractedComments.size
      });
    }

    // 更新任务进度
    this.taskProgress.currentCount = this.extractedComments.size;
  }

  // ==================== 自动操作执行 ====================

  private shouldAutoExecuteLoadMore(trigger: RefreshTrigger): boolean {
    if (!this.config.autoExecuteLoadMore) {
      return false;
    }

    // 检查是否达到最大尝试次数
    if (this.loadMoreAttempts >= (this.config.maxLoadMoreAttempts || 5)) {
      console.log(`🔄 已达到最大加载更多尝试次数 (${this.loadMoreAttempts})，停止自动执行`);
      return false;
    }

    // 检查是否还需要更多评论
    if (this.extractedComments.size >= (this.config.maxComments || 1000)) {
      return false;
    }

    // 只在特定触发源下自动执行
    return ['initialization', 'timer', 'mutation'].includes(trigger.type);
  }

  private async autoExecuteLoadMore(): Promise<void> {
    const loadMoreOperations = Array.from(this.registeredOperations.values())
      .filter(op => op.action === 'load_more' || op.id.includes('load_more'));

    if (loadMoreOperations.length === 0) {
      return;
    }

    try {
      console.log(`🤖 自动执行加载更多操作 (尝试 ${this.loadMoreAttempts + 1}/${this.config.maxLoadMoreAttempts})`);

      // 执行第一个加载更多操作
      const operation = loadMoreOperations[0];
      const result = await this.executeOperation(operation.id);

      this.loadMoreAttempts++;

      // 检查操作结果
      if (result.success) {
        // 如果操作成功，重置尝试计数
        if (result.data?.newContentLoaded) {
          this.loadMoreAttempts = 0;
          this.noNewCommentCount = 0;
        }
      } else {
        console.warn(`加载更多操作失败: ${result.error}`);
      }

      this.emit('auto-operation:executed', {
        operationId: operation.id,
        success: result.success,
        attempt: this.loadMoreAttempts
      });

    } catch (error) {
      console.error('自动执行加载更多失败:', error);
      this.loadMoreAttempts++;
    }
  }

  // ==================== 自动滚动 ====================

  private shouldAutoScroll(trigger: RefreshTrigger): boolean {
    const shouldScroll = ['initialization', 'timer'].includes(trigger.type) &&
                        this.config.enableAutoScroll &&
                        this.extractedComments.size < (this.config.maxComments || 1000) &&
                        !this.isAutoScrolling &&
                        this.scrollAttempts < (this.config.maxScrollAttempts || 10);

    return shouldScroll;
  }

  private async performAutoScroll(): Promise<void> {
    if (this.isAutoScrolling) return;

    if (this.scrollAttempts >= (this.config.maxScrollAttempts || 10)) {
      console.log('📜 已达到最大滚动尝试次数，停止自动滚动');
      return;
    }

    this.isAutoScrolling = true;

    try {
      console.log(`📜 自动滚动加载评论 (尝试 ${this.scrollAttempts + 1}/${this.config.maxScrollAttempts})`);

      // 滚动到底部
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // 等待新内容加载
      await this.page.waitForTimeout(this.config.scrollDelay || 2000);

      this.scrollAttempts++;

      // 检查是否有新评论
      const currentCount = this.extractedComments.size;
      if (currentCount > this.lastCommentCount) {
        console.log(`📜 滚动后发现新评论: ${this.lastCommentCount} → ${currentCount}`);
        this.lastCommentCount = currentCount;
        this.scrollAttempts = 0; // 重置滚动计数
        this.noNewCommentCount = 0;
      } else {
        this.noNewCommentCount++;
        if (this.noNewCommentCount >= 3) {
          console.log('📜 连续3次滚动无新评论，停止自动滚动');
          this.scrollAttempts = this.config.maxScrollAttempts || 10; // 强制停止
        }
      }

    } catch (error) {
      console.warn('自动滚动失败:', error);
    } finally {
      this.isAutoScrolling = false;
    }
  }

  // ==================== 操作执行 ====================

  private async executeLoadMore(page: any, operation: any): Promise<OperationResult> {
    try {
      const loadMoreButton = await page.$(operation.selector);
      if (!loadMoreButton) {
        return OperationResult.success({
          action: 'load_more',
          result: 'button_not_found',
          message: '未找到加载更多按钮'
        });
      }

      // 检查按钮是否可见和可点击
      const isVisible = await page.evaluate((button) => {
        return button.offsetParent !== null && !button.disabled;
      }, loadMoreButton);

      if (!isVisible) {
        return OperationResult.success({
          action: 'load_more',
          result: 'button_not_visible',
          message: '加载更多按钮不可见'
        });
      }

      await this.safeClick(loadMoreButton, { container: this.containerSelector });
      await page.waitForTimeout(2000);

      // 检查是否有新内容加载
      const newContentLoaded = await this.checkForNewContent(page);

      return OperationResult.success({
        action: 'load_more',
        result: 'success',
        message: '加载更多操作完成',
        newContentLoaded
      });

    } catch (error) {
      return OperationResult.failure(`加载更多失败: ${error.message}`, error);
    }
  }

  private async executeExpandReplies(page: any, operation: any): Promise<OperationResult> {
    try {
      const expandButton = await page.$(operation.selector);
      if (!expandButton) {
        return OperationResult.success({
          action: 'expand_replies',
          result: 'button_not_found',
          message: '未找到展开回复按钮'
        });
      }

      await this.safeClick(expandButton, { container: this.containerSelector });
      await page.waitForTimeout(1000);

      return OperationResult.success({
        action: 'expand_replies',
        result: 'success',
        message: '展开回复操作完成'
      });

    } catch (error) {
      return OperationResult.failure(`展开回复失败: ${error.message}`, error);
    }
  }

  private async executeScrollToLoad(page: any, operation: any): Promise<OperationResult> {
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);

      return OperationResult.success({
        action: 'scroll_to_load',
        result: 'success',
        message: '滚动加载操作完成'
      });

    } catch (error) {
      return OperationResult.failure(`滚动加载失败: ${error.message}`, error);
    }
  }

  private async executeButtonClick(page: any, operation: any): Promise<OperationResult> {
    try {
      const button = await page.$(operation.selector);
      if (!button) {
        return OperationResult.success({
          action: 'click_button',
          result: 'button_not_found',
          message: '未找到按钮'
        });
      }

      await this.safeClick(button, { container: this.containerSelector });
      await page.waitForTimeout(1000);

      return OperationResult.success({
        action: 'click_button',
        result: 'success',
        message: '按钮点击操作完成'
      });

    } catch (error) {
      return OperationResult.failure(`按钮点击失败: ${error.message}`, error);
    }
  }

  private async checkForNewContent(page: any): Promise<boolean> {
    try {
      const newCommentCount = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (!element) return 0;
        return element.querySelectorAll('.Comment_item, [class*="comment-item"]').length;
      }, this.config.selector);

      return newCommentCount > this.lastCommentCount;
    } catch (error) {
      return false;
    }
  }

  // ==================== 触发源处理 ====================

  private async handleTriggerSpecificActions(trigger: RefreshTrigger): Promise<void> {
    switch (trigger.type) {
      case 'initialization':
        console.log('🚀 初始化触发，开始自动发现评论...');
        this.lastCommentCount = this.extractedComments.size;
        break;
      case 'mutation':
        console.log('👁️ 内容变化触发，检查新评论...');
        break;
      case 'timer':
        console.log('⏰ 定时触发，保持评论同步...');
        break;
      case 'operation':
        console.log(`🎮 操作触发 [${trigger.source}]:`, trigger.data);
        break;
      case 'manual':
        console.log('👆 手动触发刷新...');
        break;
    }
  }

  // ==================== 重写任务完成检查 ====================

  protected getCurrentCountFromResult(result: OperationResult): number {
    return this.extractedComments.size;
  }

  // ==================== 公共接口 ====================

  public getAllComments(): CommentData[] {
    return Array.from(this.extractedComments.values());
  }

  public getCommentStats(): any {
    const comments = Array.from(this.extractedComments.values());

    return {
      totalComments: comments.length,
      uniqueAuthors: new Set(comments.map(c: this.taskProgress
    };
  }

  public resetScrollAttempts( = > c.author.id)).size,
      totalLikes: comments.reduce((sum, c) => sum + c.statistics.likes, 0),
      totalReplies: comments.reduce((sum, c) => sum + c.statistics.replies, 0),
      commentsWithReplies: comments.filter(c => c.hasReplies).length,
      averageLikes: comments.length > 0 ? comments.reduce((sum, c) => sum + c.statistics.likes, 0) / comments.length : 0,
      refreshStats: this.getRefreshStats(),
      taskProgress): void {
    this.scrollAttempts = 0;
    this.loadMoreAttempts = 0;
    this.noNewCommentCount = 0;
    console.log('📜 重置滚动和加载尝试计数');
  }

  // ==================== 清理资源 ====================

  public async cleanup(): Promise<void> {
    console.log(`🧹 清理微博评论容器: ${this.config.name}`);

    this.extractedComments.clear();
    this.scrollAttempts = 0;
    this.loadMoreAttempts = 0;
    this.isAutoScrolling = false;
    this.lastCommentCount = 0;
    this.noNewCommentCount = 0;

    await super.cleanup();
  }
}

export default WeiboCommentContainer;