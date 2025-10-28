/**
 * 容器发现管理器
 * 协调多种发现策略，管理容器发现流程
 */

import { Page } from 'playwright';
import { 
  DiscoveryStrategy, 
  DiscoveredContainer, 
  ContainerDiscoveryResult, 
  ContainerHierarchy,
  DiscoveryStats,
  ContainerType,
  ContainerCapability
} from '../types/index';
import { DOMWalkStrategy } from '../strategies/DOMWalkStrategy';
import { HierarchyBuilder } from './HierarchyBuilder';
import { CapabilityEvaluator } from './CapabilityEvaluator';

export class ContainerDiscoveryManager {
  private strategies: DiscoveryStrategy[] = [];
  private hierarchyBuilder: HierarchyBuilder;
  private capabilityEvaluator: CapabilityEvaluator;
  private cache: Map<string, ContainerDiscoveryResult> = new Map();
  private cacheTimeout: number = 300000; // 5分钟缓存
  private performanceMetrics: Map<string, number> = new Map();

  constructor() {
    this.hierarchyBuilder = new HierarchyBuilder();
    this.capabilityEvaluator = new CapabilityEvaluator();
    this.initializeStrategies();
  }

  /**
   * 初始化发现策略
   */
  private initializeStrategies(): void {
    this.strategies = [
      // 按优先级排序的策略
      new DOMWalkStrategy(),
      // new CSSSelectorStrategy(),
      // new AIAssistedStrategy(),
      // new PatternMatchingStrategy()
    ];

    // 按优先级排序
    this.strategies.sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * 发现页面容器
   */
  async discoverContainers(page: Page, url: string): Promise<ContainerDiscoveryResult> {
    console.log('🔍 开始容器发现流程...');
    const startTime = Date.now();

    // 检查缓存
    const cached = this.getCachedResult(url);
    if (cached) {
      console.log('📦 使用缓存结果');
      return cached;
    }

    // 页面状态检查
    const pageReady = await this.ensurePageReady(page);
    if (!pageReady) {
      throw new Error('页面未准备好进行容器发现');
    }

    // 执行多策略发现
    const allContainers: DiscoveredContainer[] = [];
    const strategyResults: Map<string, DiscoveredContainer[]> = new Map();

    for (const strategy of this.strategies) {
      const strategyStartTime = Date.now();
      console.log(`🔧 执行策略: ${strategy.name}`);
      
      try {
        const containers = await strategy.discover(page);
        allContainers.push(...containers);
        strategyResults.set(strategy.name, containers);
        
        const duration = Date.now() - strategyStartTime;
        this.performanceMetrics.set(strategy.name, duration);
        console.log(`✅ 策略 ${strategy.name} 发现 ${containers.length} 个容器，耗时 ${duration}ms`);
      } catch (error) {
        console.warn(`⚠️ 策略 ${strategy.name} 执行失败:`, error);
        strategyResults.set(strategy.name, []);
      }
    }

    // 去重和合并结果
    const uniqueContainers = this.deduplicateContainers(allContainers);
    console.log(`🔄 去重后剩余 ${uniqueContainers.length} 个容器`);

    // 构建层次结构
    const hierarchy = await this.hierarchyBuilder.buildHierarchy(uniqueContainers, page);

    // 评估容器能力
    const capabilityResults = await this.capabilityEvaluator.evaluateContainers(uniqueContainers, page);

    // 生成统计信息
    const stats = this.generateDiscoveryStats(strategyResults, uniqueContainers, hierarchy);

    const result: ContainerDiscoveryResult = {
      containers: uniqueContainers,
      hierarchy,
      capabilities: capabilityResults,
      stats,
      timestamp: Date.now(),
      executionTime: Date.now() - startTime
    };

    // 缓存结果
    this.cacheResult(url, result);

    console.log(`🎉 容器发现完成，共发现 ${uniqueContainers.length} 个容器，耗时 ${Date.now() - startTime}ms`);
    return result;
  }

  /**
   * 兼容性方法 - 使用SelectorConfig
   */
  async discover(page: Page, selectorConfig: any): Promise<ContainerHierarchy> {
    // 简化实现，将selectorConfig转换为容器发现
    console.log('🔍 使用兼容性discover方法...');
    
    try {
      // 基本发现逻辑
      const containers: DiscoveredContainer[] = [];
      
      // 这里简化实现，直接返回基本层次结构
      const hierarchy: ContainerHierarchy = {
        containers: [],
        maxDepth: 0,
        totalContainers: 0
      };
      
      return hierarchy;
    } catch (error) {
      console.error('容器发现失败:', error);
      throw error;
    }
  }

  /**
   * 确保页面准备好进行发现
   */
  private async ensurePageReady(page: Page): Promise<boolean> {
    try {
      // 等待页面加载完成
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      
      // 检查是否有基本的DOM结构
      const hasBody = await page.locator('body').count() > 0;
      if (!hasBody) {
        return false;
      }

      // 等待关键元素加载
      await page.waitForTimeout(1000);
      return true;
    } catch (error) {
      console.warn('页面状态检查失败:', error);
      return false;
    }
  }

  /**
   * 去重容器
   */
  private deduplicateContainers(containers: DiscoveredContainer[]): DiscoveredContainer[] {
    const seen = new Set<string>();
    const unique: DiscoveredContainer[] = [];

    for (const container of containers) {
      const key = `${container.selector}_${container.type}_${container.rect.x}_${container.rect.y}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(container);
      }
    }

    return unique;
  }

  /**
   * 生成发现统计信息
   */
  private generateDiscoveryStats(
    strategyResults: Map<string, DiscoveredContainer[]>,
    uniqueContainers: DiscoveredContainer[],
    hierarchy: ContainerHierarchy
  ): DiscoveryStats {
    const typeDistribution = new Map<ContainerType, number>();
    
    for (const container of uniqueContainers) {
      typeDistribution.set(container.type, (typeDistribution.get(container.type) || 0) + 1);
    }

    return {
      totalCandidates: Array.from(strategyResults.values()).reduce((sum, containers) => sum + containers.length, 0),
      discoveredContainers: uniqueContainers.length,
      successRate: uniqueContainers.length > 0 ? 1.0 : 0.0,
      discoveryTime: 0, // 将在调用处设置
      strategies: Array.from(strategyResults.keys()),
      currentPage: '',
      pageTitle: '',
      typeDistribution
    };
  }

  /**
   * 获取缓存结果
   */
  private getCachedResult(url: string): ContainerDiscoveryResult | null {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached;
    }
    return null;
  }

  /**
   * 缓存结果
   */
  private cacheResult(url: string, result: ContainerDiscoveryResult): void {
    this.cache.set(url, result);
    
    // 清理过期缓存
    if (this.cache.size > 50) {
      const now = Date.now();
      for (const [key, value] of Array.from(this.cache.entries())) {
        if (now - value.timestamp > this.cacheTimeout) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.cache.clear();
    this.performanceMetrics.clear();
  }

  /**
   * 获取性能指标
   */
  public getPerformanceMetrics(): Map<string, number> {
    return new Map(this.performanceMetrics);
  }

  /**
   * 添加自定义策略
   */
  public addStrategy(strategy: DiscoveryStrategy): void {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * 获取所有策略
   */
  public getStrategies(): DiscoveryStrategy[] {
    return [...this.strategies];
  }
}
