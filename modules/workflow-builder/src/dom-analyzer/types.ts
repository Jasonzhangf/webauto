/**
 * AI Provider 配置
 */
export interface AIProviderConfig {
  baseUrl: string;
  model?: string;
  apiKey?: string;
}

/**
 * DOM 分析请求
 */
export interface DOMAnalysisRequest {
  html: string;
  targetDescription: string;
  examples?: string[];
  context?: Record<string, unknown>;
}

/**
 * DOM 分析响应
 */
export interface DOMAnalysisResponse {
  success: boolean;
  selector?: string;
  confidence?: number;
  explanation?: string;
  alternatives?: Array<{
    selector: string;
    confidence: number;
    explanation: string;
  }>;
  error?: string;
}

/**
 * 容器字段分析请求
 */
export interface ContainerFieldsRequest {
  html: string;
  containerSelector: string;
  fieldDescriptions: Record<string, string>;
}

/**
 * 容器字段分析响应
 */
export interface ContainerFieldsResponse {
  success: boolean;
  fields?: Record<string, {
    selector: string;
    confidence: number;
    explanation: string;
  }>;
  error?: string;
}

/**
 * 交互式 DOM 构建器配置
 */
export interface InteractiveDOMBuilderConfig {
  provider: AIProviderConfig;
  profile: string;
  url: string;
  interactive?: boolean;
}

/**
 * 构建步骤
 */
export interface BuildStep {
  id: string;
  type: 'selector' | 'fields' | 'validation' | 'save';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  prompt?: string;
  userInput?: string;
  result?: unknown;
  error?: string;
}

/**
 * Visual analysis response from AI vision model
 */
export interface VisualAnalysisResponse {
  success: boolean;
  elements?: Array<{
    description: string;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    confidence: number;
  }>;
  error?: string;
}
