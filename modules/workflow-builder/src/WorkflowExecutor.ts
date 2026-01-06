import { WorkflowEventEmitter } from './WorkflowEmitter.ts';
import { WorkflowLogger } from './WorkflowLogger.ts';
import WebSocket from 'ws';
import { AutoScrollStrategy } from '../../../libs/containers/src/strategies/AutoScrollStrategy.ts';
import type {
  WorkflowPhase,
  WorkflowStatus,
  ExtractedResults,
  ExtractedPost,
  WorkflowExecutionOptions,
  UnifiedActionResponse,
  ContainerMatchResponse,
  ContainerInspectResponse,
  OperationExecutionResponse,
  HighlightSpec,
  WorkflowEvent
} from './types.js';

/**
 * 事件驱动的 Workflow 执行器
 * 基于容器事件自动触发操作（高亮、提取、滚动等）
 */
export class WorkflowExecutor {
  private eventEmitter: WorkflowEventEmitter;
  private logger: WorkflowLogger;
  private currentPhase: WorkflowPhase = 'idle';
  private stopRequested = false;
  private extractedLinks: Set<string> = new Set();
  private extractedPosts: ExtractedPost[] = [];
  private eventQueue: Array<() => Promise<void>> = [];
  private isProcessing = false;
  private autoScroll?: AutoScrollStrategy;

  constructor() {
    this.eventEmitter = new WorkflowEventEmitter();
    this.logger = new WorkflowLogger(this.eventEmitter);
  }

  /**
   * 获取事件发射器，用于外部订阅状态和日志
   */
  get emitter(): WorkflowEventEmitter {
    return this.eventEmitter;
  }

  /**
   * 检查是否应该停止
   */
  shouldStop(): boolean {
    return this.stopRequested;
  }

  /**
   * 请求停止工作流
   */
  stop(): void {
    this.stopRequested = true;
    this.logger.status({ phase: 'failed', message: 'Workflow stopped by user' });
  }

  /**
   * 更新阶段
   */
  private setPhase(phase: WorkflowPhase, stepId?: string, message?: string): void {
    this.currentPhase = phase;
    const status: WorkflowStatus = { phase, stepId, message };
    this.logger.status(status);
  }

