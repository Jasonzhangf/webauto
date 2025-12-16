import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendCommand(ws, payload) {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        resolve(msg);
      } catch (err) {
        reject(err);
      }
    });
    ws.send(JSON.stringify(payload));
  });
}

async function main() {
  const ws = new WebSocket('ws://127.0.0.1:8765');

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  // 1. create session
  const createResp = await sendCommand(ws, {
    type: 'command',
    session_id: '',
    data: {
      command_type: 'session_control',
      action: 'create',
      browser_config: {
        headless: true,
        initial_url: 'https://example.com',
        session_name: 'dom-pick-smoke',
      },
    },
  });

  const sessionId = createResp?.data?.session_id;
  if (!sessionId) {
    throw new Error('Failed to create session');
  }

  console.log('[smoke] session created:', sessionId);

  // small wait to ensure page is ready
  await wait(2000);

  // 2. trigger pick_dom
  const pickPromise = sendCommand(ws, {
    type: 'command',
    session_id: sessionId,
    data: {
      command_type: 'node_execute',
      node_type: 'pick_dom',
      parameters: {
        timeout: 8000,
      },
    },
  });

  console.log('[smoke] please move mouse over page and click to select (headless may simulate default element)');

  const pickResp = await pickPromise;

  console.log('[smoke] pick_dom raw response:', JSON.stringify(pickResp, null, 2));

  const result = pickResp?.data?.data || pickResp?.data;

  if (!result) {
    throw new Error('No result payload from pick_dom');
  }

  if (result.timeout) {
    throw new Error('pick_dom timeout');
  }

  if (result.cancelled) {
    throw new Error('pick_dom cancelled');
  }

  if (!result.success) {
    throw new Error(`pick_dom failed: ${result.error || 'unknown'}`);
  }

  if (!result.dom_path || !result.selector) {
    throw new Error('pick_dom returned empty dom_path/selector');
  }

  console.log('[smoke] dom pick OK:', {
    dom_path: result.dom_path,
    selector: result.selector,
    rect: result.bounding_rect,
    text: result.text,
  });

  ws.close();
}

main().catch((err) => {
  console.error('[smoke] dom-pick-smoke failed:', err);
  process.exitCode = 1;
});
