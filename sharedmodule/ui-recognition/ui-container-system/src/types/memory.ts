/**
 * 高层UI容器系统 - 记忆系统类型定义
 * 具备学习和记忆能力的UI容器系统
 */

export interface ApplicationMemory {
  id: string;
  application_id: string;     // 应用标识 (e.g., "weibo.com", "github.com", "com.tencent.mobileqq")
  application_type: ApplicationType;
  application_name: string;
  version?: string;
  platform: Platform;

  // 记忆的UI结构
  ui_structures: UIStructure[];
  common_patterns: UI Pattern[];
  user_behaviors: UserBehavior[];

  // 学习数据
  learning_data: LearningData;
  adaptation_history: AdaptationHistory[];

  // 元数据
  created_at: Date;
  updated_at: Date;
  last_accessed: Date;
  access_count: number;
  confidence_score: number;
  tags: string[];
}

export type ApplicationType =
  | 'website'           // 网站
  | 'webapp'           // Web应用
  | 'mobile_app'       // 移动应用
  | 'desktop_app'      // 桌面应用
  | 'saas'             // SaaS平台
  | 'ecommerce'        // 电商网站
  | 'social_media'     // 社交媒体
  | 'enterprise'       // 企业应用
  | 'game'             // 游戏应用
  | 'custom';          // 自定义

export type Platform =
  | 'web'              // Web平台
  | 'ios'              // iOS平台
  | 'android'          // Android平台
  | 'windows'          // Windows平台
  | 'macos'            // macOS平台
  | 'linux'            // Linux平台
  | 'cross_platform';  // 跨平台

export interface UIStructure {
  id: string;
  structure_type: StructureType;
  page_url?: string;        // 页面URL (仅网站)
  page_route?: string;      // 页面路由 (仅应用)
  page_title?: string;
  page_hash?: string;       // 页面特征哈希

  // 容器层级结构
  root_container: ContainerSnapshot;
  container_hierarchy: ContainerHierarchy[];

  // 检测特征
  visual_features: VisualFeatures;
  structural_features: StructuralFeatures;
  behavioral_features: BehavioralFeatures;

  // 变化追踪
  change_history: StructureChange[];
  stability_score: number;

  // 时间信息
  first_seen: Date;
  last_seen: Date;
  occurrence_count: number;
}

export type StructureType =
  | 'login_page'        // 登录页面
  | 'home_page'         // 首页
  | 'search_page'       // 搜索页面
  | 'detail_page'       // 详情页面
  | 'list_page'         // 列表页面
  | 'form_page'         // 表单页面
  | 'settings_page'     // 设置页面
  | 'profile_page'      // 个人资料页面
  | 'dashboard'         // 仪表板
  | 'modal_dialog'      // 模态对话框
  | 'navigation'        // 导航栏
  | 'sidebar'           // 侧边栏
  | 'footer'            // 页脚
  | 'header'            // 页头
  | 'custom';           // 自定义

export interface ContainerSnapshot {
  container_id: string;
  container_type: string;
  bounds: BoundingBox;
  properties: Record<string, any>;
  children: string[];  // 子容器ID列表

  // 识别特征
  selector?: string;
  xpath?: string;
  text_content?: string;
  visual_signature?: string;

  // 稳定性信息
  stability_score: number;
  change_frequency: number;

  // 快照时间
  timestamp: Date;
}

export interface ContainerHierarchy {
  level: number;
  parent_id?: string;
  container_id: string;
  relationship_type: 'parent-child' | 'sibling' | 'functional';
  strength: number;
}

export interface VisualFeatures {
  color_scheme: string[];
  layout_pattern: string;
  component_density: number;
  visual_complexity: number;
  design_system?: string;  // 如: Material Design, Ant Design等

  // 图像特征
  screenshot_hash?: string;
  dominant_colors: string[];
  layout_grid: GridPattern;

  // 文本特征
  font_families: string[];
  font_sizes: number[];
  text_density: number;
}

export interface GridPattern {
  columns: number;
  rows: number;
  gutters: number;
  alignment: 'start' | 'center' | 'end' | 'stretch';
}

export interface StructuralFeatures {
  dom_depth: number;
  element_count: number;
  container_types: string[];
  interaction_elements: string[];

  // HTML结构特征
  semantic_html: boolean;
  accessibility_score: number;
  form_structure?: FormStructure;

  // 组件结构
  component_library?: string;
  custom_components: string[];
}

export interface FormStructure {
  fields: FieldInfo[];
  validation_rules: ValidationRule[];
  submit_button?: string;
  error_handling: string;
}

export interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  validation: string[];
  position: number;
}

export interface BehavioralFeatures {
  common_user_flows: UserFlow[];
  interaction_patterns: InteractionPattern[];
  performance_metrics: PerformanceMetrics;

  // 用户行为预测
  likely_next_actions: PredictedAction[];
  abandonment_points: string[];

  // 成功率统计
  task_completion_rates: Record<string, number>;
  error_prone_elements: string[];
}

export interface UserFlow {
  id: string;
  name: string;
  description: string;
  steps: FlowStep[];
  success_rate: number;
  average_completion_time: number;
  frequency: number;
}

export interface FlowStep {
  order: number;
  action: string;
  target_element: string;
  description: string;
  optional: boolean;
  alternatives: string[];
}

export interface InteractionPattern {
  pattern_type: string;
  frequency: number;
  sequence: string[];
  conditions: PatternCondition[];
  outcomes: PatternOutcome[];
}

export interface PatternCondition {
  element: string;
  property: string;
  value: any;
  operator: 'equals' | 'contains' | 'exists' | 'visible';
}

export interface PatternOutcome {
  result_type: string;
  probability: number;
  description: string;
}

