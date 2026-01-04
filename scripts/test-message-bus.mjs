#!/usr/bin/env node
/**
 * 测试消息总线功能
 * 验证 HTTP API 和 WebSocket 订阅
 */

import http from 'http';
import WebSocket from 'ws';

const API_BASE = 'http://127.0.0.1:7701';
const WS_BUS_URL = 'ws://127.0.0.1:7701/bus';

console.log('消息总线测试开始...\n');

// 等待函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// HTTP 请求辅助函数
async function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// 测试 1: 健康检查
async function testHealth() {
  console.log('测试 1: 健康检查');
  try {
    const result = await request('GET', '/health');
    console.log('✓ 健康检查通过:', result);
  } catch (err) {
    console.error('✗ 健康检查失败:', err.message);
    throw err;
  }
  console.log('');
}

// 测试 2: 获取统计信息
async function testStats() {
  console.log('测试 2: 获取统计信息');
  try {
    const result = await request('GET', '/v1/messages/stats');
    console.log('✓ 统计信息:', result.data);
  } catch (err) {
    console.error('✗ 获取统计失败:', err.message);
    throw err;
  }
  console.log('');
}

// 测试 3: 发布消息（HTTP）
async function testPublish() {
  console.log('测试 3: 发布消息（HTTP）');
  try {
    const result = await request('POST', '/v1/messages/publish', {
      type: 'MSG_CONTAINER_CREATED',
      payload: {
        containerId: 'test_container_1',
        containerType: 'list',
        selector: '.test-list'
      },
      source: {
        component: 'TestScript'
      }
    });
    console.log('✓ 消息已发布:', result.data);
  } catch (err) {
    console.error('✗ 发布消息失败:', err.message);
    throw err;
  }
  console.log('');
}

// 测试 4: 获取消息历史
async function testHistory() {
  console.log('测试 4: 获取消息历史');
  try {
    const result = await request('GET', '/v1/messages/history?limit=10');
    console.log(`✓ 获取到 ${result.count} 条消息`);
    if (result.data.length > 0) {
      console.log('  最新消息:', result.data[result.data.length - 1].type);
    }
  } catch (err) {
    console.error('✗ 获取历史失败:', err.message);
    throw err;
  }
  console.log('');
}

// 测试 5: 获取订阅列表
async function testSubscriptions() {
  console.log('测试 5: 获取订阅列表');
  try {
    const result = await request('GET', '/v1/messages/subscriptions');
    console.log('✓ 当前订阅数:', result.data.length);
  } catch (err) {
    console.error('✗ 获取订阅失败:', err.message);
    throw err;
  }
  console.log('');
}

// 测试 6: WebSocket 订阅和发布
async function testWebSocket() {
  console.log('测试 6: WebSocket 订阅和发布');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_BUS_URL);
    let messageReceived = false;
    
    const timeout = setTimeout(() => {
      if (!messageReceived) {
        ws.close();
        reject(new Error('WebSocket 测试超时'));
      }
    }, 10000);

    ws.on('open', () => {
      console.log('✓ WebSocket 连接已建立');
      
      // 订阅容器消息
      ws.send(JSON.stringify({
        type: 'subscribe',
        pattern: 'MSG_CONTAINER_*',
        options: {
          priority: 5
        }
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'subscribed') {
        console.log('✓ 订阅成功:', msg.pattern);
        
        // 发布测试消息
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'publish',
            messageType: 'MSG_CONTAINER_APPEARED',
            payload: {
              containerId: 'test_container_ws',
              domPath: '/root/0/1',
              timestamp: Date.now()
            },
            source: {
              component: 'WebSocketTest'
            }
          }));
        }, 100);
      }
      
      if (msg.type === 'published') {
        console.log('✓ 消息已发布（WebSocket）:', msg.messageId);
      }
      
      if (msg.type === 'message') {
        console.log('✓ 收到消息:', msg.message.type);
        messageReceived = true;
        clearTimeout(timeout);
        
        // 取消订阅
        setTimeout(() => {
          ws.close();
          console.log('✓ WebSocket 测试完成\n');
          resolve();
        }, 500);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      console.error('✗ WebSocket 错误:', err.message);
      reject(err);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      if (!messageReceived) {
        reject(new Error('WebSocket 未收到消息'));
      }
    });
  });
}

// 测试 7: 持久化规则
async function testPersistRules() {
  console.log('测试 7: 持久化规则');
  try {
    const result = await request('GET', '/v1/messages/rules');
    console.log('✓ 持久化规则数:', result.data.length);
    console.log('  示例规则:', result.data[0]);
  } catch (err) {
    console.error('✗ 获取规则失败:', err.message);
    throw err;
  }
  console.log('');
}

// 主测试流程
async function runTests() {
  try {
    await testHealth();
    await testStats();
    await testPublish();
    await sleep(500); // 等待消息处理
    await testHistory();
    await testSubscriptions();
    await testWebSocket();
    await testPersistRules();
    
    console.log('========================================');
    console.log('✓ 所有测试通过！');
    console.log('========================================');
    process.exit(0);
  } catch (err) {
    console.error('\n========================================');
    console.error('✗ 测试失败:', err.message);
    console.error('========================================');
    process.exit(1);
  }
}

runTests();
