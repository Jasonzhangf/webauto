/**
 * Workflow Block: CollectCommentsBlock
 *
 * 聚合 WarmupCommentsBlock + ExpandCommentsBlock：
 * - 先滚动 + 自动展开（warmup）
 * - 再一次性提取所有评论（expand）
 */

export interface CollectCommentsInput {
  sessionId: string;
  serviceUrl?: string;
  maxWarmupRounds?: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollectCommentsOutput {
  success: boolean;
  comments: Array<Record<string, any>>;
  reachedEnd: boolean;
  emptyState: boolean;
  warmupCount: number;
  totalFromHeader: number | null;
  anchor?: {
    commentSectionContainerId?: string;
    commentSectionRect?: Rect;
    sampleCommentContainerId?: string;
    sampleCommentRect?: Rect;
    endMarkerContainerId?: string;
    endMarkerRect?: Rect;
    verified?: boolean;
  };
  error?: string;
}

export async function execute(input: CollectCommentsInput): Promise<CollectCommentsOutput> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701',
    maxWarmupRounds
  } = input;

  try {
    const { execute: warmupComments } = await import('./WarmupCommentsBlock.ts');
    const { execute: expandComments } = await import('./ExpandCommentsBlock.ts');

    const warmup = await warmupComments({
      sessionId,
      serviceUrl,
      ...(typeof maxWarmupRounds === 'number' && maxWarmupRounds > 0
        ? { maxRounds: maxWarmupRounds }
        : {})
    } as any);

    if (!warmup.success) {
      return {
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        warmupCount: warmup.finalCount ?? 0,
        totalFromHeader: warmup.totalFromHeader ?? null,
        anchor: warmup.anchor,
        error: warmup.error || 'warmup failed'
      };
    }

    const expanded = await expandComments({
      sessionId,
      serviceUrl
    } as any);

    if (!expanded.success) {
      return {
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        warmupCount: warmup.finalCount ?? 0,
        totalFromHeader: warmup.totalFromHeader ?? null,
        anchor: expanded.anchor,
        error: expanded.error || 'expand failed'
      };
    }

    const comments = Array.isArray(expanded.comments) ? expanded.comments : [];
    const totalFromHeader = warmup.totalFromHeader ?? null;

    // 若能从页面头部解析出“共 N 条评论”，优先用该总数判断是否到达结尾
    let reachedEnd: boolean;
    if (typeof totalFromHeader === 'number' && totalFromHeader > 0) {
      reachedEnd = comments.length >= totalFromHeader;
    } else {
      // 否则退回到 Warmup/Expand 的内部终止信号
      reachedEnd = Boolean(warmup.reachedEnd || expanded.reachedEnd);
    }

    return {
      success: true,
      comments,
      reachedEnd,
      emptyState: expanded.emptyState,
      warmupCount: warmup.finalCount ?? 0,
      totalFromHeader,
      anchor: expanded.anchor
    };
  } catch (error: any) {
    return {
      success: false,
      comments: [],
      reachedEnd: false,
      emptyState: false,
      warmupCount: 0,
      totalFromHeader: null,
      anchor: undefined,
      error: `CollectComments failed: ${error.message}`
    };
  }
}
