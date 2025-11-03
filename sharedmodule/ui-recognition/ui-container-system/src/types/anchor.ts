/**
 * 高层UI容器系统 - 锚点系统类型定义
 * 容器与应用的强关联锚点系统
 */

export interface UIAnchor {
  // 基础信息
  id: string;
  application_id: string;         // 关联的应用ID
  anchor_name: string;           // 锚点名称，具有业务意义
  anchor_type: AnchorType;         // 锚点类型
  anchor_purpose: string;         // 锚点用途描述

  // 定位信息
  primary_locator: Locator;        // 主要定位器
  secondary_locators: Locator[];   // 备用定位器
  locator_strategy: LocatorStrategy; // 定位策略

  // 位置信息
  expected_bounds: BoundingBox;   // 期望的边界
  tolerance: Tolerance;           // 容差设置
  stability_score: number;         // 稳定性评分

  // 关联信息
  container_id: string;          // 关联的容器ID
  control_ids: string[];          // 关联的控件ID列表
  related_anchors: string[];       // 相关锚点ID

  // 认证和验证
  validation_rules: ValidationRule[];
  matching_threshold: number;      // 匹配阈值
  confidence_threshold: number;    // 置信度阈值

  // 生命周期
  created_at: Date;
  last_matched: Date;
  match_count: number;
  failure_count: number;
  success_rate: number;

  // 元数据
  tags: string[];
  annotations: AnchorAnnotation[];
  custom_properties: Record<string, any>;
}

export type AnchorType =
  | 'page_title'           // 页面标题锚点
  | 'url_pattern'          // URL模式锚点
  | 'element_text'         // 元素文本锚点
  | 'element_id'           // 元素ID锚点
  | 'css_selector'         // CSS选择器锚点
  | 'xpath'                // XPath锚点
  | 'visual_signature'     // 视觉特征锚点
  | 'position_based'       // 基于位置的锚点
  | 'functional'           // 功能性锚点
  | 'semantic'             // 语义锚点
  | 'custom';              // 自定义锚点

export interface Locator {
  type: LocatorType;
  value: string;
  weight: number;             // 定位器权重
  reliability: number;         // 可靠性评分
  context?: Record<string, any>;
}

export type LocatorType =
  | 'css_selector'          // CSS选择器
  | 'xpath'                 // XPath表达式
  | 'element_id'            // 元素ID
  | 'element_class'         // 元素类名
  | 'element_text'          // 元素文本
  | 'element_attribute'     // 元素属性
  | 'element_tag'           // 元素标签
  | 'position'              // 位置坐标
  | 'visual_pattern'        // 视觉模式
  | 'dom_path'              // DOM路径
  | 'semantic_role'         // 语义角色
  | 'custom';               // 自定义定位器

export type LocatorStrategy =
  | 'primary_first'        // 优先使用主要定位器
  | 'most_reliable'        // 使用最可靠的定位器
  | 'weighted_selection'   // 加权选择
  | 'cascade_fallback'     // 级联回退
  | 'parallel_validation'   // 并行验证
  | 'adaptive'             // 自适应策略
  | 'custom';               // 自定义策略

export interface Tolerance {
  position: number;           // 位置容差 (像素)
  size: number;               // 大小容差 (百分比)
  text: number;               // 文本容差 (编辑距离)
  visual: number;             // 视觉容差 (相似度)
  temporal: number;           // 时间容差 (毫秒)
}

export interface ValidationRule {
  type: ValidationType;
  condition: string;
  required: boolean;
  error_message: string;
  validation_function?: (element: any) => boolean;
}

export type ValidationType =
  | 'exists'               // 元素存在
  | 'visible'              // 元素可见
  | 'enabled'              // 元素可用
  | 'interactive'          // 元素可交互
  | 'contains_text'        // 包含文本
  | 'has_attribute'        // 具有属性
  | 'position_within'      // 位置范围内
  | 'size_within'          // 大小范围内
  | 'custom';              // 自定义验证

export interface AnchorAnnotation {
  id: string;
  type: 'note' | 'warning' | 'improvement' | 'correction';
  content: string;
  created_by: 'system' | 'user';
  created_at: Date;
  priority: 'low' | 'medium' | 'high';
  resolved: boolean;
}

// 锚点匹配结果
export interface AnchorMatch {
  anchor: UIAnchor;
  matched_element: MatchedElement;
  match_confidence: number;
  match_method: string;
  validation_results: ValidationResult[];
  is_stable: boolean;
  requires_adaptation: boolean;
}

export interface MatchedElement {
  element_id: string;
  element_type: string;
  bounds: BoundingBox;
  properties: Record<string, any>;
  text?: string;
  attributes: Record<string, string>;
}

export interface ValidationResult {
  rule_type: ValidationType;
  passed: boolean;
  message: string;
  actual_value?: any;
  expected_value?: any;
}

// 锚点管理器
export interface AnchorManager {
  // 锚点生命周期管理
  createAnchor(anchorData: CreateAnchorRequest): Promise<UIAnchor>;
  updateAnchor(anchorId: string, updates: Partial<UIAnchor>): Promise<boolean>;
  deleteAnchor(anchorId: string): Promise<boolean>;
  getAnchor(anchorId: string): UIAnchor | null;

  // 锚点匹配
  matchAnchors(
    applicationId: string,
    elements: any[],
    options?: MatchOptions
  ): Promise<AnchorMatch[]>;

  // 锚点搜索
  searchAnchors(query: AnchorSearchQuery): Promise<UIAnchor[]>;

  // 锚点优化
  optimizeAnchors(applicationId: string): Promise<OptimizationResult>;
  validateAnchors(applicationId: string): Promise<ValidationSummary>;

