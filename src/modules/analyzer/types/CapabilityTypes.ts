/**
 * 能力评估相关类型定义
 */

// 能力评估结果
export interface CapabilityEvaluation {
  containerId: string;
  capabilities: ContainerCapability[];
  operations: ContainerOperation[];
  contentTypes: ContentType[];
  interactions: InteractionType[];
  performance: PerformanceMetrics;
  security: SecurityAssessment;
  confidence: number;
  metadata: CapabilityMetadata;
}

// 容器能力
export interface ContainerCapability {
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  operations: string[];
}

// 容器操作
export interface ContainerOperation {
  name: string;
  type: OperationType;
  selector?: string;
  parameters: OperationParameter[];
  description: string;
  requiresAuth: boolean;
  successRate: number;
  averageTime: number;
}

// 操作类型
export type OperationType = 
  | 'click'
  | 'scroll'
  | 'input'
  | 'hover'
  | 'select'
  | 'extract'
  | 'navigate'
  | 'submit'
  | 'drag'
  | 'zoom'
  | 'swipe';

// 操作参数
export interface OperationParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  defaultValue?: any;
  description: string;
  validation?: ValidationRule[];
}

// 验证规则
export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
  value?: any;
  message?: string;
}

// 内容类型
export interface ContentType {
  type: 'text' | 'image' | 'video' | 'audio' | 'link' | 'form' | 'table' | 'list' | 'mixed';
  count: number;
  quality?: number;
  metadata?: Record<string, any>;
}

// 交互类型
export interface InteractionType {
  type: 'clickable' | 'scrollable' | 'editable' | 'selectable' | 'draggable' | 'resizable';
  count: number;
  selectors: string[];
  examples: string[];
}

// 性能指标
export interface PerformanceMetrics {
  loadTime: number;
  renderTime: number;
  responseTime: number;
  memoryUsage: number;
  cpuUsage: number;
  networkRequests: number;
  animationFrames: number;
  reflowCount: number;
}

// 安全评估
export interface SecurityAssessment {
  hasSensitiveData: boolean;
  requiresAuth: boolean;
  hasCSRFProtection: boolean;
  hasXSSProtection: boolean;
  trustLevel: 'high' | 'medium' | 'low' | 'unknown';
  riskFactors: string[];
  recommendations: string[];
}

// 能力元数据
export interface CapabilityMetadata {
  evaluatedAt: number;
  evaluationMethod: string;
  confidenceFactors: string[];
  limitations: string[];
  version: string;
  environment: string;
}

// 能力评估配置
export interface CapabilityEvaluationConfig {
  enablePerformanceAnalysis: boolean;
  enableSecurityAssessment: boolean;
  enableContentAnalysis: boolean;
  enableInteractionDetection: boolean;
  maxEvaluationTime: number;
  confidenceThreshold: number;
  cacheResults: boolean;
  cacheTimeout: number;
}

// 能力评估结果
export interface CapabilityEvaluationResult {
  evaluations: CapabilityEvaluation[];
  totalContainers: number;
  successfulEvaluations: number;
  failedEvaluations: number;
  averageConfidence: number;
  evaluationTime: number;
  stats: CapabilityEvaluationStats;
}

// 能力评估统计
export interface CapabilityEvaluationStats {
  capabilitiesByType: Record<string, number>;
  operationsByType: Record<string, number>;
  contentTypesByType: Record<string, number>;
  interactionsByType: Record<string, number>;
  securityLevels: Record<string, number>;
  performanceMetrics: {
    averageLoadTime: number;
    averageResponseTime: number;
    averageMemoryUsage: number;
  };
}
