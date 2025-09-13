import { RCCErrorHandler, RCCError, ErrorSeverity, ErrorCategory } from '@webauto/rcc-core';

/**
 * 浏览器助手专用错误处理器
 * 继承自 RCC 错误处理，提供专门的浏览器自动化错误处理
 */
export class BrowserAssistantErrorHandler extends RCCErrorHandler {
  private errorRecoveryStrategies = new Map<string, ErrorRecoveryStrategy[]>();
  private errorMetrics = new Map<string, ErrorMetric[]>();

  constructor() {
    super();
    this.initializeErrorStrategies();
    this.setupErrorListeners();
  }

  /**
   * 处理浏览器自动化错误
   */
  async handleBrowserError(error: Error, context: ErrorContext): Promise<ErrorHandlerResult> {
    const browserError = this.classifyBrowserError(error);
    
    // 记录错误指标
    this.recordErrorMetric(browserError, context);

    // 尝试恢复
    const recoveryResult = await this.attemptRecovery(browserError, context);

    if (recoveryResult.success) {
      return {
        handled: true,
        action: 'recovered',
        recoveryMethod: recoveryResult.method,
        details: recoveryResult.details
      };
    }

    // 如果无法恢复，使用标准错误处理
    return super.handleError(error, {
      ...context,
      category: this.mapToRCCCategory(browserError.category),
      severity: this.mapToRCCSeverity(browserError.severity)
    });
  }

  /**
   * 分类浏览器错误
   */
  private classifyBrowserError(error: Error): BrowserError {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.constructor.name.toLowerCase();

    // 浏览器连接错误
    if (errorMessage.includes('browser') && errorMessage.includes('connect')) {
      return {
        type: 'BROWSER_CONNECTION',
        category: ErrorCategory.CONNECTION,
        severity: ErrorSeverity.HIGH,
        original: error,
        recoverable: true
      };
    }

    // 页面导航错误
    if (errorMessage.includes('navigation') || errorMessage.includes('timeout')) {
      return {
        type: 'NAVIGATION_TIMEOUT',
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        original: error,
        recoverable: true
      };
    }

    // 元素查找错误
    if (errorMessage.includes('element') && errorMessage.includes('not found')) {
      return {
        type: 'ELEMENT_NOT_FOUND',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        original: error,
        recoverable: true
      };
    }

    // 元素交互错误
    if (errorMessage.includes('click') || errorMessage.includes('interact')) {
      return {
        type: 'ELEMENT_INTERACTION',
        category: ErrorCategory.EXECUTION,
        severity: ErrorSeverity.MEDIUM,
        original: error,
        recoverable: true
      };
    }

    // 网络错误
    if (errorMessage.includes('network') || errorMessage.includes('enetunreach')) {
      return {
        type: 'NETWORK_ERROR',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        original: error,
        recoverable: false
      };
    }

    // 资源加载错误
    if (errorMessage.includes('load') || errorMessage.includes('resource')) {
      return {
        type: 'RESOURCE_LOADING',
        category: ErrorCategory.RESOURCE,
        severity: ErrorSeverity.LOW,
        original: error,
        recoverable: true
      };
    }

    // 权限错误
    if (errorMessage.includes('permission') || errorMessage.includes('access denied')) {
      return {
        type: 'PERMISSION_ERROR',
        category: ErrorCategory.SECURITY,
        severity: ErrorSeverity.HIGH,
        original: error,
        recoverable: false
      };
    }

    // 默认分类
    return {
      type: 'UNKNOWN_BROWSER_ERROR',
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      original: error,
      recoverable: false
    };
  }

