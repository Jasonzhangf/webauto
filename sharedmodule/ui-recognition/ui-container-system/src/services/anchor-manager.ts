/**
 * 高层UI容器系统 - 锚点管理器服务
 * 容器与应用强关联的锚点系统核心实现
 */

import { v4 as uuidv4 } from 'uuid';
import {
  UIAnchor,
  AnchorManager,
  AnchorMatch,
  CreateAnchorRequest,
  MatchOptions,
  AnchorSearchQuery,
  AnchorFactory,
  UIAnchorPattern,
  AnchorStats,
  MatchingStats,
  AnchorConfig,
  Locator,
  AnchorType,
  LocatorStrategy,
  Tolerance,
  ValidationRule,
  AnchorEvent,
  AnchorEventType
} from '../types/anchor';

export class AnchorManagerService implements AnchorManager {
  private anchors: Map<string, UIAnchor> = new Map();
  private anchorEvents: AnchorEvent[] = [];
  private config: AnchorConfig;
  private anchorFactory: AnchorFactory;

  constructor(config?: Partial<AnchorConfig>) {
    this.config = {
      default_confidence_threshold: 0.7,
      default_matching_method: 'weighted_selection',
      max_matching_attempts: 3,
      matching_timeout: 5000,
      enable_auto_validation: true,
      strict_validation_mode: false,
      validation_timeout: 2000,
      enable_adaptive_learning: true,
      learning_rate: 0.1,
      feedback_collection: true,
      cache_enabled: true,
      cache_ttl: 300000,
      max_cache_size: 1000,
      min_success_rate: 0.6,
      max_failure_count: 5,
      quality_threshold: 0.7,
      ...config
    };

    this.anchorFactory = new AnchorFactoryService();
    this.initializeDefaultPatterns();
  }

  /**
   * 创建锚点
   */
  async createAnchor(request: CreateAnchorRequest): Promise<UIAnchor> {
    const anchor: UIAnchor = {
      id: uuidv4(),
      application_id: request.application_id,
      anchor_name: request.anchor_name,
      anchor_type: request.anchor_type,
      anchor_purpose: request.anchor_purpose,
      primary_locator: request.primary_locator,
      secondary_locators: request.secondary_locators || [],
      locator_strategy: request.locator_strategy || 'primary_first',
      expected_bounds: request.expected_bounds,
      tolerance: {
        position: 10,
        size: 0.1,
        text: 2,
        visual: 0.8,
        temporal: 1000,
        ...request.tolerance
      },
      stability_score: 0.8,
      container_id: request.container_id || '',
      control_ids: request.control_ids || [],
      related_anchors: [],
      validation_rules: request.validation_rules || [],
      matching_threshold: request.matching_threshold || this.config.default_confidence_threshold,
      confidence_threshold: request.confidence_threshold || this.config.default_confidence_threshold,
      created_at: new Date(),
      last_matched: new Date(),
      match_count: 0,
      failure_count: 0,
      success_rate: 0.0,
      tags: request.tags || [],
      annotations: [],
      custom_properties: request.custom_properties || {}
    };

    this.anchors.set(anchor.id, anchor);

    // 记录事件
    this.recordEvent({
      id: uuidv4(),
      anchor_id: anchor.id,
      event_type: 'created',
      timestamp: new Date(),
      data: { request }
    });

    return anchor;
  }

  /**
   * 更新锚点
   */
  async updateAnchor(anchorId: string, updates: Partial<UIAnchor>): Promise<boolean> {
    const anchor = this.anchors.get(anchorId);
    if (!anchor) {
      return false;
    }

    Object.assign(anchor, updates, {
      updated_at: new Date()
    });

    this.recordEvent({
      id: uuidv4(),
      anchor_id: anchorId,
      event_type: 'updated',
      timestamp: new Date(),
      data: { updates }
    });

    return true;
  }

  /**
   * 删除锚点
   */
  async deleteAnchor(anchorId: string): Promise<boolean> {
    const deleted = this.anchors.delete(anchorId);

    if (deleted) {
      this.recordEvent({
        id: uuidv4(),
        anchor_id: anchorId,
        event_type: 'deleted',
        timestamp: new Date(),
        data: {}
      });
    }

    return deleted;
  }

  /**
   * 获取锚点
   */
  getAnchor(anchorId: string): UIAnchor | null {
    return this.anchors.get(anchorId) || null;
  }

  /**
   * 匹配锚点
   */
  async matchAnchors(
    applicationId: string,
    elements: any[],
    options: MatchOptions = {}
  ): Promise<AnchorMatch[]> {
    const startTime = Date.now();
    const matches: AnchorMatch[] = [];

    // 获取应用的所有锚点
    const applicationAnchors = Array.from(this.anchors.values())
      .filter(anchor => anchor.application_id === applicationId);

    for (const anchor of applicationAnchors) {
      const match = await this.matchSingleAnchor(anchor, elements, options);
      if (match) {
        matches.push(match);
      }
    }

    // 按置信度排序
    matches.sort((a, b) => b.match_confidence - a.match_confidence);

    // 应用数量限制
    const maxResults = options.max_results || 10;
    return matches.slice(0, maxResults);
  }

