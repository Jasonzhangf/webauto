/**
 * 微博容器系统统一导出文件
 * 提供所有容器类型的统一访问接口
 */

// 基础容器
export { BaseSelfRefreshingContainer } from './BaseSelfRefreshingContainer.js';
export type {
  ContainerConfig,
  RefreshTrigger,
  ContainerState,
  TaskCompletionCriteria,
  ContainerSharedSpace
} from './BaseSelfRefreshingContainer.js';

// 微博特定容器
export { WeiboPageContainer } from './WeiboPageContainer.js';
export type {
  WeiboPageConfig,
  PageState
} from './WeiboPageContainer.js';

export { WeiboLinkContainer } from './WeiboLinkContainer.js';
export type {
  WeiboLinkConfig,
  LinkData
} from './WeiboLinkContainer.js';

export { WeiboScrollContainer } from './WeiboScrollContainer.js';
export type {
  WeiboScrollConfig,
  ScrollMetrics,
  ScrollResult
} from './WeiboScrollContainer.js';

export { WeiboPaginationContainer } from './WeiboPaginationContainer.js';
export type {
  WeiboPaginationConfig,
  PageMetrics,
  PaginationResult
} from './WeiboPaginationContainer.js';

export { WeiboCommentContainer } from './WeiboCommentContainer.js';
export type {
  WeiboCommentConfig,
  CommentData
} from './WeiboCommentContainer.js';

export { WeiboReplyContainer } from './WeiboReplyContainer.js';
export type {
  WeiboReplyConfig,
  ReplyData
} from './WeiboReplyContainer.js';

// 统一容器注册系统
export { UnifiedContainerRegistry, unifiedContainerRegistry } from './UnifiedContainerRegistry.js';
export type {
  ContainerInfo,
  ContainerUsageStats,
  ContainerDiscoveryConfig,
  ContainerLibrary,
  DiscoveryResult,
  ContainerHierarchy,
  ContainerRelationship,
  DiscoveryStats,
  UnifiedContainerRegistryOptions
} from './UnifiedContainerRegistry.js';

// 保持向后兼容的容器注册器
class ContainerRegistry {
  private static instance: ContainerRegistry;
  private containerTypes: Map<string, any> = new Map();

  private constructor() {
    this.registerDefaultContainers();
  }

  public static getInstance(): ContainerRegistry {
    if (!ContainerRegistry.instance) {
      ContainerRegistry.instance = new ContainerRegistry();
    }
    return ContainerRegistry.instance;
  }

  private registerDefaultContainers(): void {
    // 注册内置容器类型到统一注册系统
    unifiedContainerRegistry.registerContainerType('BaseSelfRefreshingContainer', BaseSelfRefreshingContainer);
    unifiedContainerRegistry.registerContainerType('WeiboPageContainer', WeiboPageContainer);
    unifiedContainerRegistry.registerContainerType('WeiboLinkContainer', WeiboLinkContainer);
    unifiedContainerRegistry.registerContainerType('WeiboScrollContainer', WeiboScrollContainer);
    unifiedContainerRegistry.registerContainerType('WeiboPaginationContainer', WeiboPaginationContainer);
    unifiedContainerRegistry.registerContainerType('WeiboCommentContainer', WeiboCommentContainer);
    unifiedContainerRegistry.registerContainerType('WeiboReplyContainer', WeiboReplyContainer);
  }

  public registerContainer(type: string, containerClass: any): void {
    unifiedContainerRegistry.registerContainerType(type, containerClass);
  }

  public getContainer(type: string): any {
    return unifiedContainerRegistry.getContainerType(type);
  }

  public hasContainer(type: string): boolean {
    return unifiedContainerRegistry.hasContainerType(type);
  }

  public getAllContainerTypes(): string[] {
    return unifiedContainerRegistry.getAllContainerTypes();
  }

  public createContainer(type: string, config: any): any {
    return unifiedContainerRegistry.createContainer(type, config);
  }

  public getContainerInfo(): Array<{
    type: string;
    description: string;
    configInterface?: string;
  }> {
    return unifiedContainerRegistry.getContainerInfo();
  }
}

// 导出单例实例
export const containerRegistry = ContainerRegistry.getInstance();

// 便利函数
export function createContainer(type: string, config: any): any {
  return containerRegistry.createContainer(type, config);
}

export function getContainerTypes(): string[] {
  return containerRegistry.getAllContainerTypes();
}

export function hasContainerType(type: string): boolean {
  return containerRegistry.hasContainer(type);
}

// 容器系统版本信息
export const CONTAINER_SYSTEM_VERSION = '1.0.0';
export const CONTAINER_SYSTEM_INFO = {
  version: CONTAINER_SYSTEM_VERSION,
  description: '微博容器系统 - 基于自刷新架构的动态内容处理系统',
  features: [
    '多触发源刷新机制',
    '动态操作注册和发现',
    '任务驱动的生命周期管理',
    '嵌套容器支持',
    '智能错误恢复',
    '性能监控和统计'
  ],
  supportedContainers: [
    '页面管理容器',
    '链接提取容器',
    '滚动控制容器',
    '分页控制容器',
    '评论处理容器',
    '回复处理容器'
  ],
  author: 'WebAuto Team',
  created: '2024-01-01',
  updated: new Date().toISOString().split('T')[0]
};

// 默认导出
export default {
  // 基础容器
  BaseSelfRefreshingContainer,

  // 微博容器
  WeiboPageContainer,
  WeiboLinkContainer,
  WeiboScrollContainer,
  WeiboPaginationContainer,
  WeiboCommentContainer,
  WeiboReplyContainer,

  // 新的统一容器注册系统
  UnifiedContainerRegistry,
  unifiedContainerRegistry,

  // 向后兼容的工具类
  ContainerRegistry,
  containerRegistry,

  // 便利函数
  createContainer,
  getContainerTypes,
  hasContainerType,

  // 系统信息
  CONTAINER_SYSTEM_VERSION,
  CONTAINER_SYSTEM_INFO
};