  /**
   * 处理容器出现事件
   */
  private async handleContainerAppeared(containerId: string, containerType: string): Promise<void> {
    this.logger.info(`Container appeared: ${containerId} (${containerType})`);
    
    // 将事件加入队列
    this.eventQueue.push(async () => {
      await this.processContainer(containerId, containerType);
    });

    // 触发处理
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * 处理队列中的事件
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.eventQueue.length > 0 && !this.shouldStop()) {
      const handler = this.eventQueue.shift();
      if (handler) {
        try {
          await handler();
        } catch (error) {
          this.logger.error(`Event handler failed: ${error}`);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * 处理单个容器
   */
  private async processContainer(containerId: string, containerType: string): Promise<void> {
    this.setPhase('highlighting', `highlight-${containerId}`, `Highlighting container: ${containerId}`);

    // 高亮容器（根据类型使用不同样式）
    const style = this.getHighlightStyle(containerType);
    await this.highlightContainer(containerId, style);

    // 如果是帖子容器，执行提取操作
    if (containerType === 'feed_post') {
      await this.extractContainer(containerId);
    }
  }

  /**
   * 根据容器类型获取高亮样式
   */
  private getHighlightStyle(containerType: string): string {
    switch (containerType) {
      case 'feed_list':
        return '3px dashed #fbbc05'; // 黄色虚线框
      case 'feed_post':
        return '2px solid #2196F3'; // 蓝色实线框
      case 'extracted':
        return '2px solid #00C853'; // 绿色实线框
      default:
        return '2px solid #fbbc05';
    }
  }

  /**
   * 高亮容器
   */
  private async highlightContainer(
    containerId: string,
    style: string,
    duration: number = 2000,
    label?: string
  ): Promise<boolean> {
    try {
      const UNIFIED_API = 'http://127.0.0.1:7701';
      const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:highlight',
          payload: {
            selector: containerId,
            options: {
              style,
              duration,
              sticky: false,
              label: label || containerId
            }
          }
        })
      });

      if (!response.ok) {
        this.logger.warn(`Failed to highlight ${containerId}: ${response.statusText}`);
        return false;
      }

      this.logger.info(`Highlighted ${containerId}`);
      return true;

    } catch (error) {
      this.logger.error(`Highlight error for ${containerId}: ${error}`);
      return false;
    }
  }

  /**
   * 提取容器数据
   */
  private async extractContainer(containerId: string): Promise<ExtractedPost | null> {
    this.setPhase('extracting', `extract-${containerId}`, `Extracting from: ${containerId}`);

    try {
      const UNIFIED_API = 'http://127.0.0.1:7701';
      const response = await fetch(`${UNIFIED_API}/v1/container/${containerId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'weibo_fresh',
          operationId: 'extract',
          config: {
            fields: {
              author: "header a[href*='weibo.com']",
              content: "div[class*='detail_wbtext']",
              timestamp: "time",
              href: "a[href*='weibo.com']"
            },
            include_text: true
          }
        })
      });

      if (!response.ok) {
        this.logger.warn(`Failed to extract from ${containerId}: ${response.statusText}`);
        return null;
      }

      const result = await response.json() as OperationExecutionResponse;
      if (!result.success || !result.data) {
        return null;
      }

      const extracted = (result.data as Record<string, unknown>).extracted as Array<Record<string, unknown>> || [];
      if (extracted.length === 0) {
        return null;
      }

      const postData = extracted[0] as Record<string, unknown>;
      const post: ExtractedPost = {
        id: containerId,
        links: [],
        author: postData.author as string | undefined,
        content: postData.content as string | undefined,
        timestamp: postData.timestamp as string | undefined
      };

      // 提取链接并去重
      if (postData.href) {
        if (!this.extractedLinks.has(postData.href as string)) {
          this.extractedLinks.add(postData.href as string);
          post.links.push({ href: postData.href as string, text: postData.text as string | undefined });
        }
      }

      this.extractedPosts.push(post);
      this.logger.info(`Extracted post ${containerId}`, {
        author: post.author,
        linksCount: post.links.length,
        totalPosts: this.extractedPosts.length
      });

      return post;

    } catch (error) {
      this.logger.error(`Extract error for ${containerId}: ${error}`);
      return null;
    }
  }

  /**
   * 滚动页面
   */
  private async scrollContainer(containerId: string, distance: number = 800): Promise<boolean> {
    this.setPhase('scrolling', 'scroll', `Scrolling container: ${containerId}`);

    try {
      const UNIFIED_API = 'http://127.0.0.1:7701';
      const response = await fetch(`${UNIFIED_API}/v1/container/${containerId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'weibo_fresh',
          operationId: 'scroll',
          config: {
            direction: 'down',
            distance
          }
        })
      });

      if (!response.ok) {
        this.logger.warn(`Failed to scroll ${containerId}: ${response.statusText}`);
        return false;
      }

      this.logger.info(`Scrolled container ${containerId}`);
      await this.sleep(3000); // 等待内容加载
      return true;

    } catch (error) {
      this.logger.error(`Scroll error for ${containerId}: ${error}`);
      return false;
    }
  }

  /**
   * 辅助: 延迟
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 订阅容器事件
   */
  private subscribeToContainerEvents(profile: string): void {
    // 通过 WebSocket 订阅容器事件
    const ws = new WebSocket('ws://127.0.0.1:7701/ws');

    ws.on('open', () => {
      this.logger.info('WebSocket connected for container events');
    });

    ws.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'event' && msg.topic?.startsWith('container:')) {
          this.handleContainerEvent(msg);
        }
      } catch (error) {
        this.logger.warn(`Failed to parse WebSocket message: ${error}`);
      }
    });

    ws.on('error', (error: Error) => {
      this.logger.error(`WebSocket error: ${error}`);
    });

    ws.on('close', () => {
      this.logger.warn('WebSocket connection closed');
    });
  }

  /**
   * 处理容器事件
   */
  private handleContainerEvent(event: any): void {
    if (event.type !== 'event') return;

    const payload = event.payload as Record<string, unknown>;
    const eventType = event.topic;

    if (eventType === 'container:discovered') {
      const containerId = payload.containerId as string;
      const containerType = payload.containerType as string;
      this.handleContainerAppeared(containerId, containerType);
    }
  }

  /**
   * 执行基于事件的微博 Feed 提取工作流
   */
  async executeEventDrivenWorkflow(options: WorkflowExecutionOptions): Promise<ExtractedResults> {
    try {
      // Step 1: 订阅容器事件
      this.setPhase('matching', 'subscribe-events', 'Subscribing to container events');
      this.subscribeToContainerEvents(options.profile);
      await this.sleep(1000);

      // Step 2: 创建自动滚动策略
      this.autoScroll = new AutoScrollStrategy(
        async (distance) => {
          await this.executeAction('containers:execute', {
            containerId: 'weibo_main_page.feed_list',
            operationId: 'scroll',
            config: { distance, direction: 'down' }
          });
        },
        async () => {
          const result = await this.executeAction('browser:evaluate', {
            script: 'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)'
          });
          return result.data as number;
        },
        async (ms) => this.sleep(ms),
        {
          trigger: { type: 'on-boundary', boundaryThreshold: 0.8 },
          scrollDistance: 800,
          waitAfterScroll: 3000,
          maxScrolls: options.scrollLimit || 50,
          stopOnNoChange: true
        }
      );

      // Step 3: 初始容器匹配，触发容器发现
      this.setPhase('matching', 'match-containers', 'Matching containers');
      const matchResult = await this.executeAction<ContainerMatchResponse['data']>('containers:match', {
        profile: options.profile,
        url: options.url,
        maxDepth: 3,
        maxChildren: 100
      });

      if (!matchResult.success) {
        throw new Error('Container match failed');
      }

      // Step 4: 主循环 - 监听事件并执行滚动
      while (this.extractedPosts.length < options.targetCount && !this.shouldStop()) {
        if (this.shouldStop()) break;

        await this.sleep(5000); // 等待事件处理

        // 检查是否应该开始滚动
        const visibleCount = await this.countVisibleContainers();
        const shouldScroll = this.autoScroll.shouldStartScrolling({
          discoveredContainers: this.extractedPosts.length,
          visibleContainers: visibleCount
        });

        if (shouldScroll) {
          this.logger.info('🔄 Starting auto-scroll...');
          const scrollResult = await this.autoScroll.execute();
          
          if (scrollResult.hasReachedBottom) {
            this.logger.info('🏁 Reached bottom, stopping workflow');
            break;
          }
        }
      }

      // 等待队列处理完成
      await this.processQueue();

      this.setPhase('completed', undefined, `Workflow completed with ${this.extractedPosts.length} posts`);
      this.logger.info('Workflow completed', {
        totalPosts: this.extractedPosts.length,
        uniqueLinks: this.extractedLinks.size,
        finalPhase: this.currentPhase
      });

      return {
        posts: this.extractedPosts,
        dedupedLinks: Array.from(this.extractedLinks)
      };

    } catch (error) {
      this.setPhase('failed', undefined, `Workflow failed: ${error}`);
      this.logger.error(`Workflow failed: ${error}`);
      throw error;
    }
  }

  /**
   * 计算当前页面可见容器数量
   */
  private async countVisibleContainers(): Promise<number> {
    const result = await this.executeAction('browser:evaluate', {
      script: `
        const containers = document.querySelectorAll('.Feed_body_3R0rO, .card, .post-item');
        let visibleCount = 0;
        containers.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            visibleCount++;
          }
        });
        visibleCount;
      `
    });
    return result.data as number || 0;
  }

  /**
   * 执行统一的 Action
   */
  private async executeAction<T = unknown>(
    action: string,
    payload: Record<string, unknown>
  ): Promise<UnifiedActionResponse<T>> {
    const UNIFIED_API = 'http://127.0.0.1:7701';
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json() as Promise<UnifiedActionResponse<T>>;
  }
}
