/**
 * Workflow Block: WeiboCollectFromLinksBlock
 *
 * Phase3/4: 从 phase2-links.jsonl 读取链接，逐个打开详情页采集内容和评论
 * 使用 WeiboCollectCommentsBlock 进行评论采集（触底检测 + 展开回复）
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { parsePlatformDate, getCurrentTimestamp } from '../../collection-manager/date-utils.js';

export interface WeiboCollectFromLinksInput {
  sessionId: string;
  keyword: string;
  env?: string;
  targetCount: number;
  maxComments?: number;
  collectComments?: boolean;
  serviceUrl?: string;
}

export interface WeiboCollectFromLinksOutput {
  success: boolean;
  keywordDir: string;
  linksPath: string;
  processedCount: number;
  persistedCount: number;
  stats: {
    postsProcessed: number;
    totalComments: number;
    errors: number;
  };
  error?: string;
}

interface WeiboLinkEntry {
  statusId: string;
  userId: string;
  safeUrl: string;
  searchUrl: string;
  authorName?: string;
  contentPreview?: string;
  ts: string;
}

function sanitizeFilenamePart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[\\/:"*?<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function resolveDownloadRoot(): string {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

async function readJsonl(filePath: string): Promise<any[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}

async function saveMarkdown(keywordDir: string, entry: WeiboLinkEntry, content: string, comments: any[], commentStats?: any, publishedAtInfo?: { date: string; time: string; fullText: string } | null): Promise<void> {
  const safeStatusId = sanitizeFilenamePart(entry.statusId);
  const mdPath = path.join(keywordDir, `${safeStatusId}.md`);
  
  const lines = [
    `# ${entry.authorName || '未知作者'}的微博`,
    '',
    `**作者**: ${entry.authorName || '未知'}`,
    `**链接**: ${entry.safeUrl}`,
    `**采集时间**: ${getCurrentTimestamp().collectedAt}`,
    `**采集时间(本地)**: ${getCurrentTimestamp().collectedAtLocal}`,
    ...(publishedAtInfo ? [
      `**发布时间**: ${publishedAtInfo.fullText}`,
      `**发布日期**: ${publishedAtInfo.date}`,
      `**发布时间**: ${publishedAtInfo.time}`,
    ] : []),
    '',
    '---',
    '',
    '## 内容',
    '',
    content,
    '',
    '---',
    '',
  ];
  
  if (comments.length > 0) {
    const mainComments = comments.filter(c => c.level === 1).length;
    const replies = comments.filter(c => c.level > 1).length;
    
    lines.push(`## 评论 (主评论: ${mainComments}, 回复: ${replies})`);
    
    if (commentStats) {
      lines.push('');
      lines.push(`**统计**: 滚动轮数 ${commentStats.scrollRounds}, 展开回复 ${commentStats.expandedCount} 次`);
      lines.push(`**状态**: ${commentStats.reachedEnd ? '已触底' : '未触底'}`);
    }
    
    lines.push('');
    
    comments.forEach((c, i) => {
      const indent = c.level > 1 ? '  '.repeat(c.level - 1) : '';
      lines.push(`${indent}### ${i + 1}. ${c.author || '匿名'} ${c.isReply ? '(回复)' : ''}`);
      lines.push('');
      lines.push(`${indent}${c.content || ''}`);
      lines.push('');
      if (c.likeCount > 0) lines.push(`${indent}👍 ${c.likeCount}`);
      lines.push('');
    });
  }
  
  await fs.writeFile(mdPath, lines.join('\n'), 'utf-8');
}

export async function execute(input: WeiboCollectFromLinksInput): Promise<WeiboCollectFromLinksOutput> {
  const {
    sessionId,
    keyword,
    env = 'debug',
    targetCount,
    maxComments = 0,
    collectComments: enableComments = false,  // 默认不采集评论，加快速度
    serviceUrl = 'http://127.0.0.1:7704',
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/command`;
  
  const keywordDir = path.join(resolveDownloadRoot(), 'weibo', env, sanitizeFilenamePart(keyword));
  const linksPath = path.join(keywordDir, 'phase2-links.jsonl');
  
  const links: WeiboLinkEntry[] = await readJsonl(linksPath);
  if (links.length === 0) {
    return {
      success: false,
      keywordDir,
      linksPath,
      processedCount: 0,
      persistedCount: 0,
      stats: { postsProcessed: 0, totalComments: 0, errors: 0 },
      error: 'No links found in phase2-links.jsonl',
    };
  }
  
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
  
  async function getCurrentUrl(): Promise<string> {
    const res = await controllerAction('evaluate', { script: 'window.location.href' });
    const value = unwrapResult(res);
    return typeof value === 'string' ? value : '';
  }
  
  async function gotoUrl(url: string): Promise<void> {
    await controllerAction('goto', { url });
    await new Promise(r => setTimeout(r, 500));  // 减少间隔  // 减少等待时间
  }
  
  async function extractPostContent(): Promise<string> {
    const script = `
      (() => {
        const el = document.querySelector('[class*="wbtext"], .detail_wbtext, article [class*="text"]');
        return el?.textContent?.trim() || '';
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    const value = unwrapResult(res);
    return typeof value === 'string' ? value : '';
  }
  


  // 提取帖子发布时间
  async function extractPostTime(): Promise<{ date: string; time: string; fullText: string } | null> {
    const script = `
      (() => {
        const selectors = [
          'time',
          '[class*="time"]',
          '[class*="date"]',
          '.from a',
          '[class*="head-info_time"]'
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            return el.textContent?.trim() || el.getAttribute('datetime') || '';
          }
        }
        return '';
      })()
    `;
    try {
      const res = await controllerAction('evaluate', { script });
      const value = unwrapResult(res);
      if (typeof value === 'string' && value) {
        return parsePlatformDate(value);
      }
    } catch (e) {
      console.log('[WeiboCollectFromLinks] Could not extract post time:', e);
    }
    return null;
  }

  // 动态导入 WeiboCollectCommentsBlock
  async function collectPostComments(): Promise<{ comments: any[], stats?: any }> {
    if (!enableComments) return { comments: [], stats: undefined };
    
    try {
      const { execute: collectWeiboComments } = await import('./WeiboCollectCommentsBlock.js');
      const result = await collectWeiboComments({
        sessionId: profile,
        serviceUrl,
        maxComments,
        maxRounds: 20,
        expandReplies: true,
      });
      
      return {
        comments: result.comments || [],
        stats: result.stats,
      };
    } catch (e: any) {
      console.error(`[WeiboCollectFromLinks] Comment collection error: ${e.message}`);
      return { comments: [], stats: undefined };
    }
  }
  
  let processedCount = 0;
  let persistedCount = 0;
  let totalComments = 0;
  let errors = 0;
  
  try {
    const targetLinks = links.slice(0, targetCount);
    
    for (const link of targetLinks) {
      processedCount++;
      console.log(`[WeiboCollectFromLinks] Processing: ${link.statusId}`);
      
      try {
        await gotoUrl(link.safeUrl);
        let currentUrl = await getCurrentUrl();
        if (!currentUrl) {
          await new Promise(r => setTimeout(r, 1200));
          currentUrl = await getCurrentUrl();
        }
        console.log(`[WeiboCollectFromLinks] currentUrl=${currentUrl || '<empty>'}, target=${link.statusId}`);
        
        if (currentUrl && !currentUrl.includes(link.statusId)) {
          console.warn(`[WeiboCollectFromLinks] URL mismatch: ${currentUrl}`);
          errors++;
          continue;
        }
        
        const content = await extractPostContent();
        const publishedAtInfo = await extractPostTime();
        const { comments, stats } = await collectPostComments();
        
        await saveMarkdown(keywordDir, link, content, comments, stats, publishedAtInfo);
        persistedCount++;
        totalComments += comments.length;
        
        console.log(`[WeiboCollectFromLinks] Saved: ${link.statusId}, content: ${content.length} chars, comments: ${comments.length}`);
      } catch (e: any) {
        console.error(`[WeiboCollectFromLinks] Error processing ${link.statusId}: ${e.message}`);
        errors++;
      }

      await new Promise(r => setTimeout(r, 500));  // 减少间隔
    }
    
    return {
      success: true,
      keywordDir,
      linksPath,
      processedCount,
      persistedCount,
      stats: {
        postsProcessed: processedCount,
        totalComments,
        errors,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      keywordDir,
      linksPath,
      processedCount,
      persistedCount,
      stats: { postsProcessed: processedCount, totalComments, errors },
      error: error.message,
    };
  }
}
