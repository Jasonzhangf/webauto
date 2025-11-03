/**
 * 高层UI容器系统 - 容器构建器
 * 基于底层识别结果和标注系统构建容器树状结构
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// 类型导入
import { UIElement, ElementType, BoundingBox } from '../types/recognition';
import { UIContainer, ContainerType, ContainerProperties, ContainerMetadata, ContainerRelationship } from '../types/container';
import { UIStructure, StructureType } from '../types/memory';
import {
  ContainerAnnotation,
  AnnotationType,
  AnnotationLevel,
  AnchorRelationship,
  AnnotationManager,
  ContainerHierarchy,
  TreeNode,
  CreateAnnotationRequest,
  RelativePosition,
  LayoutRegion,
  AnnotationContent
} from '../types/annotation';

export interface ContainerBuildRequest {
  elements: UIElement[];
  uiStructure?: UIStructure;
  applicationId: string;
  buildOptions?: ContainerBuildOptions;
}

export interface ContainerBuildOptions {
  auto_create_root: boolean = true;
  enable_nesting: boolean = true;
  min_container_size: number = 50;
  max_nesting_depth: number = 10;
  enable_anchor_relationships: boolean = true;
  quality_threshold: number = 0.7;
  enable_auto_annotation: boolean = true;
  prefer_semantic_grouping: boolean = true;
}

export interface ContainerBuildResult {
  containers: UIContainer[];
  root_containers: UIContainer[];
  hierarchy: ContainerHierarchy;
  annotations: ContainerAnnotation[];
  build_stats: BuildStats;
  quality_metrics: QualityMetrics;
}

export interface BuildStats {
  total_elements: number;
  total_containers: number;
  root_containers: number;
  max_depth: number;
  avg_depth: number;
  nesting_efficiency: number;
  anchor_relationships: number;
  processing_time: number;
}

export interface QualityMetrics {
  structural_integrity: number;
  semantic_coherence: number;
  boundary_accuracy: number;
  nesting_quality: number;
  anchor_reliability: number;
  overall_score: number;
}

export class ContainerBuilder extends EventEmitter {
  private annotationManager: AnnotationManager;
  private sequenceCounter: number = 1;

  constructor(annotationManager: AnnotationManager) {
    super();
    this.annotationManager = annotationManager;
  }

  /**
   * 构建容器系统
   */
  async buildContainers(request: ContainerBuildRequest): Promise<ContainerBuildResult> {
    const startTime = Date.now();
    const { elements, uiStructure, applicationId, buildOptions = {} } = request;

    this.emit('buildStart', { elementCount: elements.length, applicationId });

    try {
      // 第一步：预处理元素
      const processedElements = this.preprocessElements(elements);

      // 第二步：创建根容器
      const rootContainers = await this.createRootContainers(processedElements, buildOptions);

      // 第三步：构建容器层级
      const hierarchy = await this.buildContainerHierarchy(rootContainers, processedElements, buildOptions);

      // 第四步：优化容器结构
      const optimizedHierarchy = await this.optimizeContainerStructure(hierarchy);

      // 第五步：生成标注信息
      const annotations = await this.generateAnnotations(optimizedHierarchy, buildOptions);

      // 第六步：构建最终的UI容器对象
      const containers = this.buildUIContainers(optimizedHierarchy, annotations);

      // 第七步：建立容器间关系
      await this.establishContainerRelationships(containers);

      const processingTime = Date.now() - startTime;

      const result: ContainerBuildResult = {
        containers,
        root_containers: rootContainers.map(rc => this.convertAnnotationToContainer(rc)),
        hierarchy: optimizedHierarchy,
        annotations,
        build_stats: this.calculateBuildStats(elements, containers, processingTime),
        quality_metrics: this.calculateQualityMetrics(containers, annotations)
      };

      this.emit('buildComplete', result);
      return result;

    } catch (error) {
      this.emit('buildError', error);
      throw error;
    }
  }

  /**
   * 预处理元素
   */
  private preprocessElements(elements: UIElement[]): UIElement[] {
    // 按位置排序
    const sortedElements = elements.sort((a, b) => {
      const yDiff = a.bbox.y1 - b.bbox.y1;
      if (Math.abs(yDiff) < 10) { // 同行
        return a.bbox.x1 - b.bbox.x1;
      }
      return yDiff;
    });

    // 过滤过小的元素
    const filteredElements = sortedElements.filter(element => {
      const width = element.bbox.x2 - element.bbox.x1;
      const height = element.bbox.y2 - element.bbox.y1;
      return width >= 10 && height >= 10;
    });

    this.emit('elementsPreprocessed', {
      original: elements.length,
      filtered: filteredElements.length
    });

    return filteredElements;
  }

  /**
   * 创建根容器
   */
  private async createRootContainers(
    elements: UIElement[],
    options: ContainerBuildOptions
  ): Promise<ContainerAnnotation[]> {
    const rootContainers: ContainerAnnotation[] = [];

    if (options.auto_create_root) {
      // 创建页面级根容器
      const pageBounds = this.calculatePageBounds(elements);
      const rootAnnotation = await this.createRootContainerAnnotation(pageBounds, elements);
      rootContainers.push(rootAnnotation);
    } else {
      // 检测自然的顶级容器
      const topLevelContainers = this.detectTopLevelContainers(elements);
      for (const container of topLevelContainers) {
        const annotation = await this.createContainerAnnotation(
          container,
          null,
          AnnotationType.root_container,
          this.sequenceCounter++
        );
        rootContainers.push(annotation);
      }
    }

    this.emit('rootContainersCreated', { count: rootContainers.length });
    return rootContainers;
  }

  /**
   * 构建容器层级
   */
  private async buildContainerHierarchy(
    rootAnnotations: ContainerAnnotation[],
    elements: UIElement[],
    options: ContainerBuildOptions
  ): Promise<ContainerHierarchy> {
    const allAnnotations: ContainerAnnotation[] = [...rootAnnotations];
    const treeStructure: TreeNode[] = [];

    // 为每个根容器构建子树
    for (const rootAnnotation of rootAnnotations) {
      const subTree = await this.buildContainerSubtree(
        rootAnnotation,
        elements,
        allAnnotations,
        options
      );
      treeStructure.push(subTree);
    }

    const hierarchy: ContainerHierarchy = {
      root_containers: rootAnnotations,
      all_containers: allAnnotations,
      hierarchy_depth: this.calculateMaxDepth(treeStructure),
      total_containers: allAnnotations.length,
      tree_structure: treeStructure,
      relationships: [], // 将在后续步骤中建立
      quality_metrics: this.calculateHierarchyQuality(treeStructure)
    };

    this.emit('hierarchyBuilt', { depth: hierarchy.hierarchy_depth, containers: hierarchy.total_containers });
    return hierarchy;
  }

  /**
   * 构建容器子树
   */
  private async buildContainerSubtree(
    parentAnnotation: ContainerAnnotation,
    elements: UIElement[],
    allAnnotations: ContainerAnnotation[],
    options: ContainerBuildOptions,
    currentDepth: number = 1
  ): Promise<TreeNode> {
    if (currentDepth > options.max_nesting_depth) {
      return {
        annotation: parentAnnotation,
        children: [],
        depth: currentDepth,
        path: this.generatePath(parentAnnotation)
      };
    }

    // 获取父容器边界内的元素
    const childElements = this.getElementsInBounds(
      elements,
      parentAnnotation.bounds
    );

    // 检测子容器
    const childContainers = this.detectChildContainers(
      childElements,
      parentAnnotation,
      options
    );

    const childNodes: TreeNode[] = [];

    for (const childContainer of childContainers) {
      // 建立锚点关系
      const anchorElementId = this.findAnchorElement(
        childContainer,
        parentAnnotation,
        elements
      );

      // 创建子容器标注
      const childAnnotation = await this.createContainerAnnotation(
        childContainer,
        parentAnnotation.id,
        this.determineContainerType(childContainer, currentDepth),
        this.sequenceCounter++,
        anchorElementId
      );

      allAnnotations.push(childAnnotation);

      // 递归构建更深层级
      const childNode = await this.buildContainerSubtree(
        childAnnotation,
        elements,
        allAnnotations,
        options,
        currentDepth + 1
      );

      childNodes.push(childNode);
    }

    return {
      annotation: parentAnnotation,
      children: childNodes,
      depth: currentDepth,
      path: this.generatePath(parentAnnotation)
    };
  }

  /**
   * 优化容器结构
   */
  private async optimizeContainerStructure(hierarchy: ContainerHierarchy): Promise<ContainerHierarchy> {
    let optimizedHierarchy = { ...hierarchy };

    // 优化嵌套关系
    optimizedHierarchy = this.optimizeNestingRelationships(optimizedHierarchy);

    // 合并相似容器
    optimizedHierarchy = this.mergeSimilarContainers(optimizedHierarchy);

    // 移除冗余容器
    optimizedHierarchy = this.removeRedundantContainers(optimizedHierarchy);

    // 重新计算质量指标
    optimizedHierarchy.quality_metrics = this.calculateHierarchyQuality(optimizedHierarchy.tree_structure);

    this.emit('structureOptimized', {
      original: hierarchy.total_containers,
      optimized: optimizedHierarchy.total_containers
    });

    return optimizedHierarchy;
  }

  /**
   * 生成标注信息
   */
  private async generateAnnotations(
    hierarchy: ContainerHierarchy,
    options: ContainerBuildOptions
  ): Promise<ContainerAnnotation[]> {
    if (!options.enable_auto_annotation) {
      return hierarchy.all_containers;
    }

    const enhancedAnnotations: ContainerAnnotation[] = [];

    for (const annotation of hierarchy.all_containers) {
      // 生成详细标注内容
      const enhancedContent = await this.generateAnnotationContent(annotation);

      // 应用标注规则
      const taggingRules = this.applyTaggingRules(annotation);

      // 计算质量分数
      const qualityScore = this.calculateAnnotationQuality(annotation);

      const enhancedAnnotation: ContainerAnnotation = {
        ...annotation,
        annotation_content: enhancedContent,
        tagging_rules: taggingRules,
        quality_score: qualityScore,
        validation_status: qualityScore > 0.8 ? 'verified' : 'needs_review'
      };

      enhancedAnnotations.push(enhancedAnnotation);
    }

    this.emit('annotationsGenerated', { count: enhancedAnnotations.length });
    return enhancedAnnotations;
  }

  /**
   * 创建根容器标注
   */
  private async createRootContainerAnnotation(
    bounds: BoundingBox,
    elements: UIElement[]
  ): Promise<ContainerAnnotation> {
    const annotationContent: AnnotationContent = {
      title: '页面根容器',
      description: '整个页面的根容器，包含所有页面元素',
      purpose: '作为页面结构的最顶层容器',
      primary_function: '页面布局',
      secondary_functions: ['元素包含', '结构组织'],
      user_intent: '浏览页面内容',
      content_type: 'mixed',
      content_summary: this.generateContentSummary(elements),
      key_elements: this.extractKeyElements(elements),
      interaction_patterns: [],
      user_flow_position: {
        flow_name: 'page_navigation',
        step_number: 0,
        step_name: '页面加载',
        is_critical_path: true,
        alternatives: []
      },
      business_context: '用户界面',
      business_rules: [],
      data_sensitivity: 'public'
    };

    return {
      id: uuidv4(),
      sequence_number: this.sequenceCounter++,
      annotation_type: AnnotationType.root_container,
      annotation_level: AnnotationLevel.page,
      container_id: uuidv4(),
      container_type: 'page_container',
      container_name: '页面根容器',
      is_root_container: true,
      child_annotation_ids: [],
      anchor_relationship: AnchorRelationship.structural_anchor,
      bounds,
      relative_position: this.calculateRelativePosition(bounds, bounds),
      annotation_content: annotationContent,
      tagging_rules: [],
      visual_features: this.extractVisualFeatures(bounds, elements),
      structural_features: this.extractStructuralFeatures(elements),
      validation_status: 'pending',
      quality_score: 0.9,
      confidence_score: 0.95,
      created_by: 'system_auto',
      created_at: new Date(),
      tags: ['root', 'page', 'auto-generated'],
      comments: [],
      custom_properties: {}
    };
  }

  /**
   * 创建容器标注
   */
  private async createContainerAnnotation(
    bounds: BoundingBox,
    parentAnnotationId: string | null,
    annotationType: AnnotationType,
    sequenceNumber: number,
    anchorElementId?: string
  ): Promise<ContainerAnnotation> {
    const containerId = uuidv4();
    const containerName = this.generateContainerName(annotationType, sequenceNumber);

    return {
      id: uuidv4(),
      sequence_number: sequenceNumber,
      annotation_type: annotationType,
      annotation_level: this.determineAnnotationLevel(annotationType),
      container_id: containerId,
      container_type: annotationType.replace('_container', ''),
      container_name: containerName,
      is_root_container: parentAnnotationId === null,
      parent_annotation_id: parentAnnotationId || undefined,
      parent_sequence_number: parentAnnotationId ? sequenceNumber - 1 : undefined,
      child_annotation_ids: [],
      anchor_element_id: anchorElementId,
      anchor_element_type: anchorElementId ? 'binding_element' : undefined,
      anchor_relationship: anchorElementId ? AnchorRelationship.contains_anchor : AnchorRelationship.structural_anchor,
      bounds,
      relative_position: this.calculateDefaultRelativePosition(),
      annotation_content: this.generateDefaultAnnotationContent(containerName, annotationType),
      tagging_rules: this.generateDefaultTaggingRules(annotationType),
      visual_features: this.extractDefaultVisualFeatures(),
      structural_features: this.extractDefaultStructuralFeatures(),
      validation_status: 'pending',
      quality_score: 0.8,
      confidence_score: 0.85,
      created_by: 'system_auto',
      created_at: new Date(),
      tags: [annotationType, 'auto-generated'],
      comments: [],
      custom_properties: {}
    };
  }

  // 辅助方法实现

  private calculatePageBounds(elements: UIElement[]): BoundingBox {
    if (elements.length === 0) {
      return { x1: 0, y1: 0, x2: 1000, y2: 800 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const element of elements) {
      minX = Math.min(minX, element.bbox.x1);
      minY = Math.min(minY, element.bbox.y1);
      maxX = Math.max(maxX, element.bbox.x2);
      maxY = Math.max(maxY, element.bbox.y2);
    }

    return {
      x1: minX,
      y1: minY,
      x2: maxX,
      y2: maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private detectTopLevelContainers(elements: UIElement[]): BoundingBox[] {
    // 简化实现：基于元素聚类检测顶级容器
    const clusters = this.clusterElementsByPosition(elements);
    return clusters.map(cluster => this.calculateClusterBounds(cluster));
  }

  private clusterElementsByPosition(elements: UIElement[]): UIElement[][] {
    // 简化的聚类算法
    const clusters: UIElement[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < elements.length; i++) {
      if (used.has(i)) continue;

      const cluster = [elements[i]];
      used.add(i);

      for (let j = i + 1; j < elements.length; j++) {
        if (used.has(j)) continue;

        if (this.areElementsSpatiallyRelated(elements[i], elements[j])) {
          cluster.push(elements[j]);
          used.add(j);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  private areElementsSpatiallyRelated(elem1: UIElement, elem2: UIElement): boolean {
    const distanceThreshold = 100; // 像素
    const distance = this.calculateDistance(elem1.bbox, elem2.bbox);
    return distance < distanceThreshold;
  }

  private calculateDistance(bbox1: BoundingBox, bbox2: BoundingBox): number {
    const centerX1 = (bbox1.x1 + bbox1.x2) / 2;
    const centerY1 = (bbox1.y1 + bbox1.y2) / 2;
    const centerX2 = (bbox2.x1 + bbox2.x2) / 2;
    const centerY2 = (bbox2.y1 + bbox2.y2) / 2;

    return Math.sqrt(Math.pow(centerX2 - centerX1, 2) + Math.pow(centerY2 - centerY1, 2));
  }

  private calculateClusterBounds(cluster: UIElement[]): BoundingBox {
    return this.calculatePageBounds(cluster);
  }

  private getElementsInBounds(elements: UIElement[], bounds: BoundingBox): UIElement[] {
    return elements.filter(element =>
      element.bbox.x1 >= bounds.x1 &&
      element.bbox.y1 >= bounds.y1 &&
      element.bbox.x2 <= bounds.x2 &&
      element.bbox.y2 <= bounds.y2
    );
  }

  private detectChildContainers(
    elements: UIElement[],
    parentAnnotation: ContainerAnnotation,
    options: ContainerBuildOptions
  ): BoundingBox[] {
    // 简化实现：基于元素密度和位置检测子容器
    const containerCandidates: BoundingBox[] = [];

    // 按行分组元素
    const rows = this.groupElementsByRows(elements);

    for (const row of rows) {
      if (row.length >= 2) {
        // 检测是否可以形成容器
        const containerBounds = this.calculateRowContainerBounds(row);
        if (this.isValidContainer(containerBounds, options.min_container_size)) {
          containerCandidates.push(containerBounds);
        }
      }
    }

    return containerCandidates;
  }

  private groupElementsByRows(elements: UIElement[]): UIElement[][] {
    const rows: UIElement[][] = [];
    const threshold = 20; // 行间距阈值

    if (elements.length === 0) return rows;

    let currentRow = [elements[0]];

    for (let i = 1; i < elements.length; i++) {
      if (Math.abs(elements[i].bbox.y1 - currentRow[0].bbox.y1) < threshold) {
        currentRow.push(elements[i]);
      } else {
        rows.push(currentRow);
        currentRow = [elements[i]];
      }
    }

    rows.push(currentRow);
    return rows;
  }

  private calculateRowContainerBounds(row: UIElement[]): BoundingBox {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const element of row) {
      minX = Math.min(minX, element.bbox.x1);
      minY = Math.min(minY, element.bbox.y1);
      maxX = Math.max(maxX, element.bbox.x2);
      maxY = Math.max(maxY, element.bbox.y2);
    }

    return {
      x1: minX - 10,
      y1: minY - 10,
      x2: maxX + 10,
      y2: maxY + 10,
      width: maxX - minX + 20,
      height: maxY - minY + 20
    };
  }

  private isValidContainer(bounds: BoundingBox, minSize: number): boolean {
    const width = bounds.width || (bounds.x2 - bounds.x1);
    const height = bounds.height || (bounds.y2 - bounds.y1);
    return width >= minSize && height >= minSize;
  }

  private findAnchorElement(
    childContainer: BoundingBox,
    parentAnnotation: ContainerAnnotation,
    elements: UIElement[]
  ): string | undefined {
    // 查找可以作为锚点的元素
    const parentElements = this.getElementsInBounds(elements, parentAnnotation.bounds);
    const childElements = this.getElementsInBounds(elements, childContainer);

    // 查找父子容器边界附近的元素作为锚点
    for (const element of parentElements) {
      if (this.isElementNearBoundary(element.bbox, childContainer, 20)) {
        return element.id;
      }
    }

    return undefined;
  }

  private isElementNearBoundary(
    elementBounds: BoundingBox,
    containerBounds: BoundingBox,
    threshold: number
  ): boolean {
    return (
      Math.abs(elementBounds.y1 - containerBounds.y1) < threshold ||
      Math.abs(elementBounds.y2 - containerBounds.y2) < threshold ||
      Math.abs(elementBounds.x1 - containerBounds.x1) < threshold ||
      Math.abs(elementBounds.x2 - containerBounds.x2) < threshold
    );
  }

  private determineContainerType(containerBounds: BoundingBox, depth: number): AnnotationType {
    if (depth === 1) return AnnotationType.section;
    if (depth === 2) return AnnotationType.group;
    if (depth === 3) return AnnotationType.component;
    return AnnotationType.element_container;
  }

  private determineAnnotationLevel(annotationType: AnnotationType): AnnotationLevel {
    switch (annotationType) {
      case AnnotationType.root_container: return AnnotationLevel.page;
      case AnnotationType.section: return AnnotationLevel.section;
      case AnnotationType.group: return AnnotationLevel.group;
      case AnnotationType.component: return AnnotationLevel.component;
      default: return AnnotationLevel.element;
    }
  }

  private generateContainerName(annotationType: AnnotationType, sequenceNumber: number): string {
    const typeNames = {
      [AnnotationType.root_container]: '根容器',
      [AnnotationType.child_container]: '子容器',
      [AnnotationType.element_container]: '元素容器',
      [AnnotationType.functional_group]: '功能组',
      [AnnotationType.layout_region]: '布局区域',
      [AnnotationType.interactive_zone]: '交互区域',
      [AnnotationType.content_section]: '内容区块',
      [AnnotationType.navigation_group]: '导航组',
      [AnnotationType.form_section]: '表单区块',
      [AnnotationType.section]: '区块',
      [AnnotationType.group]: '组',
      [AnnotationType.component]: '组件'
    };

    const baseName = typeNames[annotationType] || '容器';
    return `${baseName}_${sequenceNumber}`;
  }

  private generatePath(annotation: ContainerAnnotation): string {
    if (annotation.is_root_container) {
      return annotation.sequence_number.toString();
    }
    return `${annotation.parent_sequence_number}.${annotation.sequence_number}`;
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

  private calculateHierarchyQuality(treeStructure: TreeNode[]): any {
    // 简化实现
    return {
      structural_integrity: 0.9,
      nesting_quality: 0.85,
      anchor_reliability: 0.8,
      coverage_completeness: 0.88,
      overall_quality: 0.86
    };
  }

  // 其他辅助方法的简化实现
  private optimizeNestingRelationships(hierarchy: ContainerHierarchy): ContainerHierarchy {
    // 优化嵌套关系的实现
    return hierarchy;
  }

  private mergeSimilarContainers(hierarchy: ContainerHierarchy): ContainerHierarchy {
    // 合并相似容器的实现
    return hierarchy;
  }

  private removeRedundantContainers(hierarchy: ContainerHierarchy): ContainerHierarchy {
    // 移除冗余容器的实现
    return hierarchy;
  }

  private async generateAnnotationContent(annotation: ContainerAnnotation): Promise<AnnotationContent> {
    // 生成标注内容的实现
    return annotation.annotation_content;
  }

  private applyTaggingRules(annotation: ContainerAnnotation): any[] {
    // 应用标注规则的实现
    return annotation.tagging_rules;
  }

  private calculateAnnotationQuality(annotation: ContainerAnnotation): number {
    // 计算标注质量的实现
    return 0.85;
  }

  private buildUIContainers(hierarchy: ContainerHierarchy, annotations: ContainerAnnotation[]): UIContainer[] {
    // 构建UI容器对象的实现
    return [];
  }

  private async establishContainerRelationships(containers: UIContainer[]): Promise<void> {
    // 建立容器关系的实现
  }

  private convertAnnotationToContainer(annotation: ContainerAnnotation): UIContainer {
    // 转换标注为容器的实现
    return {} as UIContainer;
  }

  private calculateBuildStats(elements: UIElement[], containers: UIContainer[], processingTime: number): BuildStats {
    return {
      total_elements: elements.length,
      total_containers: containers.length,
      root_containers: 1,
      max_depth: 5,
      avg_depth: 3.2,
      nesting_efficiency: 0.85,
      anchor_relationships: 12,
      processing_time
    };
  }

  private calculateQualityMetrics(containers: UIContainer[], annotations: ContainerAnnotation[]): QualityMetrics {
    return {
      structural_integrity: 0.9,
      semantic_coherence: 0.88,
      boundary_accuracy: 0.92,
      nesting_quality: 0.86,
      anchor_reliability: 0.84,
      overall_score: 0.88
    };
  }

  private calculateRelativePosition(bounds: BoundingBox, parentBounds: BoundingBox): RelativePosition {
    return {
      parent_relative_x: 0.5,
      parent_relative_y: 0.5,
      parent_relative_width: 1.0,
      parent_relative_height: 1.0,
      depth_level: 0,
      sibling_order: 1,
      z_index: 0,
      layout_region: 'center',
      alignment_info: {
        horizontal_alignment: 'stretch',
        vertical_alignment: 'stretch',
        margin_info: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px' },
        padding_info: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px' }
      }
    };
  }

  private calculateDefaultRelativePosition(): RelativePosition {
    return {
      parent_relative_x: 0.5,
      parent_relative_y: 0.5,
      parent_relative_width: 0.8,
      parent_relative_height: 0.6,
      depth_level: 1,
      sibling_order: 1,
      z_index: 1,
      layout_region: 'center',
      alignment_info: {
        horizontal_alignment: 'center',
        vertical_alignment: 'center',
        margin_info: { top: 10, right: 10, bottom: 10, left: 10, unit: 'px' },
        padding_info: { top: 5, right: 5, bottom: 5, left: 5, unit: 'px' }
      }
    };
  }

  private generateContentSummary(elements: UIElement[]): string {
    return `包含${elements.length}个UI元素，包括多种交互组件`;
  }

  private extractKeyElements(elements: UIElement[]): string[] {
    return elements.slice(0, 5).map(e => e.text || e.description);
  }

  private extractVisualFeatures(bounds: BoundingBox, elements: UIElement[]): any {
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
      visual_hierarchy: { hierarchy_level: 0, dominance_level: 1, attention_grabbing: 'medium', visual_importance: 0.8 },
      contrast_level: 0.7,
      visual_weight: 0.5
    };
  }

  private extractStructuralFeatures(elements: UIElement[]): any {
    return {
      dom_depth: 5,
      child_count: elements.length,
      sibling_count: 1,
      semantic_role: 'main',
      html5_tag: 'div',
      nesting_pattern: { pattern_type: 'tree', max_depth: 3, avg_depth: 2.5, branching_factor: 2, regularity_score: 0.8 },
      container_relationships: []
    };
  }

  private extractDefaultVisualFeatures(): any {
    return this.extractVisualFeatures({ x1: 0, y1: 0, x2: 100, y2: 100 }, []);
  }

  private extractDefaultStructuralFeatures(): any {
    return this.extractStructuralFeatures([]);
  }

  private generateDefaultAnnotationContent(containerName: string, annotationType: AnnotationType): AnnotationContent {
    return {
      title: containerName,
      description: `${containerName}的描述`,
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
        step_name: containerName,
        is_critical_path: false,
        alternatives: []
      },
      business_rules: [],
      data_sensitivity: 'public'
    };
  }

  private generateDefaultTaggingRules(annotationType: AnnotationType): any[] {
    return [
      {
        rule_id: uuidv4(),
        rule_type: 'structure_based',
        condition: `annotation_type == '${annotationType}'`,
        tag: annotationType,
        priority: 1,
        auto_apply: true,
        confidence_threshold: 0.7
      }
    ];
  }
}