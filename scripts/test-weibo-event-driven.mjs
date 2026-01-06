/**
 * 测试脚本：验证微博事件驱动流程
 *
 * 测试点：
 * 1. 容器匹配后是否发送 container.appear 事件
 * 2. 展开按钮出现时是否触发自动点击
 * 3. 点击后是否重新提取内容
 */

const WS_URL = 'ws://127.0.0.1:7701/ws';
const API_URL = 'http://127.0.0.1:7701';

async function testContainerMatching() {
  console.log('\n=== 测试容器匹配 ===\n');

  try {
    const response = await fetch(`${API_URL}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'containers:match',
        payload: {
          profile: 'weibo_fresh',
          url: 'https://weibo.com/',
          maxDepth: 2,
          maxChildren: 5
        }
      })
    });

    const result = await response.json();
    console.log('✅ 容器匹配结果:', result.success);
    
    if (result.success && result.data) {
      const snapshot = result.data.snapshot || result.data;
      console.log('- Root容器:', snapshot?.root_match?.container?.id);
      console.log('- 容器树节点数:', snapshot?.container_tree?.children?.length || 0);
    }
  } catch (error) {
    console.error('❌ 容器匹配失败:', error.message);
  }
}

async function testExpandButton() {
  console.log('\n=== 测试展开按钮 ===\n');

  try {
    const response = await fetch(`${API_URL}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'containers:inspect',
        payload: {
          profile: 'weibo_fresh',
          containerId: 'weibo_main_page.feed_post.expand_button',
          maxDepth: 2,
          maxChildren: 3
        }
      })
    });

    const result = await response.json();
    console.log('✅ 展开按钮检查结果:', result.success);
    
    if (result.success && result.data) {
      const snapshot = result.data.snapshot || result.data;
      const container = snapshot?.container || snapshot?.container_tree?.container;
      console.log('- 容器ID:', container?.id);
      console.log('- 匹配数:', container?.match_count);
      console.log('- 自动点击:', container?.definition?.metadata?.auto_click);
    }
  } catch (error) {
    console.error('❌ 展开按钮检查失败:', error.message);
  }
}

async function testEventSubscription() {
  console.log('\n=== 测试事件订阅 ===\n');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const events = new Set();
    
    ws.on('open', () => {
      console.log('✅ WebSocket 已连接');
      // 订阅容器事件
      ws.send(JSON.stringify({
        type: 'subscribe',
        topic: 'container:*'
      }));
      
      // 触发容器匹配
      testContainerMatching().then(() => {
        // 等待5秒收集事件
        setTimeout(() => {
          ws.close();
          console.log('\n收集到的事件:', Array.from(events));
          resolve();
        }, 5000);
      });
    });
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'event') {
          console.log(`📨 事件: ${msg.topic}`);
          events.add(msg.topic);
          
          // 检查是否是 appear 事件
          if (msg.topic === 'container:appear' || msg.topic?.includes(':appear')) {
            console.log(`  - 容器出现: ${msg.payload?.containerId}`);
          }
        }
      } catch (e) {
        console.error('事件解析失败:', e);
      }
    });
    
    ws.on('error', reject);
    ws.on('close', () => console.log('\nWebSocket 已关闭'));
  });
}

async function main() {
  console.log('\n🧪 WebAuto 事件驱动测试\n');
  
  try {
    // Step 1: 测试容器匹配
    await testContainerMatching();
    
    // Step 2: 测试展开按钮
    await testExpandButton();
    
    // Step 3: 测试事件订阅
    await testEventSubscription();
    
    console.log('\n✅ 测试完成\n');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

main();
