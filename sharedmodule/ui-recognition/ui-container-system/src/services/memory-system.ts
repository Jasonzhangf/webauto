/**
 * 高层UI容器系统 - 记忆系统服务
 * 具备学习和记忆能力的UI容器系统核心服务
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ApplicationMemory,
  UIStructure,
  UIPattern,
  UserBehavior,
  MemorySystemConfig,
  MemoryQuery,
  MemorySearchResult,
  ApplicationType,
  Platform,
  StructureType,
  LearningData
} from '../types/memory';
import { UIElement } from '../../recognition-service/src/types/element';

export class MemorySystem {
  private config: MemorySystemConfig;
  private applicationMemories: Map<string, ApplicationMemory> = new Map();
  private patternLibrary: Map<string, UIPattern> = new Map();
  private learningEngine: LearningEngine;

  constructor(config?: Partial<MemorySystemConfig>) {
    this.config = {
      max_applications: 1000,
      max_structures_per_app: 100,
      max_memory_age_days: 365,
      learning_enabled: true,
      adaptation_threshold: 0.7,
      pattern_recognition_sensitivity: 0.8,
      cache_size: 500,
      cleanup_interval_hours: 24,
      compression_enabled: true,
      data_retention_days: 730,
      anonymize_user_data: true,
      encryption_enabled: false,
      ...config
    };

    this.learningEngine = new LearningEngine(this.config);
    this.initializePatternLibrary();

    // 定期清理
    setInterval(() => this.cleanup(), this.config.cleanup_interval_hours * 60 * 60 * 1000);
  }

  /**
   * 记录新的UI结构
   */
  async recordUIStructure(
    applicationId: string,
    applicationType: ApplicationType,
    platform: Platform,
    elements: UIElement[],
    context?: {
      pageUrl?: string;
      pageTitle?: string;
      userId?: string;
      sessionId?: string;
    }
  ): Promise<UIStructure> {
    // 获取或创建应用记忆
    let appMemory = this.applicationMemories.get(applicationId);
    if (!appMemory) {
      appMemory = await this.createApplicationMemory(
        applicationId,
        applicationType,
        platform
      );
      this.applicationMemories.set(applicationId, appMemory);
    }

    // 分析并创建UI结构
    const structure = await this.analyzeUIStructure(elements, context);

    // 检查是否已存在相似结构
    const existingStructure = this.findSimilarStructure(appMemory, structure);
    if (existingStructure) {
      // 更新现有结构
      await this.updateExistingStructure(existingStructure, structure);
      return existingStructure;
    } else {
      // 添加新结构
      appMemory.ui_structures.push(structure);
      await this.learnFromNewStructure(appMemory, structure);
      return structure;
    }
  }

  /**
   * 查找匹配的UI结构
   */
  async findMatchingStructure(
    applicationId: string,
    elements: UIElement[],
    threshold: number = 0.8
  ): Promise<UIStructure | null> {
    const appMemory = this.applicationMemories.get(applicationId);
    if (!appMemory) {
      return null;
    }

    const candidateStructure = await this.analyzeUIStructure(elements);

    // 在记忆中搜索最相似的结构
    let bestMatch: UIStructure | null = null;
    let bestScore = 0;

    for (const structure of appMemory.ui_structures) {
      const similarity = await this.calculateStructureSimilarity(structure, candidateStructure);
      if (similarity > bestScore && similarity >= threshold) {
        bestScore = similarity;
        bestMatch = structure;
      }
    }

    if (bestMatch) {
      // 更新访问记录
      bestMatch.last_seen = new Date();
      bestMatch.occurrence_count++;
      appMemory.last_accessed = new Date();
      appMemory.access_count++;
    }

    return bestMatch;
  }

  /**
   * 记录用户行为
   */
  async recordUserBehavior(
    applicationId: string,
    actions: Array<{
      timestamp: Date;
      action: string;
      targetElement: string;
      result: 'success' | 'failure' | 'partial';
    }>,
    context: {
      userId?: string;
      sessionId: string;
      startTime: Date;
      endTime: Date;
    }
  ): Promise<void> {
    const appMemory = this.applicationMemories.get(applicationId);
    if (!appMemory) {
      return;
    }

    const behavior: UserBehavior = {
      user_id: context.userId,
      session_id: context.sessionId,
      action_sequence: actions.map(action => ({
        timestamp: action.timestamp,
        action: action.action,
        target_element: action.targetElement,
        parameters: {},
        result: action.result,
        response_time: 0 // 需要实际计算
      })),
      time_spent: context.endTime.getTime() - context.startTime.getTime(),
      completion_status: this.determineCompletionStatus(actions),
      behavior_pattern: this.identifyBehaviorPattern(actions),
      efficiency_score: this.calculateEfficiencyScore(actions),
      error_events: actions.filter(a => a.result === 'failure').map(a => ({
        timestamp: a.timestamp,
        error_type: 'action_failure',
        element: a.targetElement,
        description: `Action ${a.action} failed`
      })),
      start_time: context.startTime,
      end_time: context.endTime,
      duration: context.endTime.getTime() - context.startTime.getTime()
    };

    appMemory.user_behaviors.push(behavior);

    // 触发学习
    await this.learningEngine.processUserBehavior(appMemory, behavior);
  }

  /**
   * 搜索记忆
   */
  async searchMemory(query: MemoryQuery): Promise<MemorySearchResult> {
    const startTime = Date.now();

    let applications: ApplicationMemory[] = [];
    let structures: UIStructure[] = [];
    let patterns: UIPattern[] = [];

    // 搜索应用记忆
    if (query.application_id) {
      const appMemory = this.applicationMemories.get(query.application_id);
      if (appMemory) {
        applications.push(appMemory);
      }
    } else {
      // 搜索所有匹配的应用
      applications = Array.from(this.applicationMemories.values()).filter(app => {
        if (query.tags && !query.tags.every(tag => app.tags.includes(tag))) {
          return false;
        }
        if (query.confidence_threshold && app.confidence_score < query.confidence_threshold) {
          return false;
        }
        return true;
      });
    }

    // 搜索UI结构
    structures = applications.flatMap(app => app.ui_structures).filter(structure => {
      if (query.structure_type && structure.structure_type !== query.structure_type) {
        return false;
      }
      if (query.time_range) {
        const structureTime = structure.last_seen.getTime();
        if (structureTime < query.time_range.start.getTime() ||
            structureTime > query.time_range.end.getTime()) {
          return false;
        }
      }
      return true;
    });

    // 搜索模式
    patterns = Array.from(this.patternLibrary.values()).filter(pattern => {
      if (query.pattern_type && pattern.pattern_type !== query.pattern_type) {
        return false;
      }
      return true;
    });

    // 计算相关性得分
    const relevanceScore = this.calculateRelevanceScore(query, applications, structures, patterns);

    return {
      applications,
      structures,
      patterns,
      relevance_score: relevanceScore,
      total_results: applications.length + structures.length + patterns.length,
      search_time: Date.now() - startTime
    };
  }

  /**
   * 获取学习建议
   */
  async getLearningSuggestions(applicationId: string): Promise<string[]> {
    const appMemory = this.applicationMemories.get(applicationId);
    if (!appMemory) {
      return [];
    }

    return await this.learningEngine.generateSuggestions(appMemory);
  }

  /**
   * 适应性更新
   */
  async adaptToChanges(
    applicationId: string,
    changes: Array<{
      type: 'addition' | 'removal' | 'modification';
      elementId: string;
      description: string;
    }>
  ): Promise<boolean> {
    const appMemory = this.applicationMemories.get(applicationId);
    if (!appMemory) {
      return false;
    }

    return await this.learningEngine.processChanges(appMemory, changes);
  }

  /**
   * 获取应用统计信息
   */
  getApplicationStats(applicationId: string): {
    total_structures: number;
    total_behaviors: number;
    learning_progress: number;
    confidence_score: number;
    last_updated: Date;
  } | null {
    const appMemory = this.applicationMemories.get(applicationId);
    if (!appMemory) {
      return null;
    }

    return {
      total_structures: appMemory.ui_structures.length,
      total_behaviors: appMemory.user_behaviors.length,
      learning_progress: this.calculateLearningProgress(appMemory),
      confidence_score: appMemory.confidence_score,
      last_updated: appMemory.updated_at
    };
  }

  // 私有方法

  private async createApplicationMemory(
    applicationId: string,
    applicationType: ApplicationType,
    platform: Platform
  ): Promise<ApplicationMemory> {
    return {
      id: uuidv4(),
      application_id: applicationId,
      application_type: applicationType,
      application_name: this.extractApplicationName(applicationId),
      platform,
      ui_structures: [],
      common_patterns: [],
      user_behaviors: [],
      learning_data: {
        total_interactions: 0,
        successful_interactions: 0,
        learning_rate: 0.0,
        identified_patterns: [],
        pattern_confidence: {},
        adaptation_suggestions: [],
        performance_improvements: [],
        user_feedback: [],
        system_feedback: []
      },
      adaptation_history: [],
      created_at: new Date(),
      updated_at: new Date(),
      last_accessed: new Date(),
      access_count: 0,
      confidence_score: 0.5,
      tags: [applicationType, platform]
    };
  }

  private extractApplicationName(applicationId: string): string {
    // 从applicationId中提取应用名称
    if (applicationId.startsWith('http')) {
      try {
        const url = new URL(applicationId);
        return url.hostname.replace('www.', '');
      } catch {
        return applicationId;
      }
    }
    return applicationId.split('.').pop() || applicationId;
  }

  private async analyzeUIStructure(
    elements: UIElement[],
    context?: any
  ): Promise<UIStructure> {
    const structureType = this.inferStructureType(elements, context);
    const pageHash = this.calculatePageHash(elements);

    return {
      id: uuidv4(),
      structure_type: structureType,
      page_url: context?.pageUrl,
      page_route: context?.pageRoute,
      page_title: context?.pageTitle,
      page_hash: pageHash,
      root_container: this.buildContainerSnapshot(elements),
      container_hierarchy: this.buildContainerHierarchy(elements),
      visual_features: this.extractVisualFeatures(elements),
      structural_features: this.extractStructuralFeatures(elements),
      behavioral_features: await this.extractBehavioralFeatures(elements),
      change_history: [],
      stability_score: 0.8,
      first_seen: new Date(),
      last_seen: new Date(),
      occurrence_count: 1
    };
  }

  private inferStructureType(elements: UIElement[], context?: any): StructureType {
    // 基于元素类型和分布推断结构类型
    const elementTypes = elements.map(e => e.type);

    if (elementTypes.includes('input') && elementTypes.includes('button')) {
      if (elementTypes.some(t => t.includes('password') || t.includes('login'))) {
        return 'login_page';
      }
      return 'form_page';
    }

    if (elementTypes.includes('search') || context?.pageUrl?.includes('search')) {
      return 'search_page';
    }

    if (elementTypes.filter(t => t === 'link' || t === 'list').length > elementTypes.length / 2) {
      return 'list_page';
    }

    if (context?.pageUrl?.includes('dashboard') || elementTypes.some(t => t.includes('chart'))) {
      return 'dashboard';
    }

    return 'custom';
  }

  private calculatePageHash(elements: UIElement[]): string {
    // 计算页面结构的哈希值
    const structure = elements
      .map(e => `${e.type}:${e.bbox.x1},${e.bbox.y1},${e.bbox.x2},${e.bbox.y2}`)
      .sort()
      .join('|');

    return this.simpleHash(structure);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private buildContainerSnapshot(elements: UIElement[]): any {
    // 构建容器快照
    return {
      container_id: 'root',
      container_type: 'page',
      bounds: this.calculateOverallBounds(elements),
      properties: {
        element_count: elements.length,
        element_types: [...new Set(elements.map(e => e.type))]
      },
      children: elements.slice(0, 10).map(e => e.id), // 限制子元素数量
      stability_score: 0.8,
      change_frequency: 0.1,
      timestamp: new Date()
    };
  }

  private calculateOverallBounds(elements: UIElement[]): any {
    if (elements.length === 0) {
      return { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100 };
    }

    const x1 = Math.min(...elements.map(e => e.bbox.x1));
    const y1 = Math.min(...elements.map(e => e.bbox.y1));
    const x2 = Math.max(...elements.map(e => e.bbox.x2));
    const y2 = Math.max(...elements.map(e => e.bbox.y2));

    return {
      x1, y1, x2, y2,
      width: x2 - x1,
      height: y2 - y1
    };
  }

  private buildContainerHierarchy(elements: UIElement[]): any[] {
    // 构建容器层级关系
    return elements.slice(0, 5).map((element, index) => ({
      level: 1,
      container_id: element.id,
      relationship_type: 'parent-child' as const,
      strength: 0.8
    }));
  }

  private extractVisualFeatures(elements: UIElement[]): any {
    return {
      color_scheme: [],
      layout_pattern: 'grid',
      component_density: elements.length / 100,
      visual_complexity: this.calculateComplexity(elements),
      dominant_colors: [],
      layout_grid: {
        columns: 12,
        rows: 8,
        gutters: 16,
        alignment: 'start'
      },
      font_families: [],
      font_sizes: [],
      text_density: elements.filter(e => e.text).length / elements.length
    };
  }

  private calculateComplexity(elements: UIElement[]): number {
    // 计算视觉复杂度
    const typeDiversity = new Set(elements.map(e => e.type)).size;
    const spatialDensity = elements.length;
    return Math.min(1, (typeDiversity + spatialDensity / 50) / 10);
  }

  private extractStructuralFeatures(elements: UIElement[]): any {
    return {
      dom_depth: 3,
      element_count: elements.length,
      container_types: [...new Set(elements.map(e => e.type))],
      interaction_elements: elements.filter(e =>
        ['button', 'input', 'link', 'select'].includes(e.type)
      ).map(e => e.type),
      semantic_html: true,
      accessibility_score: 0.8
    };
  }

  private async extractBehavioralFeatures(elements: UIElement[]): Promise<any> {
    return {
      common_user_flows: [],
      interaction_patterns: [],
      performance_metrics: {
        load_time: 1000,
        interaction_response_time: 200,
        error_rate: 0.02,
        user_satisfaction_score: 4.2
      },
      likely_next_actions: [],
      abandonment_points: [],
      task_completion_rates: {},
      error_prone_elements: []
    };
  }

  private findSimilarStructure(appMemory: ApplicationMemory, newStructure: UIStructure): UIStructure | null {
    // 查找相似的结构
    for (const structure of appMemory.ui_structures) {
      if (structure.page_hash === newStructure.page_hash) {
        return structure;
      }
    }
    return null;
  }

  private async updateExistingStructure(existing: UIStructure, updated: UIStructure): Promise<void> {
    // 更新现有结构
    existing.last_seen = new Date();
    existing.occurrence_count++;

    // 记录变化
    existing.change_history.push({
      timestamp: new Date(),
      change_type: 'modification',
      affected_elements: [],
      description: 'Structure updated with new recognition',
      impact_level: 'low'
    });
  }

  private async learnFromNewStructure(appMemory: ApplicationMemory, structure: UIStructure): Promise<void> {
    // 从新结构中学习
    await this.learningEngine.processNewStructure(appMemory, structure);
    appMemory.updated_at = new Date();
  }

  private async calculateStructureSimilarity(structure1: UIStructure, structure2: UIStructure): Promise<number> {
    // 计算结构相似度
    if (structure1.page_hash === structure2.page_hash) {
      return 1.0;
    }

    // 基于元素类型和位置计算相似度
    const typeSimilarity = this.calculateTypeSimilarity(structure1, structure2);
    const spatialSimilarity = this.calculateSpatialSimilarity(structure1, structure2);

    return (typeSimilarity + spatialSimilarity) / 2;
  }

  private calculateTypeSimilarity(structure1: UIStructure, structure2: UIStructure): number {
    const types1 = new Set(structure1.structural_features.element_types);
    const types2 = new Set(structure2.structural_features.element_types);

    const intersection = new Set([...types1].filter(x => types2.has(x)));
    const union = new Set([...types1, ...types2]);

    return intersection.size / union.size;
  }

  private calculateSpatialSimilarity(structure1: UIStructure, structure2: UIStructure): number {
    const bounds1 = structure1.root_container.bounds;
    const bounds2 = structure2.root_container.bounds;

    const widthDiff = Math.abs(bounds1.width - bounds2.width) / Math.max(bounds1.width, bounds2.width);
    const heightDiff = Math.abs(bounds1.height - bounds2.height) / Math.max(bounds1.height, bounds2.height);

    return 1 - (widthDiff + heightDiff) / 2;
  }

  private determineCompletionStatus(actions: any[]): 'completed' | 'abandoned' | 'interrupted' {
    const failureCount = actions.filter(a => a.result === 'failure').length;
    const successCount = actions.filter(a => a.result === 'success').length;

    if (failureCount === 0) return 'completed';
    if (failureCount > successCount) return 'abandoned';
    return 'interrupted';
  }

  private identifyBehaviorPattern(actions: any[]): string {
    // 识别行为模式
    const actionTypes = actions.map(a => a.action);

    if (actionTypes.includes('type') && actionTypes.includes('click')) {
      return 'form_filling';
    }
    if (actionTypes.includes('click') && actionTypes.length > 3) {
      return 'navigation';
    }
    if (actionTypes.includes('search')) {
      return 'search_behavior';
    }

    return 'general_interaction';
  }

  private calculateEfficiencyScore(actions: any[]): number {
    const successCount = actions.filter(a => a.result === 'success').length;
    return actions.length > 0 ? successCount / actions.length : 0;
  }

  private calculateLearningProgress(appMemory: ApplicationMemory): number {
    if (appMemory.ui_structures.length === 0) return 0;

    const learningData = appMemory.learning_data;
    return Math.min(1, learningData.learning_rate +
      (appMemory.ui_structures.length / 10) * 0.3 +
      (appMemory.user_behaviors.length / 50) * 0.2);
  }

  private calculateRelevanceScore(
    query: MemoryQuery,
    applications: ApplicationMemory[],
    structures: UIStructure[],
    patterns: UIPattern[]
  ): number {
    // 计算搜索结果的相关性得分
    let score = 0;

    if (query.application_id && applications.length > 0) {
      score += 0.4;
    }

    if (query.structure_type && structures.length > 0) {
      score += 0.3;
    }

    if (query.pattern_type && patterns.length > 0) {
      score += 0.3;
    }

    return Math.min(1, score);
  }

  private initializePatternLibrary(): void {
    // 初始化模式库
    const commonPatterns: UIPattern[] = [
      {
        id: 'login-pattern',
        pattern_name: 'Login Pattern',
        pattern_type: 'authentication',
        description: 'Standard login form with username/password fields',
        visual_signature: 'login-auth-form',
        structural_signature: 'input[username]-input[password]-button[submit]',
        behavioral_signature: 'type->type->click',
        applicable_structures: ['login_page'],
        common_contexts: ['authentication', 'user_session'],
        usage_frequency: 0.9,
        success_rate: 0.85,
        reliability_score: 0.9,
        feedback_history: [],
        optimization_suggestions: []
      }
    ];

    commonPatterns.forEach(pattern => {
      this.patternLibrary.set(pattern.id, pattern);
    });
  }

  private async cleanup(): void {
    const now = new Date();
    const maxAge = this.config.max_memory_age_days * 24 * 60 * 60 * 1000;

    // 清理过期数据
    for (const [appId, appMemory] of this.applicationMemories.entries()) {
      if (now.getTime() - appMemory.last_accessed.getTime() > maxAge) {
        this.applicationMemories.delete(appId);
      }
    }
  }
}

