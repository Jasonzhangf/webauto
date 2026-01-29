/**
 * Phase 3 Block: 评论互动（Interact）
 *
 * 职责：
 * - 打开帖子详情页
 * - 展开评论区
 * - 滚动评论区，筛选包含关键字的评论
 * - 对未赞的关键字评论点赞
 * - 每个帖子点赞指定数量后返回（默认 2 条）
 */

import { controllerAction, delay } from '../utils/controllerAction.js';

export interface InteractInput {
  sessionId: string;
  noteId: string;
  safeUrl: string;
  likeKeywords: string[];
  maxLikesPerRound?: number;
  unifiedApiUrl?: string;
}

export interface InteractOutput {
  success: boolean;
  noteId: string;
  likedCount: number;
  likedComments: Array<{
    commentId: string;
    userId: string;
    userName: string;
    content: string;
    timestamp: string;
  }>;
  reachedBottom: boolean;
  error?: string;
}

export interface CommentMatchResult {
  commentId: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
  isLiked: boolean;
  anchor?: any;
}

export async function execute(input: InteractInput): Promise<InteractOutput> {
  const {
    sessionId,
    noteId,
    safeUrl,
    likeKeywords,
    maxLikesPerRound = 2,
    unifiedApiUrl = 'http://127.0.0.1:7701'
  } = input;

  console.log(`[Phase3Interact] 开始处理帖子: ${noteId}`);

  const likedComments: InteractOutput['likedComments'] = [];
  let likedCount = 0;
  let reachedBottom = false;
  let scrollCount = 0;
  const maxScrolls = 60;

  // 1) 打开详情页（必须是带 xsec_token 的 safeUrl）
  const navRes = await controllerAction(
    'browser:navigate',
    { profile: sessionId, url: safeUrl },
    unifiedApiUrl
  );
  if (navRes?.success === false) {
    return {
      success: false,
      noteId,
      likedCount: 0,
      likedComments: [],
      reachedBottom: false,
      error: navRes?.error || 'navigate failed'
    };
  }
  await delay(2000);

  // 2) 展开评论区（如果按钮存在则点击；否则视为已展开）
  await ensureCommentsOpened(sessionId, unifiedApiUrl);

  // 3) 滚动评论区 + 筛选 + 点赞
  while (likedCount < maxLikesPerRound && !reachedBottom && scrollCount < maxScrolls) {
    scrollCount += 1;

    const matches = await getKeywordCommentMatches(sessionId, likeKeywords, unifiedApiUrl);
    for (const c of matches) {
      if (likedCount >= maxLikesPerRound) break;
      if (c.isLiked) continue;

      // 视觉确认
      await controllerAction(
        'container:operation',
        {
          containerId: 'xiaohongshu_detail.comment_section.comment_item',
          operationId: 'highlight',
          sessionId,
          config: { anchor: c.anchor }
        },
        unifiedApiUrl
      );
      await delay(400);

      // 点赞（容器 click 内部 target=.like-wrapper）
      const clickRes = await controllerAction(
        'container:operation',
        {
          containerId: 'xiaohongshu_detail.comment_section.comment_item',
          operationId: 'click',
          sessionId,
          config: { anchor: c.anchor }
        },
        unifiedApiUrl
      );
      if (!clickRes?.success) {
        continue;
      }

      await delay(500);

      // 验证：like-wrapper class 是否变为 like-active
      const after = await extractComment(sessionId, c.anchor, unifiedApiUrl);
      const likeStatus = String(after?.data?.like_status || '');
      const nowLiked = likeStatus.includes('like-active');
      if (!nowLiked) {
        // 点赞可能失败或 UI 还未更新，先不计数
        continue;
      }

      likedCount += 1;
      likedComments.push({
        commentId: c.commentId,
        userId: String(after?.data?.user_id || c.userId || ''),
        userName: String(after?.data?.user_name || c.userName || ''),
        content: String(after?.data?.text || c.content || ''),
        timestamp: String(after?.data?.timestamp || c.timestamp || '')
      });

      // 点赞间隔
      await delay(800);
    }

    // 是否到底
    reachedBottom = await isCommentEnd(sessionId, unifiedApiUrl);
    if (reachedBottom) break;

    // 系统级滚动（避免大跨度）
    await controllerAction(
      'browser:keyboard:press',
      { profile: sessionId, key: 'PageDown' },
      unifiedApiUrl
    );
    await delay(900);
  }

  return {
    success: true,
    noteId,
    likedCount,
    likedComments,
    reachedBottom
  };
}

async function ensureCommentsOpened(sessionId: string, apiUrl: string): Promise<void> {
  const btn = await controllerAction(
    'containers:match',
    { containerId: 'xiaohongshu_detail.comment_button', sessionId },
    apiUrl
  );
  if (btn?.success && Array.isArray(btn?.matches) && btn.matches.length > 0) {
    await controllerAction(
      'container:operation',
      { containerId: 'xiaohongshu_detail.comment_button', operationId: 'click', sessionId },
      apiUrl
    );
    await delay(1200);
  }
}

async function isCommentEnd(sessionId: string, apiUrl: string): Promise<boolean> {
  const end = await controllerAction(
    'containers:match',
    { containerId: 'xiaohongshu_detail.comment_section.end_marker', sessionId },
    apiUrl
  );
  if (end?.success && Array.isArray(end?.matches) && end.matches.length > 0) return true;
  return false;
}

async function getKeywordCommentMatches(
  sessionId: string,
  keywords: string[],
  apiUrl: string
): Promise<CommentMatchResult[]> {
  const res = await controllerAction(
    'containers:match',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      sessionId,
      options: { viewportOnly: true }
    },
    apiUrl
  );
  const matches = Array.isArray(res?.matches) ? res.matches : [];
  if (!res?.success || matches.length === 0) return [];

  const out: CommentMatchResult[] = [];
  for (const m of matches) {
    const dataRes = await extractComment(sessionId, m.anchor, apiUrl);
    if (!dataRes?.success) continue;
    const text = String(dataRes?.data?.text || '');
    if (!text) continue;
    if (!keywords.some((k) => k && text.includes(k))) continue;

    const likeStatus = String(dataRes?.data?.like_status || '');
    out.push({
      commentId: String(m.matchId || ''),
      userId: String(dataRes?.data?.user_id || ''),
      userName: String(dataRes?.data?.user_name || ''),
      content: text,
      timestamp: String(dataRes?.data?.timestamp || ''),
      isLiked: likeStatus.includes('like-active'),
      anchor: m.anchor
    });
  }
  return out;
}

async function extractComment(sessionId: string, anchor: any, apiUrl: string): Promise<any> {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'extract',
      sessionId,
      config: { anchor }
    },
    apiUrl
  );
}
