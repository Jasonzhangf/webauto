/**
 * 高层UI容器系统 - 标注系统类型定义
 * 用于建立容器树状结构的标注系统
 */

export interface ContainerAnnotation {
  // 基础信息
  id: string;
  sequence_number: number;      // 标注序号，用于建立层级关系
  annotation_type: AnnotationType;
  annotation_level: AnnotationLevel;

  // 容器信息
  container_id: string;
  container_type: string;
  container_name: string;
  is_root_container: boolean;    // 是否为根容器

  // 层级关系
  parent_annotation_id?: string;  // 父容器标注ID
  parent_sequence_number?: number; // 父容器序号
  child_annotation_ids: string[]; // 子容器标注ID列表

  // 锚点关联
  anchor_element_id?: string;     // 锚点元素ID，用于关联父子容器
  anchor_element_type?: string;   // 锚点元素类型
  anchor_relationship: AnchorRelationship;

  // 位置信息
  bounds: BoundingBox;
  relative_position: RelativePosition;

  // 标注内容
  annotation_content: AnnotationContent;
  tagging_rules: TaggingRule[];

  // 识别特征
  visual_features: VisualAnnotationFeatures;
  structural_features: StructuralAnnotationFeatures;

  // 验证和质量
  validation_status: ValidationStatus;
  quality_score: number;
  confidence_score: number;

  // 创建信息
  created_by: AnnotationCreator;
  created_at: Date;
  verified_by?: string;
  verified_at?: Date;

  // 元数据
  tags: string[];
  comments: AnnotationComment[];
  custom_properties: Record<string, any>;
}

export type AnnotationType =
  | 'root_container'         // 根容器标注
  | 'child_container'        // 子容器标注
  | 'element_container'      // 元素容器标注
  | 'functional_group'       // 功能组标注
  | 'layout_region'          // 布局区域标注
  | 'interactive_zone'       // 交互区域标注
  | 'content_section'        // 内容区块标注
  | 'navigation_group'       // 导航组标注
  | 'form_section'           // 表单区块标注
  | 'custom';                // 自定义标注

export type AnnotationLevel =
  | 'page'                   // 页面级
  | 'section'                // 区块级
  | 'group'                  // 组级
  | 'component'              // 组件级
  | 'element';               // 元素级

export type AnchorRelationship =
  | 'contains_anchor'        // 父容器包含锚点元素
  | 'shares_anchor'          // 容器间共享锚点元素
  | 'proximity_anchor'       // 临近锚点元素
  | 'functional_anchor'      // 功能锚点元素
  | 'structural_anchor'      // 结构锚点元素
  | 'visual_anchor';         // 视觉锚点元素

export interface RelativePosition {
  // 相对于父容器的位置
  parent_relative_x: number;     // 相对X坐标 (0-1)
  parent_relative_y: number;     // 相对Y坐标 (0-1)
  parent_relative_width: number; // 相对宽度 (0-1)
  parent_relative_height: number;// 相对高度 (0-1)

  // 在层级中的位置
  depth_level: number;           // 深度层级
  sibling_order: number;         // 兄弟节点顺序
  z_index: number;               // Z轴索引

  // 布局信息
  layout_region: LayoutRegion;   // 布局区域
  alignment_info: AlignmentInfo; // 对齐信息
}

export type LayoutRegion =
  | 'top_left'               // 左上角
  | 'top_center'             // 顶部中央
  | 'top_right'              // 右上角
  | 'middle_left'            // 左侧中间
  | 'center'                 // 中央
  | 'middle_right'           // 右侧中间
  | 'bottom_left'            // 左下角
  | 'bottom_center'          // 底部中央
  | 'bottom_right';          // 右下角

export interface AlignmentInfo {
  horizontal_alignment: 'start' | 'center' | 'end' | 'stretch';
  vertical_alignment: 'start' | 'center' | 'end' | 'stretch';
  margin_info: MarginInfo;
  padding_info: PaddingInfo;
}

