/**
 * 微博回复容器实现
 * 用于处理单个评论下的回复内容
 */

import { BaseSelfRefreshingContainer, ContainerConfig, RefreshTrigger } from './BaseSelfRefreshingContainer';
import { UniversalOperator, OperationResult } from '../core/UniversalOperator';

// ==================== 接口定义 ====================

export interface WeiboReplyConfig extends ContainerConfig {
  parentCommentId: string;
  maxReplies?: number;
  replySelectors?: string[];
  expandReplySelectors?: string[];
  autoExpandReplies?: boolean;
  maxExpandAttempts?: number;
}

export interface ReplyData {
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
  };
  parentId: string;
  replyTo?: string;
  depth: number;
}

// ==================== 容器实现 ====================

export class WeiboReplyContainer extends BaseSelfRefreshingContainer {
  protected config: WeiboReplyConfig;
  protected extractedReplies: Map<string, ReplyData> = new Map();
  protected expandAttempts = 0;
  protected lastReplyCount = 0;
  protected parentCommentId: string;

  constructor(config: WeiboReplyConfig) {
    super({
      refreshInterval: 1500,
      enableAutoRefresh: true,
      enableMutationObserver: true,
      maxRefreshRetries: 3,
      debounceTime: 800,
      childContainerTypes: [], // 回复通常没有子容器
      taskCompletionCriteria: {
        type: 'count',
        targetCount: config.maxReplies || 20
      },
      ...config
    });

    this.config = config;
    this.parentCommentId = config.parentCommentId;
    this.setupReplySpecificHandlers();
  }
    expandAttempts: any;
    lastReplyCount: any;