  /**
   * 搜索锚点
   */
  searchAnchors(query: AnchorSearchQuery): UIAnchor[] {
    let results = Array.from(this.anchors.values());

    // 应用搜索过滤条件
    if (query.application_id) {
      results = results.filter(anchor => anchor.application_id === query.application_id);
    }

    if (query.anchor_name) {
      results = results.filter(anchor =>
        anchor.anchor_name.toLowerCase().includes(query.anchor_name.toLowerCase())
      );
    }

    if (query.anchor_type) {
      results = results.filter(anchor => anchor.anchor_type === query.anchor_type);
    }

    if (query.anchor_purpose) {
      results = results.filter(anchor =>
        anchor.anchor_purpose.toLowerCase().includes(query.anchor_purpose.toLowerCase())
      );
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(anchor =>
        query.tags.some(tag => anchor.tags.includes(tag))
      );
    }

    if (query.container_id) {
      results = results.filter(anchor => anchor.container_id === query.container_id);
    }

    // 应用质量和性能过滤
    if (query.min_confidence) {
      results = results.filter(anchor => anchor.stability_score >= query.min_confidence);
    }

    if (query.min_success_rate) {
      results = results.filter(anchor => anchor.success_rate >= query.min_success_rate);
    }

    return results;
  }

  /**
   * 优化锚点
   */
  async optimizeAnchors(applicationId: string): Promise<any> {
    const applicationAnchors = Array.from(this.anchors.values())
      .filter(anchor => anchor.application_id === applicationId);

    let optimizedCount = 0;
    let addedLocators = 0;
    let removedLocators = 0;
    const improvedReliability: string[] = [];

    for (const anchor of applicationAnchors) {
      const originalReliability = this.calculateLocatorReliability(anchor);

      // 优化定位器
      const optimizedAnchor = await this.optimizeAnchorLocators(anchor);
      if (optimizedAnchor) {
        this.anchors.set(anchor.id, optimizedAnchor);
        optimizedCount++;

        const newReliability = this.calculateLocatorReliability(optimizedAnchor);
        if (newReliability > originalReliability) {
          improvedReliability.push(anchor.anchor_name);
          addedLocators += (optimizedAnchor.secondary_locators.length - anchor.secondary_locators.length);
        } else {
          removedLocators += (anchor.secondary_locators.length - optimizedAnchor.secondary_locators.length);
        }
      }
    }

    const successRateImprovement = this.calculateSuccessRateImprovement(applicationAnchors);

    return {
      total_anchors: applicationAnchors.length,
      optimized_anchors: optimizedCount,
      added_locators: addedLocators,
      removed_locators: removedLocators,
      improved_reliability: improvedReliability,
      success_rate_improvement: successRateImprovement,
      recommendations: this.generateOptimizationRecommendations(applicationAnchors)
    };
  }

  /**
   * 验证锚点
   */
  async validateAnchors(applicationId: string): Promise<any> {
    const applicationAnchors = Array.from(this.anchors.values())
      .filter(anchor => anchor.application_id === applicationId);

    let validCount = 0;
    let invalidCount = 0;
    const issues: any[] = [];

    for (const anchor of applicationAnchors) {
      const validation = await this.validateAnchor(anchor);

      if (validation.isValid) {
        validCount++;
      } else {
        invalidCount++;
        issues.push(...validation.issues);
      }
    }

    const overallHealth = validCount / Math.max(1, applicationAnchors.length);

    return {
      total_anchors: applicationAnchors.length,
      valid_anchors: validCount,
      invalid_anchors: invalidCount,
      issues_found: issues,
      overall_health: overallHealth,
      recommendations: this.generateValidationRecommendations(issues)
    };
  }