// 学习引擎
class LearningEngine {
  private config: MemorySystemConfig;

  constructor(config: MemorySystemConfig) {
    this.config = config;
  }

  async processNewStructure(appMemory: ApplicationMemory, structure: UIStructure): Promise<void> {
    // 处理新结构的学习
    this.updateLearningMetrics(appMemory);
    await this.identifyPatterns(appMemory, structure);
  }

  async processUserBehavior(appMemory: ApplicationMemory, behavior: UserBehavior): Promise<void> {
    // 处理用户行为学习
    appMemory.learning_data.total_interactions++;

    if (behavior.completion_status === 'completed') {
      appMemory.learning_data.successful_interactions++;
    }

    appMemory.learning_data.learning_rate =
      appMemory.learning_data.successful_interactions /
      Math.max(1, appMemory.learning_data.total_interactions);

    // 分析行为模式
    await this.analyzeBehaviorPattern(appMemory, behavior);
  }

  async processChanges(appMemory: ApplicationMemory, changes: any[]): Promise<boolean> {
    // 处理适应性变化
    const adaptation = {
      timestamp: new Date(),
      adaptation_type: 'structural' as const,
      trigger: 'ui_structure_change',
      changes: changes.map(change => ({
        element_id: change.elementId,
        change_type: change.type,
        old_value: null,
        new_value: change.description,
        reason: 'Detected UI change'
      })),
      outcome: {
        success: true,
        impact_level: 'medium' as const,
        measurable_improvement: true,
        unexpected_side_effects: []
      },
      performance_impact: 0.1,
      user_satisfaction_impact: 0.05,
      lessons_learned: ['UI structures can change dynamically'],
      future_preventions: ['Monitor for structural changes']
    };

    appMemory.adaptation_history.push(adaptation);
    return true;
  }