  private setupReplySpecificHandlers(): void {
    // 监听回复数量变化
    this.on('refresh:completed', (data) => {
      const currentCount = this.extractedReplies.size;
      console.log(`💬 回复数量更新: ${currentCount} (父评论: ${this.parentCommentId}, 目标: ${this.config.maxReplies})`);
    });

    // 监听新回复发现
    this.on('replies:discovered', (data) => {
      console.log(`🆕 发现新回复: ${data.replies.length} 条, 总计: ${data.totalCount} 条`);
    });

    // 监听展开操作
    this.on('expand:executed', (data) => {
      console.log(`📖 展开回复操作: ${data.success ? '成功' : '失败'} (尝试 ${data.attempt}/${this.config.maxExpandAttempts})`);
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
    // 回复容器通常没有子容器，但如果需要可以扩展
    throw new Error('回复容器不支持子容器');
  }

  protected async executeDynamicOperation(page: any, operation: any, params: any): Promise<OperationResult> {
    switch (operation.action) {
      case 'expand_replies':
        return await this.executeExpandReplies(page, operation);
      case 'click_expand':
        return await this.executeClickExpand(page, operation);
      case 'scroll_to_replies':
        return await this.executeScrollToReplies(page, operation);
      default:
        return OperationResult.failure(`不支持的操作: ${operation.action}`);
    }
  }

  // ==================== 核心刷新逻辑 ====================

  protected async performRefresh(trigger: RefreshTrigger): Promise<OperationResult> {
    console.log(`🔄 执行回复容器刷新 [${trigger.type}]: ${this.config.name} (父评论: ${this.parentCommentId})`);

    try {
      // 1. 检测容器状态
      const stateUpdate = await this.detectContainerState(this.page);
      this.updateState(stateUpdate);

      // 2. 如果容器不存在，跳过刷新
      if (!stateUpdate.exists) {
        return OperationResult.success({
          action: 'refresh',
          result: 'container_not_found',
          message: '回复容器不存在'
        });
      }

      // 3. 提取回复数据
      const repliesResult = await this.extractReplies(this.page);
      if (repliesResult.success) {
        await this.updateReplyData(repliesResult.data);
      }

      // 4. 注册动态操作
      await this.registerDynamicOperations(this.page);

      // 5. 根据触发源执行特定操作
      await this.handleTriggerSpecificActions(trigger);

      // 6. 自动展开回复
      if (this.shouldAutoExpandReplies(trigger)) {
        await this.autoExpandReplies();
      }

      return OperationResult.success({
        action: 'refresh',
        trigger: trigger.type,
        replyCount: this.extractedReplies.size,
        containerState: this.state,
        taskProgress: this.taskProgress,
        parentCommentId: this.parentCommentId,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error(`回复容器刷新失败 [${trigger.type}]:`, error);
      return OperationResult.failure(`刷新失败: ${error.message}`, error);
    }
  }

  // ==================== 回复数据提取 ====================

  private async extractReplies(page: any): Promise<OperationResult> {
    try {
      const selectors = this.config.replySelectors || [
        '.Reply_item',
        '.Comment_replies .Reply_item',
        '[class*="reply-item"]',
        '.reply-item',
        '.sub-comment-item'
      ];

      const replies: ReplyData[]  = await page.evaluate((selectors, maxReplies, parentCommentId) => {
        const allReplies= [];

        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach((element, index) => {
            if (allReplies.length >= maxReplies) return;

            try {
              // 提取回复内容
              const contentEl = element.querySelector('.Reply_content, [class*="content"], .content');
              const content = contentEl?.textContent?.trim() || '';

              // 提取作者信息
              const authorEl = element.querySelector('.Reply_author, [class*="author"], .author');
              const authorName = authorEl?.textContent?.trim() || '';
              const authorId = authorEl?.getAttribute('data-user-id') || authorName;
              const avatarEl = element.querySelector('.Reply_avatar img, [class*="avatar"] img');
              const avatar = avatarEl?.getAttribute('src') || '';

              // 提取时间
              const timeEl = element.querySelector('.Reply_time, [class*="time"], .time');
              const timestamp = timeEl?.textContent?.trim() || '';

              // 提取点赞数
              const likesEl = element.querySelector('.Reply_likes [class*="count"], [class*="likes"] [class*="count"]');
              const likes = parseInt(likesEl?.textContent || '0') || 0;

              // 检查是否是回复给特定用户
              const replyToEl = element.querySelector('.Reply_to, [class*="reply-to"]');
              const replyTo = replyToEl?.textContent?.trim() || '';

              // 生成唯一ID
              const replyId = `reply_${parentCommentId}_${Date.now()}_${index}_${authorId}`;

              const reply: ReplyData: 1 // 回复的深度为1
              };

              allReplies.push(reply = {
                id: replyId,
                content,
                author: {
                  name: authorName,
                  id: authorId,
                  verified: authorEl?.classList.contains('verified'),
                  avatar
                },
                timestamp,
                statistics: { likes },
                parentId: parentCommentId,
                replyTo,
                depth);

            } catch (error) {
              console.warn(`提取回复失败 ${index}:`, error);
            }
          });
        });

        return allReplies;
      }, selectors, this.config.maxReplies || 50, this.parentCommentId);

      return OperationResult.success(replies);

    } catch (error) {
      return OperationResult.failure(`回复提取失败: ${error.message}`, error);
    }
  }

  private async updateReplyData(newReplies: ReplyData[]): Promise<void> {
    let discoveredCount = 0;

    for (const reply of newReplies) {
      if (!this.extractedReplies.has(reply.id)) {
        this.extractedReplies.set(reply.id, reply);
        discoveredCount++;
      }
    }

    if (discoveredCount > 0) {
      this.emit('replies:discovered', {
        replies: newReplies.slice(-discoveredCount),
        totalCount: this.extractedReplies.size
      });
    }

    // 更新任务进度
    this.taskProgress.currentCount = this.extractedReplies.size;
  }

  // ==================== 自动展开回复 ====================

  private shouldAutoExpandReplies(trigger: RefreshTrigger): boolean {
    if (!this.config.autoExpandReplies) {
      return false;
    }

    // 检查是否达到最大展开尝试次数
    if (this.expandAttempts >= (this.config.maxExpandAttempts || 3)) {
      console.log(`📖 已达到最大展开尝试次数 (${this.expandAttempts})，停止自动展开`);
      return false;
    }

    // 检查是否还需要更多回复
    if (this.extractedReplies.size >= (this.config.maxReplies || 50)) {
      return false;
    }

    // 只在特定触发源下自动展开
    return ['initialization', 'timer', 'mutation'].includes(trigger.type);
  }

  private async autoExpandReplies(): Promise<void> {
    const expandOperations = Array.from(this.registeredOperations.values())
      .filter(op => op.action === 'expand_replies' || op.id.includes('expand'));

    if (expandOperations.length === 0) {
      return;
    }

    try {
      console.log(`📖 自动展开回复操作 (尝试 ${this.expandAttempts + 1}/${this.config.maxExpandAttempts})`);

      // 执行第一个展开操作
      const operation = expandOperations[0];
      const result = await this.executeOperation(operation.id);

      this.expandAttempts++;

      // 检查操作结果
      if (result.success) {
        // 如果操作成功且有新内容，重置尝试计数
        if (result.data?.newContentExpanded) {
          this.expandAttempts = 0;
        }
      }

      this.emit('expand:executed', {
        operationId: operation.id,
        success: result.success,
        attempt: this.expandAttempts
      });

    } catch (error) {
      console.error('自动展开回复失败:', error);
      this.expandAttempts++;
    }
  }

  // ==================== 操作执行 ====================

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

      // 检查按钮是否可见和可点击
      const isVisible = await page.evaluate((button) => {
        return button.offsetParent !== null && !button.disabled;
      }, expandButton);

      if (!isVisible) {
        return OperationResult.success({
          action: 'expand_replies',
          result: 'button_not_visible',
          message: '展开回复按钮不可见'
        });
      }

      // 记录展开前的回复数量
      const beforeCount = this.extractedReplies.size;

      await expandButton.click();
      await page.waitForTimeout(1500);

      // 检查是否有新回复展开
      const afterCount = await this.getCurrentReplyCount(page);
      const newContentExpanded = afterCount > beforeCount;

      return OperationResult.success({
        action: 'expand_replies',
        result: 'success',
        message: '展开回复操作完成',
        newContentExpanded,
        replyCount: afterCount
      });

    } catch (error) {
      return OperationResult.failure(`展开回复失败: ${error.message}`, error);
    }
  }

