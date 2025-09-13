/**
 * 浏览器助手错误定义
 */

export class BrowserAssistantError extends Error {
  public code: string;
  public context?: any;

  constructor(message: string, context?: any) {
    super(message);
    this.name = 'BrowserAssistantError';
    this.code = 'BROWSER_ASSISTANT_ERROR';
    this.context = context;
  }
}

export class BrowserConnectionError extends BrowserAssistantError {
  constructor(message: string, context?: any) {
    super(message, context);
    this.name = 'BrowserConnectionError';
    this.code = 'BROWSER_CONNECTION_ERROR';
  }
}

export class ElementNotFoundError extends BrowserAssistantError {
  constructor(message: string, context?: any) {
    super(message, context);
    this.name = 'ElementNotFoundError';
    this.code = 'ELEMENT_NOT_FOUND_ERROR';
  }
}

export class NavigationTimeoutError extends BrowserAssistantError {
  constructor(message: string, context?: any) {
    super(message, context);
    this.name = 'NavigationTimeoutError';
    this.code = 'NAVIGATION_TIMEOUT_ERROR';
  }
}

export class AnalysisError extends BrowserAssistantError {
  constructor(message: string, context?: any) {
    super(message, context);
    this.name = 'AnalysisError';
    this.code = 'ANALYSIS_ERROR';
  }
}

export class CookieError extends BrowserAssistantError {
  constructor(message: string, context?: any) {
    super(message, context);
    this.name = 'CookieError';
    this.code = 'COOKIE_ERROR';
  }
}

export class AIError extends BrowserAssistantError {
  constructor(message: string, context?: any) {
    super(message, context);
    this.name = 'AIError';
    this.code = 'AI_ERROR';
  }
}

export class WebSocketError extends BrowserAssistantError {
  constructor(message: string, context?: any) {
    super(message, context);
    this.name = 'WebSocketError';
    this.code = 'WEBSOCKET_ERROR';
  }
}