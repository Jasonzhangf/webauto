#!/usr/bin/env node
import path from 'path';
import { WebSocket } from 'ws';

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 1) {
  const token = args[i];
  if (!token.startsWith('--')) continue;
  const key = token.slice(2);
  const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
  flags[key] = value;
}

const profileId = flags.profile || process.env.WEBAUTO_UI_TEST_PROFILE || 'weibo-fresh';
const selector = flags.selector || process.env.WEBAUTO_HIGHLIGHT_SELECTOR || '#app';
const clearOnly = flags.clear === 'true';
const wsHost = process.env.WEBAUTO_BROWSER_WS_HOST || '127.0.0.1';
const wsPort = Number(process.env.WEBAUTO_BROWSER_WS_PORT || 8765);
const wsUrl = `ws://${wsHost}:${wsPort}`;

function send(payload) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('highlight command timeout'));
    }, 15000);
    socket.once('open', () => socket.send(JSON.stringify(payload)));
    socket.once('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject(err);
      } finally {
        socket.close();
      }
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  if (!profileId) {
    throw new Error('missing profile');
  }
  const payload = {
    type: 'command',
    session_id: profileId,
    data: {
      command_type: 'dev_command',
      action: clearOnly ? 'clear_highlight' : 'highlight_element',
      parameters: clearOnly
        ? {}
        : {
            selector,
            duration: Number(process.env.WEBAUTO_HIGHLIGHT_DURATION || '1800'),
          },
    },
  };
  const response = await send(payload);
  if (response?.data?.success === false) {
    throw new Error(response?.data?.error || 'highlight command failed');
  }
  console.log(`[send-highlight-cli] ${clearOnly ? 'cleared' : 'highlighted'} via ${wsUrl}`);
}

main().catch((err) => {
  console.error('[send-highlight-cli] failed', err?.message || err);
  process.exit(1);
});
