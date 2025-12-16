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
let x = flags.x !== undefined ? Number(flags.x) : flags.clientX !== undefined ? Number(flags.clientX) : NaN;
let y = flags.y !== undefined ? Number(flags.y) : flags.clientY !== undefined ? Number(flags.clientY) : NaN;
const channel = flags.channel || 'point-highlight';
const style = flags.style || '2px dashed rgba(255, 140, 0, 0.9)';
const duration = Number(flags.duration ?? '0');
const rootSelector = flags.root || flags.rootSelector || null;
const screenshotName = flags.screenshot && flags.screenshot !== 'true' ? flags.screenshot : null;
const takeScreenshot = flags.screenshot === 'true' || Boolean(screenshotName);
const fullPage = flags.fullpage === 'true' || flags.full_page === 'true';
const selector = flags.selector || null;
const skipClear = flags.skipClear === 'true';

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
      reject(new Error('highlight-point command timeout'));
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

async function highlightPoint() {
  if (!profileId) {
    throw new Error('missing profile');
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    if (!selector) {
      throw new Error('highlight-point requires numeric --x/--y or --selector');
    }
    const point = await resolvePointFromSelector(selector);
    if (!point) {
      throw new Error(`selector "${selector}" not found`);
    }
    x = point.x;
    y = point.y;
  }
  const payload = {
    type: 'command',
    session_id: profileId,
    data: {
      command_type: 'dev_command',
      action: 'highlight_point',
      parameters: {
        x,
        y,
        channel,
        style,
        duration,
        root_selector: rootSelector,
      },
    },
  };
  const response = await send(payload);
  if (response?.data?.success === false || response?.success === false) {
    throw new Error(response?.data?.error || response?.error || 'highlight_point failed');
  }
  const result = response?.data?.data || response?.data || response || {};
  console.log('[highlight-point-cli] highlighted', {
    x,
    y,
    channel,
    element: result?.element || null,
    rect: result?.rect || null,
  });
  return result;
}

async function resolvePointFromSelector(targetSelector) {
  const script = `
    (() => {
      const el = document.querySelector(${JSON.stringify(targetSelector)});
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const viewportWidth = Math.max(1, window.innerWidth || document.documentElement?.clientWidth || 1280);
      const viewportHeight = Math.max(1, window.innerHeight || document.documentElement?.clientHeight || 800);
      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
      const inset = 6;
      const left = Math.max(rect.left + inset, inset);
      const right = Math.min(rect.right - inset, viewportWidth - inset);
      const top = Math.max(rect.top + inset, inset);
      const bottom = Math.min(rect.bottom - inset, viewportHeight - inset);
      const safeX = right >= left ? (left + right) / 2 : rect.left + inset;
      const safeY = bottom >= top ? (top + bottom) / 2 : rect.top + inset;
      return {
        x: clamp(safeX, inset, viewportWidth - inset),
        y: clamp(safeY, inset, viewportHeight - inset)
      };
    })();
  `;
  const response = await postHttpCommand('evaluate', { profileId, script });
  return response?.result ?? null;
}

async function captureScreenshot() {
  const filename = screenshotName || `highlight_point_${Date.now()}.png`;
  const data = await postHttpCommand('screenshot', { profileId, fullPage });
  const b64 = data?.data;
  if (!b64) throw new Error('screenshot: empty body.data');
  const dir = path.resolve(process.cwd(), 'screenshots');
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, filename);
  await fs.writeFile(target, Buffer.from(b64, 'base64'));
  console.log('[highlight-point-cli] screenshot saved', target);
  return target;
}

async function clearHighlightChannel() {
  if (skipClear) return;
  const payload = {
    type: 'command',
    session_id: profileId,
    data: {
      command_type: 'dev_command',
      action: 'clear_highlight',
      parameters: {
        channel,
      },
    },
  };
  const response = await send(payload);
  if (response?.data?.success === false || response?.success === false) {
    throw new Error(response?.data?.error || response?.error || 'clear highlight failed');
  }
}

async function main() {
  await highlightPoint();
  if (takeScreenshot) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await captureScreenshot();
  }
  await clearHighlightChannel();
}

main().catch((err) => {
  console.error('[highlight-point-cli] failed', err?.message || err);
  process.exit(1);
});
