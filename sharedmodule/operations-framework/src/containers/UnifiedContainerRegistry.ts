/**
 * 统一容器注册系统
 * 整合容器类型管理、实例管理、文件库管理和事件驱动支持
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { EventBus } from '../event-driven/EventBus.js';

// ==================== 接口定义 ====================

export interface ContainerInfo {
  id: string;
  website: string;
  name: string;
  selector: string;
  description?: string;
  priority?: number;
  specificity?: number;
  type?: string;
  isActive?: boolean;
  usage?: ContainerUsageStats;
  discovery?: ContainerDiscoveryConfig;
  metadata?: any;
}

export interface ContainerUsageStats {
  accessCount: number;
  lastUsed: string;
  successRate: number;
  success: boolean;
  discoveryMethod?: string;
  elementCount?: number;
  lastAccessed?: string;
}

export interface ContainerDiscoveryConfig {
  strategy: string;
  specificityThreshold?: number;
  uniquenessThreshold?: number;
  waitForElements?: boolean;
  timeout?: number;
}

export interface ContainerLibrary {
  [website: string]: {
    containers: Map<string, ContainerInfo>;
    containerCount: number;
    metadata: any;
  };
}

export interface DiscoveryResult {
  containers: ContainerInfo[];
  hierarchy: ContainerHierarchy;
  stats: DiscoveryStats;
}

export interface ContainerHierarchy {
  root: string;
  children: { [parentId: string]: string[] };
  relationships: ContainerRelationship[];
}

export interface ContainerRelationship {
  parent: string;
  child: string;
  type: 'contains' | 'sibling' | 'adjacent';
}

export interface DiscoveryStats {
  totalContainers: number;
  discoveredContainers: number;
  successRate: number;
  discoveryTime: number;
  currentPage: string;
  pageTitle: string;
}

export interface UnifiedContainerRegistryOptions {
  libraryPath?: string;
  cacheTimeout?: number;
  enableFileLibrary?: boolean;
  enableEventBus?: boolean;
}

// ==================== 容器类型管理器实现 ====================

class ContainerTypeManager {
  private containerTypes: Map<string, any> = new Map();

  registerContainerType(type: string, containerClass: any): void {
    this.containerTypes.set(type, containerClass);
    console.log(`📦 容器类型已注册: ${type}`);
  }

  getContainerType(type: string): any {
    return this.containerTypes.get(type);
  }

  hasContainerType(type: string): boolean {
    return this.containerTypes.has(type);
  }

  getAllContainerTypes(): string[] {
    return Array.from(this.containerTypes.keys());
  }

  createContainer(type: string, config: any): any {
    const ContainerClass = this.getContainerType(type);
    if (!ContainerClass) {
      throw new Error(`未知的容器类型: ${type}`);
    }
    return new ContainerClass(config);
  }

  registerDefaultContainers(containers: { [key: string]: any }): void {
    Object.entries(containers).forEach(([type, containerClass]) => {
      this.registerContainerType(type, containerClass);
    });
  }
}

// ==================== 容器实例管理器实现 ====================

class ContainerInstanceManager {
  private containerInstances: Map<string, any> = new Map();

  registerContainerInstance(id: string, container: any): void {
    this.containerInstances.set(id, container);
  }

  getContainerInstance(id: string): any {
    return this.containerInstances.get(id);
  }

  hasContainerInstance(id: string): boolean {
    return this.containerInstances.has(id);
  }

  getAllContainerInstances(): Map<string, any> {
    return new Map(this.containerInstances);
  }

  removeContainerInstance(id: string): void {
    this.containerInstances.delete(id);
  }

  getContainerInstancesByType(type: string): any[] {
    const instances: any[] = [];
    for (const [id, container] of this.containerInstances) {
      if (container.constructor.name === type || container.type === type) {
        instances.push(container);
      }
    }
    return instances;
  }

  clearAllInstances(): void {
    this.containerInstances.clear();
  }
}

// ==================== 容器库管理器实现 ====================

class ContainerLibraryManager {
  private containerLibrary: ContainerLibrary = {};
  private cache: Map<string, ContainerInfo> = new Map();
  private lastRefresh: number = 0;
  private cacheTimeout: number;
  private libraryPath: string;
  private enableFileLibrary: boolean;

  constructor(options: { libraryPath?: string; cacheTimeout?: number; enableFileLibrary?: boolean }) {
    const preferred = options.libraryPath || './container-library';
    const alt = './containers';
    try {
      const p = require('path').join(process.cwd(), preferred);
      const fs = require('fs');
      const altp = require('path').join(process.cwd(), alt);
      this.libraryPath = fs.existsSync(p) ? preferred : (fs.existsSync(altp) ? alt : preferred);
    } catch {
      this.libraryPath = preferred;
    }
    this.cacheTimeout = options.cacheTimeout || 30000; // 30秒缓存
    this.enableFileLibrary = options.enableFileLibrary !== false;
    
    if (this.enableFileLibrary) {
      this.initializeLibrary();
    }
  }

  /**
   * 初始化容器库
   */
  private async initializeLibrary(): Promise<void> {
    try {
      await this.loadContainerLibrary();
      console.log('✅ 容器库管理器初始化完成');
    } catch (error) {
      console.error('❌ 容器库管理器初始化失败:', error.message);
    }
  }

  /**
   * 加载容器库
   */
  async loadContainerLibrary(): Promise<void> {
    if (!this.enableFileLibrary) return;

    const globalIndexPath = path.join(this.libraryPath, 'global-index.json');

    if (!fs.existsSync(globalIndexPath)) {
      console.warn('⚠️ 容器库索引文件不存在，创建空库');
      this.containerLibrary = {};
      return;
    }

    try {
      const globalIndex = JSON.parse(fs.readFileSync(globalIndexPath, 'utf8'));

      for (const [website, websiteInfo] of Object.entries(globalIndex.websites)) {
        const indexPath = path.join(this.libraryPath, website, 'index.json');
        
        if (fs.existsSync(indexPath)) {
          const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
          const websiteContainers = new Map<string, ContainerInfo>();

          for (const container of indexData.containers) {
            const containerPath = path.join(this.libraryPath, website, container.fileName);
            if (fs.existsSync(containerPath)) {
              const containerData = JSON.parse(fs.readFileSync(containerPath, 'utf8'));
              websiteContainers.set(container.id, containerData);
            }
          }

          this.containerLibrary[website] = {
            containers: websiteContainers,
            containerCount: websiteContainers.size,
            metadata: {
              loadedAt: new Date().toISOString(),
              source: 'file-based-library'
            }
          };
        }
      }

      console.log(`🔄 容器库加载完成: ${Object.keys(this.containerLibrary).length} 个网站`);
    } catch (error) {
      console.error('❌ 容器库加载失败:', error.message);
      throw error;
    }
  }

  /**
   * 刷新缓存
   */
  async refreshCache(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefresh < this.cacheTimeout) {
      return;
    }

    this.cache.clear();
    this.lastRefresh = now;

    try {
      for (const [website, websiteData] of Object.entries(this.containerLibrary)) {
        for (const [containerId, containerInfo] of websiteData.containers) {
          this.cache.set(`${website}:${containerId}`, containerInfo);
        }
      }

      console.log('🔄 容器库缓存已刷新');
    } catch (error) {
      console.error('❌ 刷新缓存失败:', error.message);
    }
  }

  /**
   * 注册容器
   */
  async registerContainer(website: string, containerInfo: ContainerInfo): Promise<void> {
    if (!this.enableFileLibrary) return;

    try {
      // 确保网站存在
      if (!this.containerLibrary[website]) {
        this.containerLibrary[website] = {
          containers: new Map(),
          containerCount: 0,
          metadata: {
            createdAt: new Date().toISOString(),
            website
          }
        };
      }

      // 注册容器
      this.containerLibrary[website].containers.set(containerInfo.id, containerInfo);
      this.containerLibrary[website].containerCount = this.containerLibrary[website].containers.size;

      // 更新缓存
      this.cache.set(`${website}:${containerInfo.id}`, containerInfo);

      // 保存到文件系统
      await this.saveContainerToFile(website, containerInfo);

      console.log(`✅ 容器注册成功: ${website}:${containerInfo.id}`);
    } catch (error) {
      console.error(`❌ 容器注册失败 ${website}:${containerInfo.id}:`, error.message);
      throw error;
    }
  }

  /**
   * 保存容器到文件系统
   */
  private async saveContainerToFile(website: string, containerInfo: ContainerInfo): Promise<void> {
    if (!this.enableFileLibrary) return;

    try {
      // 创建网站目录
      const websiteDir = path.join(this.libraryPath, website);
      if (!fs.existsSync(websiteDir)) {
        fs.mkdirSync(websiteDir, { recursive: true });
      }

      // 生成文件名
      const fileName = `${containerInfo.id}_${this.generateSelectorHash(containerInfo.selector)}_${containerInfo.type || 'container'}.json`;
      const filePath = path.join(websiteDir, fileName);

      // 保存容器数据
      const containerData = {
        ...containerInfo,
        registeredAt: new Date().toISOString(),
        metadata: {
          ...containerInfo.metadata,
          generatedAt: new Date().toISOString(),
          fileVersion: '1.0.0'
        }
      };

      fs.writeFileSync(filePath, JSON.stringify(containerData, null, 2));

      // 更新索引
      await this.updateIndex(website, containerInfo.id, fileName, containerInfo.selector);

      console.log(`💾 容器文件保存成功: ${filePath}`);
    } catch (error) {
      console.error(`❌ 容器文件保存失败:`, error.message);
      throw error;
    }
  }

  /**
   * 更新索引文件
   */
  private async updateIndex(website: string, containerId: string, fileName: string, selector: string): Promise<void> {
    if (!this.enableFileLibrary) return;

    try {
      const websiteDir = path.join(this.libraryPath, website);
      const indexPath = path.join(websiteDir, 'index.json');

      let indexData: any = {
        website,
        generatedAt: new Date().toISOString(),
        containerCount: 0,
        containers: []
      };

      // 读取现有索引
      if (fs.existsSync(indexPath)) {
        indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      }

      // 更新容器列表
      const existingIndex = indexData.containers.findIndex((c: any) => c.id === containerId);
      const containerEntry = { id: containerId, fileName, selector };

      if (existingIndex >= 0) {
        indexData.containers[existingIndex] = containerEntry;
      } else {
        indexData.containers.push(containerEntry);
      }

      indexData.containerCount = indexData.containers.length;

      // 更新搜索索引
      indexData.searchIndex = this.buildSearchIndex(indexData.containers);

      // 保存索引
      fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));

      // 更新全局索引
      await this.updateGlobalIndex(website, indexData.containerCount);

      console.log(`📝 索引文件更新成功: ${indexPath}`);
    } catch (error) {
      console.error(`❌ 索引文件更新失败:`, error.message);
      throw error;
    }
  }

  /**
   * 构建搜索索引
   */
  private buildSearchIndex(containers: any[]): any {
    const searchIndex: any = {
      byType: {},
      byPriority: {},
      byName: {}
    };

    containers.forEach(container => {
      // 按类型索引
      const type = 'container'; // 简化处理
      if (!searchIndex.byType[type]) {
        searchIndex.byType[type] = [];
      }
      searchIndex.byType[type].push(container.id);

      // 按优先级索引
      const priority = 999; // 简化处理
      if (!searchIndex.byPriority[priority]) {
        searchIndex.byPriority[priority] = [];
      }
      searchIndex.byPriority[priority].push(container.id);

      // 按名称索引
      searchIndex.byName[container.id] = container.id;
    });

    return searchIndex;
  }

  /**
   * 更新全局索引
   */
  private async updateGlobalIndex(website: string, containerCount: number): Promise<void> {
    if (!this.enableFileLibrary) return;

    try {
      const globalIndexPath = path.join(this.libraryPath, 'global-index.json');
      let globalIndex: any = {
        generatedAt: new Date().toISOString(),
        websites: {},
        statistics: {
          totalContainers: 0,
          totalWebsites: 0
        }
      };

      // 读取现有全局索引
      if (fs.existsSync(globalIndexPath)) {
        globalIndex = JSON.parse(fs.readFileSync(globalIndexPath, 'utf8'));
      }

      // 更新网站信息
      globalIndex.websites[website] = {
        containerCount,
        path: `./container-library/${website}`,
        lastUpdated: new Date().toISOString()
      };

      // 更新统计信息
      globalIndex.statistics.totalWebsites = Object.keys(globalIndex.websites).length;
      globalIndex.statistics.totalContainers = Object.values(globalIndex.websites)
        .reduce((sum: number, website: any) => sum + website.containerCount, 0);

      // 保存全局索引
      fs.writeFileSync(globalIndexPath, JSON.stringify(globalIndex, null, 2));

      console.log(`🌍 全局索引更新成功: ${globalIndexPath}`);
    } catch (error) {
      console.error(`❌ 全局索引更新失败:`, error.message);
    }
  }

  /**
   * 查找容器
   */
  async findContainer(website: string, containerId: string): Promise<ContainerInfo | null> {
    await this.refreshCache();

    // 首先从缓存查找
    const cacheKey = `${website}:${containerId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null;
    }

    // 从库中查找
    const websiteData = this.containerLibrary[website];
    if (websiteData) {
      const container = websiteData.containers.get(containerId);
      if (container) {
        this.cache.set(cacheKey, container);
        return container;
      }
    }

    return null;
  }

  /**
   * 按选择器查找容器
   */
  async findBySelector(website: string, selector: string): Promise<ContainerInfo | null> {
    await this.refreshCache();

    // 从库中查找
    const websiteData = this.containerLibrary[website];
    if (websiteData) {
      for (const [containerId, containerInfo] of websiteData.containers) {
        if (containerInfo.selector === selector) {
          return containerInfo;
        }
      }
    }

    return null;
  }

  /**
   * 获取网站所有容器
   */
  async getWebsiteContainers(website: string): Promise<Map<string, ContainerInfo>> {
    await this.refreshCache();
    return this.containerLibrary[website]?.containers || new Map();
  }

  /**
   * 获取容器统计信息
   */
  async getStatistics(): Promise<any> {
    await this.refreshCache();

    const stats: any = {
      totalContainers: 0,
      totalWebsites: 0,
      typeDistribution: {},
      websiteDistribution: {}
    };

    for (const [website, websiteData] of Object.entries(this.containerLibrary)) {
      stats.totalWebsites++;
      stats.totalContainers += websiteData.containerCount;
      stats.websiteDistribution[website] = websiteData.containerCount;

      for (const [containerId, containerInfo] of websiteData.containers) {
        const type = containerInfo.type || 'container';
        stats.typeDistribution[type] = (stats.typeDistribution[type] || 0) + 1;
      }
    }

    return stats;
  }

  async updateContainerUsage(
    website: string,
    containerId: string,
    usageStats: Partial<ContainerUsageStats>
  ): Promise<void> {
    try {
      const container = await this.findContainer(website, containerId);
      if (container) {
        container.usage = {
          accessCount: 0,
          lastUsed: new Date().toISOString(),
          successRate: 0,
          success: false,
          ...container.usage,
          ...usageStats,
          lastUsed: new Date().toISOString()
        };

        // 更新库和缓存
        if (this.containerLibrary[website]) {
          this.containerLibrary[website].containers.set(containerId, container);
          this.cache.set(`${website}:${containerId}`, container);
        }

        // 保存到文件
        if (this.enableFileLibrary) {
          await this.saveContainerToFile(website, container);
        }

        console.log(`📊 容器使用统计更新: ${website}:${containerId}`);
      }
    } catch (error: any) {
      console.error(`❌ 容器使用统计更新失败 ${website}:${containerId}:`, error.message);
    }
  }

  /**
   * 生成选择器哈希
   */
  private generateSelectorHash(selector: string): string {
    let hash = 0;
    for (let i = 0; i < selector.length; i++) {
      const char = selector.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }
}

// ==================== 事件驱动支持实现 ====================

class EventDrivenSupport extends EventEmitter {
  private eventBus: EventBus;

  constructor(enableEventBus: boolean = true) {
    super();
    this.eventBus = new EventBus();
  }

  async emit(event: string, data: any): Promise<boolean> {
    // 发送到内部事件总线
    const localResult = super.emit(event, data);
    
    // 发送到全局事件总线
    await this.eventBus.emit(event, data);
    
    return localResult;
  }

  on(event: string, handler: (...args: any[]) => void): this {
    super.on(event, handler);
    return this;
  }

  off(event: string, handler: (...args: any[]) => void): this {
    super.off(event, handler);
    return this;
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }
}

// ==================== 统一容器注册中心 ====================

export class UnifiedContainerRegistry {
  private typeManager: ContainerTypeManager;
  private instanceManager: ContainerInstanceManager;
  private libraryManager: ContainerLibraryManager;
  private eventSupport: EventDrivenSupport;
  private static instance: UnifiedContainerRegistry;

  private constructor(private options: UnifiedContainerRegistryOptions = {}) {
    this.typeManager = new ContainerTypeManager();
    this.instanceManager = new ContainerInstanceManager();
    this.libraryManager = new ContainerLibraryManager({
      libraryPath: options.libraryPath,
      cacheTimeout: options.cacheTimeout,
      enableFileLibrary: options.enableFileLibrary
    });
    this.eventSupport = new EventDrivenSupport(options.enableEventBus);
  }

  public static getInstance(options?: UnifiedContainerRegistryOptions): UnifiedContainerRegistry {
    if (!UnifiedContainerRegistry.instance) {
      UnifiedContainerRegistry.instance = new UnifiedContainerRegistry(options);
    }
    return UnifiedContainerRegistry.instance;
  }

  // ==================== 容器类型管理方法 ====================

  registerContainerType(type: string, containerClass: any): void {
    this.typeManager.registerContainerType(type, containerClass);
  }

  getContainerType(type: string): any {
    return this.typeManager.getContainerType(type);
  }

  hasContainerType(type: string): boolean {
    return this.typeManager.hasContainerType(type);
  }

  getAllContainerTypes(): string[] {
    return this.typeManager.getAllContainerTypes();
  }

  createContainer(type: string, config: any): any {
    const container = this.typeManager.createContainer(type, config);
    if (container) {
      // 注册容器实例
      if (container.config && container.config.id) {
        this.instanceManager.registerContainerInstance(container.config.id, container);
      }
      // 发出容器创建事件
      this.eventSupport.emit('container:created', {
        containerId: container.config?.id,
        containerType: type,
        timestamp: Date.now()
      });
    }
    return container;
  }

  registerDefaultContainers(containers: { [key: string]: any }): void {
    this.typeManager.registerDefaultContainers(containers);
  }

  // ==================== 容器实例管理方法 ====================

  registerContainerInstance(id: string, container: any): void {
    this.instanceManager.registerContainerInstance(id, container);
  }

  getContainerInstance(id: string): any {
    return this.instanceManager.getContainerInstance(id);
  }

  hasContainerInstance(id: string): boolean {
    return this.instanceManager.hasContainerInstance(id);
  }

  getAllContainerInstances(): Map<string, any> {
    return this.instanceManager.getAllContainerInstances();
  }

  removeContainerInstance(id: string): void {
    this.instanceManager.removeContainerInstance(id);
  }

  getContainerInstancesByType(type: string): any[] {
    return this.instanceManager.getContainerInstancesByType(type);
  }

  // ==================== 容器库管理方法 ====================

  async loadContainerLibrary(path?: string): Promise<void> {
    if (path) {
      // 重新创建库管理器以使用新路径
      this.libraryManager = new ContainerLibraryManager({
        libraryPath: path,
        cacheTimeout: this.options.cacheTimeout,
        enableFileLibrary: this.options.enableFileLibrary
      });
    }
    await this.libraryManager.loadContainerLibrary();
  }

  async saveContainer(containerInfo: ContainerInfo): Promise<void> {
    await this.libraryManager.registerContainer(containerInfo.website, containerInfo);
  }

  async findContainer(website: string, containerId: string): Promise<ContainerInfo | null> {
    return await this.libraryManager.findContainer(website, containerId);
  }

  async findBySelector(website: string, selector: string): Promise<ContainerInfo | null> {
    return await this.libraryManager.findBySelector(website, selector);
  }

  async getWebsiteContainers(website: string): Promise<Map<string, ContainerInfo>> {
    return await this.libraryManager.getWebsiteContainers(website);
  }

  async updateContainerUsage(
    website: string,
    containerId: string,
    usageStats: Partial<ContainerUsageStats>
  ): Promise<void> {
    await this.libraryManager.updateContainerUsage(website, containerId, usageStats);
  }

  async getLibraryStatistics(): Promise<any> {
    return await this.libraryManager.getStatistics();
  }

  // ==================== 事件驱动支持方法 ====================

  async emitEvent(event: string, data: any): Promise<void> {
    await this.eventSupport.emit(event, data);
  }

  onEvent(event: string, handler: Function): void {
    this.eventSupport.on(event, handler);
  }

  offEvent(event: string, handler: Function): void {
    this.eventSupport.off(event, handler);
  }

  getEventBus(): EventBus {
    return this.eventSupport.getEventBus();
  }

  // ==================== 便利方法 ====================

  /**
   * 获取容器信息
   */
  getContainerInfo(): Array<{
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

  /**
   * 清理所有资源
   */
  cleanup(): void {
    this.instanceManager.clearAllInstances();
    console.log('🔄 容器注册中心已清理');
  }
}

// ==================== 导出 ====================

export const unifiedContainerRegistry = UnifiedContainerRegistry.getInstance();

export default UnifiedContainerRegistry;
