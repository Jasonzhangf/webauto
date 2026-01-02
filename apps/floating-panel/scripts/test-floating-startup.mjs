#!/usr/bin/env node
/**
 * 浮窗启动集成测试 - 验证浮窗能否正常启动并初始化
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = join(__dirname, '..');

console.log('[floating-startup-test] Starting floating panel startup test...');
console.log('[floating-startup-test] App root:', appRoot);

// 设置环境变量：headless模式，启用devtools输出
const env = {
  ...process.env,
  WEBAUTO_FLOATING_HEADLESS: '1',
  WEBAUTO_FLOATING_DEVTOOLS: '0',
  DEBUG: '1'
};

const electronPath = join(appRoot, 'node_modules', '.bin', 'electron');
const args = [appRoot];

console.log('[floating-startup-test] Spawning electron process...');
const electronProcess = spawn(electronPath, args, {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  cwd: appRoot
});

let stdout = '';
let stderr = '';
let timeout = null;
let hasError = false;

electronProcess.stdout.on('data', (data) => {
  const str = data.toString();
  stdout += str;
  console.log('[stdout]', str.trim());
});

electronProcess.stderr.on('data', (data) => {
  const str = data.toString();
  stderr += str;
  console.error('[stderr]', str.trim());
  
  // 检测关键错误
  if (str.includes('Error') || str.includes('Exception') || str.includes('failed')) {
    if (str.includes('Render frame was disposed')) {
      console.error('[floating-startup-test] ❌ CRITICAL: Render frame disposal error detected!');
      hasError = true;
    }
  }
});

electronProcess.on('close', (code) => {
  if (timeout) {
    clearTimeout(timeout);
  }
  
  console.log('[floating-startup-test] Electron process exited with code:', code);
  
  // 检查是否有必要的日志
  const hasAppReady = stdout.includes('App ready') || stderr.includes('App ready');
  const hasWindowCreated = stdout.includes('Creating window') || stderr.includes('Creating window');
  const hasBusConnected = stdout.includes('Bus WebSocket OPEN') || stderr.includes('Bus WebSocket OPEN');
  const hasPreloadComplete = stdout.includes('Preload script completed') || stderr.includes('Preload script completed');
  
  console.log('\n[floating-startup-test] Startup check results:');
  console.log('  - App ready:', hasAppReady ? '✅' : '❌');
  console.log('  - Window created:', hasWindowCreated ? '✅' : '❌');
  console.log('  - Bus connected:', hasBusConnected ? '✅' : '❌');
  console.log('  - Preload complete:', hasPreloadComplete ? '✅' : '❌');
  console.log('  - Has critical errors:', hasError ? '❌' : '✅');
  
  if (hasAppReady && hasWindowCreated && hasPreloadComplete && !hasError) {
    console.log('\n[floating-startup-test] ✅ Floating panel startup test PASSED');
    process.exit(0);
  } else {
    console.error('\n[floating-startup-test] ❌ Floating panel startup test FAILED');
    process.exit(1);
  }
});

electronProcess.on('error', (err) => {
  console.error('[floating-startup-test] Failed to start electron:', err);
  process.exit(1);
});

// 设置10秒超时
timeout = setTimeout(() => {
  console.error('[floating-startup-test] ❌ Test timeout after 10 seconds');
  electronProcess.kill('SIGTERM');
  
  setTimeout(() => {
    electronProcess.kill('SIGKILL');
    process.exit(1);
  }, 2000);
}, 10000);

console.log('[floating-startup-test] Test timeout set to 10 seconds...');
