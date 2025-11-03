/**
 * 高层UI容器系统 - 控件类型定义
 * 现代化的UI控件系统
 */

export interface UIControl {
  id: string;
  type: ControlType;
  bounds: BoundingBox;
  container: string;  // 所属容器ID
  properties: ControlProperties;
  operations: Operation[];
  metadata: ControlMetadata;
}

export type ControlType =
  // 输入类控件
  | 'text-input'      // 文本输入框
  | 'password-input'  // 密码输入框
  | 'email-input'     // 邮箱输入框
  | 'number-input'    // 数字输入框
  | 'search-input'    // 搜索输入框
  | 'url-input'       // URL输入框
  | 'tel-input'       // 电话输入框
  | 'date-input'      // 日期输入框
  | 'time-input'      // 时间输入框
  | 'file-input'      // 文件输入框
  | 'color-input'     // 颜色选择器
  | 'range-input'     // 范围滑块

  // 按钮类控件
  | 'button'          // 按钮
  | 'submit-button'   // 提交按钮
  | 'reset-button'    // 重置按钮
  | 'cancel-button'   // 取消按钮
  | 'toggle-button'   // 切换按钮
  | 'link-button'     // 链接按钮
  | 'icon-button'     // 图标按钮
  | 'dropdown-button' // 下拉按钮
  | 'split-button'    // 分割按钮

  // 选择类控件
  | 'checkbox'        // 复选框
  | 'radio'           // 单选按钮
  | 'select'          // 下拉选择
  | 'multi-select'    // 多选下拉
  | 'listbox'         // 列表框
  | 'switch'          // 开关
  | 'slider'          // 滑块

  // 显示类控件
  | 'label'           // 标签
  | 'text'            // 文本
  | 'heading'         // 标题
  | 'paragraph'       // 段落
  | 'image'           // 图片
  | 'icon'            // 图标
  | 'avatar'          // 头像
  | 'badge'           // 徽章
  | 'chip'            // 标签
  | 'progress'        // 进度条
  | 'spinner'         // 加载动画
  | 'tooltip'         // 工具提示

  // 媒体类控件
  | 'video'           // 视频
  | 'audio'           // 音频
  | 'canvas'          // 画布
  | 'chart'           // 图表
  | 'map'             // 地图

  // 导航类控件
  | 'link'            // 链接
  | 'tab'             // 标签页
  | 'breadcrumb'      // 面包屑导航
  | 'pagination'      // 分页
  | 'menu-item'       // 菜单项
  | 'tree-item'       // 树形项

  // 表格类控件
  | 'table-cell'      // 表格单元格
  | 'table-header'    // 表头
  | 'table-row'       // 表格行
  | 'data-grid'       // 数据网格

  // 容器类控件
  | 'card'            // 卡片
  | 'panel'           // 面板
  | 'accordion'       // 手风琴
  | 'tabs'            // 标签页组
  | 'carousel'        // 轮播图
  | 'timeline'        // 时间线

  // 反馈类控件
  | 'alert'           // 警告
  | 'notification'    // 通知
  | 'toast'           // 吐司
  | 'modal'           // 模态框
  | 'drawer'          // 抽屉
  | 'popover'         // 弹出框
  | 'dropdown'        // 下拉菜单

  // 自定义控件
  | 'custom'          // 自定义控件
  | 'composite'       // 复合控件
  | 'unknown';        // 未知控件

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

export interface ControlProperties {
  // 基础属性
  name?: string;
  label?: string;
  placeholder?: string;
  title?: string;
  description?: string;
  help_text?: string;
  value?: any;
  default_value?: any;

  // 视觉属性
  text_color?: string;
  background_color?: string;
  border_color?: string;
  border_width?: number;
  border_radius?: number;
  font_size?: number;
  font_weight?: 'normal' | 'bold' | 'bolder' | 'lighter';
  text_align?: 'left' | 'center' | 'right' | 'justify';
  padding?: Spacing;
  margin?: Spacing;

  // 状态属性
  enabled?: boolean;
  readonly?: boolean;
  required?: boolean;
  visible?: boolean;
  checked?: boolean;
  selected?: boolean;
  focused?: boolean;
  hovered?: boolean;
  active?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  valid?: boolean;

  // 交互属性
  clickable?: boolean;
  focusable?: boolean;
  editable?: boolean;
  resizable?: boolean;
  draggable?: boolean;
  droppable?: boolean;
  scrollable?: boolean;
  keyboard_accessible?: boolean;

  // 数据属性
  data_type?: DataType;
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  step?: number;
  pattern?: string;
  format?: string;
  validation_rules?: ValidationRule[];
  options?: ControlOption[];

  // 行为属性
  auto_complete?: 'on' | 'off';
  auto_focus?: boolean;
  spell_check?: boolean;
  multi_line?: boolean;
  wrap_text?: boolean;
  resize_mode?: 'none' | 'both' | 'horizontal' | 'vertical';

