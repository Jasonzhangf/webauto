/**
 * 能力评估器
 * 分析已发现容器的能力、操作和特性
 */

import { Page } from 'playwright';
import { 
  DiscoveredContainer, 
  ContainerCapability, 
  CapabilityEvaluation, 
  CapabilityEvaluationResult, 
  CapabilityEvaluationConfig,
  ContainerOperation,
  OperationType,
  ContentType,
  InteractionType as InteractionTypeData,
  PerformanceMetrics,
  SecurityAssessment,
  CapabilityMetadata,
  CapabilityEvaluationStats,
  ContainerType
} from '../types/index.js';

export class CapabilityEvaluator {
  private config: CapabilityEvaluationConfig;
  private evaluationCache: Map<string, CapabilityEvaluation> = new Map();
  private cacheTimeout: number = 300000;

  constructor(config?: Partial<CapabilityEvaluationConfig>) {
    this.config = {
      enablePerformanceAnalysis: true,
      enableSecurityAssessment: true,
      enableContentAnalysis: true,
      enableInteractionDetection: true,
      maxEvaluationTime: 30000,
      confidenceThreshold: 0.7,
      cacheResults: true,
      cacheTimeout: 300000,
      ...config
    };
  }

  async evaluateContainers(containers: DiscoveredContainer[], page: Page): Promise<CapabilityEvaluationResult> {
    console.log('🔍 开始评估容器能力...');
    const startTime = Date.now();
    const evaluations: CapabilityEvaluation[] = [];
    let successfulEvaluations = 0;
    let failedEvaluations = 0;
    
    const evaluationPromises = containers.map(container => 
      this.evaluateSingleContainer(container, page)
    );
    
    const results = await Promise.allSettled(evaluationPromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        evaluations.push(result.value);
        successfulEvaluations++;
      } else {
        console.warn('容器评估失败:', result.reason);
        failedEvaluations++;
      }
    }
    
    const stats = this.generateEvaluationStats(evaluations);
    const evaluationTime = Date.now() - startTime;
    
    const capabilityResult: CapabilityEvaluationResult = {
      evaluations,
      totalContainers: containers.length,
      successfulEvaluations,
      failedEvaluations,
      averageConfidence: this.calculateAverageConfidence(evaluations),
      evaluationTime,
      stats
    };
    
    console.log(`🎉 容器能力评估完成，成功 ${successfulEvaluations}/${containers.length}，耗时 ${evaluationTime}ms`);
    return capabilityResult;
  }

  async evaluateSingleContainer(container: DiscoveredContainer, page: Page): Promise<CapabilityEvaluation> {
    const cacheKey = `${container.selector}_${container.type}`;
    
    // 检查缓存
    if (this.config.cacheResults && this.evaluationCache.has(cacheKey)) {
      const cached = this.evaluationCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached;
      }
    }

    const startTime = Date.now();
    const capabilities: ContainerCapability[] = [];
    const operations: ContainerOperation[] = [];
    
    try {
      // 基础能力检测
      const element = await page.$(container.selector);
      if (!element) {
        throw new Error(`容器元素不存在: ${container.selector}`);
      }

      // 检测可见性
      const isVisible = await element.isVisible();
      if (isVisible) {
        capabilities.push({
          type: 'visibility',
          confidence: 0.9,
          enabled: true,
          description: '容器可见'
        });
      }

      // 检测交互能力
      const isClickable = await element.isClickable();
      if (isClickable) {
        capabilities.push({
          type: 'click',
          confidence: 0.8,
          enabled: true,
          description: '支持点击操作'
        });
        
        operations.push({
          type: OperationType.CLICK,
          description: '点击容器',
          complexity: 'low',
          reliability: 0.8
        });
      }

      // 检测文本内容
      const textContent = await element.textContent();
      if (textContent && textContent.trim().length > 0) {
        capabilities.push({
          type: 'text-content',
          confidence: 0.7,
          enabled: true,
          description: '包含文本内容',
          metadata: {
            contentLength: textContent.length,
            wordCount: textContent.split(/\s+/).length
          }
        });
      }

      // 检测子元素
      const children = await element.$$('*');
      if (children.length > 0) {
        capabilities.push({
          type: 'has-children',
          confidence: 0.6,
          enabled: true,
          description: `包含${children.length}个子元素`,
          metadata: {
            childCount: children.length
          }
        });
      }

    } catch (error) {
      console.warn(`容器 ${container.selector} 评估失败:`, error);
    }

    const evaluation: CapabilityEvaluation = {
      container,
      capabilities,
      operations,
      confidence: capabilities.length > 0 ? 
        capabilities.reduce((sum, cap) => sum + cap.confidence, 0) / capabilities.length : 0,
      timestamp: Date.now(),
      evaluationTime: Date.now() - startTime
    };

    // 缓存结果
    if (this.config.cacheResults) {
      this.evaluationCache.set(cacheKey, evaluation);
    }

    return evaluation;
  }

  generateEvaluationStats(evaluations: CapabilityEvaluation[]): CapabilityEvaluationStats {
    const totalCapabilities = evaluations.reduce((sum, eval) => sum + eval.capabilities.length, 0);
    const totalOperations = evaluations.reduce((sum, eval) => sum + eval.operations.length, 0);
    const averageConfidence = evaluations.reduce((sum, eval) => sum + eval.confidence, 0) / evaluations.length;
    const averageTime = evaluations.reduce((sum, eval) => sum + eval.evaluationTime, 0) / evaluations.length;

    return {
      totalContainers: evaluations.length,
      totalCapabilities,
      totalOperations,
      averageConfidence,
      averageEvaluationTime: averageTime,
      cacheHitRate: 0, // 简化实现
      memoryUsage: process.memoryUsage().heapUsed
    };
  }

  calculateAverageConfidence(evaluations: CapabilityEvaluation[]): number {
    if (evaluations.length === 0) return 0;
    
    const totalConfidence = evaluations.reduce((sum, eval) => sum + eval.confidence, 0);
    return totalConfidence / evaluations.length;
  }
}
