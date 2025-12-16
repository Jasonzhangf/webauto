#!/usr/bin/env node
import fs from 'node:fs/promises';
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
const selector = flags.selector || flags.sel || '.vue-component';
const timeoutMs = Number(flags.timeout ?? '10000');
const settleMs = Number(flags.settle_ms ?? flags.settleMs ?? '32');
const screenshotName = flags.screenshot && flags.screenshot !== 'true' ? flags.screenshot : null;
const takeScreenshot = flags.screenshot === 'true' || Boolean(screenshotName);
const fullPage = flags.fullpage === 'true' || flags.full_page === 'true';

const wsHost = process.env.WEBAUTO_BROWSER_WS_HOST || '127.0.0.1';
const wsPort = Number(process.env.WEBAUTO_BROWSER_WS_PORT || 8765);
const wsUrl = `ws://${wsHost}:${wsPort}`;

const httpHost = process.env.WEBAUTO_BROWSER_HOST || '127.0.0.1';
const httpPort = Number(process.env.WEBAUTO_BROWSER_PORT || 7704);
const commandUrl = `http://${httpHost}:${httpPort}/command`;

function send(payload) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('dom-picker-loopback command timeout'));
    }, 20000);
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

async function postHttpCommand(action, args = {}) {
  const res = await fetch(commandUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, args }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function runLoopback() {
  if (!profileId) {
    throw new Error('missing profile');
  }
  if (!selector) {
    throw new Error('dom-picker-loopback requires --selector');
  }
  const payload = {
    type: 'command',
    session_id: profileId,
    data: {
      command_type: 'node_execute',
      node_type: 'dom_pick_loopback',
      parameters: {
        selector,
        timeout: timeoutMs,
        settle_ms: settleMs,
      },
    },
  };
  const response = await send(payload);
  if (response?.data?.success === false || response?.success === false) {
    throw new Error(response?.data?.error || response?.error || 'dom_pick_loopback failed');
  }
  const data = response?.data?.data || response?.data || response || {};
  console.log('[dom-picker-loopback]', JSON.stringify(data, null, 2));
  return data;
}

async function captureScreenshot() {
  const filename = screenshotName || `dom_picker_loopback_${Date.now()}.png`;
  const data = await postHttpCommand('screenshot', { profileId, fullPage });
  const b64 = data?.data;
  if (!b64) throw new Error('screenshot: empty body.data');
  const dir = path.resolve(process.cwd(), 'screenshots');
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, filename);
  await fs.writeFile(target, Buffer.from(b64, 'base64'));
  console.log('[dom-picker-loopback] screenshot saved', target);
  return target;
}

async function main() {
  await runLoopback();
  if (takeScreenshot) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await captureScreenshot();
  }
}

main().catch((err) => {
  console.error('[dom-picker-loopback] failed', err?.message || err);
  process.exit(1);
});
