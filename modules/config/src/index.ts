// 配置模块主入口

import { ConfigLoader } from './ConfigLoader.js';

export { ConfigLoader } from './ConfigLoader.js';
export { ConfigValidator } from './ConfigValidator.js';

// 导出所有类型
export type {
  Config,
  BrowserServiceConfig,
  PortsConfig,
  EnvironmentConfig,
  EnvironmentsConfig,
  UIConfig,
  DesktopConsoleConfig,
  ConfigLoaderOptions,
  ValidationResult
} from './types.js';

// 导出所有 schemas
export * from './schemas/index.js';

// 创建默认配置加载器实例
const defaultLoader = new ConfigLoader();

/**
 * 加载配置（使用默认配置加载器）
 * @returns 配置对象
 */
export async function loadConfig(): Promise<import('./types.js').Config> {
  return defaultLoader.load();
}

/**
 * 保存配置（使用默认配置加载器）
 * @param config 配置对象
 */
export async function saveConfig(config: import('./types.js').Config): Promise<void> {
  return defaultLoader.save(config);
}

/**
 * 重新加载配置（使用默认配置加载器）
 * @returns 配置对象
 */
export async function reloadConfig(): Promise<import('./types.js').Config> {
  return defaultLoader.reload();
}

/**
 * 获取配置（使用默认配置加载器）
 * @returns 配置对象或 null
 */
export function getConfig(): import('./types.js').Config | null {
  return defaultLoader.get();
}

/**
 * 验证配置（使用默认配置加载器）
 * @returns 验证结果
 */
export async function validateConfig(): Promise<import('./types.js').ValidationResult> {
  return defaultLoader.validate();
}

/**
 * 获取默认配置
 * @returns 默认配置对象
 */
export function getDefaultConfig(): import('./types.js').Config {
  return defaultLoader.getDefaultConfig();
}

// 导出默认加载器实例供高级用法
export { defaultLoader as loader };