export interface MarginInfo {
  top: number;
  right: number;
  bottom: number;
  left: number;
  unit: 'px' | 'percent' | 'em';
}

export interface PaddingInfo {
  top: number;
  right: number;
  bottom: number;
  left: number;
  unit: 'px' | 'percent' | 'em';
}

export interface AnnotationContent {
  // 描述信息
  title: string;
  description: string;
  purpose: string;

  // 功能信息
  primary_function: string;
  secondary_functions: string[];
  user_intent: string;

  // 内容分析
  content_type: string;
  content_summary: string;
  key_elements: string[];

  // 交互信息
  interaction_patterns: InteractionPattern[];
  user_flow_position: UserFlowPosition;

  // 业务信息
  business_context?: string;
  business_rules: string[];
  data_sensitivity: DataSensitivity;
}

export interface InteractionPattern {
  pattern_type: string;
  frequency: 'high' | 'medium' | 'low';
  user_expectation: string;
  typical_actions: string[];
}

export interface UserFlowPosition {
  flow_name: string;
  step_number: number;
  step_name: string;
  is_critical_path: boolean;
  alternatives: string[];
}

export type DataSensitivity =
  | 'public'                 // 公开
  | 'internal'               // 内部
  | 'confidential'           // 机密
  | 'restricted'             // 限制
  | 'personal';              // 个人信息

export interface TaggingRule {
  rule_id: string;
  rule_type: TaggingRuleType;
  condition: string;
  tag: string;
  priority: number;
  auto_apply: boolean;
  confidence_threshold: number;
}

export type TaggingRuleType =
  | 'position_based'         // 基于位置的规则
  | 'content_based'          // 基于内容的规则
  | 'structure_based'        // 基于结构的规则
  | 'visual_based'           // 基于视觉的规则
  | 'functional_based'       // 基于功能的规则
  | 'hierarchy_based'        // 基于层级的规则
  | 'custom';                // 自定义规则

export interface VisualAnnotationFeatures {
  // 颜色特征
  primary_colors: string[];
  background_color: string;
  text_color: string;
  accent_colors: string[];

  // 字体特征
  font_family: string;
  font_size: number;
  font_weight: string;
  text_alignment: string;

  // 布局特征
  border_style: string;
  border_width: number;
  corner_radius: number;
  shadow_info: ShadowInfo;

  // 间距特征
  spacing_pattern: SpacingPattern;
  grid_alignment: GridAlignment;

  // 视觉层级
  visual_hierarchy: VisualHierarchy;
  contrast_level: number;
  visual_weight: number;
}

export interface ShadowInfo {
  has_shadow: boolean;
  shadow_offset_x: number;
  shadow_offset_y: number;
  shadow_blur: number;
  shadow_color: string;
}

export interface SpacingPattern {
  internal_spacing: number;
  external_spacing: number;
  spacing_consistency: 'consistent' | 'variable' | 'irregular';
  spacing_unit: string;
}

export interface GridAlignment {
  follows_grid: boolean;
  grid_columns: number;
  grid_rows: number;
  grid_gutters: number;
  alignment_type: 'strict' | 'loose' | 'none';
}

export interface VisualHierarchy {
  hierarchy_level: number;
  dominance_level: number;
  attention_grabbing: 'high' | 'medium' | 'low';
  visual_importance: number;
}

export interface StructuralAnnotationFeatures {
  // DOM结构
  dom_depth: number;
  child_count: number;
  sibling_count: number;
  parent_tag?: string;

  // 语义结构
  semantic_role: string;
  html5_tag: string;
  aria_role?: string;
  heading_level?: number;

  // 表单结构
  form_role?: FormRole;
  field_grouping?: FieldGrouping;
  validation_rules?: string[];

  // 列表结构
  list_structure?: ListStructure;
  table_structure?: TableStructure;

  // 导航结构
  navigation_role?: NavigationRole;
  breadcrumb_level?: number;

  // 嵌套关系
  nesting_pattern: NestingPattern;
  container_relationships: ContainerRelationship[];
}

