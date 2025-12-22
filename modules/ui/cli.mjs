#!/usr/bin/env node
/**
 * UI CLI（Phase6）
 * 启动浮窗并接入状态总线
 */

import { spawn } from 'node:child_process';
import { getStateBus } from '../core/src/state-bus.mjs';
import { UIClient } from './src/ui-client.mjs';

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function main() {
  log('=== WebAuto UI 模块 (Phase6) ===', 'blue');
  const bus = getStateBus();
  bus.register('ui', { version: '0.1.0', type: 'floating-panel' });

  try {
    log('[UI] 连接状态总线...', 'blue');
    const client = new UIClient();
    await client.connect();
    bus.setState('ui', { connected: true });
    log('✅ 已连接状态总线', 'green');

    log('[UI] 启动浮窗...', 'blue');
    const proc = spawn('npm', ['run', 'dev'], {
      cwd: 'apps/floating-panel',
      stdio: 'inherit',
      env: {
        ...process.env,
        WEBAUTO_FLOATING_WS_URL: 'ws://127.0.0.1:8765',
        WEBAUTO_FLOATING_BUS_PORT: '8790',
        WEBAUTO_FLOATING_HEADLESS: '0'
      }
    });

    proc.on('close', () => {
      log('[UI] 浮窗已退出', 'yellow');
      client.disconnect();
      bus.setState('ui', { connected: false });
      process.exit(0);
    });

    // 保持运行
    process.stdin.resume();
  } catch (e) {
    log(`[UI] 启动失败: ${e.message}`, 'red');
    process.exit(1);
  }
}

main();
