import { IBaseOperation, OperationContext, OperationResult } from '../core/BaseOperationSimple';

export interface BrowserOperationContext extends OperationContext {
  page: any;
  browser: any;
  cookies: Map<string, any>;
  selectors: Map<string, string[]>;
  metadata?: any;
}

export interface IBrowserOperation extends IBaseOperation {
  execute(context: BrowserOperationContext, params?: any): Promise<OperationResult>;
  supportedSelectors?: string[];
  requiredCookies?: string[];
}

export interface BrowserOperationConfig {
  browser: {
    type: 'camoufox' | 'playwright';
    headless: boolean;
    userAgent?: string;
    viewport: { width: number; height: number };
  };
  cookies: {
    storagePath: string;
    autoSave: boolean;
    domains: string[];
  };
  operations: {
    timeout: number;
    retryAttempts: number;
    parallelLimit: number;
  };
  containers: {
    enabled: boolean;
    configPath?: string;
  };
}

export interface CookieParams {
  action: 'load' | 'save' | 'clear';
  domain?: string;
  cookieData?: any[];
}

export interface ExtractionParams {
  containerSelector: string;
  containerType: string;
  maxResults?: number;
  includeMetadata?: boolean;
}

export interface ContainerParams {
  containerId: string;
  operationName: string;
  operationParams: any;
}