  private async executeClickExpand(page: any, operation: any): Promise<OperationResult> {
    try {
      const expandElement = await page.$(operation.selector);
      if (!expandElement) {
        return OperationResult.success({
          action: 'click_expand',
          result: 'element_not_found',
          message: '未找到展开元素'
        });
      }

      await expandElement.click();
      await page.waitForTimeout(1000);

      return OperationResult.success({
        action: 'click_expand',
        result: 'success',
        message: '点击展开操作完成'
      });

    } catch (error) {
      return OperationResult.failure(`点击展开失败: ${error.message}`, error);
    }
  }

  private async executeScrollToReplies(page: any, operation: any): Promise<OperationResult> {
    try {
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, this.config.selector);

      await page.waitForTimeout(1000);

      return OperationResult.success({
        action: 'scroll_to_replies',
        result: 'success',
        message: '滚动到回复区域操作完成'
      });

    } catch (error) {
      return OperationResult.failure(`滚动到回复区域失败: ${error.message}`, error);
    }
  }

  private async getCurrentReplyCount(page: any): Promise<number> {
    try {
      const selectors = this.config.replySelectors || [
        '.Reply_item',
        '.Comment_replies .Reply_item',
        '[class*="reply-item"]',
        '.reply-item'
      ];

      const count = await page.evaluate((selectors) => {
        let totalCount = 0;
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          totalCount += elements.length;
        });
        return totalCount;
      }, selectors);

      return count;
    } catch (error) {
      return this.extractedReplies.size;
    }
  }

  // ==================== 触发源处理 ====================

  private async handleTriggerSpecificActions(trigger: RefreshTrigger): Promise<void> {
    switch (trigger.type) {
      case 'initialization':
        console.log('🚀 初始化触发，开始自动发现回复...');
        this.lastReplyCount = this.extractedReplies.size;
        break;
      case 'mutation':
        console.log('👁️ 内容变化触发，检查新回复...');
        break;
      case 'timer':
        console.log('⏰ 定时触发，保持回复同步...');
        break;
      case 'operation':
        console.log(`🎮 操作触发 [${trigger.source}]:`, trigger.data);
        break;
      case 'manual':
        console.log('👆 手动触发刷新...');
        break;
    }
  }

  // ==================== 重写方法 ====================

  protected async registerDynamicOperations(page: any): Promise<void> {
    try {
      const operations = await page.evaluate((config) => {
        const element = document.querySelector(config.selector);
        if (!element) return [];

        const operations: any[] = [];

        // 检测展开回复按钮
        const expandButtons = element.querySelectorAll('button, [role="button"], [onclick]');
        expandButtons.forEach((button, index) => {
          const text = button.textContent?.trim() || '';
          const action = this.inferExpandActionFromText(text);

          if (action) {
            operations.push({
              id: `expand_${index}`,
              type: 'element-type',
              selector: `${config.selector} button:nth-child(${index + 1})`,
              action,
              text,
              autoExecute: this.shouldAutoExecuteExpand(text),
              maxAttempts: this.getMaxExpandAttempts(text)
            });
          }
        });

        return operations;
      }, this.config);

      // 注册检测到的操作
      for (const op of operations) {
        await this.registerOperation(op.id, async (params: any) => {
          return await this.executeDynamicOperation(page, op, params);
        }, op);
      }

    } catch (error) {
      console.warn(`动态操作注册失败 ${this.config.id}:`, error);
    }
  }

  private inferExpandActionFromText(text: string): string | null {
    const actionMap: Record<string, string> = {
      '展开回复': 'expand_replies',
      '查看回复': 'expand_replies',
      '展开': 'expand',
      '收起': 'collapse',
      '更多回复': 'expand_replies'
    };

    for (const [key, action] of Object.entries(actionMap)) {
      if (text.includes(key)) {
        return action;
      }
    }

    return null;
  }

  private shouldAutoExecuteExpand(text: string): boolean {
    const autoExecuteTexts = ['展开回复', '查看回复', '更多回复'];
    return autoExecuteTexts.some(autoText => text.includes(autoText));
  }

  private getMaxExpandAttempts(text: string): number {
    if (text.includes('展开回复') || text.includes('查看回复')) {
      return 3;
    }
    return 1;
  }

  // ==================== 重写任务完成检查 ====================

  protected getCurrentCountFromResult(result: OperationResult): number {
    return this.extractedReplies.size;
  }

  // ==================== 公共接口 ====================

  public getAllReplies(): ReplyData[] {
    return Array.from(this.extractedReplies.values());
  }

  public getReplyStats(): any {
    const replies = Array.from(this.extractedReplies.values());

    return {
      totalReplies: replies.length,
      uniqueAuthors: new Set(replies.map(r: this.parentCommentId
    };
  }

  public resetExpandAttempts( = > r.author.id)).size,
      totalLikes: replies.reduce((sum, r) => sum + r.statistics.likes, 0),
      averageLikes: replies.length > 0 ? replies.reduce((sum, r) => sum + r.statistics.likes, 0) / replies.length : 0,
      refreshStats: this.getRefreshStats(),
      taskProgress: this.taskProgress,
      parentCommentId): void {
    this.expandAttempts = 0;
    console.log('📖 重置展开尝试计数');
  }

  // ==================== 清理资源 ====================

  public async cleanup(): Promise<void> {
    console.log(`🧹 清理微博回复容器: ${this.config.name} (父评论: ${this.parentCommentId})`);

    this.extractedReplies.clear();
    this.expandAttempts = 0;
    this.lastReplyCount = 0;

    await super.cleanup();
  }
}

export default WeiboReplyContainer;