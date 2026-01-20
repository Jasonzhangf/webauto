/**
 * Workflow Block: WarmupCommentsBlock
 *
 * 第一阶段：只负责把评论区滚到底并自动展开「展开 N 条回复」，不做内容提取。
 * 目标是让 DOM 中尽可能多地渲染出 .comment-item，再交给后续 ExpandCommentsBlock 做纯提取。
 */

import {
  clickCommentButtonByContainerId,
  locateCommentSection,
  type CommentSectionLocateResult,
} from './helpers/commentSectionLocator.js';
import {
  scrollCommentSection,
  type Rect as ScrollRect,
  type ScrollResult,
} from './helpers/commentScroller.js';
import { expandRepliesInView } from './helpers/replyExpander.js';

export interface WarmupCommentsInput {
  sessionId: string;
  maxRounds?: number;
  serviceUrl?: string;
  allowClickCommentButton?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WarmupCommentsOutput {
  success: boolean;
  reachedEnd: boolean;
  totalFromHeader: number | null;
  finalCount: number;
  anchor?: {
    commentSectionContainerId: string;
    commentSectionRect?: Rect;
  };
  error?: string;
}

export async function execute(input: WarmupCommentsInput): Promise<WarmupCommentsOutput> {
  const {
    sessionId,
    maxRounds,
    serviceUrl = 'http://127.0.0.1:7701',
    allowClickCommentButton,
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;
  const browserServiceUrl =
    process.env.WEBAUTO_BROWSER_SERVICE_URL || 'http://127.0.0.1:7704';

  const canClickCommentButton = allowClickCommentButton !== false;

  const commentSectionContainerId = 'xiaohongshu_detail.comment_section';
  const commentButtonContainerId = 'xiaohongshu_detail.comment_button';
  const showMoreContainerId = 'xiaohongshu_detail.comment_section.show_more_button';

  try {
    const { getPrimarySelectorByContainerId } = await import('./helpers/containerAnchors.js');

    let showMoreSelector: string | null = null;
    try {
      showMoreSelector = await getPrimarySelectorByContainerId(showMoreContainerId);
      if (!showMoreSelector) {
        console.warn('[WarmupComments] primary selector not found for show_more_button');
      } else {
        console.log(`[WarmupComments] show_more_button selector: ${showMoreSelector}`);
      }
    } catch (e: any) {
      console.warn(`[WarmupComments] getPrimarySelectorByContainerId error: ${e?.message || e}`);
    }

    // 1) 锚定评论区（高亮 + rect 回环）
    const locateResult: CommentSectionLocateResult = await locateCommentSection({
      profile,
      serviceUrl,
      controllerUrl,
      commentSectionContainerId,
      commentButtonContainerId,
      canClickCommentButton,
      highlightStyle: '2px solid #ffaa00',
      highlightMs: 2000,
    });

    if (!locateResult.found || !locateResult.rect) {
      return {
        success: false,
        reachedEnd: false,
        totalFromHeader: null,
        finalCount: 0,
        anchor: {
          commentSectionContainerId,
          commentSectionRect: undefined,
        },
        error: locateResult.error || 'comment_section anchor not found',
      };
    }

    const focusRect: ScrollRect = locateResult.rect as any;

    // 2) 滚动评论区到“到底/空态”，每轮尝试展开可见的回复按钮
    let commentButtonClicked = Boolean(locateResult.clickedCommentButton);
    const activateComments = async (reason: string) => {
      if (!canClickCommentButton) return;
      if (commentButtonClicked) return;
      const res = await clickCommentButtonByContainerId({
        profile,
        serviceUrl,
        controllerUrl,
        commentButtonContainerId,
      });
      if (res.clicked) {
        commentButtonClicked = true;
        console.log(`[WarmupComments] comment_button clicked (${reason})`);
      }
    };

    const scrollResult: ScrollResult = await scrollCommentSection({
      controllerUrl,
      profile,
      browserServiceUrl,
      ...(typeof maxRounds === 'number' && maxRounds > 0 ? { maxRounds } : {}),
      focusRect,
      logPrefix: '[WarmupComments]',
      activateComments,
      expand: async ({ round, focusPoint }) => {
        await expandRepliesInView({
          controllerUrl,
          profile,
          browserServiceUrl,
          focusPoint,
          showMoreContainerId,
          showMoreSelector,
          logPrefix: '[WarmupComments]',
          round,
        });
      },
    });

    return {
      success: true,
      reachedEnd: scrollResult.reachedEnd,
      totalFromHeader: scrollResult.totalFromHeader,
      finalCount: scrollResult.finalCount,
      anchor: {
        commentSectionContainerId,
        commentSectionRect: locateResult.rect,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      reachedEnd: false,
      totalFromHeader: null,
      finalCount: 0,
      anchor: { commentSectionContainerId, commentSectionRect: undefined },
      error: `WarmupComments failed: ${error?.message || error}`,
    };
  }
}

