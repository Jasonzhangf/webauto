#!/usr/bin/env node
/**
 * 最终版微博采集器 - 拟人化滚动版 (Fix Regex 2)
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

class HumanExtractor {
  constructor() {
    this.collectedPosts = [];
    this.processedUrls = new Set();
    this.scrollCount = 0;
    this.currentHeight = 0;
    this.heightUnchangedCount = 0;
    this.lastHeightChangeTime = Date.now();
    this.HEIGHT_CHECK_COUNT = 20; 
    this.HEIGHT_CHECK_DELAY = 3000;
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
                const path = url.pathname;
                // Avoid using regex literals inside template string
                if (url.hostname === 'weibo.com' && (
                    path.includes('/status/') || 
                    path.includes('/detail/') ||
                    (path.split('/').length === 4 && !isNaN(parseInt(path.split('/')[2])))
                )) {
                  postUrl = url.href;
                  break;
                }
              } catch {}
            }

            for (const link of links) {
              const href = link.href || '';
              if (href.includes('/u/') || (href.includes('weibo.com') && href.split('/').length === 4 && !isNaN(parseInt(href.split('/')[3])))) {
                authorUrl = href;
                author = link.getAttribute('aria-label') || link.textContent.trim();
                if (author) break;
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
        log('SCROLL', `Height unchanged ${this.heightUnchangedCount}/${this.HEIGHT_CHECK_COUNT} (${newHeight}px)`);
        this.lastHeightChangeTime = now;
      }
    } else {
      log('SCROLL', `Height changed: ${this.currentHeight} -> ${newHeight}`);
      this.currentHeight = newHeight;
      this.heightUnchangedCount = 0;
      this.lastHeightChangeTime = Date.now();
    }

    return this.heightUnchangedCount >= this.HEIGHT_CHECK_COUNT;
  }

  async scrollPage() {
    await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          const height = document.body.scrollHeight;
          const current = window.scrollY;
          
          // Random scroll down amount (600-1000)
          const scrollDown = 600 + Math.floor(Math.random() * 400);
          
          // Scroll down
          window.scrollTo({
            top: current + scrollDown,
            behavior: 'smooth'
          });
          
          setTimeout(() => {
             // 50% chance to scroll up a bit
             if (Math.random() > 0.5) {
                 const scrollUp = 200 + Math.floor(Math.random() * 300);
                 window.scrollBy({
                    top: -scrollUp,
                    behavior: 'smooth'
                 });
                 
                 setTimeout(() => {
                     window.scrollTo({
                        top: document.body.scrollHeight,
                        behavior: 'smooth'
                     });
                 }, 1000 + Math.random() * 1500);
             } else {
                 window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: 'smooth'
                 });
             }
          }, 800 + Math.random() * 800);
        `
      }
    });
    this.scrollCount++;
    log('SCROLL', `Scrolled page (Humanized), count: ${this.scrollCount}`);
  }

  async collectLoop() {
    await new Promise(r => setTimeout(r, 5000));

    while (this.collectedPosts.length < TARGET_COUNT) {
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

      const atBottom = await this.checkScrollHeight();
      if (atBottom) {
        log('SCROLL', 'Reached bottom of page (max retries reached)');
        break;
      }

      await this.scrollPage();
      
      const waitTime = 3000 + Math.floor(Math.random() * 3000);
      await new Promise(r => setTimeout(r, waitTime));
    }
  }

  async generateMarkdown() {
    const fs = await import('fs/promises');
    
    const lines = [
      '# 微博主页采集结果 (拟人版)',
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
    const filename = 'weibo_posts_200_human.md';
    await fs.writeFile(filename, content, 'utf-8');
    log('OUTPUT', `Markdown saved to: ${filename}`);
    
    console.log('\n📋 Collection Summary:');
    console.log(`   ✅ Total posts: ${this.collectedPosts.length}`);
    console.log(`   📁 Output file: ${filename}`);
    console.log(`   📜 Scroll count: ${this.scrollCount}`);
    console.log('\n🎉 Collection completed!');
  }

  async start() {
    try {
      log('INIT', 'Starting humanized extraction (Target: 200)');
      await this.collectLoop();
      await this.generateMarkdown();
    } catch (err) {
      log('ERROR', err.message);
      console.error(err);
    }
  }
}

new HumanExtractor().start().catch(console.error);
