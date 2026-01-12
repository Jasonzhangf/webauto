/**
 * API Usage 注册与查询服务
 */

export interface ParameterDefinition {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  description?: string;
  default?: any;
}

export interface ActionUsage {
  description: string;
  parameters: Record<string, ParameterDefinition>;
  returns: string;
}

const usageRegistry = new Map<string, ActionUsage>();

/**
 * 注册 action usage
 */
export function registerActionUsage(action: string, usage: ActionUsage): void {
  usageRegistry.set(action, usage);
}

/**
 * 查询单个 action usage
 */
export function getActionUsage(action: string): ActionUsage | undefined {
  return usageRegistry.get(action);
}

/**
 * 获取所有已注册的 usages
 */
export function getAllUsages(): Record<string, ActionUsage> {
  const result: Record<string, ActionUsage> = {};
  for (const [action, usage] of usageRegistry.entries()) {
    result[action] = usage;
  }
  return result;
}

/**
 * 清除所有 usages（主要用于测试）
 */
export function clearAllUsages(): void {
  usageRegistry.clear();
}

export type { ActionUsage as Usage, ParameterDefinition as Parameter };
