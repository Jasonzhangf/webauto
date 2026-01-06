/**
 * ContainerAutoClickHandler - 容器自动点击处理器
 * 
 * 作用：当带有 auto_click 元数据的容器出现时，自动触发点击操作
 * 核心职责：
 * 1. 监听容器 appear 事件
 * 2. 检查容器定义是否包含 auto_click 元数据
 * 3. 自动执行 click 操作
 */

import { EventBus } from '../../../../libs/operations-framework/src/event-driven/EventBus.js';
import { ContainerDefV2 } from './types.js';

export interface AutoClickConfig {
  waitAfter?: number; // 点击后等待毫秒数
  retries?: number; // 重试次数
  timeout?: number; // 操作超时时间
}

export class ContainerAutoClickHandler {
  private eventBus: EventBus;
  private containerDefs: Map<string, ContainerDefV2>;
  private pendingClicks = new Map<string, NodeJS.Timeout>();

  constructor(eventBus: EventBus, defs: ContainerDefV2[]) {
    this.eventBus = eventBus;
    this.containerDefs = new Map(defs.map(d => [d.id, d]));
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // 订阅所有容器 appear 事件
    this.eventBus.on('container:appear', async (data: any) => {
      await this.handleContainerAppear(data);
    });

    // 订阅特定容器的 appear 事件
    this.containerDefs.forEach((def, containerId) => {
      if (def.metadata?.auto_click) {
        this.eventBus.on(`container:${containerId}:appear`, async (data: any) => {
          await this.handleAutoClick(containerId, data);
        });
      }
    });
  }

  /**
   * 处理容器 appear 事件
   */
  private async handleContainerAppear(data: any): Promise<void> {
    const { containerId, sessionId } = data;
    const def = this.containerDefs.get(containerId);

    if (!def) return;

    // 检查是否需要自动点击
    const shouldAutoClick = def.metadata?.auto_click === true;

    if (shouldAutoClick) {
      console.log(`[AutoClickHandler] 容器 ${containerId} 出现，准备自动点击`);
      await this.handleAutoClick(containerId, data);
    }
  }

  /**
   * 处理自动点击
   */
  private async handleAutoClick(containerId: string, appearData: any): Promise<void> {
    // 避免重复点击
    if (this.pendingClicks.has(containerId)) {
      console.log(`[AutoClickHandler] 容器 ${containerId} 已有待执行的点击，跳过`);
      return;
    }

    const def = this.containerDefs.get(containerId);
    if (!def) return;

    const config: AutoClickConfig = {
      waitAfter: def.metadata?.auto_click_wait_after || 500,
      retries: def.metadata?.auto_click_retries || 1,
      timeout: def.metadata?.auto_click_timeout || 5000
    };

    console.log(`[AutoClickHandler] 自动点击容器 ${containerId}`, {
      waitAfter: config.waitAfter,
      retries: config.retries
    });

    // 发送点击操作事件
    await this.eventBus.emit(`container:${containerId}:click`, {
      containerId,
      sessionId: appearData.sessionId,
      trigger: 'auto_click',
      timestamp: Date.now()
    }, 'AutoClickHandler');

    // 设置防抖
    const timer = setTimeout(() => {
      this.pendingClicks.delete(containerId);
    }, config.waitAfter);
    
    this.pendingClicks.set(containerId, timer);
  }

  /**
   * 清理待处理的点击任务
   */
  cleanup(): void {
    for (const timer of this.pendingClicks.values()) {
      clearTimeout(timer);
    }
    this.pendingClicks.clear();
  }

  /**
   * 更新容器定义（用于运行时动态更新）
   */
  updateDefs(defs: ContainerDefV2[]): void {
    this.containerDefs = new Map(defs.map(d => [d.id, d]));
  }
}