export interface FormRole {
  is_form_element: boolean;
  form_type: string;
  input_type?: string;
  label_association?: string;
  required: boolean;
  validation_type?: string;
}

export interface FieldGrouping {
  group_name?: string;
  field_group_type: string;
  group_size: number;
  logical_grouping: boolean;
}

export interface ListStructure {
  is_list_item: boolean;
  list_type: 'ordered' | 'unordered' | 'definition';
  list_level: number;
  item_index: number;
}

export interface TableStructure {
  is_table_cell: boolean;
  table_role: 'header' | 'data' | 'footer';
  row_index: number;
  column_index: number;
  colspan: number;
  rowspan: number;
}

export interface NavigationRole {
  is_navigation: boolean;
  nav_type: string;
  nav_level: number;
  is_active: boolean;
  nav_target?: string;
}

export interface NestingPattern {
  pattern_type: 'linear' | 'tree' | 'grid' | 'mixed';
  max_depth: number;
  avg_depth: number;
  branching_factor: number;
  regularity_score: number;
}

export interface ContainerRelationship {
  related_container_id: string;
  relationship_type: ContainerRelationshipType;
  relationship_strength: number;
  spatial_relationship: SpatialRelationship;
  functional_relationship: FunctionalRelationship;
}

export type ContainerRelationshipType =
  | 'parent_child'           // 父子关系
  | 'sibling'                // 兄弟关系
  | 'adjacent'               // 相邻关系
  | 'containing'             // 包含关系
  | 'overlapping'            // 重叠关系
  | 'referencing'            // 引用关系
  | 'dependent'              // 依赖关系
  | 'functional_pair'        // 功能配对
  | 'visual_group'           // 视觉分组
  | 'custom';                // 自定义关系

export interface SpatialRelationship {
  relative_position: 'above' | 'below' | 'left' | 'right' | 'inside' | 'overlapping';
  distance: number;
  alignment: 'start' | 'center' | 'end' | 'none';
  proximity_level: 'close' | 'medium' | 'far';
}

export interface FunctionalRelationship {
  function_type: 'input_output' | 'trigger_action' | 'data_source' | 'navigation' | 'display' | 'control';
  dependency_direction: 'unidirectional' | 'bidirectional';
  interaction_flow: string[];
  business_logic: string;
}

export type ValidationStatus =
  | 'pending'                // 待验证
  | 'verified'               // 已验证
  | 'rejected'               // 已拒绝
  | 'needs_review'           // 需要审查
  | 'auto_verified'          // 自动验证
  | 'manually_verified';     // 手动验证

export type AnnotationCreator =
  | 'system_auto'            // 系统自动
  | 'human_expert'           // 人工专家
  | 'machine_learning'       // 机器学习
  | 'hybrid'                 // 混合方式
  | 'template_based';        // 基于模板

export interface AnnotationComment {
  id: string;
  author: string;
  content: string;
  comment_type: 'suggestion' | 'issue' | 'question' | 'confirmation';
  created_at: Date;
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: Date;
}

// 标注系统管理器接口
export interface AnnotationManager {
  // 标注创建
  createAnnotation(annotationData: CreateAnnotationRequest): Promise<ContainerAnnotation>;
  createRootContainer(bounds: BoundingBox, metadata: any): Promise<ContainerAnnotation>;
  createChildContainer(parentId: string, bounds: BoundingBox, anchorElementId: string): Promise<ContainerAnnotation>;

  // 标注管理
  updateAnnotation(annotationId: string, updates: Partial<ContainerAnnotation>): Promise<boolean>;
  deleteAnnotation(annotationId: string): Promise<boolean>;
  getAnnotation(annotationId: string): ContainerAnnotation | null;

  // 层级管理
  buildContainerHierarchy(annotations: ContainerAnnotation[]): ContainerHierarchy;
  validateHierarchy(hierarchy: ContainerHierarchy): ValidationResult;
  optimizeHierarchy(hierarchy: ContainerHierarchy): ContainerHierarchy;

