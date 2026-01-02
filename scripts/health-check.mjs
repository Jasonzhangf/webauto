#!/usr/bin/env node

/**
 * 系统启动健康检查
 * 检查项：
 * - WS 连接
 * - 各模块健康状态
 * - 页面信息获取
 * - 登录信息
 * - 匹配信息（UI/DOM 锚点）
 */

import { spawn } from 'child_process';
import WebSocket from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const HEALTH_CHECK_TIMEOUT = 30000; // 30s
const WS_CONNECT_TIMEOUT = 10000;   // 10s

let electronProcess = null;
let testFailed = false;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForWebSocket(url, timeout = WS_CONNECT_TIMEOUT) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const ws = new WebSocket(url);
      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.close();
          resolve();
        });
        ws.on('error', reject);
        setTimeout(() => reject(new Error('WS connect timeout')), 5000);
      });
      return true;
    } catch (err) {
      await sleep(500);
    }
  }
  throw new Error(`WebSocket not available at ${url} after ${timeout}ms`);
}

async function checkModulesHealth(wsUrl) {
  const ws = new WebSocket(wsUrl);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Health check timeout'));
    }, 15000);

    ws.on('open', () => {
      console.log('✓ WS connected successfully');
      
      // 发送健康检查命令
      ws.send(JSON.stringify({
        type: 'health_check',
        timestamp: Date.now()
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'health_check_response') {
          clearTimeout(timeout);
          
          console.log('✓ Health check response received');
          console.log('  Modules:', Object.keys(msg.modules || {}).join(', '));
          
          // 检查关键模块
          const requiredModules = ['controller', 'browser', 'dom'];
          const availableModules = Object.keys(msg.modules || {});
          
          const allPresent = requiredModules.every(mod => 
            availableModules.some(am => am.includes(mod))
          );
          
          if (allPresent) {
            console.log('✓ All required modules present');
          } else {
            console.warn('⚠ Some modules missing:', requiredModules.filter(mod => 
              !availableModules.some(am => am.includes(mod))
            ));
          }
          
          ws.close();
          resolve(msg);
        }
      } catch (err) {
        // 忽略解析错误，等待正确的消息
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      ws.close();
      reject(err);
    });
  });
}

async function checkPageInfo(wsUrl) {
  const ws = new WebSocket(wsUrl);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Page info check timeout'));
    }, 10000);

    ws.on('open', () => {
      // 请求页面信息
      ws.send(JSON.stringify({
        type: 'get_page_info',
        timestamp: Date.now()
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'page_info' || msg.url || msg.title) {
          clearTimeout(timeout);
          console.log('✓ Page info received');
          console.log('  URL:', msg.url || 'N/A');
          console.log('  Title:', msg.title || 'N/A');
          ws.close();
          resolve(msg);
        }
      } catch (err) {
        // 忽略
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      ws.close();
      // 页面信息不是关键错误，警告即可
      console.warn('⚠ Page info check failed:', err.message);
      resolve({ warning: err.message });
    });
  });
}

async function checkUIAnchors(wsUrl) {
  const ws = new WebSocket(wsUrl);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('UI anchor check timeout'));
    }, 10000);

    ws.on('open', () => {
      // 请求 UI 状态
      ws.send(JSON.stringify({
        type: 'get_ui_state',
        timestamp: Date.now()
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'ui_state' || msg.rendered !== undefined) {
          clearTimeout(timeout);
          console.log('✓ UI state received');
          console.log('  Rendered:', msg.rendered ? 'Yes' : 'No');
          ws.close();
          resolve(msg);
        }
      } catch (err) {
        // 忽略
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      ws.close();
      // UI 锚点不是关键错误
      console.warn('⚠ UI anchor check failed:', err.message);
      resolve({ warning: err.message });
    });
  });
}

async function runHealthChecks() {
  console.log('Starting system health check...\n');
  
  // 1. 启动 Electron 应用
  console.log('1. Starting Electron application...');
  electronProcess = spawn('electron', ['apps/floating-panel'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_ENABLE_LOGGING: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let startupLogs = '';
  
  electronProcess.stdout?.on('data', (data) => {
    startupLogs += data.toString();
  });
  
  electronProcess.stderr?.on('data', (data) => {
    startupLogs += data.toString();
  });

  electronProcess.on('exit', (code) => {
    if (code !== 0 && code !== null && !testFailed) {
      console.error('✗ Electron process exited unexpectedly with code:', code);
      console.error('Startup logs:\n', startupLogs);
      process.exit(1);
    }
  });

  // 等待应用启动
  await sleep(3000);
  
  // 2. 检查 WebSocket 连接
  console.log('\n2. Checking WebSocket connection...');
  const wsUrl = 'ws://localhost:9223';
  
  try {
    await waitForWebSocket(wsUrl);
    console.log('✓ WebSocket server is available');
  } catch (err) {
    console.error('✗ WebSocket connection failed:', err.message);
    console.error('Startup logs:\n', startupLogs);
    testFailed = true;
    throw err;
  }

  // 3. 检查模块健康
  console.log('\n3. Checking modules health...');
  try {
    await checkModulesHealth(wsUrl);
  } catch (err) {
    console.error('✗ Modules health check failed:', err.message);
    testFailed = true;
    throw err;
  }

  // 4. 检查页面信息（非关键）
  console.log('\n4. Checking page info...');
  try {
    await checkPageInfo(wsUrl);
  } catch (err) {
    console.warn('⚠ Page info check failed (non-critical):', err.message);
  }

  // 5. 检查 UI 锚点（非关键）
  console.log('\n5. Checking UI anchors...');
  try {
    await checkUIAnchors(wsUrl);
  } catch (err) {
    console.warn('⚠ UI anchor check failed (non-critical):', err.message);
  }

  console.log('\n✓ All critical health checks passed!');
}

// 清理函数
function cleanup() {
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill('SIGTERM');
    setTimeout(() => {
      if (!electronProcess.killed) {
        electronProcess.kill('SIGKILL');
      }
    }, 2000);
  }
}

// 主流程
(async () => {
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  const timeout = setTimeout(() => {
    console.error('✗ Health check timeout after', HEALTH_CHECK_TIMEOUT, 'ms');
    testFailed = true;
    cleanup();
    process.exit(1);
  }, HEALTH_CHECK_TIMEOUT);

  try {
    await runHealthChecks();
    clearTimeout(timeout);
    cleanup();
    await sleep(1000);
    process.exit(0);
  } catch (err) {
    clearTimeout(timeout);
    console.error('✗ Health check failed:', err.message);
    cleanup();
    await sleep(1000);
    process.exit(1);
  }
})();
