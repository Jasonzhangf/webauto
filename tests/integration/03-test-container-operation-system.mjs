import { WebSocket } from 'ws';
import http from 'node:http';

const HOST = '127.0.0.1';
const PORT = 7701;
const WS_URL = `ws://${HOST}:${PORT}/ws`;
const API_HOST = `http://${HOST}:${PORT}`;
const LOG_FILE = '/tmp/test-operation-system.log';

function log(msg) {
  console.log(msg);
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
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function testSubscription() {
  log('[TEST] Subscribing to container status...');
  const res = await httpPost('/v1/container/test-container/subscribe', {});
  if (!res.success) throw new Error('Subscription failed');
  log('[TEST] Subscription OK');
}

async function testWebSocketEvent() {
  log('[TEST] Connecting WebSocket...');
  const ws = new WebSocket(WS_URL);

  const ready = new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  await ready;
  log('[TEST] WebSocket connected');

  return new Promise((resolve, reject) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ready') {
        log('[TEST] WS ready');
        resolve(true);
        ws.close();
      }
    });

    setTimeout(() => {
      reject(new Error('Timeout waiting for WS ready')); 
      ws.close();
    }, 5000);
  });
}

async function run() {
  try {
    await testSubscription();
    await testWebSocketEvent();
    log('[TEST] ✅ Operation System integration test passed');
  } catch (err) {
    console.error('[TEST] ❌ Operation System integration test failed', err.message);
    process.exit(1);
  }
}

run();