  // 锚点管理
  establishAnchorRelationship(parentId: string, childId: string, anchorElementId: string): Promise<boolean>;
  validateAnchorRelationship(relationship: AnchorRelationshipInfo): Promise<boolean>;
  optimizeAnchorRelationships(containerId: string): Promise<AnchorOptimizationResult>;

  // 标注搜索
  searchAnnotations(query: AnnotationSearchQuery): Promise<ContainerAnnotation[]>;
  findAnnotationsByLevel(level: AnnotationLevel): Promise<ContainerAnnotation[]>;
  findAnnotationsByType(type: AnnotationType): Promise<ContainerAnnotation[]>;

  // 质量管理
  validateAnnotation(annotation: ContainerAnnotation): ValidationResult;
  calculateQualityScore(annotation: ContainerAnnotation): number;
  improveAnnotation(annotationId: string): Promise<ImprovementResult>;

  // 批量操作
  batchCreateAnnotations(requests: CreateAnnotationRequest[]): Promise<ContainerAnnotation[]>;
  batchUpdateAnnotations(updates: AnnotationUpdate[]): Promise<boolean>;
  batchValidateAnnotations(annotationIds: string[]): Promise<ValidationSummary>;
}

export interface CreateAnnotationRequest {
  annotation_type: AnnotationType;
  annotation_level: AnnotationLevel;
  container_type: string;
  container_name: string;
  bounds: BoundingBox;
  parent_annotation_id?: string;
  anchor_element_id?: string;
  anchor_relationship: AnchorRelationship;
  annotation_content: AnnotationContent;
  tagging_rules: TaggingRule[];
  tags: string[];
  custom_properties?: Record<string, any>;
}

export interface ContainerHierarchy {
  root_containers: ContainerAnnotation[];
  all_containers: ContainerAnnotation[];
  hierarchy_depth: number;
  total_containers: number;
  tree_structure: TreeNode[];
  relationships: ContainerRelationship[];
  quality_metrics: HierarchyQualityMetrics;
}

export interface TreeNode {
  annotation: ContainerAnnotation;
  children: TreeNode[];
  depth: number;
  path: string;
  parent?: TreeNode;
}

export interface HierarchyQualityMetrics {
  structural_integrity: number;
  nesting_quality: number;
  anchor_reliability: number;
  coverage_completeness: number;
  overall_quality: number;
}

export interface AnchorRelationshipInfo {
  parent_annotation_id: string;
  child_annotation_id: string;
  anchor_element_id: string;
  relationship_type: AnchorRelationship;
  confidence: number;
  validation_rules: string[];
}

export interface AnchorOptimizationResult {
  optimized_relationships: number;
  added_relationships: number;
  removed_relationships: number;
  improved_reliability: number;
  suggestions: string[];
}

export interface AnnotationSearchQuery {
  annotation_type?: AnnotationType;
  annotation_level?: AnnotationLevel;
  container_type?: string;
  tags?: string[];
  parent_id?: string;
  anchor_element_id?: string;
  quality_score_min?: number;
  confidence_score_min?: number;
  created_after?: Date;
  created_before?: Date;
}

export interface ValidationResult {
  is_valid: boolean;
  confidence: number;
  issues: ValidationIssue[];
  suggestions: string[];
  next_steps: string[];
}

export interface ValidationIssue {
  issue_type: 'structure' | 'anchor' | 'content' | 'quality' | 'consistency';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affected_element: string;
  suggested_fix: string;
}

export interface ImprovementResult {
  improvements_made: string[];
  quality_improvement: number;
  new_confidence: number;
  remaining_issues: string[];
  next_recommendations: string[];
}

export interface AnnotationUpdate {
  annotation_id: string;
  updates: Partial<ContainerAnnotation>;
}

export interface ValidationSummary {
  total_annotations: number;
  valid_annotations: number;
  invalid_annotations: number;
  issues_summary: Record<string, number>;
  overall_quality: number;
  recommendations: string[];
}

// BoundingBox（重新定义以保持独立性）
export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  height?: number;
}