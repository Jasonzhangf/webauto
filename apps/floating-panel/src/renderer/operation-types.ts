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

export type TriggerType = 
  | 'appear' 
  | 'click' 
  | 'input' 
  | 'change'
  | 'page:load'
  | 'page:scroll'
  | 'page:navigate'
  | string; // Allow custom events like 'custom:myevent'

export interface Operation {
  id: string;
  type: OperationType;
  triggers: TriggerType[];
  enabled: boolean;
  config: Record<string, any>;
}

/**
 * 基本事件列表
 */
export const BASIC_EVENTS: TriggerType[] = ['appear', 'click', 'change'];

/**
 * 页面级事件列表（仅根容器）
 */
export const PAGE_EVENTS: TriggerType[] = ['page:load', 'page:scroll', 'page:navigate'];

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
