/**
 * WebAuto Browser Assistant - Operation-Based Architecture
 * 基于操作子架构的智能浏览器自动化助手
 *
 * @module @webauto/browser-assistant
 */

// === 操作子架构核心组件 ===
export { OperationBasedBrowserAssistant } from './operations';
export {
  BrowserContextManager,
  BrowserWorkflowEngine,
  BrowserWorkflowEngine as WorkflowEngine
} from './operations';

export {
  IBrowserOperation,
  BrowserOperationContext,
  BrowserOperationConfig,
  CookieParams,
  ExtractionParams,
  ContainerParams
} from './operations/interfaces';

// === 核心浏览器操作子 ===
export { BrowserLaunchOperation } from './operations/browser/BrowserLaunchOperationSimple';

// === 向后兼容的组件（保留以便迁移） ===
export { BrowserAssistant } from './core/BrowserAssistant';
export { BaseBrowserModule } from './core/BaseModule';
export { BrowserAssistantErrorHandler } from './core/ErrorHandler';

export { PageAnalyzer } from './core/PageAnalyzer';
export { ContentExtractor } from './core/ContentExtractor';
export { ListAnalyzer } from './core/ListAnalyzer';

export { BrowserManager } from './core/BrowserManager';
export { PageObserver } from './observers/PageObserver';
export { OperationEngine } from './operations/OperationEngine';
export { CookieManager } from './browser/CookieManager';
export { CamoufoxManager, type CamoufoxConfig } from './browser/CamoufoxManager';

export { PageOperationCenter, type OperationOptions, type ClickOptions, type ScrollOptions, type TypeOptions, type ContentExtractionOptions, type CopyPasteOptions, type ExtractedContent } from './operations/PageOperationCenter';
export { SmartElementSelector, type ElementContext, type ElementSelection, type SelectorStrategy, type ElementIdentification } from './operations/SmartElementSelector';

export { WebSocketServer } from './websocket/WebSocketServer';
export { AIAnalyzer } from './observers/AIAnalyzer';

// === 类型定义和接口 ===
export * from './types';
export * from './types/page-analysis';
export * from './interfaces';

// === 工具函数和配置 ===
export { generateId, generateClientId } from './utils/idGenerator';
export { deepMerge, debounce, throttle } from './utils/helpers';
export { defaultConfig } from './config/default';

// === 错误类型 ===
export {
  BrowserAssistantError,
  BrowserConnectionError,
  ElementNotFoundError,
  NavigationTimeoutError,
  AnalysisError
} from './errors';

// === 版本信息 ===
export const version = '2.0.0';
export const name = '@webauto/browser-assistant';

/**
 * 快速创建基于操作子的浏览器助手实例
 * @param config 配置选项
 * @returns OperationBasedBrowserAssistant 实例
 */
export async function createOperationBasedBrowserAssistant(config?: any) {
  const { OperationBasedBrowserAssistant } = await import('./operations');
  return new OperationBasedBrowserAssistant(config);
}

/**
 * 快速页面分析（基于操作子架构）
 * @param url 目标URL
 * @param options 分析选项
 * @returns 分析结果
 */
export async function analyzePage(url: string, options?: any) {
  const assistant = await createOperationBasedBrowserAssistant(options);

  try {
    const workflow = {
      name: 'page-analysis',
      description: 'Navigate to URL and analyze page structure',
      steps: [
        {
          operation: 'browser-launch',
          parameters: { headless: options?.headless ?? false },
          required: true
        },
        {
          operation: 'page-navigation',
          parameters: { url, waitUntil: 'networkidle' },
          required: true
        }
      ]
    };

    return await assistant.executeWorkflow(workflow);
  } finally {
    // Context cleanup can be handled automatically or manually
  }
}

/**
 * 快速内容提取（基于操作子架构）
 * @param url 目标URL
 * @param options 提取选项
 * @returns 提取结果
 */
export async function extractContent(url: string, options?: any) {
  const assistant = await createOperationBasedBrowserAssistant(options);

  try {
    const workflow = {
      name: 'content-extraction',
      description: 'Navigate to URL and extract content',
      steps: [
        {
          operation: 'browser-launch',
          parameters: { headless: options?.headless ?? false },
          required: true
        },
        {
          operation: 'page-navigation',
          parameters: { url, waitUntil: 'networkidle' },
          required: true
        }
      ]
    };

    return await assistant.executeWorkflow(workflow);
  } finally {
    // Context cleanup can be handled automatically or manually
  }
}

// === 向后兼容的便利函数 ===
export async function createBrowserAssistant(config?: Partial<import('./types').BrowserAssistantConfig>) {
  const { BrowserAssistant } = await import('./core/BrowserAssistant');
  return new BrowserAssistant(config);
}

// 便利的默认导出
export default {
  OperationBasedBrowserAssistant: require('./operations').OperationBasedBrowserAssistant,
  BrowserAssistant: require('./core/BrowserAssistant').BrowserAssistant,
  createOperationBasedBrowserAssistant,
  createBrowserAssistant,
  analyzePage,
  extractContent,
  version,
  name
};