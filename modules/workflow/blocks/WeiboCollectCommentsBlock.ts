/**
 * Workflow Block: WeiboCollectCommentsBlock
 *
 * Weibo comment collection (protocol-only interactions).
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface WeiboCollectCommentsInput {
  sessionId: string;
  serviceUrl?: string;
  maxComments?: number;
  maxRounds?: number;
  expandReplies?: boolean;
}

export interface WeiboComment {
  id?: string;
  author: string;
  content: string;
  timestamp?: string;
  likeCount?: number;
  replyCount?: number;
  isReply?: boolean;
  parentId?: string;
  level: number;
}

export interface WeiboCollectCommentsOutput {
  success: boolean;
  comments: WeiboComment[];
  totalCollected: number;
  reachedEnd: boolean;
  emptyState: boolean;
  stats: {
    mainComments: number;
    replies: number;
    expandedCount: number;
    scrollRounds: number;
  };
  error?: string;
}

function isDebugArtifactsEnabled(): boolean {
  return (
    process.env.WEBAUTO_DEBUG === '1' ||
    process.env.WEBAUTO_DEBUG_ARTIFACTS === '1'
  );
}

export async function execute(input: WeiboCollectCommentsInput): Promise<WeiboCollectCommentsOutput> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7704',
    maxComments = 0,
    maxRounds = 30,
    expandReplies = true,
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/command`;
  const comments: WeiboComment[] = [];
  const seenIds = new Set<string>();
  let scrollRounds = 0;
  let expandedCount = 0;
  let reachedEnd = false;
  let emptyState = false;

  async function controllerAction(action: string, args: any = {}): Promise<any> {
    const res = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args: { profileId: profile, ...args } }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined,
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw}`);
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    return data;
  }

  function unwrapResult(response: any): any {
    if (response && typeof response === 'object') {
      if ('result' in response) return response.result;
      if (response.data && typeof response.data === 'object' && 'result' in response.data) {
        return response.data.result;
      }
      if ('data' in response) return response.data;
    }
    return response;
  }

  // click comment icon using protocol click (no DOM click)
  async function clickCommentIcon(): Promise<boolean> {
    const script = `
      (() => {
        const icon = document.querySelector('.woo-font--comment');
        if (!icon) return { success: false, error: 'comment_icon_not_found' };
        const btn = icon.closest('div[role=button], .woo-box-flex, button') || icon.parentElement;
        if (!btn) return { success: false, error: 'comment_button_not_found' };
        const rect = btn.getBoundingClientRect();
        return {
          success: true,
          rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
          center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        };
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    const result = unwrapResult(res);
    if (!result?.success || !result?.center) return false;
    const x = Math.round(Number(result.center.x));
    const y = Math.round(Number(result.center.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    await controllerAction('mouse:click', { x, y, clicks: 1 });
    return true;
  }

  // get comment container
  async function getCommentContainer(): Promise<Element | null> {
    const script = `
      (() => {
        const containers = [
          document.querySelector('[class*="comment_list"]'),
          document.querySelector('[class*="Comment_list"]'),
          document.querySelector('[class*="comment-list"]'),
          document.querySelector('section[class*="comment"]'),
          document.querySelector('article + div'),
        ];
        const found = containers.find(el => el && el.children.length > 0);
        return found ? { found: true, className: found.className } : { found: false };
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    return unwrapResult(res);
  }

  // extract current visible comments
  async function extractComments(): Promise<WeiboComment[]> {
    const script = `
      (() => {
        const results = [];
        const items = document.querySelectorAll('[class*="Comment_item"], [class*="comment-item"], .list_li, [class*="reply"]');
        items.forEach((item, index) => {
          const authorEl = item.querySelector('[class*="author"], .user-name, .name, [class*="nick"]');
          const contentEl = item.querySelector('[class*="content"], .WB_text, .txt, [class*="text"]');
          const likeEl = item.querySelector('[class*="like"], .praised, [class*="agree"]');
          const timeEl = item.querySelector('time, [class*="time"], [class*="date"]');

          const isReply = item.className.toLowerCase().includes('reply') || 
                         item.closest('[class*="reply"]') !== null;

          const id = item.getAttribute('data-id') || item.id || 'item_' + index;

          results.push({
            id,
            author: authorEl?.textContent?.trim() || '匿名',
            content: contentEl?.textContent?.trim() || '',
            timestamp: timeEl?.textContent?.trim() || timeEl?.getAttribute('datetime') || '',
            likeCount: parseInt(likeEl?.textContent?.match(/\\d+/)?.[0] || '0'),
            isReply,
            level: isReply ? 2 : 1,
          });
        });
        return results;
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    const result = unwrapResult(res);
    return Array.isArray(result) ? result : [];
  }

  // expand reply buttons with protocol click
  async function expandReplyButtons(): Promise<number> {
    const script = `
      (() => {
        const buttons = Array.from(document.querySelectorAll('a, button, span'))
          .filter(el => {
            const text = el.textContent?.trim() || '';
            return text.includes('收起回复') || text.includes('回复') || text.includes('展开');
          })
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.top > 0 && rect.bottom < window.innerHeight && rect.width > 0;
          });

        return buttons.slice(0, 3).map(btn => {
          const rect = btn.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        });
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    const result = unwrapResult(res);
    const targets = Array.isArray(result) ? result : [];
    let clicked = 0;
    for (const target of targets) {
      const x = Math.round(Number(target?.x));
      const y = Math.round(Number(target?.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      await controllerAction('mouse:click', { x, y, clicks: 1 });
      clicked += 1;
      await new Promise(r => setTimeout(r, 200));
    }
    return clicked;
  }

  // scroll comments using protocol wheel
  async function scrollComments(): Promise<boolean> {
    await controllerAction('mouse:wheel', { deltaX: 0, deltaY: 500 });
    await new Promise(r => setTimeout(r, 1000));
    return true;
  }

  // check end state
  async function checkEndState(): Promise<{ reachedEnd: boolean; emptyState: boolean }> {
    const script = `
      (() => {
        const noMoreText = Array.from(document.querySelectorAll('*'))
          .find(el => el.textContent?.includes('没有更多'));
        const loading = document.querySelector('[class*="loading"], [class*="Loading"]');
        return { 
          reachedEnd: !!noMoreText, 
          emptyState: document.querySelectorAll('[class*="comment"]').length === 0 
        };
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    const result = unwrapResult(res);
    return typeof result === 'object' && result !== null ? result : { reachedEnd: false, emptyState: false };
  }

  try {
    const clicked = await clickCommentIcon();
    if (!clicked) {
      return {
        success: false,
        comments: [],
        totalCollected: 0,
        reachedEnd: false,
        emptyState: true,
        stats: { mainComments: 0, replies: 0, expandedCount: 0, scrollRounds: 0 },
        error: 'Failed to click comment icon',
      };
    }

    await new Promise(r => setTimeout(r, 2000));

    while (scrollRounds < maxRounds) {
      if (maxComments > 0 && comments.length >= maxComments) break;

      if (expandReplies) {
        const expanded = await expandReplyButtons();
        expandedCount += expanded;
        if (expanded > 0) await new Promise(r => setTimeout(r, 800));
      }

      const newComments = await extractComments();
      let addedCount = 0;

      for (const comment of newComments) {
        const key = `${comment.author}:${comment.content.slice(0, 30)}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          comments.push(comment);
          addedCount++;
        }
      }

      console.log(`[WeiboComments] Round ${scrollRounds + 1}: collected ${comments.length} comments, new: ${addedCount}`);

      const endState = await checkEndState();
      if (endState.reachedEnd || endState.emptyState) {
        reachedEnd = endState.reachedEnd;
        emptyState = endState.emptyState;
        break;
      }

      await scrollComments();
      scrollRounds++;

      if (addedCount === 0 && scrollRounds > 3) {
        const endCheck = await checkEndState();
        if (endCheck.reachedEnd) {
          reachedEnd = true;
          break;
        }
      }
    }

    const mainComments = comments.filter(c => c.level === 1).length;
    const replies = comments.filter(c => c.level > 1).length;

    return {
      success: true,
      comments,
      totalCollected: comments.length,
      reachedEnd,
      emptyState,
      stats: {
        mainComments,
        replies,
        expandedCount,
        scrollRounds,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      comments,
      totalCollected: comments.length,
      reachedEnd,
      emptyState,
      stats: {
        mainComments: comments.filter(c => c.level === 1).length,
        replies: comments.filter(c => c.level > 1).length,
        expandedCount,
        scrollRounds,
      },
      error: error.message,
    };
  }
}

