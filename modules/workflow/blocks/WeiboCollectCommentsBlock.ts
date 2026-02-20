/**
 * Workflow Block: WeiboCollectCommentsBlock
 *
 * 微博评论采集 - 类似小红书结构
 * - 点击评论图标展开评论区
 * - 滚动加载主评论
 * - 展开回复（支持多级）
 * - 触底检测和统计
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
    maxComments = 0, // 0 = no limit
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

  // 点击评论图标展开评论区
  async function clickCommentIcon(): Promise<boolean> {
    const script = `
      (() => {
        const icon = document.querySelector('.woo-font--comment');
        if (!icon) return { success: false, error: 'comment_icon_not_found' };
        const btn = icon.closest('div[role=button], .woo-box-flex, button') || icon.parentElement;
        if (!btn) return { success: false, error: 'comment_button_not_found' };
        btn.click();
        return { success: true, rect: btn.getBoundingClientRect().toJSON() };
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    const result = unwrapResult(res);
    return result?.success === true;
  }

  // 获取评论区容器
  async function getCommentContainer(): Promise<Element | null> {
    const script = `
      (() => {
        // 微博评论区可能在展开后的不同位置
        const containers = [
          document.querySelector('[class*="comment_list"]'),
          document.querySelector('[class*="Comment_list"]'),
          document.querySelector('[class*="comment-list"]'),
          document.querySelector('section[class*="comment"]'),
          document.querySelector('article + div'), // 文章后面的评论区
        ];
        const found = containers.find(el => el && el.children.length > 0);
        return found ? { found: true, className: found.className } : { found: false };
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    return unwrapResult(res);
  }

  // 提取当前可见的评论
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
          
          // 检测是否为回复
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

  // 查找并点击展开回复按钮
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
        
        let clicked = 0;
        buttons.slice(0, 3).forEach(btn => {
          btn.click();
          clicked++;
        });
        return clicked;
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    const result = unwrapResult(res);
    return typeof result === 'number' ? result : 0;
  }

  // 滚动评论区
  async function scrollComments(): Promise<boolean> {
    const script = `
      (() => {
        const container = document.querySelector('[class*="comment_list"], [class*="Comment_list"]') || 
                         document.scrollingElement;
        if (!container) return { hasMore: false };
        
        const beforeScroll = container.scrollTop;
        container.scrollTop += 500;
        
        // 检查是否还能滚动
        const hasMore = container.scrollTop > beforeScroll || 
                       container.scrollHeight - container.scrollTop > container.clientHeight + 100;
        
        return { hasMore, scrollTop: container.scrollTop, scrollHeight: container.scrollHeight };
      })()
    `;
    await controllerAction('evaluate', { script });
    await new Promise(r => setTimeout(r, 1000));
    return true;
  }

  // 检测是否到底
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
    // 1. 点击评论图标展开评论区
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

    // 等待评论区加载
    await new Promise(r => setTimeout(r, 2000));

    // 2. 循环滚动和采集
    while (scrollRounds < maxRounds) {
      if (maxComments > 0 && comments.length >= maxComments) break;

      // 展开回复按钮
      if (expandReplies) {
        const expanded = await expandReplyButtons();
        expandedCount += expanded;
        if (expanded > 0) await new Promise(r => setTimeout(r, 800));
      }

      // 提取评论
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

      // 检测是否到底
      const endState = await checkEndState();
      if (endState.reachedEnd || endState.emptyState) {
        reachedEnd = endState.reachedEnd;
        emptyState = endState.emptyState;
        break;
      }

      // 滚动
      await scrollComments();
      scrollRounds++;
      
      // 如果没有新增，再试一次后退出
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
