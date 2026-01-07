/**
 * ErrorClassifier - 错误分类与重试策略
 *
 * 用于区分：
 * - 临时性错误（可重试）
 * - 永久性错误（应跳过）
 * - 系统性错误（必须终止）
 * - 可降级错误（可继续但降级处理）
 */

export type ErrorType = 'TEMPORARY' | 'PERMANENT' | 'SYSTEMIC' | 'DEGRADED';

export interface ErrorClassification {
  type: ErrorType;
  retryable: boolean;
  fatal?: boolean;
  backoffMs?: number;
}

export function classifyError(error: unknown): ErrorClassification {
  const msg = String((error as any)?.message || error || '').toLowerCase();

  // 临时性错误：可重试
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('network')) {
    return { type: 'TEMPORARY', retryable: true, backoffMs: 3000 };
  }

  // 永久性错误：应跳过
  if (msg.includes('not found') || msg.includes('404') || msg.includes('invalid selector')) {
    return { type: 'PERMANENT', retryable: false };
  }

  // 系统性错误：必须终止
  if (msg.includes('session') || msg.includes('unauthorized') || msg.includes('blocked')) {
    return { type: 'SYSTEMIC', retryable: false, fatal: true };
  }

  // 默认可降级
  return { type: 'DEGRADED', retryable: false };
}

/**
 * 重试包装器（指数退避 + 随机抖动）
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const classified = classifyError(err);

      if (!classified.retryable) {
        throw err;
      }

      const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
      console.log(`[Retry] ${classified.type} error, retry ${i + 1}/${maxRetries} in ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
