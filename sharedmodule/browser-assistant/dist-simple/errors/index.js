"use strict";
/**
 * 浏览器助手错误定义
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketError = exports.AIError = exports.CookieError = exports.AnalysisError = exports.NavigationTimeoutError = exports.ElementNotFoundError = exports.BrowserConnectionError = exports.BrowserAssistantError = void 0;
class BrowserAssistantError extends Error {
    code;
    context;
    constructor(message, context) {
        super(message);
        this.name = 'BrowserAssistantError';
        this.code = 'BROWSER_ASSISTANT_ERROR';
        this.context = context;
    }
}
exports.BrowserAssistantError = BrowserAssistantError;
class BrowserConnectionError extends BrowserAssistantError {
    constructor(message, context) {
        super(message, context);
        this.name = 'BrowserConnectionError';
        this.code = 'BROWSER_CONNECTION_ERROR';
    }
}
exports.BrowserConnectionError = BrowserConnectionError;
class ElementNotFoundError extends BrowserAssistantError {
    constructor(message, context) {
        super(message, context);
        this.name = 'ElementNotFoundError';
        this.code = 'ELEMENT_NOT_FOUND_ERROR';
    }
}
exports.ElementNotFoundError = ElementNotFoundError;
class NavigationTimeoutError extends BrowserAssistantError {
    constructor(message, context) {
        super(message, context);
        this.name = 'NavigationTimeoutError';
        this.code = 'NAVIGATION_TIMEOUT_ERROR';
    }
}
exports.NavigationTimeoutError = NavigationTimeoutError;
class AnalysisError extends BrowserAssistantError {
    constructor(message, context) {
        super(message, context);
        this.name = 'AnalysisError';
        this.code = 'ANALYSIS_ERROR';
    }
}
exports.AnalysisError = AnalysisError;
class CookieError extends BrowserAssistantError {
    constructor(message, context) {
        super(message, context);
        this.name = 'CookieError';
        this.code = 'COOKIE_ERROR';
    }
}
exports.CookieError = CookieError;
class AIError extends BrowserAssistantError {
    constructor(message, context) {
        super(message, context);
        this.name = 'AIError';
        this.code = 'AI_ERROR';
    }
}
exports.AIError = AIError;
class WebSocketError extends BrowserAssistantError {
    constructor(message, context) {
        super(message, context);
        this.name = 'WebSocketError';
        this.code = 'WEBSOCKET_ERROR';
    }
}
exports.WebSocketError = WebSocketError;
//# sourceMappingURL=index.js.map