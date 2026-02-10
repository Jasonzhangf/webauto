/**
 * Phase 3-4 Block: 采集评论
 *
 * 职责：
 * 1. 展开评论区（系统级点击 comment_button）
 * 2. 批量采集可见评论（comment_item extract）
 * 3. 点击“展开更多”+评论区滚动加载
 * 4. 返回去重后的评论数组
 */

import {
  ensureCommentsOpened,
  extractVisibleComments,
  isCommentEnd,
  scrollComments,
  expandAllVisibleReplyButtons,
  type XhsExtractedComment,
} from './helpers/xhsComments.js';
import { controllerAction, delay } from '../utils/controllerAction.js';

export interface CollectCommentsInput {
  sessionId?: string;
  unifiedApiUrl?: string;
  maxRounds?: number;
  batchSize?: number;
}

export interface CollectCommentsOutput {
  success: boolean;
  comments: Array<{
    userName: string;
    userId: string;
    content: string;
    time: string;
    likeCount: number;
  }>;
  totalCollected: number;
  error?: string;
}

async function isCommentEmpty(sessionId: string, apiUrl: string): Promise<boolean> {
  const res = await controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.empty_state',
      operationId: 'extract',
      sessionId,
      config: { max_items: 1, visibleOnly: true },
    },
    apiUrl,
  ).catch((): null => null);

  const extracted = Array.isArray((res as any)?.extracted) ? (res as any).extracted : [];
  return extracted.length > 0;
}

function toNormalizedComment(item: XhsExtractedComment) {
  return {
    userName: String((item as any).user_name || ''),
    userId: String((item as any).user_id || ''),
    content: String((item as any).text || '').replace(/\s+/g, ' ').trim(),
    time: String((item as any).timestamp || ''),
    likeCount: 0,
  };
}

export async function execute(input: CollectCommentsInput): Promise<CollectCommentsOutput> {
  const {
    sessionId = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
    maxRounds = 0,
    batchSize = 0,
  } = input;

  const roundLimit = Number.isFinite(Number(maxRounds)) && Number(maxRounds) > 0
    ? Math.floor(Number(maxRounds))
    : Number.POSITIVE_INFINITY;
  const batchLimit = Number.isFinite(Number(batchSize)) && Number(batchSize) > 0
    ? Math.floor(Number(batchSize))
    : Number.POSITIVE_INFINITY;

  console.log(
    `[Phase34CollectComments] 开始采集评论 (batchSize=${Number.isFinite(batchLimit) ? batchLimit : 'unlimited'}, maxRounds=${Number.isFinite(roundLimit) ? roundLimit : 'unlimited'})`,
  );

  const allComments: CollectCommentsOutput['comments'] = [];
  const seen = new Set<string>();
  let round = 0;
  let noNewCount = 0;
  let expandNoClickStreak = 0;
  const MAX_NO_NEW = 3;

  // 1) 展开评论区（允许已展开/无按钮时继续尝试 extract）
  try {
    await ensureCommentsOpened(sessionId, unifiedApiUrl);
  } catch (err: any) {
    console.warn(`[Phase34CollectComments] 评论区展开异常: ${err?.message || String(err)}`);
  }

  await delay(800);

  while (round < roundLimit) {
    round += 1;

    const empty = await isCommentEmpty(sessionId, unifiedApiUrl);
    if (empty) {
      console.log('[Phase34CollectComments] 评论区空状态，停止采集');
      break;
    }

    const expandNow = await expandAllVisibleReplyButtons(sessionId, unifiedApiUrl, {
      maxPasses: 6,
      maxClicksPerPass: 12,
    }).catch(() => ({ clicked: 0, passes: 0, remaining: 0, detected: 0 }));
    if (expandNow.clicked > 0 || expandNow.remaining > 0) {
      console.log(
        `[Phase34CollectComments] Round ${round}: 先展开可见回复 clicked=${expandNow.clicked} remaining=${expandNow.remaining}`,
      );
      await delay(320);
    }

    const remaining = Number.isFinite(batchLimit)
      ? Math.max(1, batchLimit - allComments.length)
      : 200;
    const visible = await extractVisibleComments(sessionId, unifiedApiUrl, Math.min(200, remaining));

    const prev = allComments.length;
    for (const item of visible) {
      const normalized = toNormalizedComment(item);
      if (!normalized.content) continue;
      const key = `${normalized.userId}:${normalized.content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allComments.push(normalized);
    }

    const newCount = allComments.length - prev;
    console.log(`[Phase34CollectComments] Round ${round}: 可见${visible.length} 新增${newCount} 总计${allComments.length}`);

    if (newCount > 0) {
      noNewCount = 0;
    } else {
      noNewCount += 1;
      console.log(`[Phase34CollectComments] 无新评论计数: ${noNewCount}/${MAX_NO_NEW}`);
    }

    if (Number.isFinite(batchLimit) && allComments.length >= batchLimit) {
      console.log(`[Phase34CollectComments] 已达到批次大小 ${batchLimit}，停止采集`);
      break;
    }

    const endReached = await isCommentEnd(sessionId, unifiedApiUrl).catch(() => false);
    if (endReached) {
      console.log('[Phase34CollectComments] 检测到评论区底部，停止采集');
      break;
    }

    if (noNewCount >= MAX_NO_NEW) {
      console.log(`[Phase34CollectComments] 连续 ${MAX_NO_NEW} 轮无新增，停止采集`);
      break;
    }

    // 滚动前先把视口内“展开回复”按钮点完，再决定是否滚动。
    const expandBeforeScroll = await expandAllVisibleReplyButtons(sessionId, unifiedApiUrl, {
      maxPasses: 8,
      maxClicksPerPass: 15,
    }).catch(() => ({ clicked: 0, passes: 0, remaining: 0, detected: 0 }));

    if (expandBeforeScroll.clicked > 0) {
      expandNoClickStreak = 0;
      console.log(
        `[Phase34CollectComments] Round ${round}: 滚动前展开 clicked=${expandBeforeScroll.clicked} remaining=${expandBeforeScroll.remaining}，先重采当前视口`,
      );
      await delay(420);
      continue;
    }

    if (expandBeforeScroll.remaining > 0) {
      expandNoClickStreak += 1;
      console.log(
        `[Phase34CollectComments] Round ${round}: 检测到 remaining=${expandBeforeScroll.remaining} 但点击为0 (streak=${expandNoClickStreak})`,
      );
      if (expandNoClickStreak < 2) {
        await delay(420);
        continue;
      }
      console.log('[Phase34CollectComments] 展开按钮无法点击，强制执行滚动以避免卡住');
    } else {
      expandNoClickStreak = 0;
    }

    let scrolled: any = null;
    try {
      console.log(`[Phase34CollectComments] Round ${round}: 无可展开按钮，执行滚动`);
      scrolled = await scrollComments(sessionId, unifiedApiUrl, 650);
    } catch {
      scrolled = null;
    }
    if (scrolled?.success === false) {
      console.log('[Phase34CollectComments] 评论区滚动失败，停止采集');
      break;
    }
    await delay(900);
  }

  console.log(`[Phase34CollectComments] 完成，共采集 ${allComments.length} 条评论`);

  return {
    success: true,
    comments: allComments,
    totalCollected: allComments.length,
  };
}
