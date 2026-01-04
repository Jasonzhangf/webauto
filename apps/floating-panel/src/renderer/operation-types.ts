/**
 * Operation 类型定义
 * 根据 task.md 中的数据结构定义
 */

export type OperationType = 
  | 'highlight' 
  | 'click' 
  | 'input' 
  | 'scroll' 
  | 'extract' 
  | 'wait'
  | 'navigate'
  | 'screenshot';

export type MessageType =
  | 'appear'
  | 'click'
  | 'input'
  | 'change'
  | 'focused'
  | 'defocused'
  | 'page:load'
  | 'page:scroll'
  | 'page:navigate'
  | 'MSG_CONTAINER_ROOT_SCROLL_COMPLETE'
  | 'MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE'
  | 'MSG_CONTAINER_ROOT_VAR_CHANGED'
  | string; // Allow custom messages

export type ConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'exists' | 'not-exists';

/**
 * Trigger 条件定义
 */
export interface TriggerCondition {
  var: string;        // 变量名，如 'count' 或 'root.isReady'
  op: ConditionOperator;
  value?: any;        // 对于 exists/not-exists 可选
}

/**
 * Trigger 定义：消息 + 可选条件
 */
export interface Trigger {
  message: MessageType;
  condition?: TriggerCondition;
}

/**
 * 向后兼容：支持字符串形式的 trigger（无条件）
 */
export type TriggerType = Trigger | string;

export interface Operation {
  id: string;
  type: OperationType;
  triggers: TriggerType[];
  enabled: boolean;
  config: Record<string, any>;
}

/**
 * 基本消息列表
 */
export const BASIC_MESSAGES: MessageType[] = ['appear', 'click', 'change', 'input', 'focused', 'defocused'];

/**
 * 页面级消息列表（仅根容器）
 */
export const PAGE_MESSAGES: MessageType[] = [
  'page:load',
  'page:scroll',
  'page:navigate',
  'MSG_CONTAINER_ROOT_SCROLL_COMPLETE',
  'MSG_CONTAINER_ROOT_ALL_OPERATIONS_COMPLETE',
  'MSG_CONTAINER_ROOT_VAR_CHANGED'
];

// 向后兼容别名
export const BASIC_EVENTS = BASIC_MESSAGES;
export const PAGE_EVENTS = PAGE_MESSAGES;

/**
 * 所有操作类型选项
 */
export const OPERATION_TYPES: { value: OperationType; label: string }[] = [
  { value: 'highlight', label: '高亮显示' },
  { value: 'click', label: '点击操作' },
  { value: 'input', label: '输入操作' },
  { value: 'scroll', label: '滚动' },
  { value: 'extract', label: '提取数据' },
  { value: 'wait', label: '等待' },
  { value: 'navigate', label: '页面导航' },
  { value: 'screenshot', label: '截图' },
];

/**
 * 检查是否为根容器
 */
export function isRootContainer(container: any): boolean {
  return container?.id?.endsWith('_main_page') ||
         container?.metadata?.isRoot ||
         container?.type === 'root';
}

/**
 * 标准化 Trigger：将字符串转为对象格式
 */
export function normalizeTrigger(trigger: TriggerType): Trigger {
  if (typeof trigger === 'string') {
    return { message: trigger };
  }
  return trigger;
}

/**
 * 格式化 Trigger 显示文本
 */
export function formatTrigger(trigger: TriggerType): string {
  const normalized = normalizeTrigger(trigger);
  let text = normalized.message;

  if (normalized.condition) {
    const { var: varName, op, value } = normalized.condition;
    if (op === 'exists') {
      text += ` (${varName} exists)`;
    } else if (op === 'not-exists') {
      text += ` (${varName} not exists)`;
    } else {
      const valueStr = typeof value === 'string' ? `"${value}"` : value;
      text += ` (${varName} ${op} ${valueStr})`;
    }
  }

  return text;
}

/**
 * 获取 Trigger 的主消息名
 */
export function getTriggerMessage(trigger: TriggerType): string {
  return typeof trigger === 'string' ? trigger : trigger.message;
}
