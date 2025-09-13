import { BrowserConfig, CookieDomain, PageToolsConfig } from '../types';

// 浏览器管理器接口
export interface IBrowserManager {
  launch(): Promise<void>;
  newContext(config?: ContextConfig): Promise<BrowserContext>;
  newPage(contextId?: string): Promise<Page>;
  getCDPSession(page: Page): Promise<CDPSession>;
  getAccessibilityTree(page: Page): Promise<AccessibilityNode>;
  close(): Promise<void>;
  isLaunched(): boolean;
}

// 页面观察器接口
export interface IPageObserver {
  observe(page: Page, options?: ObserveOptions): Promise<ObserveResult>;
  analyzePage(page: Page): Promise<PageAnalysis>;
  getAccessibilityTree(page: Page): Promise<string>;
  clearCache(): void;
}

// Cookie 管理器接口
export interface ICookieManager {
  saveCookies(domain: string, cookies: Cookie[]): Promise<void>;
  loadCookies(domain: string): Promise<Cookie[]>;
  autoSaveOnNavigation(page: Page): Promise<void>;
  exportCookies(): Promise<CookieExport[]>;
  importCookies(cookies: CookieExport[]): Promise<void>;
  clearDomain(domain: string): Promise<void>;
  clearAll(): Promise<void>;
}

// 页面工具注入接口
export interface IPageToolsInjector {
  injectTools(page: Page, config: PageToolsConfig): Promise<void>;
  removeTools(page: Page): Promise<void>;
  isToolsInjected(page: Page): Promise<boolean>;
  executeTool(page: Page, toolName: string, params: any): Promise<any>;
}

// 配置接口
export interface ContextConfig {
  viewport?: { width: number; height: number };
  userAgent?: string;
  locale?: string;
  timezone?: string;
  permissions?: string[];
  geolocation?: { latitude: number; longitude: number; accuracy?: number };
}

export interface OperationConfig {
  enableSmartRecovery: boolean;
  maxRetries: number;
  timeout: number;
  retryDelay?: number;
}

export interface ObservationConfig {
  enableAI: boolean;
  confidenceThreshold: number;
  cacheResults: boolean;
  maxCacheSize?: number;
  cacheTTL?: number;
}

export interface CookieConfig {
  autoSave: boolean;
  storagePath: string;
  encryptionKey?: string;
  autoCleanup: boolean;
  cleanupInterval?: number;
}

export interface WebSocketConfig {
  enabled: boolean;
  port: number;
  cors: boolean;
  maxConnections?: number;
  heartbeatInterval?: number;
}

// 类型别名
export type BrowserContext = any;
export type Page = any;
export type CDPSession = any;
export type Cookie = any;
export type CookieExport = any;
export type AccessibilityNode = any;
export type WebSocket = any;
export type IncomingMessage = any;