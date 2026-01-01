import { WorkflowEventEmitter } from './WorkflowEmitter.js';
import { WorkflowLogger } from './WorkflowLogger.js';
import type {
  WorkflowPhase,
  WorkflowStatus,
  ExtractedResults,
  ExtractedPost,
  WorkflowExecutionOptions,
  UnifiedActionResponse,
  ContainerMatchResponse,
  ContainerInspectResponse,
  OperationExecutionResponse
} from './types.js';

/**
 * 自动化 Workflow 构建器
 * 用于动态构建和执行基于容器的 Web 自动化工作流
 */
export class WorkflowBuilder {
  private eventEmitter: WorkflowEventEmitter;
  private logger: WorkflowLogger;
  private currentPhase: WorkflowPhase = 'idle';
  private stopRequested = false;
  private extractedLinks: Set<string> = new Set();
  private extractedPosts: ExtractedPost[] = [];

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
   * 执行统一的 WebSocket/HTTP Action
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

  /**
   * 步骤 1: 导航到页面
   */
  private async stepNavigate(options: WorkflowExecutionOptions): Promise<void> {
    this.setPhase('navigating', 'navigate', `Navigating to ${options.url}`);
    
    const result = await this.executeAction<{ sessionId?: string }>('session:create', {
      profile: options.profile,
      url: options.url
    });

    if (!result.success) {
      throw new Error('Failed to create session or navigate');
    }

    this.logger.info(`Navigated to ${options.url} with profile ${options.profile}`);
    await this.sleep(3000); // Wait for page to load
  }

  /**
   * 步骤 2: 匹配容器
   */
  private async stepMatchContainers(options: WorkflowExecutionOptions): Promise<ContainerMatchResponse> {
    this.setPhase('matching', 'match-containers', 'Matching containers on page');
    
    const result = await this.executeAction<ContainerMatchResponse['data']>('containers:match', {
      profile: options.profile,
      url: options.url,
      maxDepth: 3,
      maxChildren: 100
    });

    if (!result.success) {
      throw new Error('Container match failed');
    }

    const containers = result.data?.snapshot?.container_tree?.containers || [];
    this.logger.info(`Matched ${containers.length} containers`, {
      containerIds: containers.map(c => c.id)
    });

    return result as ContainerMatchResponse;
  }

  /**
   * 步骤 3: 选择目标容器
   */
  private async stepSelectContainer(
    options: WorkflowExecutionOptions,
    targetContainerId: string
  ): Promise<string> {
    this.setPhase('selecting', 'select-container', `Selecting container: ${targetContainerId}`);
    
    const result = await this.executeAction<ContainerInspectResponse['data']>('containers:inspect-container', {
      profile: options.profile,
      containerId: targetContainerId,
      maxChildren: 100
    });

    if (!result.success) {
      throw new Error(`Failed to inspect container ${targetContainerId}`);
    }

    const children = result.data?.snapshot?.children || [];
    this.logger.info(`Selected container ${targetContainerId} with ${children.length} children`);

    return targetContainerId;
  }

  /**
   * 步骤 4: 高亮目标容器
   */
  private async stepHighlight(
    options: WorkflowExecutionOptions,
    containerId: string,
    style: string,
    label?: string
  ): Promise<void> {
    this.setPhase('highlighting', 'highlight', `Highlighting container: ${containerId}`);
    
    const result = await this.executeAction('browser:highlight', {
      profile: options.profile,
      selector: containerId,
      options: {
        style,
        duration: 2000,
        sticky: false,
        label
      }
    });

    if (!result.success) {
      this.logger.warn(`Failed to highlight container ${containerId}`);
    } else {
      this.logger.info(`Highlighted container ${containerId}`);
    }
  }