  /**
   * 初始化错误恢复策略
   */
  private initializeErrorStrategies(): void {
    // 浏览器连接错误恢复策略
    this.registerRecoveryStrategy('BROWSER_CONNECTION', [
      {
        name: 'retry_connection',
        priority: 1,
        canHandle: (error, context) => context.retryCount < 3,
        execute: async (error, context) => {
          const delay = Math.pow(2, context.retryCount) * 1000; // 指数退避
          await this.sleep(delay);
          return { success: true, method: 'retry_connection', details: { delay } };
        }
      },
      {
        name: 'restart_browser',
        priority: 2,
        canHandle: (error, context) => context.retryCount >= 3,
        execute: async (error, context) => {
          if (context.browserManager) {
            await context.browserManager.restart();
            return { success: true, method: 'restart_browser', details: {} };
          }
          return { success: false, method: 'restart_browser', details: { reason: 'no_browser_manager' } };
        }
      }
    ]);

    // 元素查找错误恢复策略
    this.registerRecoveryStrategy('ELEMENT_NOT_FOUND', [
      {
        name: 'wait_and_retry',
        priority: 1,
        canHandle: (error, context) => true,
        execute: async (error, context) => {
          await this.sleep(2000);
          return { success: true, method: 'wait_and_retry', details: { waitTime: 2000 } };
        }
      },
      {
        name: 'alternative_selector',
        priority: 2,
        canHandle: (error, context) => context.selector && context.alternativeSelectors?.length > 0,
        execute: async (error, context) => {
          // 尝试使用替代选择器
          return { success: true, method: 'alternative_selector', details: {} };
        }
      },
      {
        name: 'scroll_to_element',
        priority: 3,
        canHandle: (error, context) => context.page && context.selector,
        execute: async (error, context) => {
          try {
            await context.page.evaluate((sel) => {
              const element = document.querySelector(sel);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, context.selector);
            await this.sleep(1000);
            return { success: true, method: 'scroll_to_element', details: {} };
          } catch {
            return { success: false, method: 'scroll_to_element', details: { reason: 'scroll_failed' } };
          }
        }
      }
    ]);

    // 导航超时错误恢复策略
    this.registerRecoveryStrategy('NAVIGATION_TIMEOUT', [
      {
        name: 'extend_timeout',
        priority: 1,
        canHandle: (error, context) => context.timeout !== undefined,
        execute: async (error, context) => {
          const newTimeout = (context.timeout || 30000) * 1.5;
          return { success: true, method: 'extend_timeout', details: { newTimeout } };
        }
      },
      {
        name: 'reload_page',
        priority: 2,
        canHandle: (error, context) => context.page,
        execute: async (error, context) => {
          await context.page.reload({ waitUntil: 'domcontentloaded' });
          return { success: true, method: 'reload_page', details: {} };
        }
      }
    ]);
  }

  /**
   * 注册错误恢复策略
   */
  private registerRecoveryStrategy(errorType: string, strategies: ErrorRecoveryStrategy[]): void {
    this.errorRecoveryStrategies.set(errorType, strategies);
  }

  /**
   * 尝试错误恢复
   */
  private async attemptRecovery(error: BrowserError, context: ErrorContext): Promise<RecoveryResult> {
    const strategies = this.errorRecoveryStrategies.get(error.type) || [];
    
    for (const strategy of strategies.sort((a, b) => a.priority - b.priority)) {
      if (strategy.canHandle(error.original, context)) {
        try {
          const result = await strategy.execute(error.original, context);
          if (result.success) {
            return result;
          }
        } catch (recoveryError) {
          this.logger.warn(`Recovery strategy ${strategy.name} failed:`, recoveryError);
        }
      }
    }

    return { success: false, method: 'none', details: { reason: 'no_suitable_strategy' } };
  }

  /**
   * 记录错误指标
   */
  private recordErrorMetric(error: BrowserError, context: ErrorContext): void {
    const metric: ErrorMetric = {
      timestamp: new Date(),
      errorType: error.type,
      severity: error.severity,
      context: {
        url: context.url,
        operation: context.operation,
        selector: context.selector
      },
      recoveryAttempted: true,
      recoverySuccessful: false
    };

    if (!this.errorMetrics.has(error.type)) {
      this.errorMetrics.set(error.type, []);
    }

    const metrics = this.errorMetrics.get(error.type)!;
    metrics.push(metric);

    // 保持最近1000条记录
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }
  }

