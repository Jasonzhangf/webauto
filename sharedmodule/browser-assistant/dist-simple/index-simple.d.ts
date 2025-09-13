/**
 * WebAuto Browser Assistant - Simplified Version
 * 智能浏览器自动化助手，基于 Camoufox 和基本页面操作
 *
 * @module @webauto/browser-assistant
 */
export { BaseBrowserModule } from './core/SimpleBaseModule';
export { CamoufoxManager } from './browser/CamoufoxManager';
export { CookieManager } from './browser/SimpleCookieManager';
export type { CamoufoxConfig } from './browser/CamoufoxManager';
export { PageOperationCenter } from './operations/SimplePageOperationCenter';
export { SmartElementSelector } from './operations/SimpleSmartElementSelector';
export type { ElementContext, ElementSelection } from './operations/SimpleSmartElementSelector';
export { BrowserAssistantError, BrowserConnectionError, ElementNotFoundError, NavigationTimeoutError, AnalysisError, CookieError, AIError, WebSocketError } from './errors';
export * from './types';
export declare const createBrowserAssistant: (config?: Partial<any>) => any;
export declare const version = "0.1.0";
export declare const name = "@webauto/browser-assistant";
declare const _default: {
    readonly CamoufoxManager: any;
    readonly PageOperationCenter: any;
    readonly SmartElementSelector: any;
    readonly CookieManager: any;
    createBrowserAssistant: (config?: Partial<any>) => any;
    version: string;
    name: string;
};
export default _default;
//# sourceMappingURL=index-simple.d.ts.map