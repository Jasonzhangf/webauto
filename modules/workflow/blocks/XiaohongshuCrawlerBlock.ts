import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface XiaohongshuCrawlerInput {
  sessionId: string;
  keyword: string;
  targetCount: number;
  serviceUrl?: string; // Unified API URL (http://127.0.0.1:7701)
  maxNoNew?: number;
  savePath?: string;
}

export interface XiaohongshuCrawlerOutput {
  success: boolean;
  collectedCount: number;
  savePath: string;
  error?: string;
}

// 辅助函数
function sanitizeName(name: string) {
  return (name || 'untitled').replace(/[\\/:*?"<>|.\s]/g, '_').trim().slice(0, 60);
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// 核心执行逻辑
export async function execute(input: XiaohongshuCrawlerInput): Promise<XiaohongshuCrawlerOutput> {
  const {
    sessionId, // 这里的 sessionId 实际上是 profileId
    keyword,
    targetCount = 50,
    serviceUrl = 'http://127.0.0.1:7701',
    maxNoNew = 10,
    savePath
  } = input;

  const profile = sessionId;
  const basePath = savePath 
    ? path.resolve(savePath)
    : path.join(os.homedir(), '.webauto', 'download', 'xiaohongshu', sanitizeName(keyword));

  // Helper for API calls
  async function post(endpoint: string, data: any) {
    const res = await fetch(`${serviceUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async function executeScript(script: string | (() => any)) {
    const scriptStr = typeof script === 'function' ? `(${script.toString()})()` : script;
    const res = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile,
        script: scriptStr
      }
    });
    return res.data?.result;
  }

  async function jsClick(selector: string, index = 0) {
    return executeScript(`() => {
      const els = document.querySelectorAll('${selector}');
      const el = els[${index}];
      if (el) { el.click(); return true; }
      return false;
    }`);
  }

  async function getCurrentUrl() {
    return executeScript(() => location.href);
  }

  async function downloadFile(url: string, dest: string, headers: any) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const buffer = await res.arrayBuffer();
      await fs.writeFile(dest, Buffer.from(buffer));
      return true;
    } catch (err: any) {
      console.warn(`[XiaohongshuCrawler] Download failed (${url}): ${err.message}`);
      return false;
    }
  }

  try {
    console.log(`[XiaohongshuCrawler] Starting crawler for "${keyword}"`);
    console.log(`[XiaohongshuCrawler] Save path: ${basePath}`);
    await fs.mkdir(basePath, { recursive: true });

    // 扫描已下载内容进行去重
    const collectedIds = new Set<string>();
    try {
      const existingDirs = await fs.readdir(basePath);
      existingDirs.forEach(dir => {
        const parts = dir.split('_');
        const possibleId = parts[parts.length - 1];
        if (possibleId && possibleId.length > 10) {
          collectedIds.add(possibleId);
        }
      });
      console.log(`[XiaohongshuCrawler] Found ${collectedIds.size} already downloaded notes.`);
    } catch {}

    // 获取 Headers
    const browserData: any = await executeScript(() => ({
      ua: navigator.userAgent,
      cookie: document.cookie
    }));
    const headers = {
      'User-Agent': browserData?.ua || 'Mozilla/5.0',
      'Cookie': browserData?.cookie || '',
      'Referer': 'https://www.xiaohongshu.com/'
    };

    let processedIndex = 0;
    let noNewCount = 0;
    let sessionCollectedCount = 0;

    // 搜索列表获取脚本
    const getSearchItemsScript = (startIndex: number) => `() => {
      const items = [];
      const els = document.querySelectorAll('.note-item');
      for (let i = ${startIndex}; i < els.length; i++) {
        const el = els[i];
        const linkEl = el.querySelector('a');
        const href = linkEl ? linkEl.href : '';
        let noteId = '';
        if (href) {
          const match = href.match(/\\/explore\\/([a-f0-9]+)/);
          if (match) noteId = match[1];
        }
        if (noteId) {
          let title = el.textContent.replace(/\\n/g, ' ').trim().substring(0, 50);
          items.push({ index: i, noteId, title });
        }
      }
      return items;
    }`;

    while (sessionCollectedCount < targetCount && noNewCount < maxNoNew) {
      const items: any[] = await executeScript(getSearchItemsScript(processedIndex));

      if (!items || items.length === 0) {
        noNewCount++;
        console.log(`[XiaohongshuCrawler] No new items, scrolling (${noNewCount}/${maxNoNew})`);
        await post('/v1/controller/action', {
          action: 'user_action',
          payload: { profile, operation_type: 'scroll', target: { deltaY: 800 } }
        });
        await delay(2000);
        continue;
      }

      noNewCount = 0;

      for (const item of items) {
        if (sessionCollectedCount >= targetCount) break;
        processedIndex = Math.max(processedIndex, item.index + 1);

        if (collectedIds.has(item.noteId)) {
          continue;
        }

        console.log(`[XiaohongshuCrawler] Processing [${sessionCollectedCount + 1}/${targetCount}] ${item.title}`);

        // 点击进入详情
        const clicked = await jsClick('.note-item a', item.index);
        if (!clicked) {
          console.warn('[XiaohongshuCrawler] Click failed');
          continue;
        }

        await delay(3000);

        const url: string = await getCurrentUrl();
        if (!url.includes('/explore/')) {
          console.warn('[XiaohongshuCrawler] Not in detail page, skipping');
          continue;
        }

        // 评论深度加载逻辑
        await executeScript(async () => {
          const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
          
          let scroller = document.querySelector('.note-scroller') || 
                         document.querySelector('#noteContainer') || 
                         document.querySelector('.note-content-container');
          
          if (!scroller && document.querySelector('.note-detail-mask')) {
             const commentsEl = document.querySelector('.comments-container');
             if (commentsEl) scroller = commentsEl.parentElement;
          }
          
          const target = scroller || window;
          const isWindow = !scroller;
          
          const scrollBottom = () => {
            if (isWindow) window.scrollTo(0, document.body.scrollHeight);
            else target.scrollTop = target.scrollHeight;
          };

          let noChangeCount = 0;
          let prevHeight = 0;
          let prevCommentCount = 0;
          const MAX_CYCLES = 20;

          for (let i = 0; i < MAX_CYCLES; i++) {
            scrollBottom();
            await sleep(1000);

            const expandBtns = Array.from(document.querySelectorAll('.reply-expand, .show-more, .expand-btn'));
            let clickedCount = 0;
            for (const btn of expandBtns) {
              if (btn.offsetParent !== null && !(btn as any).dataset.clicked) {
                (btn as HTMLElement).click();
                (btn as any).dataset.clicked = 'true';
                clickedCount++;
                await sleep(300);
              }
            }

            const currentHeight = isWindow ? document.body.scrollHeight : target.scrollHeight;
            const currentCommentCount = document.querySelectorAll('.comment-item').length;
            
            if (currentHeight === prevHeight && clickedCount === 0 && currentCommentCount === prevCommentCount) {
              noChangeCount++;
              if (noChangeCount >= 3) break;
            } else {
              noChangeCount = 0;
            }
            
            prevHeight = currentHeight;
            prevCommentCount = currentCommentCount;
            await sleep(500 + Math.random() * 500);
          }
        });

        // 提取数据
        const data: any = await executeScript(() => {
          const getText = (sel: string) => {
            const el = document.querySelector(sel);
            return el ? (el as HTMLElement).innerText.trim() : '';
          };

          const d: any = {
            title: getText('.note-detail-title, .title, h1') || '无标题',
            content: getText('.note-content, .desc, .content, #detail-desc'),
            date: getText('.date, .bottom-container .time'),
            author: { name: 'Unknown', id: '', link: '' },
            images: [],
            comments: []
          };

          const authorNameEl = document.querySelector('.author-container .name, .author-wrapper .name');
          if (authorNameEl) d.author.name = (authorNameEl as HTMLElement).innerText.trim();
          
          const authorLinkEl = document.querySelector('.author-container .info, .author-wrapper');
          if (authorLinkEl && (authorLinkEl as HTMLAnchorElement).href) {
            d.author.link = (authorLinkEl as HTMLAnchorElement).href;
            const match = d.author.link.match(/\/user\/profile\/([a-f0-9]+)/);
            if (match) d.author.id = match[1];
          }

          document.querySelectorAll('.note-slider-image').forEach(div => {
            const bg = window.getComputedStyle(div).backgroundImage;
            const match = bg.match(/url\(["']?([^"']+)["']?\)/);
            if (match) d.images.push(match[1]);
          });
          document.querySelectorAll('.note-slider-image img, .note-content img').forEach(img => {
            const src = (img as HTMLImageElement).src;
            if (src && !d.images.includes(src)) d.images.push(src);
          });

          const commentItems = document.querySelectorAll('.comment-item');
          commentItems.forEach(item => {
            const extractOne = (el: Element) => {
              const userEl = el.querySelector('.name, .user-name');
              const contentEl = el.querySelector('.content, .comment-content');
              const linkEl = el.querySelector('a.avatar, a.name');
              if (!userEl || !contentEl) return null;
              
              let userId = '';
              if (linkEl && (linkEl as HTMLAnchorElement).href) {
                const match = (linkEl as HTMLAnchorElement).href.match(/\/user\/profile\/([a-f0-9]+)/);
                if (match) userId = match[1];
              }
              
              return {
                user: (userEl as HTMLElement).innerText.trim(),
                userId: userId,
                text: (contentEl as HTMLElement).innerText.trim()
              };
            };

            const rootComment: any = extractOne(item);
            if (rootComment) {
              const replies: any[] = [];
              const replyEls = item.querySelectorAll('.reply-list .comment-item, .reply-container .comment-item');
              replyEls.forEach(replyEl => {
                const reply = extractOne(replyEl);
                if (reply) replies.push(reply);
              });
              rootComment.replies = replies;
              d.comments.push(rootComment);
            }
          });
          return d;
        });

        data.link = url;

        // 保存文件
        const dirName = `${sanitizeName(data.title)}_${item.noteId}`;
        const noteDir = path.join(basePath, dirName);
        const imagesDir = path.join(noteDir, 'images');
        await fs.mkdir(imagesDir, { recursive: true });

        const savedImages: string[] = [];
        for (let i = 0; i < data.images.length; i++) {
          let imgUrl = data.images[i];
          if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
          const ext = imgUrl.includes('png') ? '.png' : '.jpg';
          const filename = `${i + 1}${ext}`;
          const destPath = path.join(imagesDir, filename);
          
          let success = false;
          for (let r = 0; r < 3; r++) {
            success = await downloadFile(imgUrl, destPath, headers);
            if (success) break;
            await delay(1000);
          }
          if (success) savedImages.push(`./images/${filename}`);
          else savedImages.push(imgUrl);
          await delay(200);
        }

        let md = `# ${data.title}\n\n`;
        md += `- **作者**: ${data.author.name} (ID: ${data.author.id}) [主页](${data.author.link})\n`;
        md += `- **发布时间**: ${data.date}\n`;
        md += `- **原文链接**: ${data.link}\n`;
        md += `- **Note ID**: ${item.noteId}\n\n`;
        md += `## 正文\n\n${data.content}\n\n`;
        md += `## 图片\n\n${savedImages.map(img => `![](${img})`).join('\n')}\n\n`;
        md += `## 评论 (${data.comments.length})\n\n`;
        data.comments.forEach((c: any, idx: number) => {
          md += `### ${idx + 1}. ${c.user} (ID: ${c.userId})\n${c.text}\n\n`;
          if (c.replies && c.replies.length) {
            c.replies.forEach((r: any) => md += `> **${r.user}** (${r.userId}): ${r.text}\n>\n`);
          }
          md += `\n`;
        });

        await fs.writeFile(path.join(noteDir, 'content.md'), md, 'utf-8');
        console.log(`[XiaohongshuCrawler] Saved: ${dirName}`);
        
        collectedIds.add(item.noteId);
        sessionCollectedCount++;

        // 关闭弹窗
        await post('/v1/controller/action', {
          action: 'user_action',
          payload: { profile, operation_type: 'key', target: { key: 'Escape' } }
        });
        await delay(1500);
      }

      // 翻页
      await post('/v1/controller/action', {
        action: 'user_action',
        payload: { profile, operation_type: 'scroll', target: { deltaY: 800 } }
      });
      await delay(2000);
    }

    return {
      success: true,
      collectedCount: sessionCollectedCount,
      savePath: basePath
    };

  } catch (err: any) {
    console.error(`[XiaohongshuCrawler] Error: ${err.message}`);
    return {
      success: false,
      collectedCount: 0,
      savePath: basePath,
      error: err.message
    };
  }
}
