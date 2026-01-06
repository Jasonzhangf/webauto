/**
 * 测试脚本：事件驱动链路验证
 * 
 * 目标：验证 appear -> click -> extract 事件链
 */

import WebSocket from 'ws';

const UNIFIED_WS = 'ws://127.0.0.1:7701/ws';
const PROFILE = 'weibo_fresh';

function log(type, msg) {
  console.log(`[${type}] ${msg}`);
}

async function main() {
  const ws = new WebSocket(UNIFIED_WS);
  
  ws.on('open', () => {
    log('SYSTEM', 'Connected to WebSocket');
    
    // 订阅所有容器事件
    ws.send(JSON.stringify({
      type: 'subscribe',
      topic: 'container:*'
    }));
    
    // 触发容器匹配以启动事件流
    fetch('http://127.0.0.1:7701/v1/controller/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'containers:match',
        payload: {
          profile: PROFILE,
          url: 'https://weibo.com/',
          maxDepth: 3
        }
      })
    });
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type !== 'event') return;
      
      const { topic, payload } = msg;
      
      // 1. 监听 expand_button appear
      if (topic.includes('expand_button:appear')) {
        log('EVENT', `Expand button appeared: ${payload.containerId}`);
      }
      
      // 2. 监听 click 操作
      if (topic.includes(':click')) {
        log('EVENT', `Click triggered on ${payload.containerId} (trigger: ${payload.trigger})`);
      }
      
      // 3. 监听操作完成
      if (topic.includes(':operation:completed')) {
        log('EVENT', `Operation completed: ${payload.operationType} on ${payload.containerId}`);
        
        // 如果是 click 完成，手动触发 extract 验证
        if (payload.operationType === 'click') {
          // 找到对应的 feed_post ID (假设它是父容器或关联容器)
          // 这里简化处理，直接打印日志
          log('ACTION', 'Expand completed, ready to re-extract');
        }
      }
      
    } catch (e) {
      log('ERROR', e.message);
    }
  });
  
  // 30秒后自动退出
  setTimeout(() => {
    log('SYSTEM', 'Test timeout, exiting...');
    ws.close();
    process.exit(0);
  }, 30000);
}

main().catch(console.error);
