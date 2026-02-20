/**
 * Workflow Block: WeiboCollectSearchLinksBlock
 * Phase2: 在微博搜索结果页采集帖子链接
 * 
 * 集成：
 * - RateLimiter: 流控配额（仅 search/like/comment）
 * - ProcessRegistry: 进程生命周期
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { RateLimiter, type QuotaType } from '../../rate-limiter/index.js';
import { ProcessRegistry, type ProcessType } from '../../process-registry/index.js';

export interface WeiboCollectSearchLinksInput {
  sessionId: string;
  keyword: string;
  env?: string;
  targetCount?: number;
  maxPages?: number;
  serviceUrl?: string;
}

export interface WeiboLinkEntry {
  statusId: string;
  userId: string;
  safeUrl: string;
  searchUrl: string;
  authorName?: string;
  contentPreview?: string;
  ts: string;
}

export interface WeiboCollectSearchLinksOutput {
  success: boolean;
  keywordDir: string;
  linksPath: string;
  initialCount: number;
  finalCount: number;
  addedCount: number;
  targetCount: number;
  stats: { pagesScraped: number; cardsFound: number };
  error?: string;
}

function sanitizeFilenamePart(value: string): string {
  return String(value || '').trim().replace(/[\\/:"*?<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);
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
    return content.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}

async function appendJsonl(filePath: string, value: any): Promise<void> {
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf-8');
}

export async function execute(input: WeiboCollectSearchLinksInput): Promise<WeiboCollectSearchLinksOutput> {
  const { sessionId, keyword, env = 'debug', targetCount, maxPages: _deprecatedMaxPages, serviceUrl = 'http://127.0.0.1:7704' } = input;
  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/command`;
  
  const rateLimiter = RateLimiter.getInstance();
  const processRegistry = ProcessRegistry.getInstance();
  
  // 注册进程
  await processRegistry.register('weibo-search' as ProcessType, profile, { keyword, env });
  
  const keywordDir = path.join(resolveDownloadRoot(), 'weibo', env, sanitizeFilenamePart(keyword));
  const linksPath = path.join(keywordDir, 'phase2-links.jsonl');
  await fs.mkdir(keywordDir, { recursive: true });
  
  const existingLinks = await readJsonl(linksPath);
  const initialCount = existingLinks.length;
  const seenStatusIds = new Set(existingLinks.map(l => l.statusId).filter(Boolean));
  
  async function controllerAction(action: string, args: any = {}): Promise<any> {
    const res = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args: { profileId: profile, ...args } }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined,
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw}`);
    try { return JSON.parse(raw); } catch { return { raw }; }
  }
  
  async function getCurrentUrl(): Promise<string> {
    const res = await controllerAction('evaluate', { script: 'window.location.href' });
    return res?.result ?? '';
  }
  
  // 滚动到底部（无需配额）
  async function scrollToBottom(): Promise<void> {
    await controllerAction('mouse:wheel', { deltaX: 0, deltaY: 3000 });
    await new Promise(r => setTimeout(r, 1500));
    await controllerAction('mouse:wheel', { deltaX: 0, deltaY: 3000 });
    await new Promise(r => setTimeout(r, 1500));
  }
  
  // 点击下一页（无需配额）
  async function clickNextPage(): Promise<{ clicked: boolean }> {
    const script = `(function() {
      var links = document.querySelectorAll('.m-page a');
      for (var i = 0; i < links.length; i++) {
        var txt = (links[i].textContent || '').trim();
        if (txt === '下一页' || txt.indexOf('下一页') >= 0) {
          links[i].click();
          return { clicked: true };
        }
      }
      return { clicked: false };
    })()`;
    const res = await controllerAction('evaluate', { script });
    return { clicked: res?.result?.clicked === true };
  }
  
  async function extractPostsFromPage(): Promise<WeiboLinkEntry[]> {
    const script = `(function() {
      var cards = document.querySelectorAll('.card-wrap');
      var results = [];
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var timeLink = card.querySelector('.from a');
        if (!timeLink) continue;
        var href = timeLink.getAttribute('href');
        if (!href || !href.includes('/')) continue;
        var statusMatch = href.match(/weibo[.]com[/][0-9]+[/]([A-Za-z0-9]+)/);
        var userMatch = href.match(/weibo[.]com[/]([0-9]+)[/]/);
        if (!statusMatch || !userMatch) continue;
        var statusId = statusMatch[1];
        var userId = userMatch[1];
        var authorEl = card.querySelector('.name a, .info a');
        var authorName = authorEl && authorEl.textContent ? authorEl.textContent.trim() : '';
        var contentEl = card.querySelector('.wbtext, .txt, [node-type="feed_list_content"], p');
        var contentPreview = contentEl && contentEl.textContent ? contentEl.textContent.trim().slice(0, 200) : '';
        results.push({
          statusId: statusId,
          userId: userId,
          safeUrl: 'https:' + href.replace(/\\?.*$/, ''),
          searchUrl: window.location.href,
          authorName: authorName,
          contentPreview: contentPreview,
          ts: new Date().toISOString()
        });
      }
      return results;
    })()`;
    const res = await controllerAction('evaluate', { script });
    const posts = res?.result ?? [];
    return Array.isArray(posts) ? posts : [];
  }
  
  try {
    // 申请搜索配额
    const searchPermit = await rateLimiter.acquire('search' as QuotaType, { keyword, profileId: profile });
    if (!searchPermit.granted) {
      const error = `搜索配额拒绝: ${searchPermit.reason}${searchPermit.waitMs ? `, 需等待 ${searchPermit.waitMs}ms` : ''}`;
      console.log(`[WeiboCollectLinks] ${error}`);
      return {
        success: false,
        keywordDir,
        linksPath,
        initialCount,
        finalCount: initialCount,
        addedCount: 0,
        targetCount,
        stats: { pagesScraped: 0, cardsFound: 0 },
        error,
      };
    }
    
    // 确保在搜索页
    let currentUrl = await getCurrentUrl();
    console.log('[WeiboCollectLinks] current URL:', currentUrl);
    
    if (!currentUrl.includes('s.weibo.com/weibo')) {
      const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`;
      console.log('[WeiboCollectLinks] navigating to:', searchUrl);
      await controllerAction('goto', { url: searchUrl });
      await new Promise(r => setTimeout(r, 3000));
      currentUrl = await getCurrentUrl();
    }
    
    // 记录搜索执行
    await rateLimiter.record('search' as QuotaType, { keyword, profileId: profile });
    
    let pagesScraped = 0;
    let cardsFound = 0;
    let pageNum = 1;
    const hasTarget = typeof targetCount === 'number' && targetCount > 0;
    
    while (true) {
      processRegistry.heartbeat();
      
      console.log(`[WeiboCollectLinks] Page ${pageNum}, collected: ${seenStatusIds.size}${hasTarget ? '/' + targetCount : ''}`);
      
      // 1. 滚动到底部
      await scrollToBottom();
      
      // 2. 采集帖子
      const posts = await extractPostsFromPage();
      console.log(`[WeiboCollectLinks] Page ${pageNum}: found ${posts.length} cards`);
      
      let newAdded = 0;
      for (const post of posts) {
        if (seenStatusIds.has(post.statusId)) continue;
        seenStatusIds.add(post.statusId);
        await appendJsonl(linksPath, post);
        newAdded++;
        cardsFound++;
        if (hasTarget && seenStatusIds.size >= targetCount) break;
      }
      console.log(`[WeiboCollectLinks] Added ${newAdded} new, total: ${seenStatusIds.size}`);
      
      pagesScraped++;
      
      if (hasTarget && seenStatusIds.size >= targetCount) {
        console.log(`[WeiboCollectLinks] Target reached: ${seenStatusIds.size}`);
        break;
      }
      
      // 3. 点击下一页
      const nextResult = await clickNextPage();
      if (!nextResult.clicked) {
        console.log(`[WeiboCollectLinks] No more pages`);
        break;
      }
      
      await new Promise(r => setTimeout(r, 3000));
      pageNum++;
    }
    
    const finalCount = seenStatusIds.size;
    
    await processRegistry.unregister();
    
    return {
      success: true,
      keywordDir,
      linksPath,
      initialCount,
      finalCount,
      addedCount: finalCount - initialCount,
      targetCount,
      stats: { pagesScraped, cardsFound },
    };
  } catch (error: any) {
    await processRegistry.unregister();
    
    return {
      success: false,
      keywordDir,
      linksPath,
      initialCount,
      finalCount: seenStatusIds.size,
      addedCount: seenStatusIds.size - initialCount,
      targetCount,
      stats: { pagesScraped: 0, cardsFound: 0 },
      error: error.message,
    };
  }
}
