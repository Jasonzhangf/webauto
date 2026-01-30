#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 微博采集器 (鼠标滚动版)
 * 
 * 改进点：
 * 1. 使用 page.mouse.wheel 替代 window.scrollTo
 * 2. 模拟真实鼠标滚轮事件以触发懒加载
 * 3. 增加鼠标移动模拟
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const TARGET_COUNT = 200;

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sendMouseWheel(deltaY) {
  // Use user_action with operation_type: scroll
  const result = await post('/v1/controller/action', {
    action: 'browser:execute', // We need to use browser:execute to access page directly or implement new command
    // But currently controller doesn't expose mouse.wheel directly via browser:execute easily
    // Let's try to use the WebSocket command structure via a custom action if possible
    // OR: rely on the fact that we found the handler in ws-server.ts:
    // command_type: 'user_action', action: 'operation', parameters: { operation_type: 'scroll', deltaY }
    
    // Since we are using controller HTTP API, we might need to use a raw protocol command if controller supports it
    // If controller supports relaying raw WS commands, that would be best.
    
    // Alternative: Use browser:execute with CDP or Puppeteer/Playwright if exposed in context
    // But context usually only has window/document.
    
    // Let's try the 'user_action' command via the Unified API's proxy capability if it exists
    // The controller seems to expose 'browser:execute' which runs JS in page context.
    // It doesn't seem to expose raw mouse events directly via HTTP.
    
    // However, we saw in ws-server.ts that it handles 'user_action'.
    // Let's try to send a raw command if the Unified API allows it.
    // The Unified API has a /command endpoint that might proxy to browser service.
  });
}

// Better approach: Use the browser-service directly via its HTTP endpoint for mouse actions if possible
// Or use the Unified API's pass-through.

async function sendBrowserCommand(command) {
  // The Unified API forwards commands to browser service
  // Try using the 'browser:execute' with a special script? No.
  
  // Let's try to use the raw browser service command via the Unified API
  // Unified API maps POST /command to browser service? 
  // Let's check services/unified-api/message-routes.ts or similar
}

// Actually, let's use the mouse.wheel via the exposed websocket interface which we can connect to
import WebSocket from 'ws';

