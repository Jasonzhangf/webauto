/**
 * 高层UI容器系统 - 容器类型定义
 * 现代化的UI控件系统
 */

export interface UIContainer {
  id: string;
  type: ContainerType;
  bounds: BoundingBox;
  children: UIControl[];
  parent?: UIContainer;
  relationships: ContainerRelationship[];
  properties: ContainerProperties;
  metadata: ContainerMetadata;
}

export type ContainerType =
  | 'page'           // 页面容器
  | 'form'           // 表单容器
  | 'menu'           // 菜单容器
  | 'navigation'     // 导航容器
  | 'table'          // 表格容器
  | 'list'           // 列表容器
  | 'modal'          // 模态框容器
  | 'sidebar'        // 侧边栏容器
  | 'header'         // 头部容器
  | 'footer'         // 底部容器
  | 'content'        // 内容容器
  | 'section'        // 区块容器
  | 'card'           // 卡片容器
  | 'toolbar'        // 工具栏容器
  | 'tab'            // 标签页容器
  | 'dropdown'       // 下拉容器
  | 'grid'           // 网格容器
  | 'flex'           // 弹性容器
  | 'custom';        // 自定义容器

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

export interface ContainerRelationship {
  id: string;
  type: RelationshipType;
  target: UIContainer;
  strength: number; // 0-1
  properties?: Record<string, any>;
}

export type RelationshipType =
  | 'parent-child'     // 父子关系
  | 'sibling'          // 兄弟关系
  | 'adjacent'         // 相邻关系
  | 'nested'           // 嵌套关系
  | 'functional'       // 功能关系
  | 'spatial'          // 空间关系
  | 'temporal'         // 时间关系
  | 'data-flow'        // 数据流关系
  | 'navigation'       // 导航关系
  | 'trigger-action';  // 触发-动作关系

export interface ContainerProperties {
  // 基础属性
  name?: string;
  description?: string;
  role?: string;              // ARIA role
  label?: string;             // 可访问标签

  // 视觉属性
  background_color?: string;
  border?: string;
  padding?: Spacing;
  margin?: Spacing;
  z_index?: number;
  visibility?: 'visible' | 'hidden' | 'collapsed';

  // 布局属性
  layout_type?: LayoutType;
  alignment?: Alignment;
  direction?: Direction;
  wrap?: boolean;

  // 交互属性
  clickable?: boolean;
  focusable?: boolean;
  scrollable?: boolean;
  resizable?: boolean;
  draggable?: boolean;

  // 状态属性
  enabled?: boolean;
  readonly?: boolean;
  required?: boolean;
  valid?: boolean;
  loading?: boolean;

  // 数据属性
  data_source?: string;
  data_binding?: string;
  form_id?: string;

  // 自定义属性
  custom_properties?: Record<string, any>;
}

export type LayoutType = 'block' | 'inline' | 'flex' | 'grid' | 'table' | 'absolute' | 'relative' | 'fixed' | 'sticky';
export type Alignment = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type Direction = 'row' | 'column' | 'row-reverse' | 'column-reverse';

export interface Spacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface ContainerMetadata {
  created_at: Date;
  updated_at: Date;
  version: string;
  source: 'ai-detected' | 'manual' | 'hybrid';
  confidence: number;
  analysis_level: 'basic' | 'deep' | 'comprehensive';
  tags: string[];
  annotations: ContainerAnnotation[];
}

export interface ContainerAnnotation {
  type: 'purpose' | 'usage' | 'warning' | 'suggestion';
  content: string;
  confidence: number;
  created_by: 'ai' | 'user';
  created_at: Date;
}

// 容器分析结果
export interface ContainerAnalysis {
  container: UIContainer;
  purpose: string;
  intent: string;
  user_flow: UserFlowStep[];
  interactions: InteractionPattern[];
  suggestions: ActionSuggestion[];
  accessibility: AccessibilityInfo;
}

export interface UserFlowStep {
  order: number;
  action: string;
  target_container?: string;
  description: string;
  estimated_time: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface InteractionPattern {
  type: InteractionType;
  frequency: number;
  sequence: string[];
  conditions: InteractionCondition[];
  outcomes: InteractionOutcome[];
}

export type InteractionType =
  | 'click'
  | 'type'
  | 'select'
  | 'hover'
  | 'scroll'
  | 'drag-drop'
  | 'swipe'
  | 'pinch'
  | 'voice'
  | 'keyboard';

export interface InteractionCondition {
  property: string;
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'exists';
  value: any;
}

export interface InteractionOutcome {
  result_type: 'navigation' | 'data-change' | 'ui-update' | 'validation' | 'error';
  description: string;
  probability: number;
}

export interface ActionSuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  confidence: number;
  steps: ActionStep[];
  prerequisites: string[];
  expected_outcome: string;
  risk_level: 'low' | 'medium' | 'high';
}

export type SuggestionType =
  | 'auto-fill'        // 自动填充
  | 'form-submit'      // 表单提交
  | 'navigation'       // 导航操作
  | 'data-entry'       // 数据输入
  | 'validation'       // 验证操作
  | 'search'           // 搜索操作
  | 'filter'           // 过滤操作
  | 'sort'            // 排序操作
  | 'export'          // 导出操作
  | 'import'          // 导入操作
  | 'custom';         // 自定义操作

export interface ActionStep {
  order: number;
  action: string;
  target: string;
  parameters?: Record<string, any>;
  wait_condition?: string;
  timeout?: number;
}

export interface AccessibilityInfo {
  wcag_level: 'A' | 'AA' | 'AAA' | 'non-compliant';
  issues: AccessibilityIssue[];
  score: number;
  recommendations: string[];
}

export interface AccessibilityIssue {
  type: 'error' | 'warning' | 'info';
  category: 'keyboard' | 'color' | 'text' | 'structure' | 'other';
  description: string;
  element?: string;
  solution: string;
}

// 容器操作
export interface ContainerOperation {
  id: string;
  type: ContainerOperationType;
  target_container: string;
  parameters?: Record<string, any>;
  preconditions?: string[];
  expected_result?: string;
}

export type ContainerOperationType =
  | 'expand'          // 展开容器
  | 'collapse'        // 折叠容器
  | 'scroll'          // 滚动容器
  | 'focus'           // 聚焦容器
  | 'enable'          // 启用容器
  | 'disable'         // 禁用容器
  | 'show'            // 显示容器
  | 'hide'            // 隐藏容器
  | 'resize'          // 调整大小
  | 'move'            // 移动位置
  | 'reorder'         // 重新排序
  | 'validate'        // 验证容器
  | 'reset'           // 重置容器
  | 'refresh'         // 刷新容器
  | 'export'          // 导出数据
  | 'import'          // 导入数据
  | 'filter'          // 过滤内容
  | 'sort';           // 排序内容