/**
 * ErrorClassifier - 错误分类与重试策略（P2.2 增强版）
 *
 * 用于区分：
 * - 临时性错误（可重试）：网络抖动、超时
 * - 永久性错误（应跳过）：404、无效选择器
 * - 系统性错误（必须终止）：session 失效、频繁风控
 * - 可降级错误（可继续但降级处理）：评论展开部分失败、图片下载失败
 * 
 * P2.2 改进：
 * - 细化错误分类，区分"跳过当前条目"和"终止整个任务"
 * - 避免临时错误触发重型恢复（如回首页）
 * - 对降级错误提供明确的 fallback 建议
 */

export type ErrorType = 
  | 'TEMPORARY'     // 临时性：可重试，不影响后续条目
  | 'PERMANENT'     // 永久性：跳过当前条目，继续下一条
  | 'SYSTEMIC'      // 系统性：必须终止整个任务
  | 'DEGRADED';     // 可降级：记录警告，继续执行

export type RecoveryAction =
  | 'RETRY'         // 重试当前操作
  | 'SKIP_ITEM'     // 跳过当前条目，继续下一条
  | 'GRACEFUL_DEGRADE'  // 降级处理（如：评论失败但保存详情）
  | 'ABORT_TASK';   // 终止整个任务

export interface ErrorClassification {
  type: ErrorType;
  action: RecoveryAction;
  retryable: boolean;
  fatal?: boolean;
  backoffMs?: number;
  suggestion?: string;  // 给用户的建议
}

/**
 * 细化错误分类
 * 
 * @param error - 错误对象或消息
 * @param context - 错误发生的上下文（如 'search', 'detail', 'comment'）
 * @returns ErrorClassification
 */
export function classifyError(
  error: unknown,
  context?: 'search' | 'detail' | 'comment' | 'login' | 'unknown'
): ErrorClassification {
  const msg = String((error as any)?.message || error || '').toLowerCase();

  // 1. 系统性错误：必须终止整个任务
  if (
    msg.includes('session') ||
    msg.includes('unauthorized') ||
    msg.includes('blocked') ||
    msg.includes('login_status_uncertain') ||
    msg.includes('频繁') ||
    msg.includes('risk control')
  ) {
    return {
      type: 'SYSTEMIC',
      action: 'ABORT_TASK',
      retryable: false,
      fatal: true,
      suggestion: '会话失效或触发风控，建议手动检查浏览器状态并重新登录'
    };
  }

  // 2. 临时性错误：可重试，但不要过度重试
  if (
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed')
  ) {
    return {
      type: 'TEMPORARY',
      action: 'RETRY',
      retryable: true,
      backoffMs: 3000,
      suggestion: '网络抖动或临时超时，已自动重试'
    };
  }

  // 3. 永久性错误：跳过当前条目
  if (
    msg.includes('not found') ||
    msg.includes('404') ||
    msg.includes('error_code=300031') || // 小红书 404 笔记
    msg.includes('invalid selector') ||
    msg.includes('容器未找到') ||
    msg.includes('未获取到容器树')
  ) {
    return {
      type: 'PERMANENT',
      action: 'SKIP_ITEM',
      retryable: false,
      suggestion: '资源不存在或容器定义过时，跳过当前条目'
    };
  }

  // 4. 可降级错误：部分功能失败但可继续
  //    例如：评论展开失败、图片下载失败、锚点验证失败（但 DOM 存在）
  if (
    msg.includes('comment') ||
    msg.includes('image download') ||
    msg.includes('anchor verification failed') ||
    msg.includes('rect') ||
    msg.includes('highlight failed')
  ) {
    // 根据上下文决定降级策略
    if (context === 'comment') {
      return {
        type: 'DEGRADED',
        action: 'GRACEFUL_DEGRADE',
        retryable: false,
        suggestion: '评论采集部分失败，保存已有数据并标记 commentsPartial=true'
      };
    }

    if (context === 'detail') {
      return {
        type: 'DEGRADED',
        action: 'GRACEFUL_DEGRADE',
        retryable: false,
        suggestion: '详情部分字段缺失，保存已提取内容并标记 detailPartial=true'
      };
    }

    // 默认：锚点验证失败等非关键错误
    return {
      type: 'DEGRADED',
      action: 'GRACEFUL_DEGRADE',
      retryable: false,
      suggestion: '非关键功能失败，继续执行后续步骤'
    };
  }

  // 5. 默认未分类错误：跳过当前条目（保守策略）
  return {
    type: 'PERMANENT',
    action: 'SKIP_ITEM',
    retryable: false,
    suggestion: '未知错误，跳过当前条目以避免阻塞后续采集'
  };
}

/**
 * 重试包装器（指数退避 + 随机抖动）
 * 
 * P2.2 改进：
 * - 支持上下文传递，用于细化错误分类
 * - 对非 retryable 错误立即抛出（不浪费重试次数）
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
  context?: 'search' | 'detail' | 'comment' | 'login' | 'unknown'
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const classified = classifyError(err, context);

      // 系统性错误或永久性错误：立即抛出，不重试
      if (classified.action === 'ABORT_TASK' || classified.action === 'SKIP_ITEM') {
        console.warn(
          `[Retry] ${classified.type} error (${classified.action}): ${classified.suggestion}`
        );
        throw err;
      }

      // 可降级错误：立即抛出，由上层决定是否降级
      if (classified.action === 'GRACEFUL_DEGRADE') {
        console.warn(`[Retry] ${classified.type} error: ${classified.suggestion}`);
        throw err;
      }

      // 临时性错误：重试
      if (classified.retryable && i < maxRetries - 1) {
        const delay = (classified.backoffMs || baseDelay) * Math.pow(2, i) + Math.random() * 1000;
        console.log(
          `[Retry] ${classified.type} error, retry ${i + 1}/${maxRetries} in ${Math.round(delay)}ms`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // 重试次数耗尽
        console.warn(`[Retry] Max retries reached for ${classified.type} error`);
        throw err;
      }
    }
  }

  throw lastError;
}

/**
 * 根据错误分类决定下一步动作
 * 
 * @param error - 错误对象
 * @param context - 错误上下文
 * @returns 建议的恢复动作
 */
export function getRecoveryAction(
  error: unknown,
  context?: 'search' | 'detail' | 'comment' | 'login' | 'unknown'
): {
  action: RecoveryAction;
  suggestion: string;
  shouldLog: boolean;
  shouldSavePartial: boolean;
} {
  const classified = classifyError(error, context);

  return {
    action: classified.action,
    suggestion: classified.suggestion || '',
    shouldLog: true,
    shouldSavePartial: classified.action === 'GRACEFUL_DEGRADE'
  };
}