  /**
   * 获取锚点统计
   */
  getAnchorStats(applicationId: string): AnchorStats {
    const applicationAnchors = Array.from(this.anchors.values())
      .filter(anchor => anchor.application_id === applicationId);

    const anchorsByType = applicationAnchors.reduce((acc, anchor) => {
      acc[anchor.anchor_type] = (acc[anchor.anchor_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const anchorsByPurpose = applicationAnchors.reduce((acc, anchor) => {
      acc[anchor.anchor_purpose] = (acc[anchor.anchor_purpose] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalMatches = applicationAnchors.reduce((sum, anchor) => sum + anchor.match_count, 0);
    const successfulMatches = applicationAnchors.reduce((sum, anchor) =>
      sum + Math.floor(anchor.match_count * anchor.success_rate), 0
    );

    const recentMatches = applicationAnchors.reduce((sum, anchor) => {
      const daysSinceLastMatch = (Date.now() - anchor.last_matched.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceLastMatch <= 7 ? sum + 1 : sum;
    }, 0);

    return {
      total_anchors: applicationAnchors.length,
      anchors_by_type: anchorsByType,
      anchors_by_purpose: anchorsByPurpose,
      average_confidence: applicationAnchors.reduce((sum, anchor) => sum + anchor.stability_score, 0) / Math.max(1, applicationAnchors.length),
      average_success_rate: applicationAnchors.reduce((sum, anchor) => sum + anchor.success_rate, 0) / Math.max(1, applicationAnchors.length),
      total_matches,
      recent_matches,
      health_score: this.calculateHealthScore(applicationAnchors),
      last_updated: new Date()
    };
  }

  /**
   * 获取匹配统计
   */
  getMatchingStats(applicationId: string): MatchingStats {
    const applicationAnchors = Array.from(this.anchors.values())
      .filter(anchor => anchor.application_id === applicationId);

    const totalMatches = applicationAnchors.reduce((sum, anchor) => sum + anchor.match_count, 0);
    const successfulMatches = applicationAnchors.reduce((sum, anchor) =>
      sum + Math.floor(anchor.match_count * anchor.success_rate), 0
    );

    const matchingMethods = this.calculateMatchingMethodStats(applicationAnchors);

    return {
      total_matches: totalMatches,
      successful_matches: successfulMatches,
      failed_matches: totalMatches - successfulMatches,
      average_confidence: applicationAnchors.reduce((sum, anchor) => sum + anchor.stability_score, 0) / Math.max(1, applicationAnchors.length),
      matching_methods: matchingMethods,
      performance_metrics: {
        average_match_time: 150, // 需要实际测量
        match_success_rate: successfulMatches / Math.max(1, totalMatches),
        stability_score: applicationAnchors.reduce((sum, anchor) => sum + anchor.stability_score, 0) / Math.max(1, applicationAnchors.length)
      },
      trends: {
        success_rate_trend: this.calculateSuccessRateTrend(applicationAnchors),
        confidence_trend: this.calculateConfidenceTrend(applicationAnchors),
        volume_trend: this.calculateVolumeTrend(applicationAnchors)
      }
    };
  }

  // 私有方法

  private async matchSingleAnchor(
    anchor: UIAnchor,
    elements: any[],
    options: MatchOptions
  ): Promise<AnchorMatch | null> {
    const startTime = Date.now();

    try {
      // 根据定位策略选择定位器
      const locators = this.selectLocators(anchor);

      for (const locator of locators) {
        const matchedElement = await this.findElementWithLocator(locator, elements);

        if (matchedElement) {
          // 验证匹配
          const validationResults = await this.validateMatch(anchor, matchedElement);
          const passedValidation = this.shouldAcceptMatch(validationResults, options);

          if (passedValidation) {
            const confidence = this.calculateMatchConfidence(anchor, matchedElement, locator);

            if (confidence >= (options.confidence_threshold || anchor.matching_threshold)) {
              // 更新锚点统计
              await this.updateAnchorStats(anchor, true, confidence);

              return {
                anchor,
                matched_element: matchedElement,
                match_confidence: confidence,
                match_method: locator.type,
                validation_results: validationResults,
                is_stable: this.isMatchStable(anchor),
                requires_adaptation: this.requiresAdaptation(anchor, matchedElement)
              };
            }
          }
        }
      }

      // 匹配失败
      await this.updateAnchorStats(anchor, false, 0);
      return null;

    } catch (error) {
      console.error(`Anchor matching failed for ${anchor.id}:`, error);
      await this.updateAnchorStats(anchor, false, 0);
      return null;
    }
  }

  private selectLocators(anchor: UIAnchor): Locator[] {
    const locators: Locator[] = [anchor.primary_locator];

    switch (anchor.locator_strategy) {
      case 'primary_first':
        locators.push(...anchor.secondary_locators);
        break;

      case 'most_reliable':
        const allLocators = [anchor.primary_locator, ...anchor.secondary_locators];
        allLocators.sort((a, b) => b.reliability - a.reliability);
        return allLocators;

      case 'weighted_selection':
        locators.push(...anchor.secondary_locators);
        locators.sort((a, b) => b.weight - a.weight);
        break;

      case 'cascade_fallback':
        locators.push(...anchor.secondary_locators);
        break;

      case 'parallel_validation':
        locators.push(...anchor.secondary_locators);
        break;

      case 'adaptive':
        return this.selectAdaptiveLocators(anchor);

      default:
        locators.push(...anchor.secondary_locators);
    }

    return locators;
  }

  private selectAdaptiveLocators(anchor: UIAnchor): Locator[] {
    // 基于历史表现选择定位器
    const recentSuccessRate = this.calculateRecentSuccessRate(anchor);

    if (recentSuccessRate > 0.8) {
      // 最近表现良好，使用主要定位器
      return [anchor.primary_locator];
    } else if (recentSuccessRate < 0.5) {
      // 最近表现不佳，使用所有定位器
      return [anchor.primary_locator, ...anchor.secondary_locators];
    } else {
      // 表现一般，使用高可靠性定位器
      const allLocators = [anchor.primary_locator, ...anchor.secondary_locators];
      return allLocators.filter(l => l.reliability > 0.7);
    }
  }

  private async findElementWithLocator(locator: Locator, elements: any[]): Promise<any> {
    switch (locator.type) {
      case 'css_selector':
        return this.findByCSSSelector(locator.value, elements);
      case 'xpath':
        return this.findByXPath(locator.value, elements);
      case 'element_id':
        return this.findById(locator.value, elements);
      case 'element_text':
        return this.findByText(locator.value, elements);
      case 'position':
        return this.findByPosition(locator.value, elements);
      case 'visual_pattern':
        return this.findByVisualPattern(locator.value, elements);
      default:
        return null;
    }
  }

  private findByCSSSelector(selector: string, elements: any[]): any {
    // 简化的CSS选择器实现
    return elements.find(element => {
      // 这里需要实际的DOM查询逻辑
      // 暂时返回null
      return null;
    });
  }

  private findByXPath(xpath: string, elements: any[]): any {
    // 简化的XPath实现
    return elements.find(element => {
      // 这里需要实际的XPath查询逻辑
      // 暂时返回null
      return null;
    });
  }

  private findById(id: string, elements: any[]): any {
    return elements.find(element => element.id === id);
  }

  private findByText(text: string, elements: any[]): any {
    return elements.find(element =>
      element.text && element.text.includes(text)
    );
  }

  private findByPosition(position: string, elements: any[]): any {
    const [x, y] = position.split(',').map(Number);
    return elements.find(element => {
      const bbox = element.bbox;
      return x >= bbox.x1 && x <= bbox.x2 && y >= bbox.y1 && y <= bbox.y2;
    });
  }

  private findByVisualPattern(pattern: string, elements: any[]): any {
    // 视觉模式匹配实现
    return elements.find(element => {
      // 这里需要实际的视觉模式匹配逻辑
      return false;
    });
  }

  private async validateMatch(anchor: UIAnchor, matchedElement: any): Promise<any[]> {
    const results: any[] = [];

    for (const rule of anchor.validation_rules) {
      const result = await this.executeValidationRule(rule, matchedElement);
      results.push(result);
    }

    return results;
  }

  private async executeValidationRule(rule: ValidationRule, element: any): Promise<any> {
    switch (rule.type) {
      case 'exists':
        return {
          rule_type: rule.type,
          passed: element !== null,
          message: rule.required ? 'Element must exist' : 'Element existence check',
          actual_value: element !== null
        };

      case 'visible':
        const isVisible = element && element.properties?.visible !== false;
        return {
          rule_type: rule.type,
          passed: isVisible,
          message: 'Element must be visible',
          actual_value: isVisible
        };

      case 'enabled':
        const isEnabled = element && element.properties?.enabled !== false;
        return {
          rule_type: rule.type,
          passed: isEnabled,
          message: 'Element must be enabled',
          actual_value: isEnabled
        };

      case 'contains_text':
        const hasText = element && element.text && element.text.includes(rule.condition);
        return {
          rule_type: rule.type,
          passed: hasText,
          message: `Element must contain text: ${rule.condition}`,
          actual_value: element?.text
        };

      default:
        if (rule.validation_function) {
          const passed = rule.validation_function(element);
          return {
            rule_type: rule.type,
            passed,
            message: rule.error_message,
            actual_value: null
          };
        }
        return {
          rule_type: rule.type,
          passed: true,
          message: 'Validation passed',
          actual_value: null
        };
    }
  }

  private shouldAcceptMatch(validationResults: any[], options: MatchOptions): boolean {
    if (options.strict_validation) {
      return validationResults.every(result => result.passed);
    }

    if (options.strict_validation === false) {
      return validationResults.filter(r => r.required).every(r => r.passed);
    }

    // 默认：允许非必需的验证失败
    return true;
  }

  private calculateMatchConfidence(anchor: UIAnchor, matchedElement: any, locator: Locator): number {
    let confidence = 0;

    // 定位器可靠性
    confidence += locator.reliability * 0.4;

    // 位置匹配度
    const positionMatch = this.calculatePositionMatch(anchor, matchedElement);
    confidence += positionMatch * 0.3;

    // 大小匹配度
    const sizeMatch = this.calculateSizeMatch(anchor, matchedElement);
    confidence += sizeMatch * 0.2;

    // 锚点稳定性
    confidence += anchor.stability_score * 0.1;

    return Math.min(1, confidence);
  }

  private calculatePositionMatch(anchor: UIAnchor, element: any): number {
    const expected = anchor.expected_bounds;
    const actual = element.bbox;

    const deltaX = Math.abs(expected.x1 - actual.x1);
    const deltaY = Math.abs(expected.y1 - actual.y1);
    const tolerance = anchor.tolerance.position;

    const maxDelta = Math.max(deltaX, deltaY);
    return Math.max(0, 1 - maxDelta / tolerance);
  }

  private calculateSizeMatch(anchor: UIAnchor, element: any): number {
    const expected = anchor.expected_bounds;
    const actual = element.bbox;

    const expectedWidth = expected.x2 - expected.x1;
    const expectedHeight = expected.y2 - expected.y1;
    const actualWidth = actual.x2 - actual.x1;
    const actualHeight = actual.y2 - actual.y1;

    const widthRatio = Math.min(expectedWidth, actualWidth) / Math.max(expectedWidth, actualWidth);
    const heightRatio = Math.min(expectedHeight, actualHeight) / Math.max(expectedHeight, actualHeight);

    const tolerance = anchor.tolerance.size;
    const avgRatio = (widthRatio + heightRatio) / 2;

    return avgRatio >= (1 - tolerance) ? 1 : avgRatio;
  }

  private isMatchStable(anchor: UIAnchor): boolean {
    return anchor.stability_score > 0.7 && anchor.success_rate > 0.6;
  }

  private requiresAdaptation(anchor: UIAnchor, matchedElement: any): boolean {
    const positionMatch = this.calculatePositionMatch(anchor, matchedElement);
    const sizeMatch = this.calculateSizeMatch(anchor, matchedElement);

    return positionMatch < 0.8 || sizeMatch < 0.8;
  }

  private async updateAnchorStats(anchor: UIAnchor, success: boolean, confidence: number): Promise<void> {
    anchor.last_matched = new Date();
    anchor.match_count++;

    if (success) {
      // 更新成功率（指数移动平均）
      const alpha = 0.1;
      anchor.success_rate = alpha * 1 + (1 - alpha) * anchor.success_rate;
    } else {
      // 更新失败率
      const alpha = 0.2;
      anchor.success_rate = alpha * 0 + (1 - alpha) * anchor.success_rate;
      anchor.failure_count++;
    }

    // 更新稳定性评分
    const recentPerformance = this.calculateRecentPerformance(anchor);
    anchor.stability_score = recentPerformance;
  }

  private calculateRecentPerformance(anchor: UIAnchor): number {
    // 基于最近10次匹配计算性能
    const recentMatches = Math.min(10, anchor.match_count);
    const recentSuccessRate = anchor.success_rate;

    // 考虑失败次数对稳定性的影响
    const failurePenalty = Math.min(0.5, anchor.failure_count * 0.1);

    return recentSuccessRate * (1 - failurePenalty);
  }

  private calculateRecentSuccessRate(anchor: UIAnchor): number {
    // 基于时间衰减的近期成功率
    const daysSinceLastMatch = (Date.now() - anchor.last_matched.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceLastMatch > 30) {
      return anchor.success_rate * 0.5; // 30天前的成功率减半
    }

    return anchor.success_rate;
  }

  private calculateLocatorReliability(anchor: UIAnchor): number {
    const locators = [anchor.primary_locator, ...anchor.secondary_locators];

    if (locators.length === 0) return 0;

    const totalReliability = locators.reduce((sum, locator) => sum + locator.reliability, 0);
    return totalReliability / locators.length;
  }

  private async optimizeAnchorLocators(anchor: UIAnchor): Promise<UIAnchor | null> {
    // 基于历史表现优化定位器
    const performance = this.analyzeLocatorPerformance(anchor);

    if (performance.reliableLocators.length > 1) {
      // 如果有多个可靠的定位器，保留它们
      anchor.primary_locator = performance.reliableLocators[0];
      anchor.secondary_locators = performance.reliableLocators.slice(1);

      return anchor;
    } else if (performance.unreliableLocators.length > 0) {
      // 如果有不可靠的定位器，考虑移除
      anchor.secondary_locators = anchor.secondary_locators.filter(
        locator => !performance.unreliableLocators.includes(locator)
      );

      return anchor;
    }

    return null; // 不需要优化
  }

  private analyzeLocatorPerformance(anchor: UIAnchor): {
    reliableLocators: Locator[];
    unreliableLocators: Locator[];
  } {
    const reliable: Locator[] = [];
    const unreliable: Locator[] = [];

    if (anchor.success_rate > 0.7) {
      reliable.push(anchor.primary_locator);
    } else {
      unreliable.push(anchor.primary_locator);
    }

    anchor.secondary_locators.forEach(locator => {
      if (locator.reliability > 0.6) {
        reliable.push(locator);
      } else {
        unreliable.push(locator);
      }
    });

    return { reliableLocators: reliable, unreliableLocators: unreliable };
  }

  private calculateSuccessRateImprovement(anchors: UIAnchor[]): number {
    if (anchors.length === 0) return 0;

    const currentSuccessRate = anchors.reduce((sum, anchor) => sum + anchor.success_rate, 0) / anchors.length;
    const baselineSuccessRate = 0.6; // 假设基线成功率

    return (currentSuccessRate - baselineSuccessRate) / baselineSuccessRate;
  }

  private generateOptimizationRecommendations(anchors: UIAnchor[]): string[] {
    const recommendations: string[] = [];

    const lowReliabilityAnchors = anchors.filter(anchor =>
      this.calculateLocatorReliability(anchor) < 0.5
    );

    if (lowReliabilityAnchors.length > 0) {
      recommendations.push(`发现 ${lowReliabilityAnchors.length} 个低可靠性锚点，建议添加备用定位器`);
    }

    const highFailureAnchors = anchors.filter(anchor => anchor.failure_count > 3);
    if (highFailureAnchors.length > 0) {
      recommendations.push(`发现 ${highFailureAnchors.length} 个高失败率锚点，建议重新设计定位策略`);
    }

    const noValidationAnchors = anchors.filter(anchor => anchor.validation_rules.length === 0);
    if (noValidationAnchors.length > 0) {
      recommendations.push(`发现 ${noValidationAnchors.length} 个无验证规则的锚点，建议添加验证逻辑`);
    }

    return recommendations;
  }

  private generateValidationRecommendations(issues: any[]): string[] {
    const recommendations: string[] = [];

    const criticalIssues = issues.filter(issue => issue.severity === 'critical');
    const highIssues = issues.filter(issue => issue.severity === 'high');

    if (criticalIssues.length > 0) {
      recommendations.push(`发现 ${criticalIssues.length} 个严重问题，需要立即修复`);
    }

    if (highIssues.length > 0) {
      recommendations.push(`发现 ${highIssues.length} 个高优先级问题，建议优先处理`);
    }

    return recommendations;
  }

  private calculateHealthScore(anchors: UIAnchor[]): number {
    if (anchors.length === 0) return 0;

    const factors = {
      success_rate: anchors.reduce((sum, anchor) => sum + anchor.success_rate, 0) / anchors.length,
      stability_score: anchors.reduce((sum, anchor) => sum + anchor.stability_score, 0) / anchors.length,
      locator_reliability: anchors.reduce((sum, anchor) => sum + this.calculateLocatorReliability(anchor), 0) / anchors.length,
      failure_rate: anchors.reduce((sum, anchor) => sum + anchor.failure_count, 0) / anchors.length / Math.max(1, anchors.reduce((sum, anchor) => sum + anchor.match_count, 0))
    };

    return (
      factors.success_rate * 0.3 +
      factors.stability_score * 0.3 +
      factors.locator_reliability * 0.2 +
      (1 - factors.failure_rate) * 0.2
    );
  }

  private calculateMatchingMethodStats(anchors: UIAnchor[]): Record<string, number> {
    const stats: Record<string, number> = {};

    anchors.forEach(anchor => {
      const method = anchor.primary_locator.type;
      stats[method] = (stats[method] || 0) + 1;
    });

    return stats;
  }

  private calculateSuccessRateTrend(anchors: UIAnchor[]): number[] {
    // 简化的趋势计算
    return [0.6, 0.65, 0.7, 0.75, 0.8]; // 实际应该基于历史数据计算
  }

  private calculateConfidenceTrend(anchors: UIAnchor[]): number[] {
    return [0.7, 0.72, 0.75, 0.78, 0.8];
  }

  private calculateVolumeTrend(anchors: UIAnchor[]): number[] {
    return [10, 12, 15, 18, 20];
  }

  private recordEvent(event: AnchorEvent): void {
    this.anchorEvents.push(event);

    // 限制事件历史大小
    if (this.anchorEvents.length > 10000) {
      this.anchorEvents = this.anchorEvents.slice(-5000);
    }
  }

  private initializeDefaultPatterns(): void {
    // 初始化默认锚点模式
    const defaultPatterns: UIAnchorPattern[] = [
      {
        name: 'login-submit-button',
        description: '登录页面提交按钮',
        anchor_type: 'button' as AnchorType,
        locator_templates: [
          {
            type: 'css_selector' as LocatorType,
            template: 'button[type="submit"], input[type="submit"], .login-btn, .submit-btn',
            variables: [],
            weight: 0.9
          },
          {
            type: 'element_text' as LocatorType,
            template: '登录|Login|提交|Submit',
            variables: [],
            weight: 0.8
          }
        ],
        validation_templates: [
          {
            type: 'exists' as ValidationType,
            template: '',
            required: true,
            message_template: '登录按钮必须存在'
          },
          {
            type: 'enabled' as ValidationType,
            template: '',
            required: true,
            message_template: '登录按钮必须可用'
          }
        ],
        context_requirements: ['login_page'],
        适用场景: ['用户认证', '表单提交']
      }
    ];

    // 这里可以初始化更多默认模式
  }
}

// 锚点工厂实现
class AnchorFactoryService implements AnchorFactory {
  async createAnchorsFromAnalysis(
    applicationId: string,
    elements: any[],
    containerStructure: any
  ): Promise<UIAnchor[]> {
    const anchors: UIAnchor[] = [];

    // 基于元素类型自动创建锚点
    const elementsByType = this.groupElementsByType(elements);

    // 创建按钮锚点
    if (elementsByType.button && elementsByType.button.length > 0) {
      for (const button of elementsByType.button.slice(0, 5)) { // 限制数量
        const anchor = await this.createAnchorFromElement(
          applicationId,
          button,
          'button',
          `${button.text || 'Button'} 按钮`
        );
        if (anchor) anchors.push(anchor);
      }
    }

    // 创建输入框锚点
    if (elementsByType.input && elementsByType.input.length > 0) {
      for (const input of elementsByType.input.slice(0, 5)) {
        const anchor = await this.createAnchorFromElement(
          applicationId,
          input,
          'input',
          `${input.placeholder || input.text || 'Input'} 输入框`
        );
        if (anchor) anchors.push(anchor);
      }
    }

    return anchors;
  }

  async createAnchorsFromPattern(
    applicationId: string,
    pattern: UIAnchorPattern
  ): Promise<UIAnchor[]> {
    // 基于模式创建锚点
    const anchors: UIAnchor[] = [];

    for (const template of pattern.locator_templates) {
      const locator: Locator = {
        type: template.type,
        value: template.value,
        weight: template.weight,
        reliability: 0.8
      };

      const anchor: UIAnchor = {
        id: uuidv4(),
        application_id: applicationId,
        anchor_name: pattern.name,
        anchor_type: pattern.anchor_type,
        anchor_purpose: pattern.description,
        primary_locator: locator,
        secondary_locators: [],
        locator_strategy: 'primary_first',
        expected_bounds: { x1: 0, y1: 0, x2: 100, y2: 50, width: 100, height: 50 },
        tolerance: {
          position: 10,
          size: 0.1,
          text: 2,
          visual: 0.8,
          temporal: 1000
        },
        stability_score: 0.8,
        container_id: '',
        control_ids: [],
        related_anchors: [],
        validation_rules: pattern.validation_templates.map(template => ({
          type: template.type,
          condition: template.template,
          required: template.required,
          error_message: template.message_template,
          validation_function: undefined
        })),
        matching_threshold: 0.7,
        confidence_threshold: 0.7,
        created_at: new Date(),
        last_matched: new Date(),
        match_count: 0,
        failure_count: 0,
        success_rate: 0.0,
        tags: [pattern.anchor_type],
        annotations: [],
        custom_properties: {}
      };

      anchors.push(anchor);
    }

    return anchors;
  }

  async createAnchorsFromBehavior(
    applicationId: string,
    behaviors: any[]
  ): Promise<UIAnchor[]> {
    // 基于用户行为创建锚点
    const anchors: UIAnchor[] = [];
    const elementFrequency: Record<string, number> = {};

    // 统计元素交互频率
    behaviors.forEach(behavior => {
      behavior.actions.forEach(action => {
        elementFrequency[action.element_identifier] = (elementFrequency[action.element_identifier] || 0) + 1;
      });
    });

    // 为高频交互元素创建锚点
    Object.entries(elementFrequency)
      .filter(([, frequency]) => frequency >= 3) // 至少3次交互
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([elementId, frequency]) => {
        // 这里需要从实际元素数据中创建锚点
        // 暂时跳过实现
      });

    return anchors;
  }

  validateAnchorQuality(anchor: UIAnchor): any {
    const issues: any[] = [];
    let overallScore = 0.8;

    // 评估定位器可靠性
    const locatorReliability = this.calculateLocatorReliability(anchor);
    if (locatorReliability < 0.5) {
      issues.push({
        type: 'weak_locator',
        severity: 'medium',
        description: '定位器可靠性较低',
        impact: '影响匹配成功率',
        solution: '添加备用定位器'
      });
    } else {
      overallScore += 0.2;
    }

    // 评估验证覆盖率
    if (anchor.validation_rules.length === 0) {
      issues.push({
        type: 'missing_validation',
        severity: 'low',
        description: '缺少验证规则',
        impact: '可能错过重要错误',
        solution: '添加适当的验证规则'
      });
    } else {
      overallScore += 0.2;
    }

    // 评估稳定性
    if (anchor.stability_score < 0.6) {
      issues.push({
        type: 'unstable',
        severity: 'high',
        description: '锚点稳定性不足',
        impact: '匹配结果不可靠',
        solution: '收集更多匹配数据或调整容差设置'
      });
    } else {
      overallScore += 0.3;
    }

    // 评估容差设置
    if (anchor.tolerance.position > 20 || anchor.tolerance.size > 0.2) {
      issues.push({
        type: 'high_tolerance',
        severity: 'medium',
        description: '容差设置过大',
        impact: '可能导致误匹配',
        solution: '收紧容差设置'
      });
    } else {
      overallScore += 0.1;
    }

    return {
      overall_score: Math.min(1, overallScore),
      locator_reliability: locatorReliability,
      validation_coverage: anchor.validation_rules.length > 0 ? 0.8 : 0,
      stability_score: anchor.stability_score,
      maintainability: this.calculateMaintainability(anchor),
      issues,
      recommendations: this.generateQualityRecommendations(issues)
    };
  }

  private calculateLocatorReliability(anchor: UIAnchor): number {
    const locators = [anchor.primary_locator, ...anchor.secondary_locators];
    if (locators.length === 0) return 0;

    const totalReliability = locators.reduce((sum, locator) => sum + locator.reliability, 0);
    return totalReliability / locators.length;
  }

  private calculateMaintainability(anchor: UIAnchor): number {
    let score = 0.5;

    // 评估定位器多样性
    const locatorTypes = new Set([anchor.primary_locator.type, ...anchor.secondary_locators.map(l => l.type)]);
    score += Math.min(0.3, locatorTypes.size / 5);

    // 评估规则完整性
    if (anchor.validation_rules.length > 0) {
      score += 0.2;
    }

    // 评估文档完整性
    if (anchor.anchor_name && anchor.anchor_purpose) {
      score += 0.2;
    }

    // 评估自定义属性
    if (Object.keys(anchor.custom_properties).length > 0) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  private generateQualityRecommendations(issues: any[]): string[] {
    return issues.map(issue => issue.solution);
  }

  private groupElementsByType(elements: any[]): Record<string, any[]> {
    return elements.reduce((groups, element) => {
      const type = element.type || 'unknown';
      groups[type] = groups[type] || [];
      groups[type].push(element);
      return groups;
    }, {});
  }

  private async createAnchorFromElement(
    applicationId: string,
    element: any,
    anchorType: string,
    purpose: string
  ): Promise<UIAnchor | null> {
      if (!element || !element.bbox) {
        return null;
      }

      const primaryLocator: Locator = {
        type: this.inferLocatorType(element),
        value: this.generateLocatorValue(element),
        weight: 0.8,
        reliability: 0.7
      };

      const anchor: UIAnchor = {
        id: uuidv4(),
        application_id: applicationId,
        anchor_name: element.text || `${purpose}-${Date.now()}`,
        anchor_type: anchorType as AnchorType,
        anchor_purpose: purpose,
        primary_locator,
        secondary_locators: [],
        locator_strategy: 'primary_first',
        expected_bounds: element.bbox,
        tolerance: {
          position: 10,
          size: 0.1,
          text: 2,
          visual: 0.8,
          temporal: 1000
        },
        stability_score: 0.8,
        container_id: '',
        control_ids: [element.id],
        related_anchors: [],
        validation_rules: this.generateDefaultValidationRules(anchorType),
        matching_threshold: 0.7,
        confidence_threshold: 0.7,
        created_at: new Date(),
        last_matched: new Date(),
        match_count: 0,
        failure_count: 0,
        success_rate: 0.0,
        tags: [anchorType, element.type],
        annotations: [],
        custom_properties: {
          original_element_id: element.id,
          original_element_type: element.type
        }
      };

      return anchor;
  }

  private inferLocatorType(element: any): LocatorType {
    if (element.id) return 'element_id';
    if (element.className) return 'element_class';
    if (element.text) return 'element_text';
    if (element.attributes?.id) return 'element_attribute';
    return 'css_selector';
  }

  private generateLocatorValue(element: any): string {
    if (element.id) return `#${element.id}`;
    if (element.className) return `.${element.className}`;
    if (element.text) return `:contains("${element.text}")`;
    return element.tagName || '';
  }

  private generateDefaultValidationRules(anchorType: string): ValidationRule[] {
    const rules: ValidationRule[] = [];

    // 基础验证规则
    rules.push({
      type: 'exists',
      condition: '',
      required: true,
      error_message: '元素必须存在'
    });

    rules.push({
      type: 'visible',
      condition: '',
      required: true,
      error_message: '元素必须可见'
    });

    // 类型特定验证规则
    switch (anchorType) {
      case 'button':
        rules.push({
          type: 'enabled',
          condition: '',
          required: true,
          error_message: '按钮必须可用'
        });
        break;

      case 'input':
        rules.push({
          type: 'enabled',
          condition: '',
          required: true,
          error_message: '输入框必须可用'
        });
        break;
    }

    return rules;
  }
}