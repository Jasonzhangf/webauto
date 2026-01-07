/**
 * Workflow Block: GracefulFallbackBlock
 *
 * 职责：
 * - 提供优雅降级策略
 * - 主功能失败时自动切换到备选方案
 * - 保持任务继续运行，仅降低功能级别
 * - 适用于非关键功能（图片下载、评论展开等）
 */

export interface GracefulFallbackInput<T = any> {
  primaryFn: () => Promise<T>;
  fallbackFn: () => Promise<T>;
  context?: any;
  errorTypes?: ('TEMPORARY' | 'PERMANENT' | 'DEGRADED')[];
}

export interface GracefulFallbackOutput<T = any> {
  success: boolean;
  result: T;
  usedFallback: boolean;
  error?: string;
}

export async function execute<T>(input: GracefulFallbackInput<T>): Promise<GracefulFallbackOutput<T>> {
  const {
    primaryFn,
    fallbackFn,
    context,
    errorTypes = ['DEGRADED', 'TEMPORARY']
  } = input;

  try {
    const result = await primaryFn(context);
    return {
      success: true,
      result,
      usedFallback: false
    };
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    
    // 检查是否属于可降级错误类型
    const isDegradable = errorTypes.some(type => errorMsg.toLowerCase().includes(type.toLowerCase()));
    
    if (!isDegradable) {
      // 不可降级错误，直接抛出
      throw err;
    }

    console.log(`[GracefulFallback] 主功能失败，启用降级方案: ${errorMsg}`);
    
    try {
      const fallbackResult = await fallbackFn(context);
      return {
        success: true,
        result: fallbackResult,
        usedFallback: true,
        error: `降级处理: ${errorMsg}`
      };
    } catch (fallbackErr: any) {
      // 降级方案也失败，返回空结果
      console.warn(`[GracefulFallback] 降级方案也失败: ${fallbackErr.message}`);
      return {
        success: false,
        result: null as T,
        usedFallback: true,
        error: `主功能与降级方案均失败: ${errorMsg}`
      };
    }
  }
}

/**
 * 便捷函数：创建图片下载降级
 */
export function createImageDownloadFallback(
  sessionId: string,
  imageUrls: string[]
) {
  return {
    primaryFn: async () => {
      // 主功能：批量下载图片
      const results = await Promise.allSettled(
        imageUrls.map((url, index) => downloadImage(url, sessionId, index))
      );
      return results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => (r as PromiseFulfilledResult<string>).value);
    },
    fallbackFn: async () => {
      // 降级方案：只下载前3张图片
      const urls = imageUrls.slice(0, 3);
      const results = await Promise.allSettled(
        urls.map((url, index) => downloadImage(url, sessionId, index))
      );
      return results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => (r as PromiseFulfilledResult<string>).value);
    }
  };
}

/**
 * 便捷函数：创建评论展开降级
 */
export function createCommentExpandFallback(
  sessionId: string
) {
  return {
    primaryFn: async () => {
      // 主功能：完整评论展开
      return await expandComments({ sessionId });
    },
    fallbackFn: async () => {
      // 降级方案：只展开基础评论（不展开回复）
      return {
        success: true,
        comments: [],
        reachedEnd: false,
        emptyState: true,
        message: '降级：基础评论采集'
      };
    }
  };
}

/**
 * 便捷函数：创建详情提取降级
 */
export function createDetailExtractFallback(
  sessionId: string
) {
  return {
    primaryFn: async () => {
      // 主功能：完整详情提取
      return await extractDetail({ sessionId });
    },
    fallbackFn: async () => {
      // 降级方案：只提取基础信息（标题、作者）
      return {
        success: true,
        detail: {
          header: { title: '基础标题', author: '基础作者' },
          content: { text: '' },
          gallery: { images: [] }
        },
        message: '降级：基础详情提取'
      };
    }
  };
}

// 模拟辅助函数（实际实现中会调用真实函数）
async function downloadImage(url: string, sessionId: string, index: number): Promise<string> {
  // 实际实现中会调用下载逻辑
  return `image_${index}.jpg`;
}

async function expandComments(input: { sessionId: string }) {
  // 实际实现中会调用评论展开逻辑
  return { success: true, comments: [], reachedEnd: false, emptyState: false };
}

async function extractDetail(input: { sessionId: string }) {
  // 实际实现中会调用详情提取逻辑
  return { success: true, detail: { header: {}, content: {}, gallery: {} } };
}