class MouseScrollExtractor {
  constructor() {
    this.ws = null;
    this.collectedPosts = [];
    this.processedUrls = new Set();
    this.scrollCount = 0;
    this.currentHeight = 0;
    this.heightUnchangedCount = 0;
    this.HEIGHT_CHECK_COUNT = 10;
    this.HEIGHT_CHECK_DELAY = 3000;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      // Connect to Browser Service WS directly or via Unified API Bus?
      // ws-server.ts is listening on 8765. Let's try connecting there for direct control
      this.ws = new WebSocket('ws://127.0.0.1:8765');
      
      this.ws.on('open', () => {
        log('SYSTEM', 'Connected to Browser Service WS');
        resolve();
      });
      
      this.ws.on('error', (err) => {
        log('ERROR', `WebSocket error: ${err.message}`);
        reject(err);
      });
      
      this.ws.on('message', (data) => {
        // Handle responses
      });
    });
  }

  async mouseScroll(deltaY) {
    if (!this.ws) await this.connect();
    
    const command = {
      id: Date.now(),
      action: 'user_action',
      session_id: PROFILE,
      data: {
        command_type: 'user_action',
        action: 'operation',
        parameters: {
          operation_type: 'scroll',
          deltaY: deltaY
        }
      }
    };
    
    this.ws.send(JSON.stringify(command));
    // log('SCROLL', `Sent mouse wheel delta: ${deltaY}`);
  }
  
  async mouseMove(x, y) {
    if (!this.ws) await this.connect();
    
    const command = {
      id: Date.now(),
      action: 'user_action',
      session_id: PROFILE,
      data: {
        command_type: 'user_action',
        action: 'operation',
        parameters: {
          operation_type: 'move',
          target: { x, y }
        }
      }
    };
    
    this.ws.send(JSON.stringify(command));
  }

  async executeExtraction() {
    const result = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `(() => {
          const articles = Array.from(document.querySelectorAll('article'));
          const results = [];

          for (const article of articles) {
            const links = Array.from(article.querySelectorAll('a[href]'));
            let postUrl = null;
            let authorUrl = null;
            let author = '';
            let content = '';
            let timestamp = '';

            for (const link of links) {
              const href = link.href || '';
              try {
                const url = new URL(href, window.location.origin);
                if (url.hostname === 'weibo.com' && /^\/\d+\/[A-Za-z0-9]+$/.test(url.pathname)) {
                  postUrl = url.href;
                  break;
                }
              } catch {}
            }

            for (const link of links) {
              const href = link.href || '';
              if (href.includes('/u/')) {
                authorUrl = href;
                author = link.getAttribute('aria-label') || link.textContent.trim();
                break;
              }
            }

            const contentEl = article.querySelector('[class*="detail_wbtext"]');
            const timeEl = article.querySelector('time');

            if (contentEl) content = contentEl.textContent.trim();
            if (timeEl) timestamp = timeEl.textContent.trim();

            if (postUrl && content) {
              results.push({
                author,
                content,
                url: postUrl,
                authorUrl,
                timestamp
              });
            }
          }

          return results;
        })()`
      }
    });

    if (!result.success) {
      // Don't throw, just return empty to keep loop running
      return [];
    }

    return result.data?.result || [];
  }

  async checkScrollHeight() {
    const result = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: '() => ({ height: document.body.scrollHeight })'
      }
    });

    if (!result.success) return false;

    const newHeight = result.data?.result?.height || 0;

    if (newHeight === this.currentHeight) {
      this.heightUnchangedCount++;
      log('SCROLL', `Height unchanged ${this.heightUnchangedCount}/${this.HEIGHT_CHECK_COUNT} (${newHeight}px)`);
    } else {
      log('SCROLL', `Height changed: ${this.currentHeight} -> ${newHeight}`);
      this.currentHeight = newHeight;
      this.heightUnchangedCount = 0;
    }

    return this.heightUnchangedCount >= this.HEIGHT_CHECK_COUNT;
  }

  async collectLoop() {
    await this.connect();
    
    // Initial wait
    await new Promise(r => setTimeout(r, 5000));

    while (this.collectedPosts.length < TARGET_COUNT) {
      // 1. Extract
      const posts = await this.executeExtraction();
      let newPosts = 0;

      for (const post of posts) {
        if (this.collectedPosts.length >= TARGET_COUNT) break;
        if (!post.url || this.processedUrls.has(post.url)) continue;

        this.processedUrls.add(post.url);
        this.collectedPosts.push(post);
        newPosts++;
      }
      
      if (newPosts > 0) {
        log('COLLECT', `Collected ${newPosts} new posts. Total: ${this.collectedPosts.length}/${TARGET_COUNT}`);
        this.heightUnchangedCount = 0;
      }

      if (this.collectedPosts.length >= TARGET_COUNT) {
        log('DONE', 'Target count reached!');
        break;
      }

      // 2. Check Height
      const atBottom = await this.checkScrollHeight();
      if (atBottom) {
        log('SCROLL', 'Reached bottom of page (max retries reached)');
        break;
      }

      // 3. Mouse Scroll Action
      // Scroll down in small increments
      for (let i = 0; i < 5; i++) {
        await this.mouseScroll(200);
        await new Promise(r => setTimeout(r, 200));
      }
      
      // Occasionally move mouse to center
      if (Math.random() > 0.7) {
        await this.mouseMove(
          500 + Math.floor(Math.random() * 200), 
          400 + Math.floor(Math.random() * 200)
        );
      }
      
      // Wait for content load
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  async generateMarkdown() {
    const fs = await import('fs/promises');
    
    const lines = [
      '# 微博主页采集结果 (鼠标滚动版)',
      '',
      `采集时间：${new Date().toLocaleString('zh-CN')}`,
      `帖子数量：${this.collectedPosts.length}`,
      '',
      '---',
      ''
    ];

    this.collectedPosts.forEach((post, index) => {
      lines.push(`## ${index + 1}. ${post.author || '未知作者'}`);
      lines.push('');
      
      if (post.content) {
        lines.push(`**内容：** ${post.content.substring(0, 500)}${post.content.length > 500 ? '...' : ''}`);
        lines.push('');
      }
      
      if (post.url) {
        lines.push(`**链接：** ${post.url}`);
        lines.push('');
      }
      
      if (post.timestamp) {
        lines.push(`**时间：** ${post.timestamp}`);
        lines.push('');
      }
      
      if (post.authorUrl) {
        lines.push(`**作者链接：** ${post.authorUrl}`);
        lines.push('');
      }
      
      lines.push('---');
      lines.push('');
    });

    const content = lines.join('\n');
    const filename = 'weibo_posts_200_mouse.md';
    await fs.writeFile(filename, content, 'utf-8');
    log('OUTPUT', `Markdown saved to: ${filename}`);
    
    console.log('\n📋 Collection Summary:');
    console.log(`   ✅ Total posts: ${this.collectedPosts.length}`);
    console.log(`   📁 Output file: ${filename}`);
    console.log('\n🎉 Collection completed!');
  }

  async start() {
    try {
      log('INIT', 'Starting mouse scroll extraction (Target: 200)');
      await this.collectLoop();
      await this.generateMarkdown();
    } catch (err) {
      log('ERROR', err.message);
      console.error(err);
    } finally {
      if (this.ws) this.ws.close();
    }
  }
}

new MouseScrollExtractor().start().catch(console.error);
