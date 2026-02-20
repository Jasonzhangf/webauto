/**
 * Workflow Block: WeiboCollectSearchLinksBlock
 *
 * Phase2: 在微博搜索结果页采集帖子链接
 * - 支持分页翻页
 * - 滚动加载结果
 * - 提取每条帖子的详情链接 (weibo.com/{userid}/{statusid})
 * - 保存到 phase2-links.jsonl
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface WeiboCollectSearchLinksInput {
  sessionId: string;
  keyword: string;
  env?: string;
  targetCount: number;
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
  stats: {
    pagesScraped: number;
    cardsFound: number;
  };
  error?: string;
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

async function appendJsonl(filePath: string, value: any): Promise<void> {
  const line = `${JSON.stringify(value)}\n`;
  await fs.appendFile(filePath, line, 'utf-8');
}

export async function execute(input: WeiboCollectSearchLinksInput): Promise<WeiboCollectSearchLinksOutput> {
  const {
    sessionId,
    keyword,
    env = 'debug',
    targetCount,
    maxPages = 10,
    serviceUrl = 'http://127.0.0.1:7704',
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/command`;
  
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
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  
  async function getCurrentUrl(): Promise<string> {
    const res = await controllerAction('evaluate', { script: 'window.location.href' });
    return res?.result ?? '';
  }
  
  async function getCurrentPage(): Promise<number> {
    const script = `(() => {
      const currentPage = document.querySelector('.m-page li.cur a, .m-page a.cur');
      if (currentPage) {
        const match = currentPage.textContent.match(/第(\\d+)页/) || currentPage.href.match(/page=(\\d+)/);
        return match ? parseInt(match[1]) : 1;
      }
      return 1;
    })()`;
    const res = await controllerAction('evaluate', { script });
    return res?.result ?? 1;
  }
  
  async function goToNextPage(): Promise<boolean> {
    const script = `(() => {
      const nextLinks = Array.from(document.querySelectorAll('.m-page a')).filter(function(a) {
        return a.textContent && a.textContent.includes('下一页');
      });
      if (nextLinks.length > 0) {
        return { has: true, url: nextLinks[0].href };
      }
      const current = document.querySelector('.m-page li.cur a');
      if (current) {
        const currentMatch = current.href.match(/page=(\\d+)/);
        if (currentMatch) {
          const nextNum = parseInt(currentMatch[1]) + 1;
          const nextLink = document.querySelector('.m-page a[href*="page=' + nextNum + '"]');
          if (nextLink) {
            return { has: true, url: nextLink.href };
          }
        }
      }
      return { has: false };
    })()`;
    const res = await controllerAction('evaluate', { script });
    const result = res?.result;
    
    if (result?.has && result?.url) {
      await controllerAction('goto', { url: result.url });
      await new Promise(r => setTimeout(r, 2000));
      return true;
    }
    return false;
  }
  
  async function scrollDown(): Promise<void> {
    await controllerAction('mouse:wheel', { deltaX: 0, deltaY: 800 });
    await new Promise(r => setTimeout(r, 1000));
  }
  
  async function extractPostsFromPage(): Promise<WeiboLinkEntry[]> {
    const script = `(() => {
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
    console.log("[WeiboCollectLinks] raw evaluate result:", JSON.stringify(res));
    return Array.isArray(posts) ? posts : [];
  }
  
  async function getCardsOnPage(): Promise<number> {
    const script = 'document.querySelectorAll(".card-wrap").length';
    const res = await controllerAction('evaluate', { script });
    return res?.result ?? 0;
  }
  
  async function waitForSearchResults(timeout = 15000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const currentUrl = await getCurrentUrl();
      console.log("[WeiboCollectLinks] waiting for search page, current URL:", currentUrl);
      if (currentUrl.includes('s.weibo.com/weibo') || currentUrl.includes('s.weibo.com/article')) {
        const count = await getCardsOnPage();
        if (count > 0) {
          console.log("[WeiboCollectLinks] search results loaded:", count, "cards");
          return true;
        }
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }
  
  async function ensureOnSearchPage(): Promise<boolean> {
    const currentUrl = await getCurrentUrl();
    console.log("[WeiboCollectLinks] current URL:", currentUrl);
    
    if (currentUrl.includes('s.weibo.com/weibo')) {
      // 已经在搜索页，检查是否有结果
      const count = await getCardsOnPage();
      if (count > 0) {
        console.log("[WeiboCollectLinks] already on search page with", count, "cards");
        return true;
      }
    }
    
    // 导航到搜索页
    const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`;
    console.log("[WeiboCollectLinks] navigating to:", searchUrl);
    await controllerAction('goto', { url: searchUrl });
    await new Promise(r => setTimeout(r, 3000));
    
    return await waitForSearchResults();
  }
  
  try {
    // 确保在搜索结果页
    const onSearchPage = await ensureOnSearchPage();
    
    if (!onSearchPage) {
      const finalUrl = await getCurrentUrl();
      return {
        success: false,
        keywordDir,
        linksPath,
        initialCount,
        finalCount: initialCount,
        addedCount: 0,
        targetCount,
        stats: { pagesScraped: 0, cardsFound: 0 },
        error: 'Failed to load search results page: ' + finalUrl,
      };
    }
    
    // 额外等待确保页面加载完成
    await new Promise(r => setTimeout(r, 1000));
    
    let pagesScraped = 0;
    let cardsFound = 0;
    let currentPage = 1;
    
    while (pagesScraped < maxPages && seenStatusIds.size < targetCount + initialCount) {
      console.log('[WeiboCollectLinks] Page ' + currentPage + ', collected: ' + seenStatusIds.size + '/' + (targetCount + initialCount));
      
      let prevCards = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 5;
      
      while (scrollAttempts < maxScrollAttempts) {
        const currentCards = await getCardsOnPage();
        if (currentCards === prevCards) break;
        prevCards = currentCards;
        await scrollDown();
        scrollAttempts++;
      }
      
      const posts = await extractPostsFromPage();
      console.log('[WeiboCollectLinks] extractPostsFromPage returned:', posts.length);
      if (posts.length > 0) {
        console.log('[WeiboCollectLinks] first post:', JSON.stringify(posts[0]));
      }
      let newAdded = 0;
      
      for (const post of posts) {
        if (seenStatusIds.has(post.statusId)) continue;
        
        seenStatusIds.add(post.statusId);
        await appendJsonl(linksPath, post);
        newAdded++;
        cardsFound++;
        
        if (seenStatusIds.size >= targetCount + initialCount) break;
      }
      
      console.log('[WeiboCollectLinks] Page ' + currentPage + ': ' + posts.length + ' cards, ' + newAdded + ' new');
      
      pagesScraped++;
      
      if (seenStatusIds.size < targetCount + initialCount) {
        const hasNext = await goToNextPage();
        if (!hasNext) {
          console.log('[WeiboCollectLinks] No more pages');
          break;
        }
        currentPage++;
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    
    const finalCount = seenStatusIds.size;
    
    return {
      success: true,
      keywordDir,
      linksPath,
      initialCount,
      finalCount,
      addedCount: finalCount - initialCount,
      targetCount,
      stats: {
        pagesScraped,
        cardsFound,
      },
    };
  } catch (error: any) {
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
