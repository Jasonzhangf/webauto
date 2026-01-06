/**
 * ContainerEventDispatcher - 容器事件分发器
 *
 * 作用：当容器匹配完成后，自动发送 container.appear 事件
 * 核心职责：
 * 1. 监听容器发现/匹配结果
 * 2. 对比前后状态，识别新出现的容器
 * 3. 向 EventBus 发送 container:<containerId>:appear 事件
 */

import { EventBus } from '../../../../libs/operations-framework/src/event-driven/EventBus.js';
import { ContainerGraph, ContainerNodeRuntime } from './types.js';

export interface ContainerAppearEvent {
  containerId: string;
  containerName?: string;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  visible?: boolean;
  score?: number;
  timestamp: number;
  sessionId?: string;
}

export class ContainerEventDispatcher {
  private eventBus: EventBus;
  private knownContainers = new Set<string>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * 处理容器匹配结果，分发 appear 事件
   */
  async processMatchResult(graph: ContainerGraph, sessionId?: string): Promise<void> {
    const newContainers: ContainerAppearEvent[] = [];

    // 遍历所有容器节点
    for (const [containerId, node] of graph.nodes.entries()) {
      // 只处理已定位的容器
      if (node.state !== 'located') continue;

      // 如果是新出现的容器，发送 appear 事件
      if (!this.knownContainers.has(containerId)) {
        this.knownContainers.add(containerId);

        const event: ContainerAppearEvent = {
          containerId,
          bbox: node.bbox,
          visible: node.visible,
          score: node.score,
          timestamp: Date.now(),
          sessionId
        };

        newContainers.push(event);

        // 发送事件到 EventBus
        await this.dispatchAppearEvent(event);
      }
    }

    return;
  }

  /**
   * 分发 appear 事件
   */
  private async dispatchAppearEvent(event: ContainerAppearEvent): Promise<void> {
    // 发送通用事件
    await this.eventBus.emit('container:appear', event, 'ContainerEventDispatcher');

    // 发送容器特定事件
    await this.eventBus.emit(`container:${event.containerId}:appear`, event, 'ContainerEventDispatcher');
  }

  /**
   * 重置已知容器（用于重新匹配）
   */
  reset(): void {
    this.knownContainers.clear();
  }

  /**
   * 标记容器为已知（用于手动同步状态）
   */
  markKnown(containerId: string): void {
    this.knownContainers.add(containerId);
  }
}
