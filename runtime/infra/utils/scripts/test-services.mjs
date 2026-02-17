#!/usr/bin/env node
// 测试脚本：验证服务是否能正常启动
import { spawn, execSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

function log(msg){ console.log(`[test-services] ${msg}`); }

async function testHealth(port, name, timeout = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        const data = await response.json();
        log(`✅ ${name} (${port}): 健康检查通过 - ${JSON.stringify(data)}`);
        return true;
      }
    } catch (e) {
      // 继续等待
    }
    await wait(500);
  }
  
  log(`❌ ${name} (${port}): 健康检查失败`);
  return false;
}

async function main() {
  log('🧪 测试服务启动...');
  
  // 1. 构建服务
  try {
    log('构建服务...');
    execSync('npm run -s build:services', { stdio: 'inherit' });
    log('✅ 构建完成');
  } catch (e) {
    log('❌ 构建失败');
    process.exit(1);
  }
  
  // 2. 清理端口
  const ports = [7704, 7705, 7706];
  for (const port of ports) {
    try {
      execSync(`lsof -ti :${port} | xargs kill -9 || true`, { stdio: 'ignore' });
    } catch {}
  }
  
  // 3. 测试 Unified API
  log('测试 Unified API...');
  const unifiedProc = spawn('node', ['dist/apps/webauto/server.js'], {
    env: { ...process.env, WEBAUTO_RUNTIME_MODE: 'unified', WEBAUTO_UNIFIED_PORT: '7704' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  unifiedProc.stdout.on('data', (data) => {
    log(`[Unified API] ${data.toString().trim()}`);
  });
  
  unifiedProc.stderr.on('data', (data) => {
    log(`[Unified API ERROR] ${data.toString().trim()}`);
  });
  
  unifiedProc.on('error', (err) => {
    log(`❌ Unified API 启动错误: ${err.message}`);
  });
  
  const unifiedOk = await testHealth(7704, 'Unified API', 15000);
  
  if (unifiedOk) {
    // 4. 测试基本 API
    try {
      const response = await fetch('http://127.0.0.1:7704/v1/system/state');
      const data = await response.json();
      log(`📋 系统状态: ${JSON.stringify(data)}`);
    } catch (e) {
      log(`❌ 系统状态获取失败: ${e.message}`);
    }
  }
  
  // 5. 清理
  unifiedProc.kill('SIGTERM');
  await wait(1000);
  unifiedProc.kill('SIGKILL');
  
  log('🧹 测试完成');
  process.exit(unifiedOk ? 0 : 1);
}

main().catch(e => {
  console.error('❌ 测试失败:', e.message);
  process.exit(1);
});