  // 锚点统计
  getAnchorStats(applicationId: string): AnchorStats;
  getMatchingStats(applicationId: string): MatchingStats;
}

export interface CreateAnchorRequest {
  application_id: string;
  anchor_name: string;
  anchor_type: AnchorType;
  anchor_purpose: string;
  primary_locator: Locator;
  secondary_locators?: Locator[];
  locator_strategy?: LocatorStrategy;
  expected_bounds: BoundingBox;
  tolerance?: Partial<Tolerance>;
  validation_rules?: ValidationRule[];
  container_id?: string;
  control_ids?: string[];
  tags?: string[];
  custom_properties?: Record<string, any>;
}

export interface MatchOptions {
  confidence_threshold?: number;
  max_results?: number;
  include_unmatched?: boolean;
  strict_validation?: boolean;
  adaptation_enabled?: boolean;
}

export interface AnchorSearchQuery {
  application_id?: string;
  anchor_name?: string;
  anchor_type?: AnchorType;
  anchor_purpose?: string;
  tags?: string[];
  container_id?: string;
  min_confidence?: number;
  min_success_rate?: number;
  created_after?: Date;
  created_before?: Date;
}

export interface OptimizationResult {
  total_anchors: number;
  optimized_anchors: number;
  added_locators: number;
  removed_locators: number;
  improved_reliability: number[];
  success_rate_improvement: number;
  recommendations: string[];
}

export interface ValidationSummary {
  total_anchors: number;
  valid_anchors: number;
  invalid_anchors: number;
  issues_found: ValidationIssue[];
  overall_health: number;
  recommendations: string[];
}

export interface ValidationIssue {
  anchor_id: string;
  anchor_name: string;
  issue_type: 'locator_invalid' | 'validation_failed' | 'unstable' | 'obsolete';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggestion: string;
}

export interface AnchorStats {
  total_anchors: number;
  anchors_by_type: Record<string, number>;
  anchors_by_purpose: Record<string, number>;
  average_confidence: number;
  average_success_rate: number;
  total_matches: number;
  recent_matches: number;
  health_score: number;
  last_updated: Date;
}

export interface MatchingStats {
  total_matches: number;
  successful_matches: number;
  failed_matches: number;
  average_confidence: number;
  matching_methods: Record<string, number>;
  performance_metrics: {
    average_match_time: number;
    match_success_rate: number;
    stability_score: number;
  };
  trends: {
    success_rate_trend: number[];
    confidence_trend: number[];
    volume_trend: number[];
  };
}

// 锚点工厂
export interface AnchorFactory {
  // 自动创建锚点
  createAnchorsFromAnalysis(
    applicationId: string,
    elements: any[],
    containerStructure: any
  ): Promise<UIAnchor[]>;

  // 从模式创建锚点
  createAnchorsFromPattern(
    applicationId: string,
    pattern: UIAnchorPattern
  ): Promise<UIAnchor[]>;

  // 从用户行为创建锚点
  createAnchorsFromBehavior(
    applicationId: string,
    behaviors: UserBehavior[]
  ): Promise<UIAnchor[]>;

  // 验证锚点质量
  validateAnchorQuality(anchor: UIAnchor): AnchorQuality;
}

export interface UIAnchorPattern {
  name: string;
  description: string;
  anchor_type: AnchorType;
  locator_templates: LocatorTemplate[];
  validation_templates: ValidationTemplate[];
  context_requirements: string[];
 适用场景: string[];
}

export interface LocatorTemplate {
  type: LocatorType;
  template: string;
  variables: string[];
  weight: number;
  extraction_function?: (element: any) => string;
}

export interface ValidationTemplate {
  type: ValidationType;
  template: string;
  required: boolean;
  message_template: string;
}

export interface UserBehavior {
  session_id: string;
  actions: Array<{
    element_identifier: string;
    action: string;
    timestamp: Date;
    result: 'success' | 'failure';
  }>;
  context: Record<string, any>;
}

export interface AnchorQuality {
  overall_score: number;
  locator_reliability: number;
  validation_coverage: number;
  stability_score: number;
  maintainability: number;
  issues: QualityIssue[];
  recommendations: string[];
}

export interface QualityIssue {
  type: 'weak_locator' | 'missing_validation' | 'high_tolerance' | 'single_point_failure';
  severity: 'low' | 'medium' | 'high';
  description: string;
  impact: string;
  solution: string;
}

// BoundingBox
export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  height?: number;
}

// 锚点事件
export interface AnchorEvent {
  id: string;
  anchor_id: string;
  event_type: AnchorEventType;
  timestamp: Date;
  data: Record<string, any>;
  context?: Record<string, any>;
}

export type AnchorEventType =
  | 'created'               // 锚点创建
  | 'updated'               // 锚点更新
  | 'deleted'               // 锚点删除
  | 'matched'               // 锚点匹配成功
  | 'match_failed'          // 锚点匹配失败
  | 'validated'             // 锚点验证
  | 'validation_failed'     // 锚点验证失败
  | 'optimized'             // 锚点优化
  | 'adapted'               // 锚点适应
  | 'degraded'             // 锚点降级
  | 'restored'              // 锚点恢复;

// 锚点配置
export interface AnchorConfig {
  // 匹配配置
  default_confidence_threshold: number;
  default_matching_method: string;
  max_matching_attempts: number;
  matching_timeout: number;

  // 验证配置
  enable_auto_validation: boolean;
  strict_validation_mode: boolean;
  validation_timeout: number;

  // 学习配置
  enable_adaptive_learning: boolean;
  learning_rate: number;
  feedback_collection: boolean;

  // 性能配置
  cache_enabled: boolean;
  cache_ttl: number;
  max_cache_size: number;

  // 质量配置
  min_success_rate: number;
  max_failure_count: number;
  quality_threshold: number;
}