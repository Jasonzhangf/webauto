/**
 * 页面分析器主入口类
 * 协调所有组件完成完整的页面分析流程
 *
 * 注意：这里不再依赖 Playwright 的 Page 类型，改用最小 Page 接口约束，
 * 以避免意外引用 Node 侧的 Playwright 实现。
 */

type Page = {
  url(): string;
};

import { PageTypeIdentifier } from './core/PageTypeIdentifier.js';
import { ContainerDiscoveryManager } from './core/ContainerDiscoveryManager.js';
import { HierarchyBuilder } from './core/HierarchyBuilder.js';
import { CapabilityEvaluator } from './core/CapabilityEvaluator.js';
import {
  PageAnalysisResult,
  PageType,
  DiscoveredContainer,
  ContainerHierarchy,
  DiscoveryStats,
} from './types/index.js';

export class PageAnalyzer {
  private pageTypeIdentifier: PageTypeIdentifier;
  private discoveryManager: ContainerDiscoveryManager;
  private hierarchyBuilder: HierarchyBuilder;
  private capabilityEvaluator: CapabilityEvaluator;

  constructor() {
    this.pageTypeIdentifier = new PageTypeIdentifier();
    this.discoveryManager = new ContainerDiscoveryManager();
    this.hierarchyBuilder = new HierarchyBuilder();
    this.capabilityEvaluator = new CapabilityEvaluator();
  }

  async analyze(page: Page, url?: string): Promise<PageAnalysisResult> {
    console.log('🚀 开始页面分析...');
    const startTime = Date.now();
    const targetUrl = url || page.url();

    console.log('📋 识别页面类型...');
    const pageType = await this.pageTypeIdentifier.identifyPageType(targetUrl, page);

    console.log('🔍 发现页面容器...');
    const discoveryResult = await this.discoveryManager.discoverContainers(page, targetUrl);
    const hierarchy = discoveryResult.hierarchy;

    console.log('⚡ 评估容器能力...');
    const capabilityResults = await this.capabilityEvaluator.evaluateContainers(
      discoveryResult.containers,
      page,
    );

    const result: PageAnalysisResult = {
      pageType,
      containers: discoveryResult.containers,
      hierarchy,
      stats: {
        ...discoveryResult.stats,
        capabilityEvaluationTime: capabilityResults.evaluationTime,
      },
      capabilities: capabilityResults.evaluations,
      executionTime: Date.now() - startTime,
    };

    console.log(
      `🎉 页面分析完成，共发现 ${discoveryResult.containers.length} 个容器，耗时 ${result.executionTime}ms`,
    );
    return result;
  }

  async quickAnalyze(page: Page, url?: string): Promise<{ pageType: PageType; url: string }> {
    const targetUrl = url || page.url();
    const pageType = await this.pageTypeIdentifier.identifyPageType(targetUrl, page);
    return { pageType, url: targetUrl };
  }

  async discoverContainers(page: Page, url?: string) {
    const targetUrl = url || page.url();
    return await this.discoveryManager.discoverContainers(page, targetUrl);
  }

  clearCache(): void {
    this.discoveryManager.clearCache();
    this.capabilityEvaluator.clearCache();
  }
}
