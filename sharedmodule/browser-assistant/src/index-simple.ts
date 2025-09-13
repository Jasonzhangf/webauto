/**
 * WebAuto Browser Assistant - Simplified Version
 * 智能浏览器自动化助手，基于 Camoufox 和基本页面操作
 * 
 * @module @webauto/browser-assistant
 */

// Core exports
export { BaseBrowserModule } from './core/SimpleBaseModule';

// Browser components
export { CamoufoxManager } from './browser/CamoufoxManager';
export { CookieManager } from './browser/SimpleCookieManager';
export type { CamoufoxConfig } from './browser/CamoufoxManager';

// Operations
export { PageOperationCenter } from './operations/SimplePageOperationCenter';
export { SmartElementSelector } from './operations/SimpleSmartElementSelector';
export type {
  ElementContext,
  ElementSelection
} from './operations/SimpleSmartElementSelector';

// Error handling
export {
  BrowserAssistantError,
  BrowserConnectionError,
  ElementNotFoundError,
  NavigationTimeoutError,
  AnalysisError,
  CookieError,
  AIError,
  WebSocketError
} from './errors';

// Types
export * from './types';

// Convenience functions
export const createBrowserAssistant = (config?: Partial<any>) => {
  // Dynamic import to avoid circular reference
  const { CamoufoxManager } = require('./browser/CamoufoxManager');
  return new CamoufoxManager(config);
};

// Version info
export const version = '0.1.0';
export const name = '@webauto/browser-assistant';

// Default export
export default {
  get CamoufoxManager() { return require('./browser/CamoufoxManager').CamoufoxManager; },
  get PageOperationCenter() { return require('./operations/SimplePageOperationCenter').PageOperationCenter; },
  get SmartElementSelector() { return require('./operations/SimpleSmartElementSelector').SmartElementSelector; },
  get CookieManager() { return require('./browser/SimpleCookieManager').CookieManager; },
  createBrowserAssistant,
  version,
  name
};