export interface PerformanceMetrics {
  load_time: number;
  interaction_response_time: number;
  error_rate: number;
  user_satisfaction_score: number;
}

export interface PredictedAction {
  action: string;
  probability: number;
  context: string;
  confidence: number;
}

export interface StructureChange {
  timestamp: Date;
  change_type: 'addition' | 'removal' | 'modification' | 'reorder';
  affected_elements: string[];
  description: string;
  impact_level: 'low' | 'medium' | 'high';
}

export interface UIPattern {
  id: string;
  pattern_name: string;
  pattern_type: PatternType;
  description: string;

  // 模式特征
  visual_signature: string;
  structural_signature: string;
  behavioral_signature: string;

  // 应用场景
  applicable_structures: string[];
  common_contexts: string[];

  // 统计信息
  usage_frequency: number;
  success_rate: number;
  reliability_score: number;

  // 学习数据
  feedback_history: PatternFeedback[];
  optimization_suggestions: string[];
}

export type PatternType =
  | 'navigation'         // 导航模式
  | 'form_filling'       // 表单填写模式
  | 'data_entry'         // 数据录入模式
  | 'search_and_filter'  // 搜索过滤模式
  | 'content_consumption' // 内容消费模式
  | 'social_interaction' // 社交互动模式
  | 'ecommerce_flow'    // 电商流程模式
  | 'authentication'    // 认证模式
  | 'error_handling'    // 错误处理模式
  | 'custom';           // 自定义模式

export interface PatternFeedback {
  timestamp: Date;
  feedback_type: 'positive' | 'negative' | 'neutral';
  rating: number;
  comment: string;
  context: string;
}

export interface UserBehavior {
  user_id?: string;
  session_id: string;

  // 行为序列
  action_sequence: ActionRecord[];
  time_spent: number;
  completion_status: 'completed' | 'abandoned' | 'interrupted';

  // 行为分析
  behavior_pattern: string;
  efficiency_score: number;
  error_events: ErrorEvent[];

  // 时间信息
  start_time: Date;
  end_time: Date;
  duration: number;
}

export interface ActionRecord {
  timestamp: Date;
  action: string;
  target_element: string;
  parameters: Record<string, any>;
  result: 'success' | 'failure' | 'partial';
  response_time: number;
}

export interface ErrorEvent {
  timestamp: Date;
  error_type: string;
  element: string;
  description: string;
  recovery_action?: string;
}

export interface LearningData {
  // 学习统计
  total_interactions: number;
  successful_interactions: number;
  learning_rate: number;

  // 模式识别
  identified_patterns: string[];
  pattern_confidence: Record<string, number>;

  // 适应性改进
  adaptation_suggestions: AdaptationSuggestion[];
  performance_improvements: PerformanceImprovement[];

  // 反馈循环
  user_feedback: UserFeedback[];
  system_feedback: SystemFeedback[];
}

export interface AdaptationSuggestion {
  type: 'structure' | 'interaction' | 'performance' | 'accessibility';
  description: string;
  priority: 'low' | 'medium' | 'high';
  expected_benefit: string;
  implementation_complexity: 'easy' | 'medium' | 'hard';
}

export interface PerformanceImprovement {
  metric_name: string;
  previous_value: number;
  current_value: number;
  improvement_percentage: number;
  contributing_factors: string[];
}

export interface UserFeedback {
  timestamp: Date;
  feedback_type: 'rating' | 'comment' | 'correction' | 'suggestion';
  content: string;
  rating?: number;
  context: string;
}

export interface SystemFeedback {
  timestamp: Date;
  feedback_type: 'detection' | 'prediction' | 'adaptation' | 'error';
  content: string;
  confidence: number;
  actionable: boolean;
}

export interface AdaptationHistory {
  timestamp: Date;
  adaptation_type: AdaptationType;
  trigger: string;
  changes: AdaptationChange[];
  outcome: AdaptationOutcome;

  // 影响评估
  performance_impact: number;
  user_satisfaction_impact: number;

  // 学习记录
  lessons_learned: string[];
  future_preventions: string[];
}

export type AdaptationType =
  | 'structural'         // 结构调整
  | 'behavioral'         // 行为调整
  | 'performance'        // 性能优化
  | 'accessibility'     // 可访问性改进
  | 'user_preference'    // 用户偏好调整
  | 'error_prevention'   // 错误预防
  | 'feature_enhancement'; // 功能增强

export interface AdaptationChange {
  element_id: string;
  change_type: 'add' | 'remove' | 'modify' | 'reorder';
  old_value?: any;
  new_value?: any;
  reason: string;
}

export interface AdaptationOutcome {
  success: boolean;
  impact_level: 'low' | 'medium' | 'high';
  measurable_improvement: boolean;
  unexpected_side_effects: string[];
}

// 记忆系统配置
export interface MemorySystemConfig {
  // 存储配置
  max_applications: number;
  max_structures_per_app: number;
  max_memory_age_days: number;

  // 学习配置
  learning_enabled: boolean;
  adaptation_threshold: number;
  pattern_recognition_sensitivity: number;

  // 性能配置
  cache_size: number;
  cleanup_interval_hours: number;
  compression_enabled: boolean;

  // 隐私配置
  data_retention_days: number;
  anonymize_user_data: boolean;
  encryption_enabled: boolean;
}

// 记忆查询接口
export interface MemoryQuery {
  application_id?: string;
  structure_type?: StructureType;
  pattern_type?: PatternType;
  time_range?: {
    start: Date;
    end: Date;
  };
  user_id?: string;
  tags?: string[];
  confidence_threshold?: number;
}

export interface MemorySearchResult {
  applications: ApplicationMemory[];
  structures: UIStructure[];
  patterns: UIPattern[];
  relevance_score: number;
  total_results: number;
  search_time: number;
}