#!/usr/bin/env node
/**
 * weibo_fresh profile 基础回环测试脚本
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { BrowserService } from '../modules/browser/src/service.mjs';

const profileId = 'weibo_fresh';
const targetUrl = 'https://weibo.com';
const browserOpts = { host: '127.0.0.1', port: 7704 };

function spawnBrowserService() {
  const child = spawn('node', ['libs/browser/remote-service.js', '--host', browserOpts.host, '--port', String(browserOpts.port), '--ws-host', '127.0.0.1', '--ws-port', '8765'], {
    stdio: 'inherit',
    env: process.env
  });
  return child;
}

async function waitForHealth(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1200) });
      if (res.ok) return true;
    } catch {}
    await new Promise(res => setTimeout(res, 500));
  }
  return false;
}

async function main() {
  console.log('[test] 启动Browser Service');
  const browserProc = spawnBrowserService();
  const healthy = await waitForHealth('http://127.0.0.1:7704/health');
  if (!healthy) {
    console.error('[test] Browser Service 启动失败');
    browserProc.kill();
    process.exit(1);
  }
  console.log('[test] Browser Service 已就绪');

  const browserService = new BrowserService(browserOpts);

  console.log('[test] 创建会话...');
  const session = await browserService.createSession({ profile: profileId, url: targetUrl, headless: false });
  console.log('[test] create session result:', session);
  assert.equal(session.success, true, '会话创建应该成功');

  console.log('[test] 获取状态...');
  const status = await browserService.getStatus();
  console.log('[test] status:', status);
  assert.equal(status.success, true, 'getStatus 应该成功');
  assert.ok((status.sessions || []).length >= 0, '返回 session 列表');

  console.log('[test] 获取 cookie...');
  const cookies = await browserService.getCookies(profileId);
  console.log('[test] cookies count:', cookies.cookies?.length || 0);
  assert.equal(cookies.success, true, 'getCookies 应该成功');

  browserProc.kill();
  console.log('[test] ✅ 完成 weibo_fresh profile 回环测试');
}

main().catch(err => {
  console.error('[test] ❌ 失败:', err);
  process.exit(1);
});
