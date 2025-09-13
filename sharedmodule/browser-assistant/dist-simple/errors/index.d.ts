/**
 * 浏览器助手错误定义
 */
export declare class BrowserAssistantError extends Error {
    code: string;
    context?: any;
    constructor(message: string, context?: any);
}
export declare class BrowserConnectionError extends BrowserAssistantError {
    constructor(message: string, context?: any);
}
export declare class ElementNotFoundError extends BrowserAssistantError {
    constructor(message: string, context?: any);
}
export declare class NavigationTimeoutError extends BrowserAssistantError {
    constructor(message: string, context?: any);
}
export declare class AnalysisError extends BrowserAssistantError {
    constructor(message: string, context?: any);
}
export declare class CookieError extends BrowserAssistantError {
    constructor(message: string, context?: any);
}
export declare class AIError extends BrowserAssistantError {
    constructor(message: string, context?: any);
}
export declare class WebSocketError extends BrowserAssistantError {
    constructor(message: string, context?: any);
}
//# sourceMappingURL=index.d.ts.map