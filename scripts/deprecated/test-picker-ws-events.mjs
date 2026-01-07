#!/usr/bin/env node

/**
 * 验证 picker 事件是否通过 browser.runtime.event WebSocket 通道正确广播：
 * 1. 启动浏览器会话并注入 picker bundle
 * 2. 订阅 browser.runtime.event 与 browser.runtime.event.picker_shield
 * 3. 在页面内模拟 pointer 事件触发拾取
 * 4. 断言 WS 收到 hover/pointerdown/blocked-click/container:created 等事件
 *
 * 本脚本要求 Browser Service 已运行在 127.0.0.1:7704，WS Server 监听 8765。
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { build } from 'esbuild';

const BROWSER_HOST = '127.0.0.1';
const BROWSER_HTTP_PORT = 7704;
const BROWSER_WS_PORT = 8765;
const HTTP_BASE = `http://${BROWSER_HOST}:${BROWSER_HTTP_PORT}`;
const WS_URL = `ws://${BROWSER_HOST}:${BROWSER_WS_PORT}`;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pickerEntry = path.join(repoRoot, 'src/modules/executable-container/inpage/picker.ts');

async function browserCommand(action, args = {}, timeout = 20000) {
  const controllerUrl = `${HTTP_BASE}/command`;
  const resp = await fetch(controllerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`command ${action} failed: ${resp.status} ${text}`);
  }
  const data = await resp.json().catch(() => ({}));
  if (!data?.ok) {
    throw new Error(`command ${action} error: ${JSON.stringify(data)}`);
  }
  return data;
}

async function ensureBrowserService() {
  const health = await fetch(`${HTTP_BASE}/health`).catch(() => null);
  if (!health || !health.ok) {
    throw new Error('BrowserService 未运行 (http://127.0.0.1:7704/health 无响应)');
  }
}

function buildTestHtml() {
  const iframeDoc = String.raw`<!doctype html><html><body style="margin:0;font-family:sans-serif;">
    <div id="inner" style="width:150px;height:150px;background:#f9c;font-size:16px;display:flex;align-items:center;justify-content:center;">
      Inner Target
    </div>
    <script>
      window.__innerClicks = 0;
      document.getElementById('inner').addEventListener('click', () => {
        window.__innerClicks += 1;
      });
    </script>
  </body></html>`;
  const escapedIframeDoc = iframeDoc.replace(/"/g, '&quot;');
  return String.raw`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>WS Picker Test</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      .box { width: 200px; height: 200px; margin: 60px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
      #target { background: #b3d4fc; }
    </style>
  </head>
  <body>
    <div id="target" class="box">Main Target</div>
    <iframe id="child-frame" srcdoc="${escapedIframeDoc}" style="width:220px;height:220px;border:2px solid #444;margin:40px;"></iframe>
    <iframe id="blocked-frame" src="https://www.wikipedia.org" style="width:1px;height:1px;border:0;"></iframe>
  </body>
</html>`;
}

async function bundlePicker() {
  const result = await build({
    entryPoints: [pickerEntry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    sourcemap: false,
    write: false,
    target: ['es2022'],
  });
  return result.outputFiles[0].text;
}

async function subscribeRuntimeEvents(sessionId, topics = []) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.once('error', (err) => reject(err));
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        session_id: sessionId,
        request_id: 'sub-1',
        data: { topics: topics.length ? topics : ['browser.runtime.event'] },
      }));
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'response' && msg.request_id === 'sub-1' && msg.data?.success) {
          ws.removeAllListeners('error');
          resolve(ws);
        }
      } catch {
        /* ignore */
      }
    });
  });
}

async function simulatePick(profileId) {
  const script = `
    (() => new Promise((resolve) => {
      const target = document.getElementById('target');
      if (!target) { resolve(false); return; }
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const base = { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 42, isPrimary: true, button: 0, clientX: x, clientY: y };
      const dispatch = (type) => {
        if (type.startsWith('pointer')) {
          const evt = new PointerEvent(type, base);
          target.dispatchEvent(evt);
        } else {
          const evt = new MouseEvent(type, base);
          target.dispatchEvent(evt);
        }
      };
      dispatch('pointermove');
      dispatch('pointerdown');
      setTimeout(() => {
        dispatch('pointerup');
        dispatch('click');
        resolve(true);
      }, 120);
    }))();
  `;
  await browserCommand('evaluate', { profileId, script });
}

function waitForRequiredEvents(ws) {
  const required = {
    hover: false,
    pointerdown: false,
    blockedClick: false,
    containerCreated: false,
  };
  let frameBlocked = false;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`runtime events timeout: ${JSON.stringify({ ...required, frameBlocked })}`));
    }, 15000);
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type !== 'event') return;
        const { topic, data } = msg;
        const evt = data?.event;
        if (evt?.type === 'picker:shield') {
          const action = evt.data?.action;
          if (action === 'hover') required.hover = true;
          if (action === 'pointerdown') required.pointerdown = true;
          if (action === 'blocked-click') required.blockedClick = true;
          if (action === 'frame-blocked') frameBlocked = true;
        }
        if (evt?.type === 'container:created') {
          required.containerCreated = true;
        }
        if (Object.values(required).every(Boolean)) {
          clearTimeout(timer);
          ws.close();
          resolve({ ...required, frameBlocked });
        }
      } catch (err) {
        console.warn('[ws-events] parse error:', err);
      }
    });
  });
}

function dataUrlFromHtml(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function main() {
  try {
    console.log('[picker-ws] 检查 BrowserService ...');
    await ensureBrowserService();
    const profileId = `picker_ws_${Date.now()}`;
    console.log('[picker-ws] 启动作业 session:', profileId);
    await browserCommand('start', { profileId, headless: true, url: 'about:blank' });
    try {
      const topics = ['browser.runtime.event', 'browser.runtime.event.picker_shield', 'browser.runtime.event.container_created'];
      console.log('[picker-ws] 建立 WebSocket 订阅...');
      const ws = await subscribeRuntimeEvents(profileId, topics);
      await delay(300); // 让 runtime bridge 建立
      console.log('[picker-ws] WebSocket 已订阅 runtime 事件');

      const html = buildTestHtml();
      await browserCommand('goto', { profileId, url: dataUrlFromHtml(html) });
      console.log('[picker-ws] 已导航到测试页面');

      const bundle = await bundlePicker();
      await browserCommand('evaluate', { profileId, script: bundle });
      const waitEvents = waitForRequiredEvents(ws);
      await browserCommand('evaluate', { profileId, script: 'window.__webautoPicker?.start({ longPressMs: 20, showContainerTree: false });' });
      await simulatePick(profileId);
      const flags = await waitEvents;
      if (!flags.frameBlocked) {
        console.warn('[picker-ws] ⚠️ 未捕获 frame-blocked 事件（可能由浏览器策略或 iframe 拒绝嵌入导致）');
      }
      console.log('[picker-ws] 收到 runtime 事件：', flags);
      console.log('[picker-ws] ✅ WebSocket picker 事件验证成功');
    } finally {
      await browserCommand('stop', { profileId }).catch(() => {});
    }
  } catch (err) {
    console.error('[picker-ws] ❌ 测试失败:', err.message || err);
    process.exit(1);
  }
}

main();
