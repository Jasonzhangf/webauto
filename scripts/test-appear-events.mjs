#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 测试1: 验证容器appear事件机制
 */

import WebSocket from 'ws';

const UNIFIED_WS = 'ws://127.0.0.1:7701/ws';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

class AppearEventTester {
  constructor() {
    this.ws = null;
    this.appearedContainers = new Set();
    this.expandButtonAppears = 0;
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
          
          // 监听事件
          if (msg.type === 'event') {
            this.handleEvent(msg);
          }
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });

      this.ws.on('error', (err) => {
        log('ERROR', `WebSocket error: ${err.message}`);
        reject(err);
      });

      this.ws.on('close', () => {
        log('SYSTEM', 'WebSocket closed');
      });
    });
  }

  handleEvent(msg) {
    const { topic, payload } = msg;

    // 监听容器相关事件
    if (topic.startsWith('container:')) {
      log('EVENT', `${topic} - ${JSON.stringify(payload).substring(0, 100)}`);

      // 特殊关注expand_button
      if (topic.includes('expand_button') || (payload && payload.containerId && payload.containerId.includes('expand_button'))) {
        this.expandButtonAppears++;
        log('EXPAND', `Expand button detected (${this.expandButtonAppears} times)`);
      }

      // 记录所有出现的容器
      if (payload && payload.containerId) {
        this.appearedContainers.add(payload.containerId);
      }
    }

    // 监听操作事件
    if (topic.startsWith('operation:')) {
      log('OPERATION', `${topic}`);
    }
  }

  async test() {
    try {
      await this.connect();

      // 步骤1: 导航到微博主页
      log('NAVIGATE', 'Navigating to Weibo homepage...');
      await this.executeAction({
        action: 'browser:execute',
        payload: {
          sessionId: PROFILE,
          script: `window.location.href = '${PAGE_URL}';`
        }
      });

      await new Promise(r => setTimeout(r, 5000));

      // 步骤2: 触发容器匹配
      log('MATCH', 'Triggering container matching...');
      await this.executeAction({
        action: 'containers:match',
        payload: {
          profile: PROFILE,
          url: PAGE_URL
        }
      });

      // 步骤3: 等待30秒收集事件
      log('LISTEN', 'Listening for container events (30s)...');
      await new Promise(r => setTimeout(r, 30000));

      // 步骤4: 报告结果
      this.reportResults();

    } catch (error) {
      log('ERROR', `Test failed: ${error.message}`);
      console.error(error);
    } finally {
      this.ws?.close();
    }
  }

  async executeAction(data) {
    const res = await fetch('http://127.0.0.1:7701/v1/controller/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    return res.json();
  }

  reportResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试1: 容器Appear事件机制验证结果');
    console.log('='.repeat(60) + '\n');

    console.log(`✅ 出现的容器数量: ${this.appearedContainers.size}`);
    console.log(`✅ 展开按钮出现次数: ${this.expandButtonAppears}`);
    console.log('');

    console.log('📋 出现的容器列表:');
    const sortedContainers = Array.from(this.appearedContainers).sort();
    sortedContainers.forEach((id, index) => {
      const isExpand = id.includes('expand_button');
      const marker = isExpand ? '🔥' : '  ';
      console.log(`   ${marker} ${index + 1}. ${id}`);
    });

    console.log('');

    // 验证结论
    if (this.appearedContainers.size > 0) {
      console.log('✅ 容器appear事件机制正常工作');
    } else {
      console.log('❌ 未检测到任何容器appear事件');
    }

    if (this.expandButtonAppears > 0) {
      console.log('✅ 展开按钮appear事件检测正常');
    } else {
      console.log('⚠️  未检测到展开按钮出现（可能当前页面没有需要展开的帖子）');
    }

    console.log('\n' + '='.repeat(60));
  }
}

new AppearEventTester().test().catch(console.error);
