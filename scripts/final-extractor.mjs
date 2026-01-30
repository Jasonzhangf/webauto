#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 最终版微博采集器 - 使用正确的选择器
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const TARGET_COUNT = 150;

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

class FinalExtractor {
  constructor() {
    this.collectedPosts = [];
    this.processedUrls = new Set();
    this.scrollCount = 0;
    this.currentHeight = 0;
    this.heightUnchangedCount = 0;
    this.lastHeightChangeTime = Date.now();
  }

  async executeExtraction() {
    const result = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            const posts = [];
            const articles = document.querySelectorAll('article[class*="Feed_wrap_"]');
            
            for (const article of Array.from(articles)) {
              const header = article.querySelector('header');
              const contentEl = article.querySelector('div[class*="detail_wbtext"]');
              const footer = article.querySelector('footer');
              
              if (!contentEl) continue;
              
              const content = contentEl.textContent?.trim() || '';
              const timestamp = article.querySelector('time')?.textContent?.trim() || '';
              
              // Try to find the post link - look for a tags in article
              const links = Array.from(article.querySelectorAll('a[href*="weibo.com"]'));
              let postUrl = '';
              
              // Find a link that looks like a post link (contains /status/ or /detail/)
              for (const link of links) {
                const href = link.href;
                if (href.includes('/status/') || href.includes('/detail/')) {
                  postUrl = href;
                  break;
                }
              }
              
              // Get author
              const authorLink = header?.querySelector('a[href*="weibo.com"]');
              const author = authorLink?.textContent?.trim() || '';
              const authorUrl = authorLink?.href || '';
              
              if (content && postUrl) {
                posts.push({
                  author,
                  content,
                  url: postUrl,
                  authorUrl,
                  timestamp
                });
              }
            }
            
            return posts;
          })()
        `
      }
    });
    
    if (!result.success || !result.data?.result) {
      log('ERROR', 'Extraction failed');
      return [];
    }
    
    return result.data.result;
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
      return false;
    }
    
    const newHeight = result.data?.result?.height || 0;
    
    if (newHeight === this.currentHeight) {
      this.heightUnchangedCount++;
      log('SCROLL', `Height unchanged ${this.heightUnchangedCount}/3`);
    } else {
      this.currentHeight = newHeight;
      this.heightUnchangedCount = 0;
      this.lastHeightChangeTime = Date.now();
      log('SCROLL', `New height: ${newHeight}px`);
    }
    
    return this.heightUnchangedCount >= 3;
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
  }

  async collectLoop() {
    while (this.collectedPosts.length < TARGET_COUNT) {
      const atBottom = await this.checkScrollHeight();
      
      if (atBottom) {
        log('SCROLL', 'Reached bottom of page');
        break;
      }
      
      // Extract posts
      const posts = await this.executeExtraction();
      
      for (const post of posts) {
        if (this.collectedPosts.length >= TARGET_COUNT) break;
        if (!post.url || this.processedUrls.has(post.url)) continue;
        
        this.processedUrls.add(post.url);
        this.collectedPosts.push(post);
        log('COLLECT', `Collected ${this.collectedPosts.length}/${TARGET_COUNT}: ${post.author || 'Unknown'}`);
      }
      
      if (this.collectedPosts.length >= TARGET_COUNT) {
        log('DONE', 'Target count reached!');
        break;
      }
      
      // Scroll
      await this.scrollPage();
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  async generateMarkdown() {
    const fs = await import('fs/promises');
    
    const lines = [
      '# 微博主页采集结果',
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
    const filename = 'weibo_posts_150_final.md';
    await fs.writeFile(filename, content, 'utf-8');
    log('OUTPUT', `Markdown saved to: ${filename}`);
    
    console.log('\n📋 Collection Summary:');
    console.log(`   ✅ Total posts: ${this.collectedPosts.length}`);
    console.log(`   📁 Output file: ${filename}`);
    console.log(`   📜 Scroll count: ${this.scrollCount}`);
    console.log('\n🎉 Collection completed!');

    // Show first 5 posts
    console.log('\n📋 Sample Posts (first 5):');
    this.collectedPosts.slice(0, 5).forEach((post, index) => {
      console.log(`\n${index + 1}. ${post.author || 'Unknown'}`);
      console.log(`   URL: ${post.url || 'N/A'}`);
      console.log(`   Content: ${post.content?.substring(0, 80) || 'N/A'}...`);
    });
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
