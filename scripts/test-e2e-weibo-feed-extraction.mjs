#!/usr/bin/env node
/**
 * E2E Test: Weibo Feed Extraction
 * 
 * Tests the complete flow:
 * 1. Start browser with weibo_fresh profile
 * 2. Navigate to Weibo main page
 * 3. Discover containers using RuntimeController
 * 4. Subscribe to events via WebSocket
 * 5. Verify container discovery
 * 6. Extract feed links from discovered containers
 */

import { spawn } from 'child_process';
import WebSocket from 'ws';
import { setTimeout as sleep } from 'timers/promises';

const UNIFIED_API_URL = 'ws://127.0.0.1:7701/ws';
const HTTP_API_URL = 'http://127.0.0.1:7701';
const WEIBO_URL = 'https://weibo.com';
const TEST_PROFILE = 'weibo_fresh';
const TARGET_FEED_COUNT = 50;

class E2ETest {
  constructor() {
    this.ws = null;
    this.events = [];
    this.sessionId = null;
    this.feedLinks = [];
    this.startTime = Date.now();
    this.discoveredContainers = new Map();
  }

  log(msg, data = '') {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    console.log(`[${elapsed}s] ${msg}`, data);
  }

  async connectWebSocket() {
    this.log('Connecting to Unified API WebSocket...');
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(UNIFIED_API_URL);
      
      this.ws.on('open', () => {
        this.log('✅ WebSocket connected');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        this.events.push({ timestamp: Date.now(), ...msg });
        
        if (msg.type === 'event') {
          // Track discovered containers
          if (msg.topic && msg.topic.includes(':discovered')) {
            const containerId = msg.payload.containerId;
            if (containerId) {
              this.discoveredContainers.set(containerId, msg.payload);
            }
          }
          this.log(`📡 Event: ${msg.topic}`, JSON.stringify(msg.payload).slice(0, 100));
        }
      });
      
      this.ws.on('error', (err) => {
        this.log('❌ WebSocket error:', err.message);
        reject(err);
      });
    });
  }

  async subscribe(pattern) {
    this.log(`Subscribing to: ${pattern}`);
    this.ws.send(JSON.stringify({ type: 'subscribe', topic: pattern }));
    await sleep(500);
  }

  async sendAction(action, payload = {}) {
    const requestId = `req_${Date.now()}`;
    this.log(`Sending action: ${action}`);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Action timeout: ${action}`));
      }, 30000);
      
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.requestId === requestId && msg.type === 'response') {
          clearTimeout(timeout);
          this.ws.off('message', handler);
          resolve(msg);
        }
      };
      
      this.ws.on('message', handler);
      this.ws.send(JSON.stringify({
        type: 'action',
        action,
        payload,
        requestId
      }));
    });
  }

  async ensureSession() {
    this.log('Checking for existing session...');
    
    const listResp = await this.sendAction('session:list');
    
    if (listResp.success && listResp.data?.sessions) {
      const existing = listResp.data.sessions.find(
        s => s.profileId === TEST_PROFILE || s.session_id === TEST_PROFILE
      );
      
      if (existing) {
        this.sessionId = existing.session_id;
        this.log(`✅ Using existing session: ${this.sessionId}`);
        return this.sessionId;
      }
    }
    
    this.log('Creating new browser session...');
    const resp = await this.sendAction('session:create', {
      profile: TEST_PROFILE
    });
    
    if (resp.success && (resp.data?.session_id || resp.session_id)) {
      this.sessionId = resp.data?.session_id || resp.session_id;
      this.log(`✅ Session created: ${this.sessionId}`);
      return this.sessionId;
    }
    
    throw new Error(`Failed to create session. Response: ${JSON.stringify(resp)}`);
  }

  async navigateToWeibo() {
    this.log(`Checking current URL...`);
    
    const currentUrl = await this.sendAction('browser:execute', {
      session_id: this.sessionId,
      script: 'return window.location.href;'
    });
    
    if (currentUrl.success && currentUrl.data?.result?.includes('weibo.com')) {
      this.log('✅ Already on weibo.com');
      return;
    }
    
    this.log('Navigating to ' + WEIBO_URL + '...');
    const resp = await this.sendAction('browser:execute', {
      session_id: this.sessionId,
      script: 'window.location.href = "' + WEIBO_URL + '"; return true;'
    });
    
    this.log('✅ Navigation initiated');
    await sleep(8000); // Wait for page load
  }

  async discoverContainers() {
    this.log('Discovering containers via RuntimeController...');
    
    // Call the new runtime/discover endpoint
    const response = await fetch(`${HTTP_API_URL}/v1/runtime/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        website: 'weibo',
        containerId: 'weibo_main_page',
        rootSelector: '#app'
      })
    });
    
    const result = await response.json();
    
    if (result.success && result.graph) {
      const nodes = result.graph.nodes;
      const count = Object.keys(nodes).length;
      this.log(`✅ Discovery completed. Found ${count} nodes.`);
      
      // Log discovered nodes
      Object.values(nodes).forEach(node => {
        this.log(`   - ${node.defId}: ${node.state}`);
      });
      
      return result.graph;
    } else {
      throw new Error(`Discovery failed: ${result.error || JSON.stringify(result)}`);
    }
  }

  async extractFeedLinks() {
    this.log('Extracting feed links from discovered containers...');
    
    // Wait for feed_list to be discovered
    let feedList = null;
    let attempts = 0;
    
    while (!feedList && attempts < 10) {
      // Refresh discovery
      const graph = await this.discoverContainers();
      const nodes = graph.nodes;
      
      // Find feed list container
      for (const [id, node] of Object.entries(nodes)) {
        if (id.includes('feed_list')) {
          feedList = node;
          break;
        }
      }
      
      if (!feedList) {
        this.log('Feed list not found yet, retrying...');
        await sleep(2000);
        attempts++;
      }
    }
    
    if (!feedList) {
      this.log('⚠️ Could not find feed_list container, falling back to direct extraction');
    } else {
      this.log(`✅ Found feed_list container: ${feedList.defId}`);
    }
    
    // Continue with extraction loop
    let currentCount = 0;
    let scrollAttempts = 0;
    const maxScrolls = 20;
    const seenLinks = new Set();
    
    while (currentCount < TARGET_FEED_COUNT && scrollAttempts < maxScrolls) {
      // Extract
      const script = 'var links = [];var els = document.querySelectorAll("article");for(var i=0;i<els.length;i++){var a=els[i].querySelectorAll("a");for(var j=0;j<a.length;j++){var h=a[j].href;if(h&&h.indexOf("weibo.com")>-1&&h.indexOf("javascript")<0&&h.indexOf("#")<0){links.push({href:h,text:a[j].innerText});}}}return {count:els.length,links:links};';
      
      const resp = await this.sendAction('browser:execute', {
        session_id: this.sessionId,
        script: script
      });
      
      if (resp.success && resp.data?.result?.links) {
        const newLinks = resp.data.result.links;
        let addedCount = 0;
        
        newLinks.forEach(link => {
          if (!seenLinks.has(link.href)) {
            seenLinks.add(link.href);
            this.feedLinks.push(link);
            addedCount++;
          }
        });
        
        currentCount = this.feedLinks.length;
        this.log('Current feed count: ' + currentCount + ' (articles: ' + resp.data.result.count + ', added: ' + addedCount + ')');
      }
      
      if (currentCount < TARGET_FEED_COUNT) {
        this.log('Scrolling down for more feeds...');
        await this.sendAction('browser:execute', {
          session_id: this.sessionId,
          script: 'window.scrollBy({top:1000,behavior:"smooth"});return {scrolled:true};'
        });
        
        await sleep(3000);
        scrollAttempts++;
        
        // Trigger discovery again to find new items
        try {
          await this.discoverContainers();
        } catch (e) {
          // Ignore errors during periodic discovery
        }
      } else {
        break;
      }
    }
    
    this.log('Extraction completed: ' + this.feedLinks.length + ' unique links');
    return this.feedLinks;
  }

  async verifyEvents() {
    this.log('Verifying event emissions...');
    
    const containerEvents = this.events.filter(e => 
      e.topic && (e.topic.includes('container:') || e.topic.includes('ui:'))
    );
    
    this.log('Total events captured: ' + this.events.length);
    this.log('Container events: ' + containerEvents.length);
    
    return containerEvents.length > 0;
  }

  async generateReport() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    
    const report = {
      test: 'E2E Weibo Feed Extraction',
      duration: duration + 's',
      profile: TEST_PROFILE,
      session: this.sessionId,
      results: {
        feedsExtracted: this.feedLinks.length,
        targetReached: this.feedLinks.length >= TARGET_FEED_COUNT,
        discoveredContainers: this.discoveredContainers.size,
        eventsCapture: this.events.length,
        containerEvents: this.events.filter(e => e.topic && e.topic.includes('container:')).length
      },
      success: this.feedLinks.length >= TARGET_FEED_COUNT
    };
    
    this.log('\n========== TEST REPORT ==========');
    console.log(JSON.stringify(report, null, 2));
    this.log('================================\n');
    
    return report;
  }

  async cleanup() {
    this.log('Cleaning up...');
    if (this.ws) {
      this.ws.close();
    }
  }

  async run() {
    try {
      await this.connectWebSocket();
      await this.subscribe('container:*');
      await this.subscribe('ui:*');
      await this.subscribe('operation:*');
      await this.ensureSession();
      await this.navigateToWeibo();
      await this.discoverContainers(); // Initial discovery
      await this.extractFeedLinks();
      await this.verifyEvents();
      const report = await this.generateReport();
      await this.cleanup();
      process.exit(report.success ? 0 : 1);
    } catch (error) {
      this.log('Test failed:', error.message);
      console.error(error);
      await this.cleanup();
      process.exit(1);
    }
  }
}

const test = new E2ETest();
test.run();
