#!/usr/bin/env node
/**
 * build health check
 *
 * 默认模式：headful 启动 + bus/ws/health 全链路验证（用于手动诊断）
 * quick 模式：仅检查服务 /health，不启动浏览器、不访问小红书（用于 CI / build:services）
 *
 * 用法：
 *   node scripts/health-check.mjs           # 完整 headful 校验（可能打开小红书）
 *   node scripts/health-check.mjs --quick   # 仅校验服务健康，不启动浏览器
 */

import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocket from 'ws';

const UNIFIED = 'http://127.0.0.1:7701';
const WS = 'ws://127.0.0.1:7701/ws';
const BUS = 'ws://127.0.0.1:7701/bus';
const BROWSER = 'http://127.0.0.1:7704';
const MATCH_TIMEOUT = Number(process.env.WEBAUTO_HEALTHCHECK_MATCH_TIMEOUT || 25000);
const HANDSHAKE_TIMEOUT = Number(process.env.WEBAUTO_HEALTHCHECK_HANDSHAKE_TIMEOUT || 8000);
const EARLY_TOPICS = ['health.status', 'ui.domPicker.result', 'browser.runtime.event'];

async function waitHealth(url, timeoutMs=20000){
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await wait(300);
  }
  return false;
}

async function waitBusEvent(topic, predicate, timeoutMs=18000, earlyTopics=['health.status']){
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BUS);
    let resetTimer = null;
    const done = (result) => {
      clearTimeout(resetTimer);
      try { ws.close(); } catch {}
      resolve(result);
    };
    const fail = (msg) => {
      clearTimeout(resetTimer);
      try { ws.close(); } catch {}
      reject(new Error(msg));
    };
    let timer = setTimeout(() => fail(`bus event timeout: ${topic}`), timeoutMs);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data.toString());
        if (msg?.type === 'event' && earlyTopics.includes(msg.topic)) {
          // 收到预热消息，重置计时器
          clearTimeout(timer);
          timer = setTimeout(() => fail(`bus event timeout: ${topic}`), timeoutMs);
        }
        if (msg?.topic !== topic) return;
        if (typeof predicate === 'function' && !predicate(msg?.payload)) return;
        done(msg);
      } catch {}
    };
    ws.onerror = (err) => fail(`bus connect error: ${err?.message || err}`);
  });
}

async function runQuickHealthCheck() {
  console.log('[health-check] quick mode: service-only health check (no browser)');

  const okUnified = await waitHealth(`${UNIFIED}/health`, 20000);
  if (!okUnified) throw new Error('unified-api not healthy');

  const okBrowser = await waitHealth(`${BROWSER}/health`, 20000);
  if (!okBrowser) throw new Error('browser-service not healthy');

  console.log('[health-check] ok (quick)');
  process.exit(0);
}

async function runHeadfulHealthCheck(){
  console.log('[health-check] start services (headful)');
  const child = spawn(
    'node',
    ['scripts/start-headful.mjs', '--profile', 'xiaohongshu_fresh', '--url', 'https://www.xiaohongshu.com/explore'],
    { stdio: 'inherit', windowsHide: true },
  );
  let childClosed = false;
  child.on('exit', () => {
    childClosed = true;
  });

  const okUnified = await waitHealth(`${UNIFIED}/health`, 20000);
  if (!okUnified) throw new Error('unified-api not healthy');

  const okBrowser = await waitHealth(`${BROWSER}/health`, 20000);
  if (!okBrowser) throw new Error('browser-service not healthy');

  // 等待容器匹配完成（实际检测成功判定）
  console.log('[health-check] waiting for containers.matched (timeout=%dms)', MATCH_TIMEOUT);
  const matchStarted = Date.now();
  const containerMatch = await waitBusEvent('containers.matched', payload => payload?.matched, MATCH_TIMEOUT, EARLY_TOPICS);
  console.log('[health-check] containers.matched received in %dms', Date.now() - matchStarted);
  if (!containerMatch) throw new Error('container matching failed');

  // 等待握手状态（可选项，至少一条即算成功）
  try {
    const handshake = await waitBusEvent('handshake.status', payload => payload?.status, HANDSHAKE_TIMEOUT, EARLY_TOPICS);
    console.log('[health-check] handshake status:', handshake?.payload?.status);
  } catch (err) {
    console.warn('[health-check] handshake timeout, continue');
  }

  console.log('[health-check] ok');
  if (!childClosed) {
    child.kill('SIGINT');
  }
  process.exit(0);
}

async function main(){
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');

  if (quick) {
    return runQuickHealthCheck();
  }

  return runHeadfulHealthCheck();
}

main().catch(err => {
  console.error('[health-check] failed:', err?.message || String(err));
  process.exit(1);
});
