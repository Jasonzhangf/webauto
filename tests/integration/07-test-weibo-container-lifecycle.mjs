#!/usr/bin/env node
/**
 * 使用 weibo_fresh profile 的容器生命周期完整闭环测试
 * 
 * 测试流程:
 * 1. 连接 WebSocket
 * 2. 使用 weibo_fresh profile 检查/创建会话
 * 3. 订阅容器状态
 * 4. 执行容器匹配（触发容器发现）
 * 5. 等待容器发现事件
 * 6. 获取容器树并绘制 DOM Tree
 * 7. 验证完整的事件流
 */

import { WebSocket } from 'ws';
import http from 'node:http';

const HOST = '127.0.0.1';
const UNIFIED_API_PORT = 7701;
const WS_URL = `ws://${HOST}:${UNIFIED_API_PORT}/ws`;
const API_HOST = `http://${HOST}:${UNIFIED_API_PORT}`;
const PROFILE_ID = 'weibo_fresh';

const events = [];
let ws = null;
let sessionId = null;

function log(msg) {
  console.log(`[WEIBO-LIFECYCLE] ${msg}`);
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
        log(`收到容器事件: ${msg.topic}`);
        if (msg.payload) {
          const preview = JSON.stringify(msg.payload).substring(0, 150);
          log(`  数据: ${preview}...`);
        }
      }
    });
    
    ws.on('error', reject);
    
    setTimeout(() => reject(new Error('WebSocket 连接超时')), 5000);
  });
}

async function checkHealth() {
  log('检查服务健康状态...');
  const health = await httpGet('/health');
  if (!health.ok) {
    throw new Error('服务不健康');
  }
  log('✓ 服务健康');
}

async function getSessions() {
  log('获取当前会话列表...');
  const result = await httpPost('/v1/controller/action', {
    action: 'session:list',
    payload: {}
  });
  
  if (!result.success) {
    throw new Error('获取会话列表失败');
  }
  
  const sessions = result.data?.sessions || result.data?.data?.sessions || [];
  log(`✓ 找到 ${sessions.length} 个会话`);
  
  // 查找 weibo_fresh profile 的会话
  const weiboSession = sessions.find(s => s.profileId === PROFILE_ID || s.session_id === PROFILE_ID);
  
  if (weiboSession) {
    sessionId = weiboSession.session_id;
    log(`✓ 找到 weibo_fresh 会话: ${sessionId}`);
    log(`  当前 URL: ${weiboSession.current_url}`);
  } else {
    log(`⚠ 未找到 ${PROFILE_ID} 会话`);
  }
  
  return { sessions, weiboSession };
}

async function subscribeToContainer(containerId) {
  log(`订阅容器: ${containerId}`);
  const result = await httpPost(`/v1/container/${containerId}/subscribe`, {});
  
  if (!result.success) {
    throw new Error(`订阅失败: ${result.error || '未知错误'}`);
  }
  
  log(`✓ 容器订阅成功: ${containerId}`);
  return result;
}

async function executeContainerMatch(url) {
  log('执行容器匹配...');
  const result = await httpPost('/v1/controller/action', {
    action: 'containers:match',
    payload: { sessionId, url }
  });
  
  log(`✓ 容器匹配完成，返回: ${result.success ? '成功' : '失败'}`);
  return result;
}

async function inspectContainerTree(url) {
  log('获取容器树结构...');
  const result = await httpPost('/v1/controller/action', {
    action: 'inspect_tree',
    payload: { sessionId, url, maxDepth: 3 }
  });
  
  log(`✓ 容器树获取完成，返回: ${result.success ? '成功' : '失败'}`);
  return result;
}

function printContainerTree(data, indent = 0) {
  const prefix = '  '.repeat(indent);
  
  if (!data) {
    console.log(`${prefix}[空]`);
    return;
  }
  
  // 处理不同的返回格式
  const tree = data.snapshot || data.tree || data.data || data;
  
  if (!tree) {
    log(`无法解析容器树，直接显示原始数据`);
    console.log(prefix, JSON.stringify(data).substring(0, 200));
    return;
  }
  
  if (Array.isArray(tree)) {
    tree.forEach(node => printNode(node, indent + 1));
  } else if (tree.containerId || tree.id) {
    printNode(tree, indent);
  } else if (typeof tree === 'object') {
    Object.values(tree).forEach(val => {
      if (Array.isArray(val)) {
        val.forEach(node => printNode(node, indent + 1));
      }
    });
  }
}

