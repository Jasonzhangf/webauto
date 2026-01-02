#!/usr/bin/env node
/**
 * 浮窗启动集成测试 - 验证浮窗能否正常启动并初始化
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = join(__dirname, '..');
const LOG_FILE = join(tmpdir(), 'webauto-floating-panel.log');

console.log('[floating-startup-test] Starting floating panel startup test...');
console.log('[floating-startup-test] App root:', appRoot);
console.log('[floating-startup-test] Log file:', LOG_FILE);

// 清空日志文件
if (existsSync(LOG_FILE)) {
  unlinkSync(LOG_FILE);
}

// 设置环境变量：headless模式
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

let timeout = null;

electronProcess.stdout.on('data', (data) => {
  console.log('[stdout]', data.toString().trim());
});

electronProcess.stderr.on('data', (data) => {
  console.error('[stderr]', data.toString().trim());
});

electronProcess.on('close', (code) => {
  if (timeout) {
    clearTimeout(timeout);
  }
  
  console.log('[floating-startup-test] Electron process exited with code:', code);
  
  // 检查日志文件
  let logContent = '';
  try {
    if (existsSync(LOG_FILE)) {
      logContent = readFileSync(LOG_FILE, 'utf8');
    } else {
      console.error('[floating-startup-test] ❌ Log file not found!');
      process.exit(1);
    }
  } catch (err) {
    console.error('[floating-startup-test] ❌ Failed to read log file:', err);
    process.exit(1);
  }
  
  // 检查关键日志标记
  const hasAppReady = logContent.includes('App ready');
  const hasWindowCreated = logContent.includes('Creating window');
  const hasHTMLLoaded = logContent.includes('HTML loaded successfully') || logContent.includes('Loading HTML from:');
  const hasWindowShown = logContent.includes('Window shown') || logContent.includes('Window ready-to-show');
  const hasFileNotFound = logContent.includes('ERR_FILE_NOT_FOUND');
  const hasCorrectRoot = logContent.includes('PROJECT_ROOT: /Users/fanzhang/Documents/github/webauto/apps/floating-panel') ||
                          logContent.includes('apps/floating-panel');
  
  console.log('\n[floating-startup-test] Startup check results:');
  console.log('  - App ready:', hasAppReady ? '✅' : '❌');
  console.log('  - Window created:', hasWindowCreated ? '✅' : '❌');
  console.log('  - HTML loaded:', hasHTMLLoaded ? '✅' : '❌');
  console.log('  - Window shown:', hasWindowShown ? '✅' : '❌');
  console.log('  - Correct PROJECT_ROOT:', hasCorrectRoot ? '✅' : '❌');
  console.log('  - No file errors:', !hasFileNotFound ? '✅' : '❌');
  
  if (hasAppReady && hasWindowCreated && hasHTMLLoaded && hasWindowShown && !hasFileNotFound) {
    console.log('\n[floating-startup-test] ✅ Floating panel startup test PASSED');
    process.exit(0);
  } else {
    console.error('\n[floating-startup-test] ❌ Floating panel startup test FAILED');
    console.error('\nLast 30 lines of log:');
    console.error(logContent.split('\n').slice(-30).join('\n'));
    process.exit(1);
  }
});

electronProcess.on('error', (err) => {
  console.error('[floating-startup-test] Failed to start electron:', err);
  process.exit(1);
});

// 设置5秒超时
timeout = setTimeout(() => {
  console.log('[floating-startup-test] Test timeout - checking log file...');
  electronProcess.kill('SIGTERM');
  
  setTimeout(() => {
    electronProcess.kill('SIGKILL');
  }, 1000);
}, 5000);

console.log('[floating-startup-test] Test timeout set to 5 seconds...');