  /**
   * 获取错误统计
   */
  getErrorStatistics(): ErrorStatistics {
    const stats: ErrorStatistics = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsBySeverity: new Map(),
      recoveryRate: 0,
      averageRecoveryTime: 0,
      topErrors: []
    };

    for (const [errorType, metrics] of this.errorMetrics) {
      const errorCount = metrics.length;
      const recoveredCount = metrics.filter(m => m.recoverySuccessful).length;
      
      stats.totalErrors += errorCount;
      stats.errorsByType.set(errorType, errorCount);
      
      for (const metric of metrics) {
        const severityCount = stats.errorsBySeverity.get(metric.severity) || 0;
        stats.errorsBySeverity.set(metric.severity, severityCount + 1);
      }

      stats.topErrors.push({
        type: errorType,
        count: errorCount,
        recoveryRate: recoveredCount / errorCount
      });
    }

    // 计算整体恢复率
    const totalRecovered = Array.from(this.errorMetrics.values())
      .flat()
      .filter(m => m.recoverySuccessful).length;
    
    stats.recoveryRate = stats.totalErrors > 0 ? totalRecovered / stats.totalErrors : 0;

    // 排序顶级错误
    stats.topErrors.sort((a, b) => b.count - a.count);
    stats.topErrors = stats.topErrors.slice(0, 10);

    return stats;
  }

  /**
   * 设置错误监听器
   */
  private setupErrorListeners(): void {
    process.on('uncaughtException', (error) => {
      this.handleBrowserError(error, {
        url: 'unknown',
        operation: 'uncaught_exception',
        retryCount: 0
      }).catch(err => {
        console.error('Failed to handle uncaught exception:', err);
      });
    });

    process.on('unhandledRejection', (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.handleBrowserError(error, {
        url: 'unknown',
        operation: 'unhandled_rejection',
        retryCount: 0
      }).catch(err => {
        console.error('Failed to handle unhandled rejection:', err);
      });
    });
  }

  /**
   * 映射到 RCC 错误类别
   */
  private mapToRCCCategory(category: ErrorCategory): ErrorCategory {
    return category; // 目前直接使用相同的分类
  }

  /**
   * 映射到 RCC 错误严重性
   */
  private mapToRCCSeverity(severity: ErrorSeverity): ErrorSeverity {
    return severity; // 目前直接使用相同的严重性级别
  }

  /**
   * 辅助方法：休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 类型定义
export interface BrowserError {
  type: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  original: Error;
  recoverable: boolean;
}

export interface ErrorContext {
  url: string;
  operation: string;
  selector?: string;
  retryCount: number;
  timeout?: number;
  page?: any;
  browserManager?: any;
  alternativeSelectors?: string[];
}

export interface ErrorHandlerResult {
  handled: boolean;
  action: string;
  recoveryMethod?: string;
  details?: any;
}

export interface ErrorRecoveryStrategy {
  name: string;
  priority: number;
  canHandle: (error: Error, context: ErrorContext) => boolean;
  execute: (error: Error, context: ErrorContext) => Promise<RecoveryResult>;
}

export interface RecoveryResult {
  success: boolean;
  method: string;
  details: any;
}

export interface ErrorMetric {
  timestamp: Date;
  errorType: string;
  severity: ErrorSeverity;
  context: {
    url: string;
    operation: string;
    selector?: string;
  };
  recoveryAttempted: boolean;
  recoverySuccessful: boolean;
}

export interface ErrorStatistics {
  totalErrors: number;
  errorsByType: Map<string, number>;
  errorsBySeverity: Map<ErrorSeverity, number>;
  recoveryRate: number;
  averageRecoveryTime: number;
  topErrors: Array<{
    type: string;
    count: number;
    recoveryRate: number;
  }>;
}