// Core interfaces for the atomic operations system

// 执行上下文接口
export interface IExecutionContext {
  page: any; // Playwright Page object
  url: string;
  timestamp: Date;
  [key: string]: any;
}

// 执行结果接口
export interface IExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  operationId?: string;
  executionTime?: number;
  timestamp?: Date;
}

// 容器能力接口
export interface IContainerCapability {
  name: string;
  description: string;
  version: string;
  supportedOperations: string[];
}

// 系统状态中心接口
export interface IEntityRegistration {
  id: string;
  type: string;
  name: string;
  metadata?: any;
  timestamp: Date;
}

export interface IEntityState {
  id: string;
  state: any;
  lastUpdate: Date;
  version: number;
}

export interface IChangeSet {
  id: string;
  type: string;
  changes: any;
  timestamp: Date;
}

// 日志级别
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// 日志接口
export interface ILogger {
  log(level: LogLevel, message: string, ...args: any[]): void;
  logInfo(message: string, ...args: any[]): void;
  logWarn(message: string, ...args: any[]): void;
  logError(message: string, ...args: any[]): void;
  logDebug(message: string, ...args: any[]): void;
}