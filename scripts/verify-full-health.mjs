import WebSocket from 'ws';

const UNIFIED_URL = 'http://127.0.0.1:7701';
const WS_URL = 'ws://127.0.0.1:7701/ws';
const BUS_URL = 'ws://127.0.0.1:7701/bus';

async function checkHttpHealth() {
  console.log('[health] Checking Unified API HTTP...');
  try {
    const res = await fetch(`${UNIFIED_URL}/health`);
    if (res.ok) {
      console.log('✅ HTTP /health OK');
      return true;
    } else {
      console.error(`❌ HTTP /health failed: ${res.status}`);
    }
  } catch (err) {
    console.error(`❌ HTTP check error: ${err.message}`);
  }
  return false;
}

function checkWsConnection(url, name) {
  return new Promise((resolve) => {
    console.log(`[health] Checking ${name} WebSocket...`);
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.terminate();
      console.error(`❌ ${name} timeout`);
      resolve(false);
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log(`✅ ${name} connected`);
      ws.close();
      resolve(true);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`❌ ${name} error: ${err.message}`);
      resolve(false);
    });
  });
}

async function checkBrowserStatus() {
  console.log('[health] Checking Browser Status (via action)...');
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const requestId = 'health-check-' + Date.now();
    
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'action',
        action: 'browser:status',
        requestId
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'response' && msg.requestId === requestId) {
          if (msg.success) {
            console.log('✅ Browser Status OK');
            console.log('   Sessions:', msg.data?.sessions?.length || 0);
            ws.close();
            resolve(true);
          } else {
            console.error('❌ Browser Status failed:', msg.error);
            ws.close();
            resolve(false);
          }
        }
      } catch {}
    });
    
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.close();
        resolve(false);
    }, 5000);
  });
}

async function main() {
  console.log('🏥 开始全链路健康检查...');
  
  const httpOk = await checkHttpHealth();
  if (!httpOk) process.exit(1);

  const wsOk = await checkWsConnection(WS_URL, 'Unified WS');
  const busOk = await checkWsConnection(BUS_URL, 'Event Bus');
  
  if (!wsOk || !busOk) process.exit(1);

  const browserOk = await checkBrowserStatus();
  if (!browserOk) {
      console.error('❌ 浏览器服务未就绪或无法响应');
      process.exit(1);
  }

  console.log('✅ 全链路健康检查通过');
  process.exit(0);
}

main();

