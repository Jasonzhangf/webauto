/**
 * 事件驱动容器发现系统
 * 提供统一的容器注册、发现和管理功能
 */

import { EventBus } from './EventBus';
import { ContainerRegistry, ContainerInfo } from '../containers/ContainerRegistry';
import { EventDrivenContainer } from './EventDrivenContainer';
// 为避免误用 Node 侧 Playwright，这里只定义一个最小 Page 接口
type Page = {
  url(): string;
};

// ==================== 接口定义 ====================

export interface ContainerDiscoveryConfig {
  website: string;
  selectors: string[];
  discoveryStrategy: 'dom-walk' | 'css-selectors' | 'ai-assisted';
  maxDepth?: number;
  timeout?: number;
  enableAutoRegistration?: boolean;
}

export interface DiscoveredContainer {
  id: string;
  selector: string;
  name: string;
  type: string;
  priority: number;
  rect: { x: number; y: number; width: number; height: number };
  elementCount: number;
  parentContainer?: string;
  childContainers?: string[];
}

export interface DiscoveryResult {
  containers: DiscoveredContainer[];
  relationships: ContainerRelationship[];
  hierarchy: ContainerHierarchy;
  stats: DiscoveryStats;
}

export interface ContainerRelationship {
  parent: string;
  child: string;
  type: 'contains' | 'sibling' | 'adjacent';
}

export interface ContainerHierarchy {
  root: string;
  levels: { [level: number]: string[] };
  tree: HierarchyNode;
}

export interface HierarchyNode {
  id: string;
  children: HierarchyNode[];
  level: number;
}

export interface DiscoveryStats {
  totalElements: number;
  analyzedElements: number;
  discoveredContainers: number;
  processingTime: number;
  successRate: number;
}

// ==================== 事件驱动容器发现器 ====================

export class EventDrivenContainerDiscovery {
  private eventBus: EventBus;
  private containerRegistry: ContainerRegistry;
  private isDiscovering: boolean = false;
  private discoveryCache: Map<string, DiscoveredContainer> = new Map();
  private discoveryHistory: DiscoveryResult[] = [];
  /**
   * 可选：根事件驱动容器，用于在发现容器后分发业务事件
   */
  private rootContainer: EventDrivenContainer | null = null;

  constructor(eventBus: EventBus, containerRegistry: ContainerRegistry, rootContainer?: EventDrivenContainer) {
    this.eventBus = eventBus;
    this.containerRegistry = containerRegistry;
    this.rootContainer = rootContainer || null;
    this.setupEventHandlers();
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 监听容器发现请求
    this.eventBus.on('container:discovery:requested', async (data) => {
      await this.handleDiscoveryRequest(data);
    });

    // 监听容器注册请求
    this.eventBus.on('container:registration:requested', async (data) => {
      await this.handleRegistrationRequest(data);
    });

    // 监听容器更新请求
    this.eventBus.on('container:update:requested', async (data) => {
      await this.handleUpdateRequest(data);
    });
  }

