#!/usr/bin/env node
/**
 * 全局回环测试脚本（按模块整理）
 * 依赖：请先启动 Unified API(7701) 与 Browser Service(7704)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const steps = [
  {
    name: 'browser:highlight-loop',
    cmd: 'node',
    args: [path.join(repoRoot, 'modules/browser/tests/highlight-loop.test.mjs')],
  },
  {
    name: 'browser:container-match-loop',
    cmd: 'node',
    args: [path.join(repoRoot, 'modules/browser/tests/container-match-loop.test.mjs')],
  },
  {
    name: 'dom-branch-fetcher:loop',
    cmd: 'node',
    args: [path.join(repoRoot, 'modules/dom-branch-fetcher/tests/fetchBranch-loop.test.mjs')],
  },
  {
    name: 'floating-panel:preload-loop',
    cmd: 'npx',
    args: ['electron', 'scripts/test-preload.cjs'],
    cwd: path.join(repoRoot, 'apps/floating-panel'),
    env: { PRELOAD_PATH: path.join(repoRoot, 'apps/floating-panel/dist/main/preload.cjs') },
  },
  {
    name: 'floating-panel:ui-window-loop',
    cmd: 'npx',
    args: ['electron', 'scripts/test-ui-window-entry.mjs'],
    cwd: path.join(repoRoot, 'apps/floating-panel'),
  },
];

const services = [
  {
    name: 'unified-api',
    health: 'http://127.0.0.1:7701/health',
    cmd: 'node',
    args: [path.join(repoRoot, 'services/unified-api/server.mjs')],
  },
  {
    name: 'browser-service',
    health: 'http://127.0.0.1:7704/health',
    cmd: 'node',
    args: [path.join(repoRoot, 'libs/browser/remote-service.js'), '--host', '127.0.0.1', '--port', '7704', '--wsPort', '8765', '--wsHost', '127.0.0.1', '--enableWs'],
  },
];

const running = new Map();

async function waitForHealth(url, retries = 20, delayMs = 500) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function ensureService(service) {
  const ok = await waitForHealth(service.health, 2, 200);
  if (ok) return;

  console.log(`[loop] 启动服务: ${service.name}`);
  const proc = spawn(service.cmd, service.args, {
    cwd: repoRoot,
    env: { ...process.env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  running.set(service.name, proc);

  const ready = await waitForHealth(service.health, 30, 500);
  if (!ready) {
    throw new Error(`${service.name} 启动失败: ${service.health}`);
  }
}

function shutdownServices() {
  for (const [name, proc] of running.entries()) {
    console.log(`[loop] 停止服务: ${name}`);
    proc.kill('SIGTERM');
  }
}

function runStep(step) {
  return new Promise((resolve, reject) => {
    const proc = spawn(step.cmd, step.args, {
      cwd: step.cwd || repoRoot,
      env: { ...process.env, ...(step.env || {}) },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${step.name} failed (exit ${code})`));
      resolve();
    });
  });
}

async function run() {
  console.log('=== 全局回环测试开始 ===');
  for (const service of services) {
    await ensureService(service);
  }
  for (const step of steps) {
    console.log(`\n[loop] ${step.name}`);
    await runStep(step);
  }
  console.log('\n✅ 全局回环测试完成');
}

run().then(() => shutdownServices()).catch((err) => {
  shutdownServices();
  console.error(`\n❌ 全局回环测试失败: ${err.message}`);
  process.exit(1);
});
