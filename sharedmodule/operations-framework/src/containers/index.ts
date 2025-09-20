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
  OperationResult,
  ContainerSharedSpace,
  ContainerStats
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
  LinkData,
  LinkExtractionResult
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
  CommentData,
  CommentExtractionResult
} from './WeiboCommentContainer.js';

export { WeiboReplyContainer } from './WeiboReplyContainer.js';
export type {
  WeiboReplyConfig,
  ReplyData
} from './WeiboReplyContainer.js';

// 容器注册器
export class ContainerRegistry {
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
    // 注册内置容器类型
    this.registerContainer('BaseSelfRefreshingContainer', BaseSelfRefreshingContainer);
    this.registerContainer('WeiboPageContainer', WeiboPageContainer);
    this.registerContainer('WeiboLinkContainer', WeiboLinkContainer);
    this.registerContainer('WeiboScrollContainer', WeiboScrollContainer);
    this.registerContainer('WeiboPaginationContainer', WeiboPaginationContainer);
    this.registerContainer('WeiboCommentContainer', WeiboCommentContainer);
    this.registerContainer('WeiboReplyContainer', WeiboReplyContainer);
  }

  public registerContainer(type: string, containerClass: any): void {
    this.containerTypes.set(type, containerClass);
    console.log(`📦 容器类型已注册: ${type}`);
  }

  public getContainer(type: string): any {
    return this.containerTypes.get(type);
  }

  public hasContainer(type: string): boolean {
    return this.containerTypes.has(type);
  }

  public getAllContainerTypes(): string[] {
    return Array.from(this.containerTypes.keys());
  }

  public createContainer(type: string, config: any): any {
    const ContainerClass = this.getContainer(type);
    if (!ContainerClass) {
      throw new Error(`未知的容器类型: ${type}`);
    }
    return new ContainerClass(config);
  }

  public getContainerInfo(): Array<{
    type: string;
    description: string;
    configInterface?: string;
  }> {
    return [
      {
        type: 'BaseSelfRefreshingContainer',
        description: '自刷新容器基类，提供多触发源刷新机制',
        configInterface: 'ContainerConfig'
      },
      {
        type: 'WeiboPageContainer',
        description: '微博页面管理容器，负责整体页面状态和容器协调',
        configInterface: 'WeiboPageConfig'
      },
      {
        type: 'WeiboLinkContainer',
        description: '微博链接提取容器，专门处理链接发现和提取',
        configInterface: 'WeiboLinkConfig'
      },
      {
        type: 'WeiboScrollContainer',
        description: '微博滚动控制容器，专门处理页面滚动和无限加载',
        configInterface: 'WeiboScrollConfig'
      },
      {
        type: 'WeiboPaginationContainer',
        description: '微博分页控制容器，专门处理分页操作和多页内容加载',
        configInterface: 'WeiboPaginationConfig'
      },
      {
        type: 'WeiboCommentContainer',
        description: '微博评论容器，专门处理评论提取和动态加载',
        configInterface: 'WeiboCommentConfig'
      },
      {
        type: 'WeiboReplyContainer',
        description: '微博回复容器，专门处理评论下的回复内容',
        configInterface: 'WeiboReplyConfig'
      }
    ];
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

  // 工具类
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