#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 持久化微博采集器 - 支持刷新页面以获取更多数据
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

class PersistentExtractor {
  constructor() {
    this.collectedPosts = [];
    this.processedUrls = new Set();
    this.scrollCount = 0;
    this.currentHeight = 0;
    this.heightUnchangedCount = 0;
    this.lastHeightChangeTime = Date.now();
    this.HEIGHT_CHECK_COUNT = 3; // Reduced to fail faster and reload
    this.HEIGHT_CHECK_DELAY = 4000;
    this.reloadCount = 0;
    this.MAX_RELOADS = 10;
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

            // Find post link
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

            // Find author link
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
      throw new Error(result.error || 'Execution failed');
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

    if (!result.success) {
      log('ERROR', 'Failed to check scroll height');
      return false;
    }

    const newHeight = result.data?.result?.height || 0;

    if (newHeight === this.currentHeight) {
      const now = Date.now();
      if (now - this.lastHeightChangeTime >= this.HEIGHT_CHECK_DELAY) {
        this.heightUnchangedCount++;
        log('SCROLL', `Height unchanged ${this.heightUnchangedCount}/${this.HEIGHT_CHECK_COUNT}`);
        this.lastHeightChangeTime = now;
      }
    } else {
      this.currentHeight = newHeight;
      this.heightUnchangedCount = 0;
      this.lastHeightChangeTime = Date.now();
      log('SCROLL', `New height: ${newHeight}px`);
    }

    return this.heightUnchangedCount >= this.HEIGHT_CHECK_COUNT;
  }

  async scrollPage() {
    await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          window.scrollTo(0, document.body.scrollHeight);
          setTimeout(() => {
            window.scrollBy(0, -300); // Wiggle up
            setTimeout(() => {
              window.scrollTo(0, document.body.scrollHeight); // Scroll down again
            }, 1000);
          }, 1000);
        `
      }
    });
    this.scrollCount++;
    log('SCROLL', `Scrolled page, count: ${this.scrollCount}`);
  }

  async reloadPage() {
    log('RELOAD', 'Refreshing page to get new content...');
    await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: 'window.location.reload()'
      }
    });
    
    // Reset scroll state
    this.currentHeight = 0;
    this.heightUnchangedCount = 0;
    this.scrollCount = 0;
    this.reloadCount++;
    
    // Wait for reload
    await new Promise(r => setTimeout(r, 10000));
  }

  async collectLoop() {
    while (this.collectedPosts.length < TARGET_COUNT) {
      // 1. Extract
      const posts = await this.executeExtraction();
      let newPostsCount = 0;

      for (const post of posts) {
        if (this.collectedPosts.length >= TARGET_COUNT) break;
        if (!post.url || this.processedUrls.has(post.url)) continue;

        this.processedUrls.add(post.url);
        this.collectedPosts.push(post);
        newPostsCount++;
      }
      
      if (newPostsCount > 0) {
        log('COLLECT', `Got ${newPostsCount} new posts. Total: ${this.collectedPosts.length}/${TARGET_COUNT}`);
      }

      if (this.collectedPosts.length >= TARGET_COUNT) {
        log('DONE', 'Target count reached!');
        break;
      }

      // 2. Check Height & Scroll
      const atBottom = await this.checkScrollHeight();
      
      if (atBottom) {
        log('SCROLL', 'Reached bottom of page or stuck');
        
        if (this.reloadCount < this.MAX_RELOADS) {
          await this.reloadPage();
          continue; // Restart loop after reload
        } else {
          log('DONE', 'Max reloads reached');
          break;
        }
      }

      await this.scrollPage();
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  async generateMarkdown() {
    const fs = await import('fs/promises');
    
    const lines = [
      '# 微博主页采集结果 (持久化版)',
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
      
      lines.push('---');
      lines.push('');
    });

    const content = lines.join('\n');
    const filename = 'weibo_posts_200_persistent.md';
    await fs.writeFile(filename, content, 'utf-8');
    log('OUTPUT', `Markdown saved to: ${filename}`);
    
    console.log('\n📋 Collection Summary:');
    console.log(`   ✅ Total posts: ${this.collectedPosts.length}`);
    console.log(`   🔄 Reloads: ${this.reloadCount}`);
    console.log(`   📁 Output file: ${filename}`);
  }

  async start() {
    try {
      log('INIT', 'Starting persistent extraction (Target: 200)');
      await this.collectLoop();
      await this.generateMarkdown();
    } catch (err) {
      log('ERROR', err.message);
      console.error(err);
      // Try to save whatever we have
      await this.generateMarkdown();
    }
  }
}

new PersistentExtractor().start().catch(console.error);
