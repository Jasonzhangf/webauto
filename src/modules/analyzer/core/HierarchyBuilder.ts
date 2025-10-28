/**
 * 层次结构构建器
 * 将发现的容器构建成层次结构
 */

import { Page } from 'playwright';
import { 
  DiscoveredContainer, 
  ContainerHierarchy, 
  HierarchyNode, 
  ContainerType,
  Position
} from '../types/index.js';

export class HierarchyBuilder {
  private nodeMap: Map<string, HierarchyNode> = new Map();
  private rootNodes: Set<string> = new Set();

  /**
   * 构建容器层次结构
   */
  async buildHierarchy(containers: DiscoveredContainer[], page: Page): Promise<ContainerHierarchy> {
    console.log('🏗️ 开始构建容器层次结构...');
    
    this.nodeMap.clear();
    this.rootNodes.clear();

    // 创建所有容器节点
    for (const container of containers) {
      const node: HierarchyNode = {
        container,
        children: [],
        parent: null,
        depth: 0,
        siblings: []
      };
      this.nodeMap.set(container.id, node);
    }

    // 确定父子关系
    await this.determineParentChildRelationships();

    // 计算深度和兄弟关系
    this.calculateDepthsAndSiblings();

    // 识别根节点
    this.identifyRootNodes();

    // 构建最终层次结构
    const hierarchy = this.buildFinalHierarchy();

    console.log(`🎉 层次结构构建完成，最大深度: ${hierarchy.maxDepth}, 容器总数: ${hierarchy.totalContainers}`);
    return hierarchy;
  }

  /**
   * 兼容性方法 - 用于Weibo组件
   */
  async build(page: Page, containers: DiscoveredContainer[]): Promise<ContainerHierarchy> {
    return this.buildHierarchy(containers, page);
  }

  /**
   * 确定父子关系
   */
  private async determineParentChildRelationships(): Promise<void> {
    const nodeArray = Array.from(this.nodeMap.entries());
    
    for (const [containerId, node] of nodeArray) {
      for (const [childId, childNode] of nodeArray) {
        if (this.isParentOf(node, childNode)) {
          node.children.push(childId);
          childNode.parent = containerId;
        }
      }
    }
  }

  /**
   * 计算深度和兄弟关系
   */
  private calculateDepthsAndSiblings(): void {
    // 为每个节点计算深度
    for (const [containerId, node] of Array.from(this.nodeMap.entries())) {
      this.calculateNodeDepth(containerId);
    }

    // 确定兄弟关系
    for (const [parentId, parentNode] of Array.from(this.nodeMap.entries())) {
      const childIds = parentNode.children;
      for (let i = 0; i < childIds.length; i++) {
        const childId = childIds[i];
        const childNode = this.nodeMap.get(childId);
        if (childNode) {
          childNode.siblings = childIds.filter(id => id !== childId);
        }
      }
    }
  }

  /**
   * 计算单个节点深度
   */
  private calculateNodeDepth(containerId: string, visited: Set<string> = new Set()): number {
    if (visited.has(containerId)) {
      return 0; // 避免循环引用
    }
    visited.add(containerId);

    const node = this.nodeMap.get(containerId);
    if (!node) {
      return 0;
    }

    if (node.parent === null) {
      node.depth = 0;
      return 0;
    }

    const parentDepth = this.calculateNodeDepth(node.parent, visited);
    node.depth = parentDepth + 1;
    return node.depth;
  }

  /**
   * 识别根节点
   */
  private identifyRootNodes(): void {
    for (const [containerId, node] of Array.from(this.nodeMap.entries())) {
      if (node.parent === null) {
        this.rootNodes.add(containerId);
      }
    }
  }

  /**
   * 构建最终层次结构
   */
  private buildFinalHierarchy(): ContainerHierarchy {
    const hierarchy: ContainerHierarchy = {
      containers: [],
      maxDepth: 0,
      totalContainers: this.nodeMap.size
    };

    // 按深度排序所有节点
    const sortedNodes = Array.from(this.nodeMap.values()).sort((a, b) => a.depth - b.depth);
    
    // 计算最大深度
    hierarchy.maxDepth = Math.max(...sortedNodes.map(node => node.depth), 0);

    // 转换为适合输出的格式
    for (const node of sortedNodes) {
      hierarchy.containers.push({
        ...node.container,
        depth: node.depth,
        parent: node.parent,
        children: node.children,
        siblings: node.siblings
      });
    }

    return hierarchy;
  }

  /**
   * 判断是否为父子关系
   */
  private isParentOf(parent: HierarchyNode, child: HierarchyNode): boolean {
    const parentRect = parent.container.rect;
    const childRect = child.container.rect;

    // 子元素必须在父元素内部
    const isInside = 
      childRect.x >= parentRect.x &&
      childRect.y >= parentRect.y &&
      childRect.x + childRect.width <= parentRect.x + parentRect.width &&
      childRect.y + childRect.height <= parentRect.y + parentRect.height;

    if (!isInside) {
      return false;
    }

    // 检查是否有更合适的父元素
    for (const [potentialParentId, potentialParent] of Array.from(this.nodeMap.entries())) {
      if (potentialParentId === parent.container.id) {
        continue;
      }

      const potentialRect = potentialParent.container.rect;
      const isCloser = 
        childRect.x >= potentialRect.x &&
        childRect.y >= potentialRect.y &&
        childRect.x + childRect.width <= potentialRect.x + potentialRect.width &&
        childRect.y + childRect.height <= potentialRect.y + potentialRect.height &&
        
        potentialRect.width < parentRect.width &&
        potentialRect.height < parentRect.height;

      if (isCloser) {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取层次统计信息
   */
  getHierarchyStats(): {
    totalNodes: number;
    maxDepth: number;
    averageDepth: number;
    rootNodesCount: number;
  } {
    if (this.nodeMap.size === 0) {
      return {
        totalNodes: 0,
        maxDepth: 0,
        averageDepth: 0,
        rootNodesCount: 0
      };
    }

    const depths = Array.from(this.nodeMap.values()).map(node => node.depth);
    const maxDepth = Math.max(...depths);
    const averageDepth = depths.reduce((sum, depth) => sum + depth, 0) / depths.length;

    return {
      totalNodes: this.nodeMap.size,
      maxDepth,
      averageDepth,
      rootNodesCount: this.rootNodes.size
    };
  }

  /**
   * 清理构建器状态
   */
  clear(): void {
    this.nodeMap.clear();
    this.rootNodes.clear();
  }
}