  // 可访问性属性
  aria_label?: string;
  aria_description?: string;
  aria_role?: string;
  aria_required?: boolean;
  aria_invalid?: boolean;
  tabindex?: number;

  // 自定义属性
  custom_attributes?: Record<string, any>;
  css_classes?: string[];
  inline_styles?: Record<string, string>;
}

export type DataType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'time'
  | 'datetime'
  | 'email'
  | 'url'
  | 'tel'
  | 'file'
  | 'color'
  | 'array'
  | 'object'
  | 'custom';

export interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern' | 'custom';
  value?: any;
  message: string;
  validator?: (value: any) => boolean;
}

export interface ControlOption {
  value: any;
  label: string;
  disabled?: boolean;
  selected?: boolean;
  group?: string;
  icon?: string;
  description?: string;
}

export interface Spacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface ControlMetadata {
  created_at: Date;
  updated_at: Date;
  version: string;
  source: 'ai-detected' | 'manual' | 'hybrid';
  confidence: number;
  detection_method?: string;
  tags: string[];
  annotations: ControlAnnotation[];
  interactions: InteractionHistory[];
  performance_metrics?: PerformanceMetrics;
}

export interface ControlAnnotation {
  type: 'purpose' | 'usage' | 'warning' | 'suggestion' | 'accessibility';
  content: string;
  confidence: number;
  created_by: 'ai' | 'user';
  created_at: Date;
  priority: 'low' | 'medium' | 'high';
}

export interface InteractionHistory {
  timestamp: Date;
  action: string;
  parameters?: Record<string, any>;
  result: 'success' | 'failure' | 'partial';
  duration: number;
  user_id?: string;
  session_id?: string;
}

export interface PerformanceMetrics {
  click_success_rate: number;
  average_interaction_time: number;
  error_rate: number;
  abandonment_rate: number;
  user_satisfaction_score?: number;
}

// 操作相关类型
export interface Operation {
  id: string;
  type: OperationType;
  name: string;
  description: string;
  parameters?: OperationParameter[];
  preconditions?: string[];
  expected_result?: string;
  risk_level: 'low' | 'medium' | 'high';
  execution_time?: number;
}

export type OperationType =
  // 基础操作
  | 'click'           // 点击
  | 'double-click'    // 双击
  | 'right-click'     // 右键点击
  | 'hover'           // 悬停
  | 'focus'           // 聚焦
  | 'blur'            // 失焦

  // 输入操作
  | 'type'            // 输入文本
  | 'clear'           // 清空
  | 'select'          // 选择
  | 'deselect'        // 取消选择
  | 'paste'           // 粘贴
  | 'cut'             // 剪切
  | 'copy'            // 复制

  // 选择操作
  | 'check'           // 勾选
  | 'uncheck'         // 取消勾选
  | 'toggle'          // 切换
  | 'select-option'   // 选择选项
  | 'change-value'    // 改变值

  // 导航操作
  | 'navigate'        // 导航
  | 'scroll'          // 滚动
  | 'drag'            // 拖拽
  | 'drop'            // 放置
  | 'swipe'           // 滑动
  | 'pinch'           // 缩放

  // 表单操作
  | 'submit'          // 提交
  | 'reset'           // 重置
  | 'validate'        // 验证
  | 'save'            // 保存
  | 'cancel'          // 取消

  // 媒体操作
  | 'play'            // 播放
  | 'pause'           // 暂停
  | 'stop'            // 停止
  | 'record'          // 录制
  | 'upload'          // 上传
  | 'download'        // 下载

  // 高级操作
  | 'smart-click'     // 智能点击
  | 'auto-fill'       // 自动填充
  | 'verify'          // 验证
  | 'wait-for'        // 等待
  | 'retry'           // 重试
  | 'chain'           // 操作链

  // 自定义操作
  | 'custom'          // 自定义操作
  | 'script'          // 脚本操作
  | 'macro';          // 宏操作

export interface OperationParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default_value?: any;
  description: string;
  validation?: ValidationRule[];
}

export interface OperationResult {
  success: boolean;
  operation_id: string;
  control_id: string;
  execution_time: number;
  result_data?: any;
  error_message?: string;
  side_effects?: SideEffect[];
  screenshot_before?: string;
  screenshot_after?: string;
}

export interface SideEffect {
  type: 'ui-change' | 'navigation' | 'data-change' | 'error' | 'notification';
  description: string;
  affected_elements?: string[];
  timestamp: Date;
}

// 智能操作类型
export interface SmartOperation extends Operation {
  ai_suggested: boolean;
  confidence: number;
  context_requirements: string[];
  alternative_operations: Operation[];
  learning_data?: OperationLearningData;
}

export interface OperationLearningData {
  success_count: number;
  failure_count: number;
  average_execution_time: number;
  user_preferences: Record<string, any>;
  optimization_suggestions: string[];
}