#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 事件驱动微博采集器
 * 
 * 功能：
 * 1. 监听 container:appear 事件
 * 2. 自动点击 expand_button
 * 3. 收集帖子数据
 * 4. 自动滚动
 */

import WebSocket from 'ws';

const UNIFIED_API = 'http://127.0.0.1:7701';
const UNIFIED_WS = 'ws://127.0.0.1:7701/bus';
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

class EventDrivenCollector {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.isRunning = false;
    this.extractedCount = 0;
    this.collectedPosts = [];
    this.processedPostKeys = new Set();
    this.expandedPosts = new Set();
    this.currentHeight = 0;
    this.lastHeightChangeTime = Date.now();
    this.heightUnchangedCount = 0;
    this.scrollCount = 0;
    this.HEIGHT_CHECK_COUNT = 3;
    this.HEIGHT_CHECK_DELAY = 3000;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(UNIFIED_WS);
      
      this.ws.on('open', () => {
        log('SYSTEM', 'WebSocket connected');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
      
      this.ws.on('error', (err) => {
        log('ERROR', `WebSocket error: ${err.message}`);
        reject(err);
      });
    });
  }

  handleMessage(data) {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type !== 'event') return;
      
      const { topic, payload } = msg;
      
      if (topic === 'container:weibo_main_page.feed_post:appear') {
        this.handlePostAppear(payload);
      } else if (topic === 'container:weibo_main_page.feed_post.child_mjvm724w:appear') {
        this.handleExpandButtonAppear(payload);
      } else if (topic.startsWith('container:')) {
        log('DEBUG', `Container appear: ${topic}`);
      }
    } catch (err) {
      log('ERROR', `Message handling error: ${err.message}`);
    }
  }

  async handlePostAppear(payload) {
    log('POST', `Post appeared: ${payload.containerId}`);
    
    if (this.extractedCount >= TARGET_COUNT) return;
    
    const postKey = payload.containerId;
    
    if (this.processedPostKeys.has(postKey)) {
      log('DEBUG', 'Post already processed, skipping');
      return;
    }
    
    this.processedPostKeys.add(postKey);
    
    try {
      const extracted = await this.extractPost(payload);
      if (extracted) {
        this.collectedPosts.push(extracted);
        this.extractedCount++;
        log('COLLECT', `Extracted post ${this.extractedCount}/${TARGET_COUNT}: ${extracted.author || 'Unknown'}`);
      }
    } catch (err) {
      log('ERROR', `Extract failed: ${err.message}`);
    }
  }

  async handleExpandButtonAppear(payload) {
    log('EXPAND', `Expand button appeared: ${payload.containerId}`);
    
    // Auto-click expand button
    try {
      await this.clickContainer(payload.containerId);
      log('EXPAND', 'Clicked expand button');
      
      // Wait a bit for content to load, then re-extract
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      log('ERROR', `Click failed: ${err.message}`);
    }
  }

  async clickContainer(containerId) {
    const result = await post('/v1/controller/action', {
      action: 'container:operation',
      payload: {
        containerId,
        operationId: 'click',
        config: {},
        sessionId: PROFILE
      }
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Click failed');
    }
  }

  async extractPost(container) {
    const result = await post('/v1/controller/action', {
      action: 'container:operation',
      payload: {
        containerId: container.containerId,
        operationId: 'extract',
        config: {
          fields: {
            author: "header a[href*='weibo.com']",
            content: "div[class*='detail_wbtext']",
            timestamp: "time",
            url: "a[href*='weibo.com'][href*='/status/']",
            authorUrl: "a[href*='weibo.com/u/']"
          },
          include_text: true
        },
        sessionId: PROFILE
      }
    });
    
    if (!result.success || !result.data?.extracted || !result.data.extracted.length) {
      return null;
    }
    
    const extracted = result.data.extracted[0];
    return {
      containerId: container.containerId,
      author: extracted.author || null,
      content: extracted.content || extracted.text || null,
      timestamp: extracted.timestamp || null,
      url: extracted.url || null,
      authorUrl: extracted.authorUrl || null
    };
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
      action: 'container:operation',
      payload: {
        containerId: 'weibo_main_page.feed_list',
        operationId: 'scroll',
        config: { direction: 'down', distance: 800 },
        sessionId: PROFILE
      }
    });
    this.scrollCount++;
  }

  async collectionLoop() {
    while (this.isRunning && this.extractedCount < TARGET_COUNT) {
      const atBottom = await this.checkScrollHeight();
      
      if (atBottom) {
        log('SCROLL', 'Reached bottom of page');
        break;
      }
      
      if (this.extractedCount >= TARGET_COUNT) {
        log('DONE', 'Target count reached!');
        break;
      }
      
      await this.scrollPage();
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  async start() {
    try {
      this.isRunning = true;
      await this.connect();
      
      log('INIT', 'Starting event-driven collection');
      
      // Trigger initial container match to start event chain
      log('MATCH', 'Triggering initial container match...');
      await post('/v1/controller/action', {
        action: 'containers:match',
        payload: {
          profile: PROFILE,
          url: 'https://weibo.com/',
          maxDepth: 3,
          maxChildren: 10
        }
      });
      
      log('INIT', 'Waiting for events and collecting...');
      
      // Start collection loop
      await this.collectionLoop();
      
      // Generate final results
      await this.generateMarkdown();
      
    } catch (err) {
      log('ERROR', err.message);
      console.error(err);
    } finally {
      this.isRunning = false;
      this.ws?.close();
    }
  }

  async generateMarkdown() {
    const fs = await import('fs/promises');
    
    const lines = [
      '# 微博主页采集结果 (事件驱动版)',
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
    const filename = 'weibo_posts_150_event_driven.md';
    await fs.writeFile(filename, content, 'utf-8');
    log('OUTPUT', `Markdown saved to: ${filename}`);
    
    console.log('\n📋 Collection Summary:');
    console.log(`   ✅ Total posts: ${this.collectedPosts.length}`);
    console.log(`   📁 Output file: ${filename}`);
    console.log('\n🎉 Collection completed!');

    // Show first 5 posts
    console.log('\n📋 Sample Posts (first 5):');
    this.collectedPosts.slice(0, 5).forEach((post, index) => {
      console.log(`\n${index + 1}. ${post.author || 'Unknown'}`);
      console.log(`   URL: ${post.url || 'N/A'}`);
      console.log(`   Content: ${post.content?.substring(0, 80) || 'N/A'}...`);
    });
  }
}

new EventDrivenCollector().start().catch(console.error);
