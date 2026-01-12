/**
 * Workflow Block: MonitoringBlock
 *
 * 职责：
 * - 采集任务运行时指标
 * - 提供可观测性数据（成功率、错误率、性能指标）
 * - 支持告警阈值设置
 * - 生成运行时报告
 */

export interface MonitoringInput {
  sessionId: string;
  metric: 'success_rate' | 'error_rate' | 'performance' | 'summary';
  windowSize?: number; // 最近 N 条记录
  alertThresholds?: {
    errorRate?: number; // 0-1
    avgDuration?: number; // ms
    failureCount?: number;
  };
}

export interface MonitoringOutput {
  success: boolean;
  metric: string;
  value: number;
  details?: any;
  alert?: {
    triggered: boolean;
    type: string;
    message: string;
    currentValue: number;
    threshold: number;
  };
}

/**
 * 内存中的运行时指标存储
 */
class MetricsStore {
  private static instance: MetricsStore;
  private metrics: Map<string, any[]> = new Map();
  private maxSize = 1000;

  static getInstance(): MetricsStore {
    if (!this.instance) {
      this.instance = new MetricsStore();
    }
    return this.instance;
  }

  record(sessionId: string, metric: any) {
    if (!this.metrics.has(sessionId)) {
      this.metrics.set(sessionId, []);
    }
    const sessionMetrics = this.metrics.get(sessionId)!;
    sessionMetrics.push({
      ...metric,
      timestamp: Date.now()
    });

    // 保持最大记录数
    if (sessionMetrics.length > this.maxSize) {
      sessionMetrics.shift();
    }
  }

  getMetrics(sessionId: string, windowSize: number = 100): any[] {
    const metrics = this.metrics.get(sessionId) || [];
    return metrics.slice(-windowSize);
  }

  clear(sessionId: string) {
    this.metrics.delete(sessionId);
  }
}

export async function execute(input: MonitoringInput): Promise<MonitoringOutput> {
  const { sessionId, metric, windowSize = 100, alertThresholds = {} } = input;
  
  const store = MetricsStore.getInstance();
  const metrics = store.getMetrics(sessionId, windowSize);

  if (metrics.length === 0) {
    return {
      success: true,
      metric,
      value: 0,
      details: { message: '暂无指标数据' }
    };
  }

  let value = 0;
  let details: any = {};
  let alert: MonitoringOutput['alert'] = undefined;

  switch (metric) {
    case 'success_rate': {
      const successes = metrics.filter(m => m.success).length;
      value = metrics.length > 0 ? successes / metrics.length : 0;
      details = {
        total: metrics.length,
        successes,
        failures: metrics.length - successes
      };
      
      if (alertThresholds.errorRate && value < (1 - alertThresholds.errorRate)) {
        alert = {
          triggered: true,
          type: 'error_rate',
          message: `成功率过低: ${(value * 100).toFixed(1)}%`,
          currentValue: value,
          threshold: 1 - alertThresholds.errorRate
        };
      }
      break;
    }

    case 'error_rate': {
      const errors = metrics.filter(m => !m.success).length;
      value = metrics.length > 0 ? errors / metrics.length : 0;
      details = {
        total: metrics.length,
        errors,
        successRate: 1 - value
      };
      
      if (alertThresholds.errorRate && value > alertThresholds.errorRate) {
        alert = {
          triggered: true,
          type: 'error_rate',
          message: `错误率过高: ${(value * 100).toFixed(1)}%`,
          currentValue: value,
          threshold: alertThresholds.errorRate
        };
      }
      break;
    }

    case 'performance': {
      const durations = metrics
        .filter(m => m.duration)
        .map(m => m.duration);
      
      if (durations.length > 0) {
        value = durations.reduce((sum, d) => sum + d, 0) / durations.length;
        details = {
          avgDuration: value,
          minDuration: Math.min(...durations),
          maxDuration: Math.max(...durations),
          sampleCount: durations.length
        };
        
        if (alertThresholds.avgDuration && value > alertThresholds.avgDuration) {
          alert = {
            triggered: true,
            type: 'performance',
            message: `平均耗时过高: ${value.toFixed(0)}ms`,
            currentValue: value,
            threshold: alertThresholds.avgDuration
          };
        }
      }
      break;
    }

    case 'summary': {
      const errors = metrics.filter(m => !m.success).length;
      const avgDuration = metrics
        .filter(m => m.duration)
        .reduce((sum, d) => sum + d.duration, 0) / metrics.length || 0;
      
      value = metrics.length; // 总记录数
      details = {
        totalRecords: value,
        errorCount: errors,
        errorRate: errors / value,
        avgDuration: avgDuration,
        timeRange: {
          start: metrics[0]?.timestamp,
          end: metrics[metrics.length - 1]?.timestamp
        }
      };
      break;
    }

    default:
      return {
        success: false,
        metric,
        value: 0,
        details: `未知的指标类型: ${metric}`
      };
  }

  return {
    success: true,
    metric,
    value,
    details,
    alert
  };
}

/**
 * 记录指标（供其他 Block 调用）
 */
export function recordMetric(sessionId: string, metric: any) {
  MetricsStore.getInstance().record(sessionId, metric);
}

/**
 * 清理指标（任务完成后）
 */
export function clearMetrics(sessionId: string) {
  MetricsStore.getInstance().clear(sessionId);
}

/**
 * 便捷函数：记录成功指标
 */
export function recordSuccess(sessionId: string, duration?: number) {
  recordMetric(sessionId, {
    type: 'operation',
    success: true,
    duration: duration || 0
  });
}

/**
 * 便捷函数：记录失败指标
 */
export function recordFailure(sessionId: string, error: string, duration?: number) {
  recordMetric(sessionId, {
    type: 'operation',
    success: false,
    error,
    duration: duration || 0
  });
}