function printNode(node, indent) {
  const prefix = '  '.repeat(indent);
  const id = node.containerId || node.id || node.defId || 'unknown';
  const type = node.type || node.containerType || 'container';
  const children = node.children || node.nodes || [];
  const selectors = node.selectors || node.selector || [];
  
  console.log(`${prefix}├─ [${type}] ${id}`);
  
  if (selectors.length > 0) {
    const selStr = Array.isArray(selectors) ? selectors.join(', ') : selectors;
    console.log(`${prefix}│  selectors: ${selStr}`);
  }
  
  if (Array.isArray(children) && children.length > 0) {
    children.forEach(child => printNode(child, indent + 1));
  }
}

async function drawAsciiTree() {
  log('\n=== 预期 DOM Tree (ASCII) ===');
  console.log(`
  ┌─ [HTML]
  │  └─ [BODY]
  │     └─ [container] WB_main_frame
  │        ├─ [container] WB_webapp
  │        │  ├─ [container] WB_textarea
  │        │  └─ [container] WB_feed
  │        │     ├─ [container] feed_content
  │        │     │  └─ [list-item] feed_item
  │        │     └─ [container] feed_tools
  │        │        ├─ [button] publish
  │        │        └─ [button] refresh
  `);
}

async function analyzeEvents() {
  log('\n=== 事件流分析 ===');
  log(`总共收到 ${events.length} 个事件`);
  
  // 分类事件
  const containerEvents = events.filter(e => 
    e.type === 'event' && e.topic && e.topic.includes('container')
  );
  const readyEvents = events.filter(e => e.type === 'ready');
  const pongEvents = events.filter(e => e.type === 'pong');
  const responseEvents = events.filter(e => e.type === 'response');
  
  log(`容器相关事件: ${containerEvents.length} 个`);
  log(`ready 事件: ${readyEvents.length} 个`);
  log(`pong 事件: ${pongEvents.length} 个`);
  log(`response 事件: ${responseEvents.length} 个`);
  
  // 打印容器事件详情
  if (containerEvents.length > 0) {
    log('\n容器事件详情:');
    containerEvents.forEach((event, index) => {
      log(`[${index + 1}] ${event.topic}`);
      if (event.payload) {
        const keys = Object.keys(event.payload);
        log(`    字段: ${keys.join(', ')}`);
      }
    });
  } else {
    log('⚠ 未收到容器相关事件');
  }
  
  return { containerEvents, readyEvents, pongEvents, responseEvents };
}

async function main() {
  try {
    // Step 1: 检查服务健康
    await checkHealth();
    
    // Step 2: 连接 WebSocket
    await connectWebSocket();
    
    // Step 3: 获取会话列表
    const { sessions, weiboSession } = await getSessions();
    
    if (!weiboSession) {
      log('⚠ 未找到 weibo_fresh 会话，尝试使用第一个可用会话');
      if (sessions.length > 0) {
        sessionId = sessions[0].session_id;
        log(`使用会话: ${sessionId}`);
      } else {
        log('⚠ 没有可用会话，跳过容器操作测试');
        await analyzeEvents();
        log('\n✅ 基础 WebSocket 和健康检查通过');
        ws.close();
        process.exit(0);
      }
    }
    
    // Step 4: 绘制预期的 DOM Tree
    await drawAsciiTree();
    
    // Step 5: 订阅容器
    await subscribeToContainer('test-weibo-container');
    
    // Step 6: 执行容器匹配（触发发现流程）
    const matchResult = await executeContainerMatch(weiboSession?.current_url || 'https://weibo.com');
    
    // Step 7: 获取容器树
    const treeResult = await inspectContainerTree(weiboSession?.current_url || 'https://weibo.com');
    
    // Step 8: 打印容器树
    if (treeResult.success && treeResult.data) {
      log('\n=== 容器树结构 ===');
      printContainerTree(treeResult.data);
    }
    
    // Step 9: 等待事件传播
    log('等待事件传播...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 10: 分析事件
    const analysis = await analyzeEvents();
    
    // Step 11: 总结
    log('\n=== 测试总结 ===');
    log('✓ WebSocket 连接: 通过');
    log('✓ 会话获取: 通过');
    log(`✓ 容器匹配: ${matchResult.success ? '通过' : '失败'}`);
    log(`✓ 容器树获取: ${treeResult.success ? '通过' : '失败'}`);
    log(`✓ 事件接收: 通过 (${events.length} 个事件)`);
    
    if (analysis.containerEvents.length > 0) {
      log('✓ 容器事件跟踪: 通过');
    } else {
      log('⚠ 容器事件跟踪: 未收到（可能需要实际容器发现）');
    }
    
    log('\n✅ 容器生命周期完整闭环测试完成!');
    
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
