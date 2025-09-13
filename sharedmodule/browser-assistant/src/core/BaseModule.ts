import { BaseModule } from 'rcc-basemodule';
import { BrowserConfig, BrowserAssistantConfig } from '../types';

/**
 * 浏览器助手基类，继承自 RCC 基础模块
 * 提供统一的模块管理、配置、生命周期管理等功能
 */
export abstract class BaseBrowserModule extends BaseModule {
  protected config: BrowserAssistantConfig;
  protected isInitialized = false;

  constructor(moduleName: string, config: Partial<BrowserAssistantConfig> = {}) {
    super({
      id: moduleName,
      name: moduleName,
      version: '0.1.0',
      description: 'Browser Assistant Module',
      type: 'browser-assistant'
    });

    // 合并配置
    this.config = this.mergeConfig(config);
  }

  /**
   * 初始化模块
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.warn('Module already initialized');
      return;
    }

    try {
      this.logInfo('Initializing Browser Assistant Module...');
      
      // 调用子类的初始化逻辑
      await this.onInitialize();
      
      // 注册模块能力
      await this.registerCapabilities();
      
      this.isInitialized = true;
      this.logInfo('Browser Assistant Module initialized successfully');
      
    } catch (error) {
      this.error('Failed to initialize Browser Assistant Module:', error);
      throw error;
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      this.logInfo('Cleaning up Browser Assistant Module...');
      
      // 调用子类的清理逻辑
      await this.onCleanup();
      
      this.isInitialized = false;
      this.logInfo('Browser Assistant Module cleaned up successfully');
      
    } catch (error) {
      this.error('Failed to cleanup Browser Assistant Module:', error);
      throw error;
    }
  }

  /**
   * 获取模块状态
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      healthy: this.isInitialized && this.checkHealth(),
      uptime: Date.now() - this.startTime,
      memoryUsage: process.memoryUsage(),
      lastActivity: new Date(this.lastActivity)
    };
  }

  /**
   * 子类需要实现的初始化逻辑
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * 子类需要实现的清理逻辑
   */
  protected abstract onCleanup(): Promise<void>;

  /**
   * 注册模块能力
   */
  protected abstract registerCapabilities(): Promise<void>;

  /**
   * 健康检查
   */
  protected abstract checkHealth(): boolean;

  /**
   * 合并配置
   */
  private mergeConfig(userConfig: Partial<BrowserAssistantConfig>): BrowserAssistantConfig {
    const defaultConfig: BrowserAssistantConfig = {
      browser: {
        headless: false,
        viewport: { width: 1280, height: 720 },
        locale: ['zh-CN', 'en-US']
      },
      observation: {
        enableAI: false,
        confidenceThreshold: 0.7,
        cacheResults: true
      },
      operations: {
        enableSmartRecovery: true,
        maxRetries: 3,
        timeout: 30000
      },
      cookies: {
        autoSave: false,
        storagePath: './cookies',
        autoCleanup: true
      },
      websocket: {
        enabled: false,
        port: 8080,
        cors: true
      },
      logging: {
        level: 'info',
        enableConsole: true,
        enableFile: false
      }
    };

    return this.deepMerge(defaultConfig, userConfig);
  }

  /**
   * 应用新配置（子类可重写）
   */
  protected async applyNewConfig(newConfig: Partial<BrowserAssistantConfig>): Promise<void> {
    // 默认实现：子类可以根据需要重写此方法
    this.logInfo('Applied new configuration');
  }

  /**
   * 深度合并对象
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] as any, source[key] as any);
      } else {
        result[key] = source[key] as any;
      }
    }
    
    return result;
  }

  /**
   * 获取运行时间
   */
  private getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 获取最后活动时间
   */
  private getLastActivity(): Date {
    return new Date(this.lastActivity);
  }

  // 基础属性
  private startTime = Date.now();
  private lastActivity = Date.now();
}

export interface BrowserAssistantConfig {
  browser: BrowserConfig;
  observation: {
    enableAI: boolean;
    confidenceThreshold: number;
    cacheResults: boolean;
    maxCacheSize?: number;
    cacheTTL?: number;
  };
  operations: {
    enableSmartRecovery: boolean;
    maxRetries: number;
    timeout: number;
    retryDelay?: number;
  };
  cookies: {
    autoSave: boolean;
    storagePath: string;
    encryptionKey?: string;
    autoCleanup: boolean;
    cleanupInterval?: number;
  };
  websocket: {
    enabled: boolean;
    port: number;
    cors: boolean;
    maxConnections?: number;
    heartbeatInterval?: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableConsole: boolean;
    enableFile: boolean;
    filePath?: string;
  };
}