  /**
   * 处理发现请求
   */
  private async handleDiscoveryRequest(data: any): Promise<void> {
    try {
      const result = await this.discoverContainers(data.page, data.config);
      
      await this.eventBus.emit('container:discovery:completed', {
        requestId: data.requestId,
        result,
        timestamp: Date.now()
      });
    } catch (error) {
      await this.eventBus.emit('container:discovery:failed', {
        requestId: data.requestId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理注册请求
   */
  private async handleRegistrationRequest(data: any): Promise<void> {
    try {
      await this.registerContainer(data.containerInfo);
      
      await this.eventBus.emit('container:registration:completed', {
        requestId: data.requestId,
        containerId: data.containerInfo.id,
        timestamp: Date.now()
      });
    } catch (error) {
      await this.eventBus.emit('container:registration:failed', {
        requestId: data.requestId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理更新请求
   */
  private async handleUpdateRequest(data: any): Promise<void> {
    try {
      await this.updateContainer(data.containerId, data.updates);
      
      await this.eventBus.emit('container:update:completed', {
        requestId: data.requestId,
        containerId: data.containerId,
        timestamp: Date.now()
      });
    } catch (error) {
      await this.eventBus.emit('container:update:failed', {
        requestId: data.requestId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
    }
  }

  /**
   * 发现容器
   */
  public async discoverContainers(page: Page, config: ContainerDiscoveryConfig): Promise<DiscoveryResult> {
    if (this.isDiscovering) {
      throw new Error('Container discovery already in progress');
    }

    this.isDiscovering = true;
    const startTime = Date.now();

    try {
      console.log(`🔍 开始容器发现: ${config.website}`);

      // 1. 执行DOM分析
      const domAnalysis = await this.performDOMAnalysis(page, config);

      // 2. 构建容器层次结构
      const hierarchy = this.buildContainerHierarchy(domAnalysis.containers);

      // 3. 分析容器关系
      const relationships = this.analyzeContainerRelationships(domAnalysis.containers);

      // 4. 生成发现结果
      const result: DiscoveryResult = {
        containers: domAnalysis.containers,
        relationships,
        hierarchy,
        stats: {
          totalElements: domAnalysis.stats.totalElements,
          analyzedElements: domAnalysis.stats.analyzedElements,
          discoveredContainers: domAnalysis.containers.length,
          processingTime: Date.now() - startTime,
          successRate: domAnalysis.containers.length / Math.max(1, domAnalysis.stats.analyzedElements)
        }
      };

      // 5. 缓存发现结果
      this.cacheDiscoveryResult(result);

      // 6. 自动注册容器（如果启用）
      if (config.enableAutoRegistration) {
        await this.autoRegisterContainers(config.website, result.containers);
      }

      // 6.5 向根容器发送“容器出现”业务事件（如果已注入）
      if (this.rootContainer) {
        for (const container of result.containers) {
          try {
            const eventKey = `event.${container.id}.appear`;
            await this.rootContainer.dispatchContainerEvent(eventKey, {
              containerId: container.id,
              selector: container.selector,
              rect: container.rect,
              website: config.website
            });
          } catch (error) {
            console.warn(
              `EventDrivenContainerDiscovery: 分发 appear 事件失败 (${container.id}):`,
              error
            );
          }
        }
      }

      // 7. 发射完成事件
      await this.eventBus.emit('container:discovery:completed', {
        website: config.website,
        result,
        config,
        timestamp: Date.now()
      });

      console.log(`✅ 容器发现完成: ${result.containers.length} 个容器`);

      return result;

    } catch (error) {
      await this.eventBus.emit('container:discovery:failed', {
        website: config.website,
        error: error instanceof Error ? error.message : String(error),
        config,
        timestamp: Date.now()
      });

      throw error;
    } finally {
      this.isDiscovering = false;
    }
  }

  /**
   * 执行DOM分析
   */
  private async performDOMAnalysis(page: Page, config: ContainerDiscoveryConfig): Promise<{ containers: DiscoveredContainer[]; stats: any }> {
    const startTime = Date.now();
    const containers: DiscoveredContainer[] = [];
    let totalElements = 0;
    let analyzedElements = 0;

    try {
      const analysisResult = await page.evaluate((config) => {
        const containers: any[] = [];
        let totalElements = 0;
        let analyzedElements = 0;

        // 根据发现策略选择不同的分析方法
        switch (config.discoveryStrategy) {
          case 'css-selectors':
            // 使用CSS选择器发现容器
            config.selectors.forEach(selector => {
              try {
                const elements = document.querySelectorAll(selector);
                totalElements += elements.length;
                
                elements.forEach((element, index) => {
                  // 过滤不可见元素
                  const rect = element.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0 && 
                      rect.width < window.innerWidth * 2 && rect.height < window.innerHeight * 2) {
                    
                    analyzedElements++;
                    
                    // 生成容器信息
                    containers.push({
                      id: `${selector.replace(/[^a-zA-Z0-9]/g, '_')}_${index}_${Date.now()}`,
                      selector: selector,
                      name: this.generateContainerName(selector),
                      type: this.inferContainerType(element),
                      priority: this.calculatePriority(element, selector),
                      rect: {
                        x: rect.left,
                        y: rect.top,
                        width: rect.width,
                        height: rect.height
                      },
                      elementCount: 1,
                      attributes: {
                        className: element.className,
                        id: element.id,
                        tagName: element.tagName
                      }
                    });
                  }
                });
              } catch (e) {
                console.warn(`选择器分析失败 ${selector}:`, e.message);
              }
            });
            break;

          case 'dom-walk':
            // 遍历DOM树发现容器
            const walkResult = this.walkDOM(document.body, config.maxDepth || 5);
            containers.push(...walkResult.containers);
            totalElements = walkResult.totalElements;
            analyzedElements = walkResult.analyzedElements;
            break;

          default:
            throw new Error(`不支持的发现策略: ${config.discoveryStrategy}`);
        }

        return {
          containers,
          stats: {
            totalElements,
            analyzedElements
          }
        };
      }, config);

      return analysisResult;

    } catch (error) {
      console.error('DOM分析失败:', error);
      return {
        containers: [],
        stats: {
          totalElements: 0,
          analyzedElements: 0
        }
      };
    }
  }

  /**
   * 遍历DOM树
   */
  private walkDOM(element: Element, maxDepth: number, currentDepth: number = 0): { containers: any[]; totalElements: number; analyzedElements: number } {
    const containers: any[] = [];
    let totalElements = 1;
    let analyzedElements = 0;

    if (currentDepth > maxDepth) {
      return { containers, totalElements, analyzedElements };
    }

    // 检查当前元素是否为容器候选
    const rect = element.getBoundingClientRect();
    if (rect.width > 50 && rect.height > 50 && 
        rect.width < window.innerWidth * 2 && rect.height < window.innerHeight * 2) {
      
      analyzedElements++;
      
      // 生成容器信息
      containers.push({
        id: `${element.tagName.toLowerCase()}_${element.className.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
        selector: this.generateSelector(element),
        name: this.generateElementName(element),
        type: this.inferContainerType(element),
        priority: this.calculatePriority(element, this.generateSelector(element)),
        rect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        },
        elementCount: 1,
        depth: currentDepth,
        attributes: {
          className: element.className,
          id: element.id,
          tagName: element.tagName
        }
      });
    }

    // 递归遍历子元素
    for (let i = 0; i < element.children.length; i++) {
      const child = element.children[i];
      const childResult = this.walkDOM(child, maxDepth, currentDepth + 1);
      
      containers.push(...childResult.containers);
      totalElements += childResult.totalElements;
      analyzedElements += childResult.analyzedElements;
    }

    return { containers, totalElements, analyzedElements };
  }

  /**
   * 生成选择器
   */
  private generateSelector(element: Element): string {
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c);
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    
    return element.tagName.toLowerCase();
  }

  /**
   * 生成元素名称
   */
  private generateElementName(element: Element): string {
    if (element.id) {
      return element.id.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c);
      if (classes.length > 0) {
        return classes[0].replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
    }
    
    return element.tagName.toLowerCase();
  }

  /**
   * 生成容器名称
   */
  private generateContainerName(selector: string): string {
    return selector.replace(/[#.]/g, ' ')
                  .replace(/[^a-zA-Z0-9\s]/g, '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * 推断容器类型
   */
  private inferContainerType(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const className = element.className.toLowerCase();
    const id = element.id.toLowerCase();

    // 根据标签名推断
    if (['main', 'section', 'article', 'aside', 'nav'].includes(tagName)) {
      return tagName;
    }

    // 根据类名或ID推断
    if (className.includes('container') || id.includes('container')) {
      return 'container';
    }
    
    if (className.includes('wrapper') || id.includes('wrapper')) {
      return 'wrapper';
    }
    
    if (className.includes('content') || id.includes('content')) {
      return 'content';
    }
    
    if (className.includes('card') || id.includes('card')) {
      return 'card';
    }
    
    if (className.includes('list') || id.includes('list')) {
      return 'list';
    }
    
    if (className.includes('item') || id.includes('item')) {
      return 'item';
    }

    // 默认类型
    return 'generic';
  }

  /**
   * 计算优先级
   */
  private calculatePriority(element: Element, selector: string): number {
    let priority = 5; // 默认优先级

    // 根据大小调整优先级
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;
    
    if (area > 100000) { // 大容器
      priority += 2;
    } else if (area > 10000) { // 中等容器
      priority += 1;
    } else if (area < 1000) { // 小容器
      priority -= 1;
    }

    // 根据类型调整优先级
    const type = this.inferContainerType(element);
    const priorityMap: { [key: string]: number } = {
      'main': 10,
      'section': 8,
      'article': 7,
      'nav': 6,
      'aside': 6,
      'container': 5,
      'wrapper': 4,
      'content': 4,
      'card': 3,
      'list': 3,
      'item': 2,
      'generic': 1
    };
    
    priority += priorityMap[type] || 0;

    // 根据选择器复杂度调整
    const selectorComplexity = selector.split(/[#.\s]/).length;
    priority += Math.min(selectorComplexity, 5);

    return Math.max(1, Math.min(10, priority)); // 限制在1-10范围内
  }

  /**
   * 构建容器层次结构
   */
  private buildContainerHierarchy(containers: DiscoveredContainer[]): ContainerHierarchy {
    // 简化的层次结构构建
    const hierarchy: ContainerHierarchy = {
      root: 'body',
      levels: {},
      tree: {
        id: 'body',
        children: [],
        level: 0
      }
    };

    // 按优先级排序容器
    const sortedContainers = [...containers].sort((a, b) => b.priority - a.priority);
    
    // 分配到不同层级
    sortedContainers.forEach((container, index) => {
      const level = Math.floor(index / 5); // 每5个容器一个层级
      
      if (!hierarchy.levels[level]) {
        hierarchy.levels[level] = [];
      }
      
      hierarchy.levels[level].push(container.id);
      
      // 添加到树结构
      if (level === 0) {
        hierarchy.tree.children.push({
          id: container.id,
          children: [],
          level: 1
        });
      }
    });

    return hierarchy;
  }

  /**
   * 分析容器关系
   */
  private analyzeContainerRelationships(containers: DiscoveredContainer[]): ContainerRelationship[] {
    const relationships: ContainerRelationship[] = [];
    
    // 简化的关系分析
    for (let i = 0; i < Math.min(containers.length, 10); i++) {
      const parent = containers[i];
      
      // 查找可能的子容器
      for (let j = i + 1; j < Math.min(i + 4, containers.length); j++) {
        const child = containers[j];
        
        // 简单的位置关系检查
        if (this.isContained(parent.rect, child.rect)) {
          relationships.push({
            parent: parent.id,
            child: child.id,
            type: 'contains'
          });
        }
      }
    }
    
    return relationships;
  }

  /**
   * 检查是否包含关系
   */
  private isContained(parentRect: any, childRect: any): boolean {
    return (
      childRect.x >= parentRect.x &&
      childRect.y >= parentRect.y &&
      childRect.x + childRect.width <= parentRect.x + parentRect.width &&
      childRect.y + childRect.height <= parentRect.y + parentRect.height
    );
  }

  /**
   * 缓存发现结果
   */
  private cacheDiscoveryResult(result: DiscoveryResult): void {
    result.containers.forEach(container => {
      this.discoveryCache.set(container.id, container);
    });
    
    this.discoveryHistory.push(result);
    
    // 限制历史记录数量
    if (this.discoveryHistory.length > 10) {
      this.discoveryHistory = this.discoveryHistory.slice(-10);
    }
  }

  /**
   * 自动注册容器
   */
  private async autoRegisterContainers(website: string, containers: DiscoveredContainer[]): Promise<void> {
    for (const container of containers) {
      try {
        const containerInfo: ContainerInfo = {
          id: container.id,
          website,
          name: container.name,
          selector: container.selector,
          priority: container.priority,
          description: `自动发现的${container.name}`,
          type: container.type,
          isActive: true,
          usage: {
            accessCount: 1,
            lastUsed: new Date().toISOString(),
            successRate: 1,
            success: true,
            discoveryMethod: 'event-driven-discovery',
            elementCount: container.elementCount
          },
          discovery: {
            strategy: 'event-driven',
            specificityThreshold: 50,
            uniquenessThreshold: 0.8,
            waitForElements: true,
            timeout: 10000
          },
          metadata: {
            rect: container.rect,
            attributes: container.attributes,
            discoveredAt: new Date().toISOString()
          }
        };

        await this.containerRegistry.registerContainer(website, containerInfo);
      } catch (error) {
        console.error(`容器自动注册失败 ${container.id}:`, error.message);
      }
    }
  }

  /**
   * 注册容器
   */
  public async registerContainer(containerInfo: ContainerInfo): Promise<void> {
    await this.containerRegistry.registerContainer(containerInfo.website, containerInfo);
    
    // 更新缓存
    const discoveredContainer: DiscoveredContainer = {
      id: containerInfo.id,
      selector: containerInfo.selector,
      name: containerInfo.name,
      type: containerInfo.type || 'container',
      priority: containerInfo.priority || 5,
      rect: { x: 0, y: 0, width: 0, height: 0 }, // 简化处理
      elementCount: 1
    };
    
    this.discoveryCache.set(containerInfo.id, discoveredContainer);
  }

  /**
   * 更新容器
   */
  public async updateContainer(containerId: string, updates: Partial<ContainerInfo>): Promise<void> {
    // 这里应该更新容器注册器中的容器信息
    // 简化处理，实际实现需要根据具体需求
    console.log(`更新容器: ${containerId}`, updates);
  }

  /**
   * 获取发现历史
   */
  public getDiscoveryHistory(): DiscoveryResult[] {
    return [...this.discoveryHistory];
  }

  /**
   * 获取缓存的容器
   */
  public getCachedContainers(): Map<string, DiscoveredContainer> {
    return new Map(this.discoveryCache);
  }

  /**
   * 清理缓存
   */
  public clearCache(): void {
    this.discoveryCache.clear();
    this.discoveryHistory = [];
  }

  /**
   * 检查是否正在发现
   */
  public isCurrentlyDiscovering(): boolean {
    return this.isDiscovering;
  }
}

export default EventDrivenContainerDiscovery;
