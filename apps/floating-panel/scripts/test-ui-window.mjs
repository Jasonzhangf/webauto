#!/usr/bin/env node
/**
 * UI 主窗口回环测试
 * 1. 启动 Electron 主进程并加载 dist/renderer/index.html
 * 2. 验证 window.api 存在并可调用 minimize / close
 * 3. 不依赖外部服务，仅验证 preload IPC 与窗口行为
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const electron = path.join(root, 'node_modules/.bin/electron');
const entry = path.join(__dirname, 'test-ui-window-entry.mjs');

const log = (msg) => console.log(`[ui-window-test] ${msg}`);

function run() {
  return new Promise((resolve, reject) => {
    log('启动 Electron...');
    const proc = spawn(electron, [entry], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Electron exit ${code}\n${stderr}`));
      resolve(stdout);
    });
  });
}

run()
  .then((out) => {
    if (out.includes('[ui-window-test] window.api OK')) {
      log('✅ UI 主窗口回环测试通过');
      process.exit(0);
    }
    throw new Error('未检测到成功标记');
  })
  .catch((err) => {
    console.error('❌ UI 主窗口回环测试失败:', err.message);
    process.exit(1);
  });
