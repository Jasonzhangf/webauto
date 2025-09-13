/**
 * 简化的浏览器助手基类
 * 提供基础的生命周期管理和简单的日志功能
 */

export abstract class BaseBrowserModule {
  protected isInitialized = false;
  protected moduleName: string;

  constructor(moduleName: string) {
    this.moduleName = moduleName;
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
      this.logInfo(`Initializing ${this.moduleName}...`);
      
      // 调用子类的初始化逻辑
      await this.onInitialize();
      
      this.isInitialized = true;
      this.logInfo(`${this.moduleName} initialized successfully`);
      
    } catch (error) {
      this.error(`Failed to initialize ${this.moduleName}:`, error);
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
      this.logInfo(`Cleaning up ${this.moduleName}...`);
      
      // 调用子类的清理逻辑
      await this.onCleanup();
      
      this.isInitialized = false;
      this.logInfo(`${this.moduleName} cleaned up successfully`);
      
    } catch (error) {
      this.error(`Failed to cleanup ${this.moduleName}:`, error);
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
      moduleName: this.moduleName
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
   * 健康检查
   */
  protected abstract checkHealth(): boolean;

  /**
   * 简单的日志方法
   */
  protected logInfo(message: string, data?: any): void {
    console.log(`[${this.moduleName}] INFO: ${message}`, data || '');
  }

  protected warn(message: string, data?: any): void {
    console.warn(`[${this.moduleName}] WARN: ${message}`, data || '');
  }

  protected error(message: string, error?: any): void {
    console.error(`[${this.moduleName}] ERROR: ${message}`, error || '');
  }

  protected debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[${this.moduleName}] DEBUG: ${message}`, data || '');
    }
  }
}