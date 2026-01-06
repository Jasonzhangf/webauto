#!/usr/bin/env node
/**
 * 最终版微博采集器 - 采集 200 条
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const TARGET_COUNT = 200;

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log('[' + time + '] [' + step + '] ' + msg);
}

async function post(endpoint, data) {
  const res = await fetch(UNIFIED_API + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + await res.text());
  return res.json();
}

class FinalExtractor {
  constructor() {
    this.collectedPosts = [];
    this.processedUrls = new Set();
    this.scrollCount = 0;
    this.currentHeight = 0;
    this.heightUnchangedCount = 0;
    this.lastHeightChangeTime = Date.now();
    this.HEIGHT_CHECK_COUNT = 3;
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

          for (const article of articles.slice(0, 30)) {
            const links = Array.from(article.querySelectorAll('a[href]'));
            let postUrl = null;
            let authorUrl = null;
            let author = '';
            let content = '';
            let timestamp = '';

            // Find post link (contains /status/ or /detail/)
            for (const link of links) {
              const href = link.href || '';
              if (href.includes('/status/') || href.includes('/detail/')) {
                postUrl = href;
                break;
              }
            }

            // Find author link
            for (const link of links) {
              const href = link.href || '';
              if (href.includes('/u/')) {
                authorUrl = href;
                const authorEl = link;
                author = authorEl.textContent ? authorEl.textContent.trim() : '';
                break;
              }
            }

            // Extract content
            const contentEl = article.querySelector('[class*="detail_wbtext"]');
            if (contentEl) {
              content = contentEl.textContent.trim();
            }

            // Extract timestamp
            const timeEl = article.querySelector('time');
            if (timeEl) {
              timestamp = timeEl.textContent.trim();
            }

            if (postUrl) {
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
        script: '() => ({ height: document.body.scrollHeight, viewportHeight: window.innerHeight })'
      }
    });
    
    if (!result.success) {
      log('ERROR', 'Failed to check scroll height');
      return false;
    }
    
    const data = result.data?.result || {};
    const newHeight = data.height || 0;
    
    if (newHeight === this.currentHeight) {
      const now = Date.now();
      if (now - this.lastHeightChangeTime >= this.HEIGHT_CHECK_DELAY) {
        this.heightUnchangedCount++;
        log('SCROLL', 'Height unchanged ' + this.heightUnchangedCount + '/' + this.HEIGHT_CHECK_COUNT);
        this.lastHeightChangeTime = now;
      }
    } else {
      this.currentHeight = newHeight;
      this.heightUnchangedCount = 0;
      this.lastHeightChangeTime = Date.now();
      log('SCROLL', 'New height: ' + newHeight + 'px');
    }
    
    return this.heightUnchangedCount >= this.HEIGHT_CHECK_COUNT;
  }

  async scrollPage() {
    await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: 'window.scrollBy(0, 800);'
      }
    });
    this.scrollCount++;
    log('SCROLL', 'Scrolled page, count: ' + this.scrollCount);
  }

  async collectLoop() {
    while (this.collectedPosts.length < TARGET_COUNT) {
      const atBottom = await this.checkScrollHeight();
      
      if (atBottom) {
        log('SCROLL', 'Reached bottom of page');
        break;
      }
      
      if (this.collectedPosts.length >= TARGET_COUNT) {
        log('DONE', 'Target count reached!');
        break;
      }
      
      const posts = await this.executeExtraction();
      
      for (const post of posts) {
        if (this.collectedPosts.length >= TARGET_COUNT) break;
        if (!post.url || this.processedUrls.has(post.url)) continue;
        
        this.processedUrls.add(post.url);
        this.collectedPosts.push(post);
        log('COLLECT', 'Collected ' + this.collectedPosts.length + '/' + TARGET_COUNT + ': ' + (post.author || 'Unknown'));
      }
      
      await this.scrollPage();
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  async generateMarkdown() {
    const fs = await import('fs/promises');
    
    const lines = [
      '# 微博主页采集结果',
      '',
      '采集时间：' + new Date().toLocaleString('zh-CN'),
      '帖子数量：' + this.collectedPosts.length,
      '',
      '---',
      ''
    ];

    this.collectedPosts.forEach((post, index) => {
      lines.push('## ' + (index + 1) + '. ' + (post.author || '未知作者'));
      lines.push('');
      
      if (post.content) {
        lines.push('**内容：** ' + post.content.substring(0, 500) + (post.content.length > 500 ? '...' : ''));
        lines.push('');
      }
      
      if (post.url) {
        lines.push('**链接：** ' + post.url);
        lines.push('');
      }
      
      if (post.timestamp) {
        lines.push('**时间：** ' + post.timestamp);
        lines.push('');
      }
      
      if (post.authorUrl) {
        lines.push('**作者链接：** ' + post.authorUrl);
        lines.push('');
      }
      
      lines.push('---');
      lines.push('');
    });

    const content = lines.join('\n');
    const filename = 'weibo_posts_200_final.md';
    await fs.writeFile(filename, content, 'utf-8');
    log('OUTPUT', 'Markdown saved to: ' + filename);
    
    console.log('\n📋 Collection Summary:');
    console.log('   ✅ Total posts: ' + this.collectedPosts.length);
    console.log('   📁 Output file: ' + filename);
    console.log('   📜 Scroll count: ' + this.scrollCount);
    console.log('\n🎉 Collection completed!');

    if (this.collectedPosts.length > 0) {
      console.log('\n📋 Sample Posts (first 5):');
      this.collectedPosts.slice(0, 5).forEach((post, index) => {
        console.log('\n' + (index + 1) + '. ' + (post.author || 'Unknown'));
        console.log('   URL: ' + (post.url || 'N/A'));
        console.log('   Content: ' + (post.content?.substring(0, 80) || 'N/A') + '...');
      });
    }
  }

  async start() {
    try {
      log('INIT', 'Starting final extraction');
      await this.collectLoop();
      await this.generateMarkdown();
    } catch (err) {
      log('ERROR', err.message);
      console.error(err);
    }
  }
}

new FinalExtractor().start().catch(console.error);