  async generateSuggestions(appMemory: ApplicationMemory): Promise<string[]> {
    const suggestions: string[] = [];

    // 基于学习数据生成建议
    if (appMemory.learning_data.learning_rate < 0.5) {
      suggestions.push('Consider providing more user guidance for complex interactions');
    }

    if (appMemory.ui_structures.length > 50) {
      suggestions.push('Application has many UI variations - consider standardizing common patterns');
    }

    const recentErrors = appMemory.user_behaviors
      .filter(b => b.error_events.length > 0)
      .slice(-10);

    if (recentErrors.length > 5) {
      suggestions.push('High error rate detected - review UI element accessibility');
    }

    return suggestions;
  }

  private updateLearningMetrics(appMemory: ApplicationMemory): void {
    appMemory.confidence_score = Math.min(1,
      appMemory.confidence_score + 0.01
    );
  }

  private async identifyPatterns(appMemory: ApplicationMemory, structure: UIStructure): Promise<void> {
    // 识别模式
    const knownPatterns = Array.from(this.patternLibrary.values());

    for (const pattern of knownPatterns) {
      if (this.matchesPattern(structure, pattern)) {
        if (!appMemory.common_patterns.find(p => p.id === pattern.id)) {
          appMemory.common_patterns.push({...pattern});
        }
      }
    }
  }

  private matchesPattern(structure: UIStructure, pattern: UIPattern): boolean {
    // 简单的模式匹配
    return structure.structure_type === 'login_page' &&
           pattern.pattern_type === 'authentication';
  }

  private async analyzeBehaviorPattern(appMemory: ApplicationMemory, behavior: UserBehavior): Promise<void> {
    // 分析行为模式
    const pattern = behavior.behavior_pattern;

    if (!appMemory.learning_data.identified_patterns.includes(pattern)) {
      appMemory.learning_data.identified_patterns.push(pattern);
    }
  }
}