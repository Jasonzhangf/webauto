#!/usr/bin/env node
// 交互式测试脚本：使用 dom:pick:2 捕获元素→局部树→容器草稿
import { spawn } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import { setTimeout as wait } from 'node:timers/promises';

const profile = 'weibo-fresh';
const targetUrl = 'https://weibo.com/';
const busPort = 8790;
const browserServicePort = 7704;
const browserServiceHost = '127.0.0.1';

async function waitForPort(port, host, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ port, host }, () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`waitForPort timeout: ${host}:${port}`));
        } else {
          setTimeout(attempt, 500);
        }
      });
    };
    attempt();
  });
}

async function main() {
  console.log('🧪 交互式流程测试：dom:pick:2 → dom:branch:2 → 容器草稿');
  
  // 1. 启动浏览器 + 浮窗
  console.log('1️⃣ 启动浏览器与浮窗...');
  const child = spawn(process.execPath, [
    'runtime/browser/scripts/one-click-browser.mjs',
    '--profile', profile,
    '--url', targetUrl,
    '--headless=false',
    '--console-ui',
    '--console-headless',
    '--console-detach'
  ], { stdio: 'inherit', env: process.env });
  
  const cleanup = () => {
    try { child.kill('SIGTERM'); } catch {}
  };
  
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.warn(`[test] one-click exited with code ${code}`);
    }
  });

  try {
    // 等待服务就绪
    await waitForPort(browserServicePort, browserServiceHost, 30000);
    await waitForPort(busPort, '127.0.0.1', 30000);
    console.log('✅ 服务就绪');

    // 2. 使用 dom:pick:2 捕获元素
    console.log('2️⃣ 使用 dom:pick:2 捕获元素 (.detail_wbtext_4CRf9)...');
    const pickRes = await fetch(`http://127.0.0.1:${browserServicePort}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'dom:pick:2', profile: profile, timeout: 20000 })
    }).then(r => r.json());
    console.log('dom:pick:2 结果:', pickRes);

    // 3. 使用 dom:branch:2 展开局部树
    if (pickRes?.data?.domPath) {
      console.log('3️⃣ 使用 dom:branch:2 展开局部树...');
      const branchRes = await fetch(`http://127.0.0.1:${browserServicePort}/command`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'dom:branch:2',
          profile: profile,
          url: targetUrl,
          path: pickRes.data.domPath,
          maxDepth: 1,
          maxChildren: 12
        })
      }).then(r => r.json());
      console.log('dom:branch:2 结果:', branchRes);
    }

    // 4. 检查是否出现容器草稿
    console.log('4️⃣ 检查容器树是否出现虚线草稿...');
    // TODO: 通过 bus 获取 UI 状态

    console.log('✅ 交互流程测试完成');
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
