// RCC BaseModule 模拟实现
// 当正式的 rcc-basemodule 模块可用时，可以替换为正式模块

export interface ModuleInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  type: string;
}

export interface DebugConfig {
  baseDirectory?: string;
  level?: string;
  phase?: string;
  port?: number;
}

export enum DebugLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4
}

export class BaseModule {
  protected moduleInfo: ModuleInfo;
  protected debugConfig: DebugConfig;

  constructor(moduleInfo: ModuleInfo) {
    this.moduleInfo = moduleInfo;
    this.debugConfig = {
      level: 'INFO',
      baseDirectory: './logs'
    };
  }

  public async initialize(): Promise<void> {
    this.logInfo(`Module ${this.moduleInfo.name} initialized`);
  }

  public logInfo(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  public debug(level: string, message: string, data?: any): void {
    this.log(level, message, data);
  }

  public warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  public error(message: string, data?: any): void {
    this.log('ERROR', message, data);
  }

  public trace(message: string, data?: any): void {
    this.log('TRACE', message, data);
  }

  public logDebug(message: string, data?: any): void {
    this.log('DEBUG', message, data);
  }

  private log(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      module: this.moduleInfo.name,
      message,
      data
    };
    
    console.log(`[${timestamp}] [${level}] [${this.moduleInfo.name}]: ${message}`, data || '');
  }

  public getModuleInfo(): ModuleInfo {
    return this.moduleInfo;
  }

  public setDebugConfig(config: DebugConfig): void {
    this.debugConfig = { ...this.debugConfig, ...config };
  }

  public async shutdown(): Promise<void> {
    this.logInfo(`Module ${this.moduleInfo.name} shutdown`);
  }
}