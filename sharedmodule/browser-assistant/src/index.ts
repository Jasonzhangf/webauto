/**
 * WebAuto Browser Assistant
 * 智能浏览器自动化助手，基于 Camoufox 和 AI 驱动的页面分析
 * 
 * @module @webauto/browser-assistant
 */

// 核心类导出
export { BrowserAssistant } from './core/BrowserAssistant';
export { BaseBrowserModule } from './core/BaseModule';
export { BrowserAssistantErrorHandler } from './core/ErrorHandler';

// 分析器导出
export { PageAnalyzer } from './core/PageAnalyzer';
export { ContentExtractor } from './core/ContentExtractor';
export { ListAnalyzer } from './core/ListAnalyzer';

// 管理器导出
export { BrowserManager } from './core/BrowserManager';
export { PageObserver } from './observers/PageObserver';
export { OperationEngine } from './operations/OperationEngine';
export { CookieManager } from './browser/CookieManager';
export { CamoufoxManager, type CamoufoxConfig } from './browser/CamoufoxManager';

// 操作中心导出
export { PageOperationCenter, type OperationOptions, type ClickOptions, type ScrollOptions, type TypeOptions, type ContentExtractionOptions, type CopyPasteOptions, type ExtractedContent } from './operations/PageOperationCenter';

// 智能选择器导出
export { SmartElementSelector, type ElementContext, type ElementSelection, type SelectorStrategy, type ElementIdentification } from './operations/SmartElementSelector';

// WebSocket 导出
export { WebSocketServer } from './websocket/WebSocketServer';

// AI 分析器导出
export { AIAnalyzer } from './observers/AIAnalyzer';

// 类型定义导出
export * from './types';
export * from './types/page-analysis';

// 接口定义导出
export * from './interfaces';

// 工具函数
export { generateId, generateClientId } from './utils/idGenerator';
export { deepMerge, debounce, throttle } from './utils/helpers';

// 默认配置
export { defaultConfig } from './config/default';

// 错误类型
export {
  BrowserAssistantError,
  BrowserConnectionError,
  ElementNotFoundError,
  NavigationTimeoutError,
  AnalysisError
} from './errors';

// 版本信息
export const version = '0.1.0';
export const name = '@webauto/browser-assistant';

/**
 * 快速创建浏览器助手实例
 * @param config 配置选项
 * @returns BrowserAssistant 实例
 */
export async function createBrowserAssistant(config?: Partial<import('./types').BrowserAssistantConfig>) {
  const { BrowserAssistant } = await import('./core/BrowserAssistant');
  return new BrowserAssistant(config);
}

/**
 * 快速页面分析
 * @param url 目标URL
 * @param options 分析选项
 * @returns 分析结果
 */
export async function analyzePage(url: string, options?: any) {
  const assistant = await createBrowserAssistant();
  await assistant.initialize();
  
  try {
    return await assistant.analyzePage(url);
  } finally {
    await assistant.close();
  }
}

/**
 * 快速内容提取
 * @param url 目标URL
 * @param options 提取选项
 * @returns 提取结果
 */
export async function extractContent(url: string, options?: any) {
  const assistant = await createBrowserAssistant({
    observation: { enableAI: false }
  });
  
  await assistant.initialize();
  
  try {
    const analysis = await assistant.analyzePage(url);
    return await assistant.getContentExtractor().extractContent(analysis.structure);
  } finally {
    await assistant.close();
  }
}

// 便利的默认导出
export default {
  BrowserAssistant: require('./core/BrowserAssistant').BrowserAssistant,
  createBrowserAssistant,
  analyzePage,
  extractContent,
  version,
  name
};