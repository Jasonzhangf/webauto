import { z } from 'zod';

// 基础浏览器操作类型
export interface BrowserConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  locale?: string[];
  userAgent?: string;
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
}

// 页面元素观察结果
export interface ObservedElement {
  selector: string;
  description: string;
  method: string;
  arguments: string[];
  elementId: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

// 观察选项
export interface ObserveOptions {
  instruction?: string;
  selector?: string;
  includeMetadata?: boolean;
  confidenceThreshold?: number;
  returnAction?: boolean;
  onlyVisible?: boolean;
  drawOverlay?: boolean;
}

// 观察结果
export interface ObserveResult {
  elements: ObservedElement[];
  timestamp: string;
  url: string;
  metadata?: {
    title?: string;
    description?: string;
    accessibilityScore?: number;
  };
}

// 页面操作抽象
export interface PageOperation {
  id: string;
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
    defaultValue?: unknown;
  }>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

// 智能操作建议
export interface OperationSuggestion {
  operation: PageOperation;
  confidence: number;
  reasoning: string;
  parameters: Record<string, unknown>;
}

// 页面分析结果
export interface PageAnalysis {
  url: string;
  title: string;
  type: 'article' | 'product' | 'form' | 'navigation' | 'search' | 'unknown';
  mainContent?: {
    selector: string;
    description: string;
  };
  keyElements: ObservedElement[];
  suggestedOperations: OperationSuggestion[];
  metadata: {
    loadTime: number;
    elementCount: number;
    interactiveElements: number;
    accessibilityScore?: number;
  };
}

// Cookie管理类型
export interface CookieDomain {
  domain: string;
  cookies: Array<{
    name: string;
    value: string;
    expires?: number;
    secure: boolean;
    httpOnly: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  lastAccessed: string;
}

// WebSocket消息类型
export interface WebSocketMessage {
  type: 'command' | 'event' | 'response' | 'error';
  id: string;
  payload: unknown;
  timestamp: string;
}

// 页面注入工具
export interface InjectedTool {
  name: string;
  script: string;
  description: string;
  enabled: boolean;
}

// 页面工具配置
export interface PageToolsConfig {
  enableHighlight: boolean;
  enableWebSocket: boolean;
  enableCookieManager: boolean;
  customTools?: InjectedTool[];
}

// Schema验证
export const ObservedElementSchema = z.object({
  selector: z.string(),
  description: z.string(),
  method: z.string(),
  arguments: z.array(z.string()),
  elementId: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ObserveOptionsSchema = z.object({
  instruction: z.string().optional(),
  selector: z.string().optional(),
  includeMetadata: z.boolean().default(false),
  confidenceThreshold: z.number().min(0).max(1).default(0.7),
  returnAction: z.boolean().default(false),
  onlyVisible: z.boolean().optional(),
  drawOverlay: z.boolean().default(false),
});

export const PageAnalysisSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  type: z.enum(['article', 'product', 'form', 'navigation', 'search', 'unknown']),
  mainContent: z.object({
    selector: z.string(),
    description: z.string(),
  }).optional(),
  keyElements: z.array(ObservedElementSchema),
  suggestedOperations: z.array(z.object({
    operation: z.any(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    parameters: z.record(z.unknown()),
  })),
  metadata: z.object({
    loadTime: z.number(),
    elementCount: z.number(),
    interactiveElements: z.number(),
    accessibilityScore: z.number().min(0).max(1).optional(),
  }),
});

// Types are already exported as interfaces above