import WebSocket from 'ws';

const WS_URL = 'ws://127.0.0.1:8765';
let ws;
let sessionId;

// 简单的 Promise 包装等待
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.on('open', () => {
      console.log('✅ WebSocket 连接成功');
      resolve();
    });
    ws.on('error', (err) => {
      console.error('❌ WebSocket 连接失败:', err.message);
      reject(err);
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // 简单的会话捕获
        if (msg.type === 'session_created') {
          sessionId = msg.session_id;
        }
      } catch (e) {}
    });
  });
}

async function sendCommand(command) {
  return new Promise((resolve, reject) => {
    const id = Date.now();
    
    const listener = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.off('message', listener);
          resolve(msg.result || msg);
        }
      } catch (e) {}
    };
    ws.on('message', listener);

    ws.send(JSON.stringify({ ...command, id }));
  });
}

async function getOverlayTop() {
  const result = await sendCommand({
    command_type: 'evaluate',
    session_id: sessionId,
    expression: `(() => {
      const layer = document.getElementById('__webauto_highlight_layer');
      if (!layer || layer.children.length === 0) return null;
      const overlay = layer.children[0];
      return overlay.style.top;
    })()`
  });
  return result;
}

async function runTest() {
  try {
    console.log('⏳ 正在连接 Browser Service...');
    await connect();

    // 等待会话 ID (通常在连接后或通过列表获取)
    // 这里我们先获取列表
    console.log('⏳ 获取会话列表...');
    const listRes = await sendCommand({ command_type: 'list_sessions' });
    if (!listRes.sessions || listRes.sessions.length === 0) {
      console.log('❌ 没有活跃的浏览器会话，请先启动 start-headful.mjs');
      process.exit(1);
    }
    sessionId = listRes.sessions[0].id;
    console.log(`✅ 使用会话: ${sessionId}`);

    // 1. 高亮 body
    console.log('⚡ 发送高亮命令...');
    await sendCommand({
      command_type: 'highlight_element',
      session_id: sessionId,
      parameters: {
        selector: 'body',
        style: '2px solid red',
        sticky: true
      }
    });
    await wait(500);

    // 2. 获取初始位置
    const top1 = await getOverlayTop();
    console.log(`📍 初始 Overlay Top: ${top1}`);

    if (!top1) {
      console.error('❌ 未找到高亮框，高亮功能可能失效');
      process.exit(1);
    }

    // 3. 滚动页面
    console.log('📜 滚动页面 (window.scrollBy(0, 100))...');
    await sendCommand({
      command_type: 'evaluate',
      session_id: sessionId,
      expression: 'window.scrollBy(0, 100)'
    });
    
    // 等待 scroll listener 触发 (runtime.js 使用了 requestAnimationFrame)
    await wait(500);

    // 4. 获取滚动后位置
    const top2 = await getOverlayTop();
    console.log(`📍 滚动后 Overlay Top: ${top2}`);

    // 5. 验证
    const t1 = parseFloat(top1);
    const t2 = parseFloat(top2);
    
    console.log(`\n📊 验证结果:`);
    console.log(`   初始位置: ${t1}px`);
    console.log(`   滚动后位置: ${t2}px`);
    console.log(`   差异: ${t2 - t1}px`);

    // 因为 getBoundingClientRect 是相对于视口的
    // 向下滚动 100px，元素相对于视口上移 100px，top 应该减小
    // 注意：如果是 body，且 body 高度很大，它可能也是从 0 开始。
    // 如果页面能滚动，top 应该变化。
    
    if (Math.abs((t1 - t2) - 100) < 5) {
      console.log('✅ PASS: 高亮框跟随滚动正确移动');
    } else if (t1 === t2) {
      console.log('❌ FAIL: 高亮框位置未变化，滚动跟随失效');
    } else {
      console.log('⚠️ WARN: 位置发生了变化，但数值可能不符合预期 (可能是页面无法滚动或滚动距离不同)');
    }

  } catch (err) {
    console.error('❌ 测试出错:', err);
  } finally {
    if (ws) ws.close();
  }
}

runTest();
