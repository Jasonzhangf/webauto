import { UniversalOperator } from './UniversalOperator';

/**
 * 基础原子操作类
 * 所有原子操作都继承自此基类
 */
export abstract class BaseAtomicOperation extends UniversalOperator {
  protected config: any;
  protected stats: any;

  constructor(config: any = {}) {
    super({
      name: config.name || 'BaseAtomicOperation',
      type: 'atomic-operation',
      description: config.description || 'Base atomic operation',
      timeout: config.timeout || 30000,
      retryCount: config.retryCount || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    });

    this.config = config;
    this.stats = {
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0,
      lastExecutionTime: 0
    };
  }

  /**
   * 抽象方法：子类必须实现具体的执行逻辑
   */
  abstract execute(context: any, params?: any): Promise<any>;

  /**
   * 初始化操作
   */
  abstract initialize(): Promise<void>;

  /**
   * 执行前验证
   */
  async validate(context: any, params?: any): Promise<boolean> {
    return true;
  }

  /**
   * 执行后清理
   */
  abstract cleanup(context?: any, params?: any): Promise<void>;

  /**
   * 记录执行统计
   */
  protected recordStats(success: boolean, executionTime: number): void {
    this.stats.executionCount++;
    this.stats.lastExecutionTime = executionTime;

    if (success) {
      this.stats.successCount++;
    } else {
      this.stats.failureCount++;
    }

    // 计算平均执行时间
    this.stats.averageExecutionTime =
      (this.stats.averageExecutionTime * (this.stats.executionCount - 1) + executionTime) /
      this.stats.executionCount;
  }

  /**
   * 获取操作统计信息
   */
  getStats(): any {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0,
      lastExecutionTime: 0
    };
  }
}