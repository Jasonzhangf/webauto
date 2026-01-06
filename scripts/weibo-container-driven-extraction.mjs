#!/usr/bin/env node
/**
 * 使用容器驱动的消息机制提取微博帖子
 * 
 * 功能：
 * 1. 通过容器操作消息驱动提取流程
 * 2. 使用容器定义的 operations 进行标准化操作
 * 3. 实现事件驱动的帖子提取和滚动
 */

import WebSocket from 'ws';

const UNIFIED_API = 'http://127.0.0.1:7701';
const UNIFIED_WS = 'ws://127.0.0.1:7701/ws';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';
const TARGET_COUNT = 150;

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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

class ContainerDrivenExtractor {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.isRunning = false;
    this.extractedCount = 0;
    this.collectedPosts = [];
    this.processedPostKeys = new Set(); // 用于去重
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(UNIFIED_WS);
      this.ws.on('open', () => {
        log('SYSTEM', 'WebSocket connected');
        resolve();
      });
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'event' && msg.topic.startsWith('container:')) {
            log('EVENT', `${msg.topic} - ${JSON.stringify(msg.payload).substring(0, 50)}...`);
          }
        } catch {}
      });
      this.ws.on('error', reject);
    });
  }

  async start() {
    try {
      this.isRunning = true;
      await this.connect();

      // Step 1: 检查会话
      log('INIT', 'Checking session...');
      const sessions = await post('/v1/controller/action', {
        action: 'session:list',
        payload: {}
      });
      
      const active = sessions.data?.data?.sessions?.find(s => s.profileId === PROFILE);
      
      if (!active) {
        log('INIT', 'Creating session...');
        await post('/v1/controller/action', {
          action: 'session:create',
          payload: { profile: PROFILE, url: PAGE_URL }
        });
        await sleep(5000);
      } else {
        log('INIT', 'Using active session');
        this.sessionId = active.profileId || active.session_id;
      }

      // Step 2: 容器匹配
      log('MATCH', 'Matching containers...');
      const match = await post('/v1/controller/action', {
        action: 'containers:match',
        payload: {
          profile: PROFILE,
          url: PAGE_URL
        }
      });
      
      if (!match.data?.matched) {
        throw new Error('Root container not matched');
      }
      log('MATCH', `Root matched: ${match.data.container.id}`);

      // Step 3: 定位 Feed 列表
      log('LOCATE', 'Finding feed list...');
      const listContainer = await this.findChild(match.data.container.id, 'weibo_main_page.feed_list');
      if (!listContainer) throw new Error('Feed list not found');
      
      log('LOCATE', `Feed list found: ${listContainer.id}`);

      // Step 4: 提取循环
      await this.extractLoop(listContainer.id);

      // Step 5: 生成最终结果
      await this.generateMarkdown();

    } catch (err) {
      log('ERROR', err.message);
      console.error(err);
    } finally {
      this.isRunning = false;
      this.ws?.close();
    }
  }

  async findChild(parentId, childType) {
    // 先执行 find-child 操作
    const res = await post('/v1/controller/action', {
      action: 'container:operation',
      payload: {
        containerId: parentId,
        operationId: 'find-child',
        config: { container_id: childType },
        sessionId: PROFILE
      }
    });
    
    // 然后检查容器的子元素
    const inspect = await post('/v1/controller/action', {
      action: 'containers:inspect-container',
      payload: { profile: PROFILE, containerId: parentId }
    });
    
    const child = inspect.data?.data?.snapshot?.children?.find(c => 
      c.name === childType || 
      c.type === childType || 
      c.id === childType || 
      c.defId === childType
    );
    return child;
  }

  async highlight(containerId, channel, style) {
    await post('/v1/controller/action', {
      action: 'container:operation',
      payload: {
        containerId,
        operationId: 'highlight',
        config: { channel, style, duration: 2000 },
        sessionId: PROFILE
      }
    });
  }

  async extractLoop(listId) {
    let scrollCount = 0;
    const MAX_SCROLLS = 120;
    const HEIGHT_CHECK_COUNT = 3; // 检查多少次高度无变化后停止

    let lastHeight = 0;
    let heightUnchangedCount = 0;

    while (this.extractedCount < TARGET_COUNT && scrollCount < MAX_SCROLLS && heightUnchangedCount < HEIGHT_CHECK_COUNT) {
      log('LOOP', `Extraction cycle (Extracted: ${this.extractedCount}/${TARGET_COUNT}) | Scroll: ${scrollCount}/${MAX_SCROLLS} | Height unchanged: ${heightUnchangedCount}/${HEIGHT_CHECK_COUNT}`);

      // 1. 获取当前页面可见的帖子
      const inspect = await post('/v1/controller/action', {
        action: 'containers:inspect-container',
        payload: { profile: PROFILE, containerId: listId, maxChildren: 50 }
      });

      const posts = inspect.data?.data?.snapshot?.children || [];
      log('LOOP', `Found ${posts.length} visible posts`);

      // 2. 提取每个帖子
      for (const post of posts) {
        if (this.extractedCount >= TARGET_COUNT) break;
        
        // 检查是否已处理过（使用内容作为唯一标识）
        const postKey = await this.generatePostKey(post);
        if (this.processedPostKeys.has(postKey)) continue;

        await this.highlight(post.id, 'post', '2px solid #2196F3');
        
        const data = await this.extractPost(post.id);
        if (data && data.extracted && data.extracted.length > 0) {
          const extractedPost = data.extracted[0];
          log('DATA', `Post by ${extractedPost.author || 'unknown'}: ${extractedPost.text?.substring(0, 30) || extractedPost.content?.substring(0, 30)}...`);
          
          // 保存帖子数据
          this.collectedPosts.push({
            id: post.id,
            author: extractedPost.author,
            content: extractedPost.text || extractedPost.content,
            url: extractedPost.url,
            authorUrl: extractedPost.authorUrl,
            timestamp: extractedPost.timestamp
          });
          
          this.extractedCount++;
          this.processedPostKeys.add(postKey);
        }
        
        await sleep(500);
      }

      // 3. 检查页面高度
      const heightRes = await post('/v1/controller/action', {
        action: 'browser:execute',
        payload: {
          sessionId: PROFILE,
          script: 'document.documentElement.scrollHeight'
        }
      });
      
      const currentHeight = heightRes.data?.result;
      log('SCROLL', `Page height: ${currentHeight}, last: ${lastHeight}`);
      
      if (currentHeight === lastHeight) {
        heightUnchangedCount++;
        log('SCROLL', `Height unchanged (${heightUnchangedCount}/${HEIGHT_CHECK_COUNT})`);
      } else {
        heightUnchangedCount = 0; // 重置计数
      }
      
      lastHeight = currentHeight;

      // 4. 滚动加载更多
      if (this.extractedCount < TARGET_COUNT && heightUnchangedCount < HEIGHT_CHECK_COUNT) {
        log('SCROLL', 'Loading more...');
        await post('/v1/controller/action', {
          action: 'container:operation',
          payload: {
            containerId: listId,
            operationId: 'scroll',
            config: { direction: 'down', distance: 800 },
            sessionId: PROFILE
          }
        });
        scrollCount++;
        await sleep(3000);
      } else {
        if (this.extractedCount >= TARGET_COUNT) {
          log('SCROLL', 'Target count reached!');
        } else if (heightUnchangedCount >= HEIGHT_CHECK_COUNT) {
          log('SCROLL', 'Reached bottom of page!');
        }
      }
    }
    
    log('DONE', `Finished. Total extracted: ${this.extractedCount}`);
  }

  async generatePostKey(post) {
    // 使用帖子内容作为唯一标识
    const data = await this.extractPost(post.id);
    if (data && data.extracted && data.extracted.length > 0) {
      const extracted = data.extracted[0];
      const content = extracted.text || extracted.content || '';
      return content.substring(0, 50); // 使用前50个字符作为唯一标识
    }
    return post.id;
  }

  async extractPost(postId) {
    try {
      const res = await post('/v1/controller/action', {
        action: 'container:operation',
        payload: {
          containerId: postId,
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
      return res.data?.data;
    } catch (error) {
      log('ERROR', `Failed to extract post ${postId}: ${error.message}`);
      return { extracted: [] };
    }
  }

  async generateMarkdown() {
    const fs = await import('fs/promises');
    
    const lines = [
      '# 微博主页采集结果 (容器驱动版)',
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
        lines.push(`**链接：** ${post.url}`);  // 这是内容链接
        lines.push('');
      }
      
      if (post.timestamp) {
        lines.push(`**时间：** ${post.timestamp}`);
        lines.push('');
      }
      
      if (post.authorUrl) {
        lines.push(`**作者链接：** ${post.authorUrl}`);  // 这是作者主页链接
        lines.push('');
      }
      
      lines.push('---');
      lines.push('');
    });

    const content = lines.join('\n');
    await fs.writeFile('weibo_posts_150_container_driven.md', content, 'utf-8');
    log('OUTPUT', `Markdown saved to: weibo_posts_150_container_driven.md`);
    
    console.log('\n📋 Collection Summary:');
    console.log(`   ✅ Total posts: ${this.collectedPosts.length}`);
    console.log(`   📁 Output file: weibo_posts_150_container_driven.md`);
    console.log('\n🎉 Collection completed!');

    // 显示前5条帖子预览
    console.log('\n📋 Sample Posts (first 5):');
    this.collectedPosts.slice(0, 5).forEach((post, index) => {
      console.log(`\n${index + 1}. ${post.author || 'Unknown'}`);
      console.log(`   URL: ${post.url || 'N/A'}`);
      console.log(`   Content: ${post.content?.substring(0, 80) || 'N/A'}...`);
    });
  }
}

new ContainerDrivenExtractor().start().catch(console.error);
