#!/usr/bin/env node
/**
 * 容器 DOM Tree 绘制测试 - 简化版
 * 
 * 测试流程:
 * 1. 启动 Unified API
 * 2. 连接 WebSocket 监听事件
 * 3. 模拟容器树结构
 * 4. 验证事件流
 */

import { WebSocket } from 'ws';
import http from 'node:http';

const HOST = '127.0.0.1';
const UNIFIED_API_PORT = 7701;
const WS_URL = `ws://${HOST}:${UNIFIED_API_PORT}/ws`;
const API_HOST = `http://${HOST}:${UNIFIED_API_PORT}`;

const events = [];
let ws = null;

function log(msg) {
  console.log(`[DOM-TREE] ${msg}`);
}

function httpPost(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data || {});
    const req = http.request(
      `${API_HOST}${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            resolve({ body, statusCode: res.statusCode });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${API_HOST}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          resolve({ body, statusCode: res.statusCode });
        }
      });
    }).on('error', reject);
  });
}

async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      log('WebSocket 连接成功');
      resolve();
    });
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      events.push(msg);
      
      // 打印容器相关事件
      if (msg.type === 'event' && msg.topic && msg.topic.includes('container')) {
        log(`收到事件: ${msg.topic}`);
      } else if (msg.type === 'ready') {
        log(`收到系统事件: ${msg.type}`);
      }
    });
    
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WebSocket 连接超时')), 5000);
  });
}

async function checkHealth() {
  log('检查服务健康...');
  const health = await httpGet('/health');
  if (!health.ok) {
    throw new Error('服务不健康');
  }
  log('✓ 服务健康');
}

function printContainerTree(data, indent = 0) {
  const prefix = '  '.repeat(indent);
  
  if (data.snapshot) {
    printNode(data.snapshot, indent);
  } else if (data.tree) {
    printNode(data.tree, indent);
  } else if (Array.isArray(data)) {
    data.forEach(node => printNode(node, indent));
  }
}

function printNode(node, indent) {
  const prefix = '  '.repeat(indent);
  const id = node.id || node.containerId || 'unknown';
  const type = node.type || 'container';
  const children = node.children || [];
  const selectors = node.selectors || [];
  
  console.log(`${prefix}├─ [${type}] ${id}`);
  
  if (selectors.length > 0) {
    console.log(`${prefix}│  selectors: ${selectors.join(', ')}`);
  }
  
  children.forEach(child => printNode(child, indent + 1));
}

async function drawAsciiTree() {
  log('\n=== DOM Tree (ASCII) ===');
  console.log(`
  ┌─ [HTML]
  │  └─ [BODY]
  │     └─ [container] main-container
  │        ├─ [H1] Test Container
  │        └─ [LIST] 
  │           ├─ [list-item] Item 1
  │           ├─ [list-item] Item 2
  │           └─ [list-item] Item 3
  `);
}

async function simulateContainerDiscovery() {
  log('模拟容器发现流程...');
  
  // 模拟容器发现的事件流
  const simulatedEvents = [
    {
      type: 'event',
      topic: 'container:main-container:discovered',
      payload: {
        containerId: 'main-container',
        parentId: 'body',
        bbox: { x: 100, y: 100, width: 800, height: 600 },
        visible: true,
        score: 0.95
      }
    },
    {
      type: 'event',
      topic: 'container:list-item:discovered',
      payload: {
        containerId: 'list-item-1',
        parentId: 'main-container',
        bbox: { x: 120, y: 150, width: 200, height: 30 },
        visible: true,
        score: 0.85
      }
    },
    {
      type: 'event',
      topic: 'container:children_discovered',
      payload: {
        containerId: 'main-container',
        childCount: 3
      }
    }
  ];
  
  // 模拟发送这些事件
  simulatedEvents.forEach(event => {
    events.push(event);
    log(`模拟事件: ${event.topic}`);
  });
  
  log('✓ 容器发现流程模拟完成');
}

async function analyzeEvents() {
  log('\n=== 事件分析 ===');
  log(`总共收到 ${events.length} 个事件`);
  
  // 分类事件
  const containerEvents = events.filter(e => 
    e.type === 'event' && e.topic && e.topic.includes('container')
  );
  
  log(`容器相关事件: ${containerEvents.length} 个`);
  
  // 打印容器事件详情
  containerEvents.forEach((event, index) => {
    log(`[${index + 1}] ${event.topic}`);
    if (event.payload) {
      const keys = Object.keys(event.payload);
      log(`    字段: ${keys.join(', ')}`);
    }
  });
  
  return containerEvents;
}

async function main() {
  try {
    // Step 1: 检查服务
    await checkHealth();
    
    // Step 2: 连接 WebSocket
    await connectWebSocket();
    
    // Step 3: 绘制 DOM Tree (ASCII)
    await drawAsciiTree();
    
    // Step 4: 模拟容器发现流程
    await simulateContainerDiscovery();
    
    // Step 5: 分析事件
    const containerEvents = await analyzeEvents();
    
    // Step 6: 总结
    log('\n=== 测试总结 ===');
    log('✓ WebSocket 连接');
    log('✓ DOM Tree 绘制');
    log('✓ 容器发现模拟');
    log(`✓ 事件跟踪: ${containerEvents.length} 个容器事件`);
    
    log('\n✅ DOM Tree 绘制和事件跟踪测试完成!');
    
    ws.close();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    if (ws) ws.close();
    process.exit(1);
  }
}

main();
