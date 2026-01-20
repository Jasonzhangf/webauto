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
  allowClickCommentButton?: boolean;
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
  entryAnchor?: {
    commentSectionContainerId?: string;
    commentSectionRect?: Rect;
    verified?: boolean;
  };
  exitAnchor?: {
    commentSectionContainerId?: string;
    commentSectionRect?: Rect;
    endMarkerContainerId?: string;
    endMarkerRect?: Rect;
    verified?: boolean;
  };
  steps?: Array<{
    id: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    error?: string;
    anchor?: any;
    meta?: Record<string, any>;
  }>;
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
    maxWarmupRounds,
    allowClickCommentButton,
  } = input;

  try {
    const { execute: warmupComments } = await import('./WarmupCommentsBlock.js');
    const { execute: expandComments } = await import('./ExpandCommentsBlock.js');

    const steps: NonNullable<CollectCommentsOutput['steps']> = [];
    let entryAnchor: CollectCommentsOutput['entryAnchor'];
    let exitAnchor: CollectCommentsOutput['exitAnchor'];

    function pushStep(step: NonNullable<CollectCommentsOutput['steps']>[number]) {
      steps.push(step);
      try {
        console.log(
          '[CollectComments][step]',
          JSON.stringify(
            {
              id: step.id,
              status: step.status,
              error: step.error,
              anchor: step.anchor,
              meta: step.meta,
            },
            null,
            2,
          ),
        );
      } catch {
        console.log('[CollectComments][step]', step.id, step.status);
      }
    }

    const warmup = await warmupComments({
      sessionId,
      serviceUrl,
      ...(allowClickCommentButton === false ? { allowClickCommentButton: false } : {}),
      ...(typeof maxWarmupRounds === 'number' && maxWarmupRounds > 0
        ? { maxRounds: maxWarmupRounds }
        : {})
    } as any);

    // 入口锚点：评论区根容器 + rect
    if (warmup.anchor?.commentSectionContainerId) {
      entryAnchor = {
        commentSectionContainerId: warmup.anchor.commentSectionContainerId,
        commentSectionRect: warmup.anchor.commentSectionRect,
        verified: Boolean(warmup.anchor.commentSectionRect && warmup.anchor.commentSectionRect.height > 0),
      };
      console.log('[CollectComments][entryAnchor]', JSON.stringify(entryAnchor, null, 2));
    }

    if (!warmup.success) {
      pushStep({
        id: 'warmup_comments',
        status: 'failed',
        anchor: warmup.anchor,
        error: warmup.error || 'warmup failed',
        meta: {
          finalCount: warmup.finalCount ?? 0,
          totalFromHeader: warmup.totalFromHeader ?? null,
        },
      });
      return {
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        warmupCount: warmup.finalCount ?? 0,
        totalFromHeader: warmup.totalFromHeader ?? null,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: warmup.anchor,
        error: warmup.error || 'warmup failed'
      };
    }

    pushStep({
      id: 'warmup_comments',
      status: 'success',
      anchor: warmup.anchor,
      meta: {
        finalCount: warmup.finalCount ?? 0,
        totalFromHeader: warmup.totalFromHeader ?? null,
        reachedEnd: warmup.reachedEnd ?? false,
      },
    });

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
      serviceUrl,
      expectedTotal: warmup.totalFromHeader ?? null,
    } as any);

    if (!expanded.success) {
      pushStep({
        id: 'expand_comments',
        status: 'failed',
        anchor: expanded.anchor,
        error: expanded.error || 'expand failed',
        meta: {
          commentsCount: Array.isArray(expanded.comments) ? expanded.comments.length : 0,
          reachedEnd: expanded.reachedEnd ?? false,
          emptyState: expanded.emptyState ?? false,
        },
      });
      return {
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        warmupCount: warmup.finalCount ?? 0,
        totalFromHeader: warmup.totalFromHeader ?? null,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: expanded.anchor,
        error: expanded.error || 'expand failed'
      };
    }

    pushStep({
      id: 'expand_comments',
      status: 'success',
      anchor: expanded.anchor,
      meta: {
        commentsCount: Array.isArray(expanded.comments) ? expanded.comments.length : 0,
        reachedEnd: expanded.reachedEnd ?? false,
        emptyState: expanded.emptyState ?? false,
      },
    });

    const comments = Array.isArray(expanded.comments) ? expanded.comments : [];
    const totalFromHeader = warmup.totalFromHeader ?? null;

    // 结尾判定：只认 ExpandCommentsBlock 的锚点信号（end_marker / empty_state），避免 header 总数/滚动推断误判
    const reachedEnd = Boolean(expanded.reachedEnd);
    const emptyState = Boolean(expanded.emptyState);

    if (expanded.anchor) {
      exitAnchor = {
        commentSectionContainerId: expanded.anchor.commentSectionContainerId,
        commentSectionRect: expanded.anchor.commentSectionRect,
        endMarkerContainerId: expanded.anchor.endMarkerContainerId,
        endMarkerRect: expanded.anchor.endMarkerRect,
        verified: expanded.anchor.verified ?? false,
      };
      console.log('[CollectComments][exitAnchor]', JSON.stringify(exitAnchor, null, 2));
    }

    return {
      success: true,
      comments,
      reachedEnd,
      emptyState,
      warmupCount: warmup.finalCount ?? 0,
      totalFromHeader,
      entryAnchor,
      exitAnchor,
      steps,
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