  /**
   * 步骤 5: 提取数据
   */
  private async stepExtract(
    options: WorkflowExecutionOptions,
    postId: string,
    config: Record<string, unknown>
  ): Promise<ExtractedPost | null> {
    this.setPhase('extracting', 'extract', `Extracting data from post: ${postId}`);
    
    const result = await this.executeAction('container:execute-operation', {
      profile: options.profile,
      containerId: postId,
      operationId: 'extract',
      config
    });

    if (!result.success || !result.data) {
      this.logger.warn(`Failed to extract data from post ${postId}`);
      return null;
    }

    const extracted = (result.data as Record<string, unknown>).extracted as Array<Record<string, unknown>> || [];
    if (extracted.length === 0) {
      return null;
    }

    const postData = extracted[0] as Record<string, unknown>;
    const post: ExtractedPost = {
      id: postId,
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

    return post;
  }

  /**
   * 步骤 6: 滚动页面
   */
  private async stepScroll(options: WorkflowExecutionOptions, containerId: string): Promise<void> {
    this.setPhase('scrolling', 'scroll', `Scrolling container: ${containerId}`);
    
    const result = await this.executeOperation(containerId, 'scroll', {
      profile: options.profile,
      direction: 'down',
      distance: 800
    });

    if (!result.success) {
      this.logger.warn('Failed to scroll page');
    } else {
      this.logger.info('Scrolled page');
    }

    await this.sleep(3000); // Wait for content to load
  }

  /**
   * 执行容器操作
   */
  private async executeOperation(
    containerId: string,
    operationId: string,
    config: Record<string, unknown>
  ): Promise<OperationExecutionResponse> {
    const UNIFIED_API = 'http://127.0.0.1:7701';
    const response = await fetch(`${UNIFIED_API}/v1/container/${containerId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: config.profile,
        operationId,
        config
      })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json() as Promise<OperationExecutionResponse>;
  }

  /**
   * 辅助: 延迟
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 构建微博 Feed 提取工作流
   */
  async buildWeiboFeedWorkflow(options: WorkflowExecutionOptions): Promise<ExtractedResults> {
    const highlight = options.highlight || {
      containerStyle: '3px dashed #fbbc05',
      postStyle: '2px solid #2196F3',
      extractStyle: '2px solid #00C853'
    };

    try {
      // Step 1: 导航
      await this.stepNavigate(options);

      // Step 2: 匹配容器
      const matchResult = await this.stepMatchContainers(options);
      const rootContainer = matchResult.data?.snapshot?.container_tree?.containers?.[0];
      if (!rootContainer) {
        throw new Error('Root container not found');
      }

      // Step 3: 选择 Feed 列表
      const feedListId = await this.stepSelectContainer(options, 'weibo_main_page.feed_list');
      
      // Step 4: 高亮 Feed 列表（虚线框）
      await this.stepHighlight(options, feedListId, highlight.containerStyle, 'Feed List');

      let scrollCount = 0;
      let noNewContentCount = 0;
      const maxScrolls = options.scrollLimit;

      // Step 5-6: 提取循环
      while (this.extractedPosts.length < options.targetCount && scrollCount < maxScrolls) {
        if (this.shouldStop()) break;

        // 获取当前可见的帖子
        const inspectResult = await this.executeAction<ContainerInspectResponse['data']>(
          'containers:inspect-container',
          {
            profile: options.profile,
            containerId: feedListId,
            maxChildren: 100
          }
        );

        if (!inspectResult.success) {
          break;
        }

        const posts = inspectResult.data?.snapshot?.children || [];
        let newContent = false;

        // 处理每个帖子
        for (const post of posts) {
          if (this.extractedPosts.length >= options.targetCount) break;
          if (this.shouldStop()) break;

          const postId = post.id;
          if (!postId) continue;

          // 跳过已处理的帖子
          if (this.extractedPosts.some(p => p.id === postId)) continue;

          // 高亮帖子（实线框）
          await this.stepHighlight(options, postId, highlight.postStyle, 'Post');

          // 提取帖子数据
          const extracted = await this.stepExtract(options, postId, {
            fields: {
              author: "header a[href*='weibo.com']",
              content: "div[class*='detail_wbtext']",
              timestamp: "time",
              href: "a[href*='weibo.com']"
            },
            include_text: true
          });

          if (extracted) {
            this.extractedPosts.push(extracted);
            newContent = true;
            this.logger.info(`Extracted post ${postId}`, {
              author: extracted.author,
              linksCount: extracted.links.length,
              totalPosts: this.extractedPosts.length
            });
          }
        }

        // 检查是否有新内容
        if (!newContent) {
          noNewContentCount++;
          this.logger.info(`No new content (${noNewContentCount}/3)`);
          if (noNewContentCount >= 3) {
            this.logger.info('No new content for 3 scrolls, stopping');
            break;
          }
        } else {
          noNewContentCount = 0;
        }

        // 滚动加载更多
        if (this.extractedPosts.length < options.targetCount) {
          await this.stepScroll(options, feedListId);
          scrollCount++;
        }
      }

      this.setPhase('completed', undefined, `Workflow completed with ${this.extractedPosts.length} posts`);
      this.logger.info('Workflow completed', {
        totalPosts: this.extractedPosts.length,
        uniqueLinks: this.extractedLinks.size,
        scrollCount
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
}
