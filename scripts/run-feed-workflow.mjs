#!/usr/bin/env node

/**
 * 微博 Feed 提取 Workflow
 */

import WebSocket from 'ws';

const UNIFIED_API = 'http://127.0.0.1:7701';
const UNIFIED_WS = 'ws://127.0.0.1:7701/ws';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';

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

async function get(endpoint) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

class WorkflowRunner {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.isRunning = false;
    this.extractedCount = 0;
    this.lastExtracted = null;
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
            // log('EVENT', `${msg.topic} - ${JSON.stringify(msg.payload).substring(0, 50)}...`);
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

      // Step 1: 初始化
      log('INIT', 'Checking session...');
      const sessions = await get('/v1/session/list');
      const active = sessions.data?.sessions?.find(s => s.profileId === PROFILE);
      
      if (!active) {
        log('INIT', 'Creating session...');
        await post('/v1/session/create', { profile: PROFILE, url: PAGE_URL });
        await sleep(5000);
      } else {
        log('INIT', 'Using active session');
        this.sessionId = active.profileId || active.session_id;
      }

      // Step 2: 容器匹配
      log('MATCH', 'Matching containers...');
      const match = await post('/v1/container/match', {
        profile: PROFILE,
        url: PAGE_URL
      });
      
      if (!match.data.matched) {
        throw new Error('Root container not matched');
      }
      log('MATCH', `Root matched: ${match.data.container.id}`);

      // Step 3: 定位 Feed 列表
      log('LOCATE', 'Finding feed list...');
      const listContainer = await this.findChild(match.data.container.id, 'weibo_main_page.feed_list');
      if (!listContainer) throw new Error('Feed list not found');
      
      await this.highlight(listContainer.id, 'container', '2px solid #fbbc05');

      // Step 4: 提取循环
      await this.extractLoop(listContainer.id);

    } catch (err) {
      log('ERROR', err.message);
    } finally {
      this.isRunning = false;
      this.ws?.close();
    }
  }

  async findChild(parentId, childType) {
    const res = await post(`/v1/container/${parentId}/execute`, {
      sessionId: PROFILE,
      operationId: 'find-child', sessionId: PROFILE,
      config: { container_id: childType }
    });
    
    // find-child currently returns void or count, need to inspect to get children
    // So we inspect the parent to get children
    const inspect = await post('/v1/controller/action', {
      action: 'containers:inspect-container',
      payload: { profile: PROFILE, containerId: parentId }
    });
    
    const child = inspect.data.snapshot?.children?.find(c => c.name === childType || c.type === childType || c.id === childType || c.defId === childType || c.defId === childType);
    return child;
  }

  async highlight(containerId, channel, style) {
    await post(`/v1/container/${containerId}/execute`, {
      sessionId: PROFILE,
      operationId: 'highlight',
      config: { channel, style, duration: 2000 }
    });
  }

  async extractLoop(listId) {
    let scrollCount = 0;
    const MAX_SCROLLS = 3;
    const TARGET_COUNT = 20;

    while (this.extractedCount < TARGET_COUNT && scrollCount < MAX_SCROLLS) {
      log('LOOP', `Extraction cycle (Extracted: ${this.extractedCount})`);

      // 1. Find all visible posts
      const inspect = await post('/v1/controller/action', {
        action: 'containers:inspect-container',
        payload: { profile: PROFILE, containerId: listId, maxChildren: 50 }
      });

      const posts = inspect.data.snapshot?.children || [];
      log('LOOP', `Found ${posts.length} visible posts`);

      // 2. Extract each post
      for (const post of posts) {
        if (this.extractedCount >= TARGET_COUNT) break;
        if (post.extracted) continue; // Skip if already processed (need state tracking)

        await this.highlight(post.id, 'post', '2px solid #2196F3');
        
        const data = await this.extractPost(post.id);
        if (data && data.extracted && data.extracted.length > 0) {
          const info = data.extracted[0];
          log('DATA', `Post by ${info.author || 'unknown'}: ${info.text?.substring(0, 30)}...`);
          this.extractedCount++;
        }
        
        post.extracted = true; // Local state tracking
        await sleep(500);
      }

      // 3. Scroll
      if (this.extractedCount < TARGET_COUNT) {
        log('SCROLL', 'Loading more...');
        await post(`/v1/container/${listId}/execute`, {
          sessionId: PROFILE,
          operationId: 'scroll',
          config: { direction: 'down', distance: 800 }
        });
        scrollCount++;
        await sleep(3000);
      }
    }
    
    log('DONE', `Finished. Total extracted: ${this.extractedCount}`);
  }

  async extractPost(postId) {
    const res = await post(`/v1/container/${postId}/execute`, {
      sessionId: PROFILE,
      operationId: 'extract',
      config: {
        fields: {
          author: "header a[href*='weibo.com']",
          content: "div[class*='detail_wbtext']",
          timestamp: "a[href*='/status/']"
        },
        include_text: true
      }
    });
    return res.data;
  }
}

new WorkflowRunner().start();
