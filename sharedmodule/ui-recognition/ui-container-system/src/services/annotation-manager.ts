/**
 * 高层UI容器系统 - 标注管理器实现
 * 管理容器标注系统，支持层级结构建立和锚点关联
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import {
  ContainerAnnotation,
  AnnotationManager,
  AnnotationType,
  AnnotationLevel,
  AnchorRelationship,
  CreateAnnotationRequest,
  ContainerHierarchy,
  TreeNode,
  AnchorRelationshipInfo,
  AnchorOptimizationResult,
  AnnotationSearchQuery,
  ValidationResult,
  ValidationIssue,
  ImprovementResult,
  AnnotationUpdate,
  ValidationSummary,
  RelativePosition,
  LayoutRegion,
  AnnotationContent,
  ValidationStatus,
  AnnotationCreator,
  AnnotationComment,
  BoundingBox
} from '../types/annotation';

export class AnnotationManagerService extends EventEmitter implements AnnotationManager {
  private annotations: Map<string, ContainerAnnotation> = new Map();
  private hierarchy: ContainerHierarchy | null = null;
  private sequenceCounter: number = 1;

  constructor() {
    super();
  }

  /**
   * 创建标注
   */
  async createAnnotation(request: CreateAnnotationRequest): Promise<ContainerAnnotation> {
    const annotationId = uuidv4();
    const containerId = uuidv4();

    const annotation: ContainerAnnotation = {
      id: annotationId,
      sequence_number: request.parent_annotation_id ?
        this.getParentSequenceNumber(request.parent_annotation_id) + 1 :
        this.sequenceCounter++,
      annotation_type: request.annotation_type,
      annotation_level: this.determineAnnotationLevel(request.annotation_type),
      container_id: containerId,
      container_type: request.container_type,
      container_name: request.container_name,
      is_root_container: !request.parent_annotation_id,
      parent_annotation_id: request.parent_annotation_id,
      parent_sequence_number: request.parent_annotation_id ?
        this.getParentSequenceNumber(request.parent_annotation_id) : undefined,
      child_annotation_ids: [],
      anchor_element_id: request.anchor_element_id,
      anchor_element_type: request.anchor_element_id ? 'binding_element' : undefined,
      anchor_relationship: request.anchor_relationship,
      bounds: request.bounds,
      relative_position: this.calculateRelativePosition(request.bounds, request.parent_annotation_id),
      annotation_content: request.annotation_content,
      tagging_rules: request.tagging_rules,
      visual_features: this.extractDefaultVisualFeatures(),
      structural_features: this.extractDefaultStructuralFeatures(),
      validation_status: ValidationStatus.pending,
      quality_score: 0.8,
      confidence_score: 0.85,
      created_by: AnnotationCreator.system_auto,
      created_at: new Date(),
      tags: request.tags,
      comments: [],
      custom_properties: request.custom_properties || {}
    };

    // 保存标注
    this.annotations.set(annotationId, annotation);

    // 更新父容器的子容器列表
    if (request.parent_annotation_id) {
      const parentAnnotation = this.annotations.get(request.parent_annotation_id);
      if (parentAnnotation) {
        parentAnnotation.child_annotation_ids.push(annotationId);
      }
    }

    // 验证标注
    const validationResult = await this.validateAnnotation(annotation);
    if (validationResult.is_valid) {
      annotation.validation_status = ValidationStatus.verified;
    } else {
      annotation.validation_status = ValidationStatus.needs_review;
    }

    this.emit('annotationCreated', { annotation, validationResult });
    return annotation;
  }

  /**
   * 创建根容器
   */
  async createRootContainer(bounds: BoundingBox, metadata: any): Promise<ContainerAnnotation> {
    const request: CreateAnnotationRequest = {
      annotation_type: AnnotationType.root_container,
      annotation_level: AnnotationLevel.page,
      container_type: 'page_container',
      container_name: '页面根容器',
      bounds,
      anchor_relationship: AnchorRelationship.structural_anchor,
      annotation_content: {
        title: '页面根容器',
        description: '整个页面的根容器',
        purpose: '页面结构组织',
        primary_function: '布局容器',
        secondary_functions: ['元素包含', '结构组织'],
        user_intent: '浏览页面',
        content_type: 'mixed',
        content_summary: '包含所有页面元素',
        key_elements: [],
        interaction_patterns: [],
        user_flow_position: {
          flow_name: 'page_navigation',
          step_number: 0,
          step_name: '页面加载',
          is_critical_path: true,
          alternatives: []
        },
        business_rules: [],
        data_sensitivity: 'public'
      },
      tagging_rules: [],
      tags: ['root', 'page', 'auto-generated'],
      custom_properties: metadata || {}
    };

    return this.createAnnotation(request);
  }

  /**
   * 创建子容器
   */
  async createChildContainer(
    parentId: string,
    bounds: BoundingBox,
    anchorElementId: string
  ): Promise<ContainerAnnotation> {
    const parentAnnotation = this.annotations.get(parentId);
    if (!parentAnnotation) {
      throw new Error(`父容器标注不存在: ${parentId}`);
    }

    const childType = this.determineChildContainerType(bounds, parentAnnotation);
    const childName = this.generateChildContainerName(childType, parentAnnotation.child_annotation_ids.length + 1);

    const request: CreateAnnotationRequest = {
      annotation_type: AnnotationType.child_container,
      annotation_level: this.determineChildAnnotationLevel(parentAnnotation.annotation_level),
      container_type: childType,
      container_name: childName,
      bounds,
      parent_annotation_id: parentId,
      anchor_element_id: anchorElementId,
      anchor_relationship: AnchorRelationship.contains_anchor,
      annotation_content: this.generateChildAnnotationContent(childName, childType),
      tagging_rules: this.generateChildTaggingRules(childType),
      tags: [childType, 'child-container', 'auto-generated'],
      custom_properties: {
        parent_id: parentId,
        anchor_element: anchorElementId
      }
    };

    return this.createAnnotation(request);
  }

  /**
   * 更新标注
   */
  async updateAnnotation(annotationId: string, updates: Partial<ContainerAnnotation>): Promise<boolean> {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) {
      return false;
    }

    // 应用更新
    Object.assign(annotation, updates);
    annotation.last_updated = new Date();

    // 重新验证
    const validationResult = await this.validateAnnotation(annotation);
    if (validationResult.is_valid) {
      annotation.validation_status = ValidationStatus.verified;
    } else {
      annotation.validation_status = ValidationStatus.needs_review;
    }

    this.emit('annotationUpdated', { annotationId, updates, validationResult });
    return true;
  }

  /**
   * 删除标注
   */
  async deleteAnnotation(annotationId: string): Promise<boolean> {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) {
      return false;
    }

    // 检查是否有子容器
    if (annotation.child_annotation_ids.length > 0) {
      throw new Error(`无法删除包含子容器的标注: ${annotationId}`);
    }

    // 从父容器中移除
    if (annotation.parent_annotation_id) {
      const parentAnnotation = this.annotations.get(annotation.parent_annotation_id);
      if (parentAnnotation) {
        parentAnnotation.child_annotation_ids = parentAnnotation.child_annotation_ids
          .filter(id => id !== annotationId);
      }
    }

    // 删除标注
    this.annotations.delete(annotationId);

    this.emit('annotationDeleted', { annotationId });
    return true;
  }

  /**
   * 获取标注
   */
  getAnnotation(annotationId: string): ContainerAnnotation | null {
    return this.annotations.get(annotationId) || null;
  }

  /**
   * 构建容器层级
   */
  async buildContainerHierarchy(annotations: ContainerAnnotation[]): Promise<ContainerHierarchy> {
    // 找到根容器
    const rootContainers = annotations.filter(a => a.is_root_container);

    // 构建树结构
    const treeStructure: TreeNode[] = [];
    for (const rootAnnotation of rootContainers) {
      const treeNode = await this.buildTreeNode(rootAnnotation, annotations);
      treeStructure.push(treeNode);
    }

    // 计算层级深度
    const hierarchyDepth = this.calculateMaxDepth(treeStructure);

    // 建立容器关系
    const relationships = this.establishContainerRelationships(annotations);

    const hierarchy: ContainerHierarchy = {
      root_containers: rootContainers,
      all_containers: annotations,
      hierarchy_depth: hierarchyDepth,
      total_containers: annotations.length,
      tree_structure: treeStructure,
      relationships,
      quality_metrics: this.calculateHierarchyQuality(treeStructure, relationships)
    };

    this.hierarchy = hierarchy;
    this.emit('hierarchyBuilt', { hierarchy });

    return hierarchy;
  }

  /**
   * 验证层级结构
   */
  async validateHierarchy(hierarchy: ContainerHierarchy): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    let is_valid = true;

    // 验证根容器
    if (hierarchy.root_containers.length === 0) {
      issues.push({
        issue_type: 'structure',
        severity: 'critical',
        description: '缺少根容器',
        affected_element: 'hierarchy',
        suggested_fix: '创建至少一个根容器'
      });
      is_valid = false;
    }

    // 验证循环引用
    const cycleDetected = this.detectCycles(hierarchy.tree_structure);
    if (cycleDetected) {
      issues.push({
        issue_type: 'structure',
        severity: 'critical',
        description: '检测到循环引用',
        affected_element: 'hierarchy',
        suggested_fix: '修复容器父子关系'
      });
      is_valid = false;
    }

    // 验证孤立容器
    const orphanedContainers = this.findOrphanedContainers(hierarchy);
    if (orphanedContainers.length > 0) {
      issues.push({
        issue_type: 'structure',
        severity: 'medium',
        description: `发现${orphanedContainers.length}个孤立容器`,
        affected_element: orphanedContainers.join(', '),
        suggested_fix: '将孤立容器分配到合适的父容器或创建新的根容器'
      });
    }

    // 验证锚点关系
    for (const annotation of hierarchy.all_containers) {
      if (annotation.anchor_element_id && !this.validateAnchorElement(annotation)) {
        issues.push({
          issue_type: 'anchor',
          severity: 'medium',
          description: `锚点元素无效: ${annotation.anchor_element_id}`,
          affected_element: annotation.id,
          suggested_fix: '重新选择锚点元素或移除锚点关系'
        });
      }
    }

    const validationResult: ValidationResult = {
      is_valid,
      confidence: is_valid ? 0.9 : 0.6,
      issues,
      suggestions: this.generateValidationSuggestions(issues),
      next_steps: this.generateNextSteps(issues)
    };

    this.emit('hierarchyValidated', { hierarchy, validationResult });
    return validationResult;
  }

  /**
   * 优化层级结构
   */
  async optimizeHierarchy(hierarchy: ContainerHierarchy): Promise<ContainerHierarchy> {
    let optimizedHierarchy = { ...hierarchy };

    // 优化容器边界
    optimizedHierarchy = this.optimizeContainerBounds(optimizedHierarchy);

    // 合并相似容器
    optimizedHierarchy = this.mergeSimilarContainers(optimizedHierarchy);

    // 移除冗余容器
    optimizedHierarchy = this.removeRedundantContainers(optimizedHierarchy);

    // 重新计算质量指标
    optimizedHierarchy.quality_metrics = this.calculateHierarchyQuality(
      optimizedHierarchy.tree_structure,
      optimizedHierarchy.relationships
    );

    this.emit('hierarchyOptimized', {
      original: hierarchy.total_containers,
      optimized: optimizedHierarchy.total_containers
    });

    return optimizedHierarchy;
  }

  /**
   * 建立锚点关系
   */
  async establishAnchorRelationship(
    parentId: string,
    childId: string,
    anchorElementId: string
  ): Promise<boolean> {
    const parentAnnotation = this.annotations.get(parentId);
    const childAnnotation = this.annotations.get(childId);

    if (!parentAnnotation || !childAnnotation) {
      return false;
    }

    // 更新子容器的锚点信息
    childAnnotation.anchor_element_id = anchorElementId;
    childAnnotation.anchor_element_type = 'binding_element';
    childAnnotation.anchor_relationship = AnchorRelationship.contains_anchor;

    // 验证锚点关系
    const anchorInfo: AnchorRelationshipInfo = {
      parent_annotation_id: parentId,
      child_annotation_id: childId,
      anchor_element_id: anchorElementId,
      relationship_type: AnchorRelationship.contains_anchor,
      confidence: 0.9,
      validation_rules: [
        'anchor_element_must_exist',
        'anchor_must_be_in_parent',
        'anchor_must_be_near_child'
      ]
    };

    const isValid = await this.validateAnchorRelationship(anchorInfo);
    if (!isValid) {
      childAnnotation.validation_status = ValidationStatus.needs_review;
    }

    this.emit('anchorRelationshipEstablished', { parentId, childId, anchorElementId, isValid });
    return true;
  }

  /**
   * 验证锚点关系
   */
  async validateAnchorRelationship(relationship: AnchorRelationshipInfo): Promise<boolean> {
    // 简化验证实现
    const parentAnnotation = this.annotations.get(relationship.parent_annotation_id);
    const childAnnotation = this.annotations.get(relationship.child_annotation_id);

    if (!parentAnnotation || !childAnnotation) {
      return false;
    }

    // 验证锚点元素是否在父容器边界内
    // 这里应该有实际的元素位置验证逻辑
    // 简化实现：总是返回true
    return true;
  }

  /**
   * 优化锚点关系
   */
  async optimizeAnchorRelationships(containerId: string): Promise<AnchorOptimizationResult> {
    const container = this.annotations.get(containerId);
    if (!container) {
      throw new Error(`容器不存在: ${containerId}`);
    }

    let optimizedRelationships = 0;
    let addedRelationships = 0;
    let removedRelationships = 0;
    const suggestions: string[] = [];

    // 分析子容器的锚点关系
    for (const childId of container.child_annotation_ids) {
      const childAnnotation = this.annotations.get(childId);
      if (!childAnnotation) continue;

      // 检查是否需要优化锚点
      if (!childAnnotation.anchor_element_id) {
        // 尝试自动寻找合适的锚点
        const suggestedAnchor = this.suggestAnchorElement(container, childAnnotation);
        if (suggestedAnchor) {
          suggestions.push(`为容器 ${childAnnotation.container_name} 建议锚点: ${suggestedAnchor}`);
          addedRelationships++;
        }
      } else {
        // 验证现有锚点的质量
        const anchorQuality = this.evaluateAnchorQuality(container, childAnnotation);
        if (anchorQuality < 0.7) {
          suggestions.push(`容器 ${childAnnotation.container_name} 的锚点质量较低，建议重新选择`);
          optimizedRelationships++;
        }
      }
    }

    const improvedReliability = suggestions.length > 0 ? 0.15 : 0.05;

    const result: AnchorOptimizationResult = {
      optimized_relationships: optimizedRelationships,
      added_relationships: addedRelationships,
      removed_relationships: removedRelationships,
      improved_reliability: improvedReliability,
      suggestions
    };

    this.emit('anchorRelationshipsOptimized', { containerId, result });
    return result;
  }

  /**
   * 搜索标注
   */
  async searchAnnotations(query: AnnotationSearchQuery): Promise<ContainerAnnotation[]> {
    let results = Array.from(this.annotations.values());

    // 按类型过滤
    if (query.annotation_type) {
      results = results.filter(a => a.annotation_type === query.annotation_type);
    }

    // 按级别过滤
    if (query.annotation_level) {
      results = results.filter(a => a.annotation_level === query.annotation_level);
    }

    // 按容器类型过滤
    if (query.container_type) {
      results = results.filter(a => a.container_type === query.container_type);
    }

    // 按标签过滤
    if (query.tags && query.tags.length > 0) {
      results = results.filter(a =>
        query.tags!.some(tag => a.tags.includes(tag))
      );
    }

    // 按父容器过滤
    if (query.parent_id) {
      results = results.filter(a => a.parent_annotation_id === query.parent_id);
    }

    // 按锚点元素过滤
    if (query.anchor_element_id) {
      results = results.filter(a => a.anchor_element_id === query.anchor_element_id);
    }

    // 按质量分数过滤
    if (query.quality_score_min) {
      results = results.filter(a => a.quality_score >= query.quality_score_min!);
    }

    // 按置信度过滤
    if (query.confidence_score_min) {
      results = results.filter(a => a.confidence_score >= query.confidence_score_min!);
    }

    // 按创建时间过滤
    if (query.created_after) {
      results = results.filter(a => a.created_at >= query.created_after!);
    }

    if (query.created_before) {
      results = results.filter(a => a.created_at <= query.created_before!);
    }

    this.emit('annotationsSearched', { query, resultCount: results.length });
    return results;
  }

  /**
   * 按级别查找标注
   */
  async findAnnotationsByLevel(level: AnnotationLevel): Promise<ContainerAnnotation[]> {
    return this.searchAnnotations({ annotation_level: level });
  }

  /**
   * 按类型查找标注
   */
  async findAnnotationsByType(type: AnnotationType): Promise<ContainerAnnotation[]> {
    return this.searchAnnotations({ annotation_type: type });
  }

  /**
   * 验证标注
   */
  async validateAnnotation(annotation: ContainerAnnotation): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];

    // 验证边界
    if (!this.isValidBoundingBox(annotation.bounds)) {
      issues.push({
        issue_type: 'structure',
        severity: 'high',
        description: '容器边界无效',
        affected_element: annotation.id,
        suggested_fix: '检查并修正容器边界坐标'
      });
    }

    // 验证名称
    if (!annotation.container_name || annotation.container_name.trim().length === 0) {
      issues.push({
        issue_type: 'content',
        severity: 'medium',
        description: '容器名称为空',
        affected_element: annotation.id,
        suggested_fix: '为容器提供有意义的名称'
      });
    }

    // 验证父容器关系
    if (annotation.parent_annotation_id) {
      const parentAnnotation = this.annotations.get(annotation.parent_annotation_id);
      if (!parentAnnotation) {
        issues.push({
          issue_type: 'structure',
          severity: 'high',
          description: '父容器不存在',
          affected_element: annotation.id,
          suggested_fix: '重新分配父容器或设为根容器'
        });
      }
    }

    // 验证锚点元素
    if (annotation.anchor_element_id && !this.validateAnchorElement(annotation)) {
      issues.push({
        issue_type: 'anchor',
        severity: 'medium',
        description: '锚点元素无效',
        affected_element: annotation.id,
        suggested_fix: '重新选择锚点元素'
      });
    }

    const is_valid = issues.length === 0;
    const confidence = is_valid ? 0.95 : Math.max(0.5, 1 - (issues.length * 0.1));

    return {
      is_valid,
      confidence,
      issues,
      suggestions: this.generateValidationSuggestions(issues),
      next_steps: this.generateNextSteps(issues)
    };
  }

  /**
   * 计算质量分数
   */
  calculateQualityScore(annotation: ContainerAnnotation): number {
    let score = 0.5; // 基础分数

    // 边界有效性
    if (this.isValidBoundingBox(annotation.bounds)) {
      score += 0.15;
    }

    // 名称质量
    if (annotation.container_name && annotation.container_name.length > 3) {
      score += 0.1;
    }

    // 父容器关系
    if (annotation.parent_annotation_id) {
      const parentAnnotation = this.annotations.get(annotation.parent_annotation_id);
      if (parentAnnotation) {
        score += 0.1;
      }
    }

    // 锚点关系
    if (annotation.anchor_element_id && this.validateAnchorElement(annotation)) {
      score += 0.15;
    }

    // 标注内容
    if (annotation.annotation_content && annotation.annotation_content.description) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  /**
   * 改进标注
   */
  async improveAnnotation(annotationId: string): Promise<ImprovementResult> {
    const annotation = this.annotations.get(annotationId);
    if (!annotation) {
      throw new Error(`标注不存在: ${annotationId}`);
    }

    const improvementsMade: string[] = [];
    const originalQuality = annotation.quality_score;

    // 改进容器名称
    if (!annotation.container_name || annotation.container_name.length < 3) {
      annotation.container_name = this.generateImprovedContainerName(annotation);
      improvementsMade.push('改进了容器名称');
    }

    // 改进标注内容
    if (!annotation.annotation_content.description) {
      annotation.annotation_content.description = this.generateImprovedDescription(annotation);
      improvementsMade.push('添加了容器描述');
    }

    // 寻找合适的锚点
    if (!annotation.anchor_element_id && annotation.parent_annotation_id) {
      const parentAnnotation = this.annotations.get(annotation.parent_annotation_id);
      if (parentAnnotation) {
        const suggestedAnchor = this.suggestAnchorElement(parentAnnotation, annotation);
        if (suggestedAnchor) {
          annotation.anchor_element_id = suggestedAnchor;
          annotation.anchor_element_type = 'binding_element';
          improvementsMade.push('添加了锚点关系');
        }
      }
    }

    // 重新计算质量分数
    annotation.quality_score = this.calculateQualityScore(annotation);
    const qualityImprovement = annotation.quality_score - originalQuality;

    const result: ImprovementResult = {
      improvements_made: improvementsMade,
      quality_improvement: qualityImprovement,
      new_confidence: annotation.confidence_score,
      remaining_issues: [],
      next_recommendations: this.generateNextRecommendations(annotation)
    };

    this.emit('annotationImproved', { annotationId, result });
    return result;
  }

  /**
   * 批量创建标注
   */
  async batchCreateAnnotations(requests: CreateAnnotationRequest[]): Promise<ContainerAnnotation[]> {
    const annotations: ContainerAnnotation[] = [];

    for (const request of requests) {
      try {
        const annotation = await this.createAnnotation(request);
        annotations.push(annotation);
      } catch (error) {
        console.error(`创建标注失败:`, error);
      }
    }

    this.emit('batchAnnotationsCreated', {
      requested: requests.length,
      created: annotations.length
    });

    return annotations;
  }

  /**
   * 批量更新标注
   */
  async batchUpdateAnnotations(updates: AnnotationUpdate[]): Promise<boolean> {
    let successCount = 0;

    for (const update of updates) {
      const success = await this.updateAnnotation(update.annotation_id, update.updates);
      if (success) {
        successCount++;
      }
    }

    const allSuccess = successCount === updates.length;
    this.emit('batchAnnotationsUpdated', {
      requested: updates.length,
      successful: successCount,
      allSuccess
    });

    return allSuccess;
  }

  /**
   * 批量验证标注
   */
  async batchValidateAnnotations(annotationIds: string[]): Promise<ValidationSummary> {
    const results: ValidationResult[] = [];

    for (const annotationId of annotationIds) {
      const annotation = this.annotations.get(annotationId);
      if (annotation) {
        const result = await this.validateAnnotation(annotation);
        results.push(result);
      }
    }

    const totalAnnotations = results.length;
    const validAnnotations = results.filter(r => r.is_valid).length;
    const invalidAnnotations = totalAnnotations - validAnnotations;

    // 统计问题类型
    const issuesSummary: Record<string, number> = {};
    for (const result of results) {
      for (const issue of result.issues) {
        issuesSummary[issue.issue_type] = (issuesSummary[issue.issue_type] || 0) + 1;
      }
    }

    const overallQuality = validAnnotations / totalAnnotations;
    const recommendations = this.generateBatchRecommendations(results);

    const summary: ValidationSummary = {
      total_annotations: totalAnnotations,
      valid_annotations: validAnnotations,
      invalid_annotations: invalidAnnotations,
      issues_summary: issuesSummary,
      overall_quality: overallQuality,
      recommendations
    };

    this.emit('batchAnnotationsValidated', summary);
    return summary;
  }

  // 私有辅助方法

  private determineAnnotationLevel(annotationType: AnnotationType): AnnotationLevel {
    const levelMapping: Record<AnnotationType, AnnotationLevel> = {
      [AnnotationType.root_container]: AnnotationLevel.page,
      [AnnotationType.child_container]: AnnotationLevel.section,
      [AnnotationType.element_container]: AnnotationLevel.component,
      [AnnotationType.functional_group]: AnnotationLevel.group,
      [AnnotationType.layout_region]: AnnotationLevel.section,
      [AnnotationType.interactive_zone]: AnnotationLevel.group,
      [AnnotationType.content_section]: AnnotationLevel.section,
      [AnnotationType.navigation_group]: AnnotationLevel.group,
      [AnnotationType.form_section]: AnnotationLevel.section,
      [AnnotationType.section]: AnnotationLevel.section,
      [AnnotationType.group]: AnnotationLevel.group,
      [AnnotationType.component]: AnnotationLevel.component,
      [AnnotationType.custom]: AnnotationLevel.element
    };

    return levelMapping[annotationType] || AnnotationLevel.element;
  }

  private getParentSequenceNumber(parentId: string): number {
    const parentAnnotation = this.annotations.get(parentId);
    return parentAnnotation ? parentAnnotation.sequence_number : 0;
  }

  private calculateRelativePosition(bounds: BoundingBox, parentId?: string): RelativePosition {
    if (!parentId) {
      return {
        parent_relative_x: 0,
        parent_relative_y: 0,
        parent_relative_width: 1,
        parent_relative_height: 1,
        depth_level: 0,
        sibling_order: 1,
        z_index: 0,
        layout_region: LayoutRegion.center,
        alignment_info: {
          horizontal_alignment: 'stretch',
          vertical_alignment: 'stretch',
          margin_info: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px' },
          padding_info: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px' }
        }
      };
    }

    // 简化实现：返回默认相对位置
    return {
      parent_relative_x: 0.5,
      parent_relative_y: 0.5,
      parent_relative_width: 0.8,
      parent_relative_height: 0.6,
      depth_level: 1,
      sibling_order: 1,
      z_index: 1,
      layout_region: LayoutRegion.center,
      alignment_info: {
        horizontal_alignment: 'center',
        vertical_alignment: 'center',
        margin_info: { top: 10, right: 10, bottom: 10, left: 10, unit: 'px' },
        padding_info: { top: 5, right: 5, bottom: 5, left: 5, unit: 'px' }
      }
    };
  }

  private extractDefaultVisualFeatures(): any {
    return {
      primary_colors: ['#ffffff', '#f0f0f0'],
      background_color: '#ffffff',
      text_color: '#333333',
      accent_colors: ['#007bff'],
      font_family: 'Arial',
      font_size: 14,
      font_weight: 'normal',
      text_alignment: 'left',
      border_style: 'none',
      border_width: 0,
      corner_radius: 0,
      shadow_info: { has_shadow: false },
      spacing_pattern: { internal_spacing: 10, external_spacing: 20, spacing_consistency: 'consistent', spacing_unit: 'px' },
      grid_alignment: { follows_grid: false },
      visual_hierarchy: { hierarchy_level: 1, dominance_level: 1, attention_grabbing: 'medium', visual_importance: 0.7 },
      contrast_level: 0.7,
      visual_weight: 0.5
    };
  }

  private extractDefaultStructuralFeatures(): any {
    return {
      dom_depth: 3,
      child_count: 0,
      sibling_count: 1,
      semantic_role: 'region',
      html5_tag: 'div',
      nesting_pattern: { pattern_type: 'tree', max_depth: 2, avg_depth: 1.5, branching_factor: 1, regularity_score: 0.8 },
      container_relationships: []
    };
  }

  private determineChildContainerType(bounds: BoundingBox, parentAnnotation: ContainerAnnotation): string {
    // 简化实现：基于父容器类型确定子容器类型
    const parentType = parentAnnotation.container_type;

    if (parentType === 'page_container') {
      return 'section_container';
    } else if (parentType === 'section_container') {
      return 'group_container';
    } else {
      return 'component_container';
    }
  }

  private generateChildContainerName(type: string, index: number): string {
    const typeNames: Record<string, string> = {
      'section_container': '区块容器',
      'group_container': '分组容器',
      'component_container': '组件容器'
    };

    const baseName = typeNames[type] || '容器';
    return `${baseName}_${index}`;
  }

  private determineChildAnnotationLevel(parentLevel: AnnotationLevel): AnnotationLevel {
    const levelProgression: Record<AnnotationLevel, AnnotationLevel> = {
      [AnnotationLevel.page]: AnnotationLevel.section,
      [AnnotationLevel.section]: AnnotationLevel.group,
      [AnnotationLevel.group]: AnnotationLevel.component,
      [AnnotationLevel.component]: AnnotationLevel.element,
      [AnnotationLevel.element]: AnnotationLevel.element
    };

    return levelProgression[parentLevel] || AnnotationLevel.element;
  }

  private generateChildAnnotationContent(name: string, type: string): AnnotationContent {
    return {
      title: name,
      description: `${name}的描述`,
      purpose: '组织和管理相关UI元素',
      primary_function: '容器功能',
      secondary_functions: ['元素包含', '布局管理'],
      user_intent: '与界面交互',
      content_type: 'interactive',
      content_summary: '包含多个交互元素',
      key_elements: [],
      interaction_patterns: [],
      user_flow_position: {
        flow_name: 'user_interaction',
        step_number: 1,
        step_name: name,
        is_critical_path: false,
        alternatives: []
      },
      business_rules: [],
      data_sensitivity: 'public'
    };
  }

  private generateChildTaggingRules(type: string): any[] {
    return [
      {
        rule_id: uuidv4(),
        rule_type: 'structure_based',
        condition: `container_type == '${type}'`,
        tag: type,
        priority: 1,
        auto_apply: true,
        confidence_threshold: 0.7
      }
    ];
  }

  private async buildTreeNode(annotation: ContainerAnnotation, allAnnotations: ContainerAnnotation[]): Promise<TreeNode> {
    const children: TreeNode[] = [];

    // 找到子容器
    for (const childId of annotation.child_annotation_ids) {
      const childAnnotation = allAnnotations.find(a => a.id === childId);
      if (childAnnotation) {
        const childNode = await this.buildTreeNode(childAnnotation, allAnnotations);
        children.push(childNode);
      }
    }

    return {
      annotation,
      children,
      depth: annotation.sequence_number,
      path: annotation.sequence_number.toString()
    };
  }

  private calculateMaxDepth(treeStructure: TreeNode[]): number {
    let maxDepth = 0;

    for (const node of treeStructure) {
      const nodeDepth = this.calculateNodeDepth(node);
      maxDepth = Math.max(maxDepth, nodeDepth);
    }

    return maxDepth;
  }

  private calculateNodeDepth(node: TreeNode): number {
    if (node.children.length === 0) {
      return node.depth;
    }

    let maxChildDepth = 0;
    for (const child of node.children) {
      const childDepth = this.calculateNodeDepth(child);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }

    return maxChildDepth;
  }

  private establishContainerRelationships(annotations: ContainerAnnotation[]): any[] {
    // 简化实现：返回空关系数组
    return [];
  }

  private calculateHierarchyQuality(treeStructure: TreeNode[], relationships: any[]): any {
    // 简化实现：返回默认质量指标
    return {
      structural_integrity: 0.9,
      nesting_quality: 0.85,
      anchor_reliability: 0.8,
      coverage_completeness: 0.88,
      overall_quality: 0.86
    };
  }

  private detectCycles(treeStructure: TreeNode[]): boolean {
    // 简化实现：返回false
    return false;
  }

  private findOrphanedContainers(hierarchy: ContainerHierarchy): string[] {
    // 简化实现：返回空数组
    return [];
  }

  private validateAnchorElement(annotation: ContainerAnnotation): boolean {
    // 简化实现：返回true
    return true;
  }

  private generateValidationSuggestions(issues: ValidationIssue[]): string[] {
    return issues.map(issue => issue.suggested_fix);
  }

  private generateNextSteps(issues: ValidationIssue[]): string[] {
    if (issues.length === 0) {
      return ['标注验证通过，可以继续后续操作'];
    }

    const criticalIssues = issues.filter(i => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      return ['优先解决关键问题', '重新验证层级结构'];
    }

    return ['修复发现的问题', '进行质量改进'];
  }

  private optimizeContainerBounds(hierarchy: ContainerHierarchy): ContainerHierarchy {
    // 简化实现：直接返回
    return hierarchy;
  }

  private mergeSimilarContainers(hierarchy: ContainerHierarchy): ContainerHierarchy {
    // 简化实现：直接返回
    return hierarchy;
  }

  private removeRedundantContainers(hierarchy: ContainerHierarchy): ContainerHierarchy {
    // 简化实现：直接返回
    return hierarchy;
  }

  private suggestAnchorElement(parentAnnotation: ContainerAnnotation, childAnnotation: ContainerAnnotation): string | null {
    // 简化实现：返回null
    return null;
  }

  private evaluateAnchorQuality(parentAnnotation: ContainerAnnotation, childAnnotation: ContainerAnnotation): number {
    // 简化实现：返回默认质量
    return 0.8;
  }

  private isValidBoundingBox(bounds: BoundingBox): boolean {
    return bounds.x1 < bounds.x2 && bounds.y1 < bounds.y2 &&
           bounds.x1 >= 0 && bounds.y1 >= 0 &&
           (bounds.width || (bounds.x2 - bounds.x1)) > 0 &&
           (bounds.height || (bounds.y2 - bounds.y1)) > 0;
  }

  private generateImprovedContainerName(annotation: ContainerAnnotation): string {
    const type = annotation.container_type;
    const index = annotation.sequence_number;

    const typeNames: Record<string, string> = {
      'page_container': '页面容器',
      'section_container': '区块容器',
      'group_container': '分组容器',
      'component_container': '组件容器'
    };

    const baseName = typeNames[type] || '容器';
    return `${baseName}_${index}`;
  }

  private generateImprovedDescription(annotation: ContainerAnnotation): string {
    return `这是一个${annotation.container_name}，用于组织和管理相关的UI元素。`;
  }

  private generateNextRecommendations(annotation: ContainerAnnotation): string[] {
    const recommendations: string[] = [];

    if (annotation.quality_score < 0.8) {
      recommendations.push('继续改进标注质量');
    }

    if (!annotation.anchor_element_id && annotation.parent_annotation_id) {
      recommendations.push('考虑添加锚点关系');
    }

    if (annotation.tags.length < 2) {
      recommendations.push('添加更多描述性标签');
    }

    return recommendations;
  }

  private generateBatchRecommendations(results: ValidationResult[]): string[] {
    const issueTypes = new Set<string>();

    for (const result of results) {
      for (const issue of result.issues) {
        issueTypes.add(issue.issue_type);
      }
    }

    const recommendations: string[] = [];

    if (issueTypes.has('structure')) {
      recommendations.push('检查并修复容器结构问题');
    }

    if (issueTypes.has('anchor')) {
      recommendations.push('审查和改进锚点关系');
    }

    if (issueTypes.has('content')) {
      recommendations.push('完善标注内容信息');
    }

    if (recommendations.length === 0) {
      recommendations.push('标注质量良好，继续维护');
    }

    return recommendations;
  }
}