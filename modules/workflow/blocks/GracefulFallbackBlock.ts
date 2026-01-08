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
      // 主功能：目前仅返回全部 URL，由调用方负责下载
      // （占位实现，避免依赖不存在的 downloadImage 辅助函数）
      return imageUrls;
    },
    fallbackFn: async () => {
      // 降级方案：只返回前 3 张 URL
      return imageUrls.slice(0, 3);
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
      // 主功能：完整评论展开（调用真实 ExpandCommentsBlock）
      const { execute: expandComments } = await import('./ExpandCommentsBlock.ts');
      return await expandComments({ sessionId } as any);
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
 *
 * 主路径走完整的 ExtractDetailBlock（包含 gallery.images 等字段）；
 * 只有在“可降级错误”时才返回一个仅含基础 header/content 的占位 detail，gallery.images 为空。
 */
export function createDetailExtractFallback(
  sessionId: string
) {
  return {
    primaryFn: async () => {
      const { execute: extractDetail } = await import('./ExtractDetailBlock.ts');
      return await extractDetail({ sessionId } as any);
    },
    fallbackFn: async () => {
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
