/**
 * Log Entries Interface
 * 日志条目接口
 */

// Import PipelineIOEntry from IRequestContext
import { PipelineIOEntry } from './IRequestContext';

/**
 * Pipeline Request Log Entry
 * 流水线请求日志条目
 */
export interface PipelineRequestLogEntry {
  // Context
  requestId: string;
  pipelineId: string;
  timestamp: number;
  provider: string;
  operation: string;

  // Request data
  request: {
    headers?: Record<string, string>;
    body: any;
    metadata?: Record<string, any>;
  };

  // Response data
  response: {
    status: number;
    headers?: Record<string, string>;
    body: any;
    metadata?: Record<string, any>;
  };

  // Performance
  duration: number;
  success: boolean;
  error?: string;

  // Pipeline information
  stages: any[];
}

/**
 * Pipeline Error Log Entry
 * 流水线错误日志条目
 */
export interface PipelineErrorLogEntry {
  requestId: string;
  pipelineId: string;
  timestamp: number;
  provider: string;
  operation: string;

  // Error details
  error: {
    message: string;
    stack?: string;
    code?: string;
    type: string;
  };

  // Context
  request: {
    headers?: Record<string, string>;
    body: any;
    metadata?: Record<string, any>;
  };

  // Pipeline stage where error occurred
  failedStage?: string;
  stages: any[];

  // Additional debug info
  debugInfo?: Record<string, any>;
}

/**
 * Pipeline System Log Entry
 * 流水线系统日志条目
 */
export interface PipelineSystemLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  requestId?: string;
  provider?: string;
  operation?: string;
  metadata?: Record<string, any>;
}

/**
 * Pipeline Performance Metrics
 * 流水线性能指标
 */
export interface PipelinePerformanceMetrics {
  requestId: string;
  pipelineId: string;
  provider: string;
  operation: string;

  // Timing
  totalDuration: number;
  validationDuration?: number;
  mappingDuration?: number;
  executionDuration?: number;
  responseDuration?: number;

  // Success/failure
  success: boolean;
  error?: string;

  // Stage performance
  stagePerformance: {
    [stage: string]: {
      duration: number;
      success: boolean;
      error?: string;
    };
  };
}

/**
 * Pipeline Log Entry Types Union
 * 流水线日志条目类型联合
 */
export type PipelineLogEntry = PipelineRequestLogEntry | PipelineErrorLogEntry | PipelineSystemLogEntry | PipelinePerformanceMetrics;

/**
 * Log Entry Manager Interface
 * 日志条目管理器接口
 */
export interface ILogEntryManager {
  // Log entry creation
  createRequestLogEntry(entry: Omit<PipelineRequestLogEntry, 'timestamp'>): void;
  createErrorLogEntry(entry: Omit<PipelineErrorLogEntry, 'timestamp'>): void;
  createSystemLogEntry(entry: Omit<PipelineSystemLogEntry, 'timestamp'>): void;
  createPerformanceMetricsEntry(entry: Omit<PipelinePerformanceMetrics, 'timestamp'>): void;

  // Log entry retrieval
  getRequestLogEntries(requestId?: string): PipelineRequestLogEntry[];
  getErrorLogEntries(requestId?: string): PipelineErrorLogEntry[];
  getSystemLogEntries(level?: string): PipelineSystemLogEntry[];
  getPerformanceMetrics(requestId?: string): PipelinePerformanceMetrics[];

  // I/O tracking integration
  createPipelineIOEntry(entry: Omit<PipelineIOEntry, 'timestamp'>): void;
  getPipelineIOEntries(pipelineId?: string): PipelineIOEntry[];

  // Cleanup
  clearEntries(): void;
  clearEntriesByRequestId(requestId: string): void;
}