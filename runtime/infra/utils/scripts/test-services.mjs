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
  
  // 3. 测试 Workflow API
  log('测试 Workflow API...');
  const workflowProc = spawn('node', ['dist/services/engines/api-gateway/server.js'], {
    env: { ...process.env, PORT_WORKFLOW: '7704' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  workflowProc.stdout.on('data', (data) => {
    log(`[Workflow API] ${data.toString().trim()}`);
  });
  
  workflowProc.stderr.on('data', (data) => {
    log(`[Workflow API ERROR] ${data.toString().trim()}`);
  });
  
  workflowProc.on('error', (err) => {
    log(`❌ Workflow API 启动错误: ${err.message}`);
  });
  
  const workflowOk = await testHealth(7704, 'Workflow API', 15000);
  
  if (workflowOk) {
    // 4. 测试基本 API
    try {
      const response = await fetch('http://127.0.0.1:7704/sessions');
      const data = await response.json();
      log(`📋 会话列表: ${JSON.stringify(data)}`);
    } catch (e) {
      log(`❌ 会话列表获取失败: ${e.message}`);
    }
  }
  
  // 5. 清理
  workflowProc.kill('SIGTERM');
  await wait(1000);
  workflowProc.kill('SIGKILL');
  
  log('🧹 测试完成');
  process.exit(workflowOk ? 0 : 1);
}

main().catch(e => {
  console.error('❌ 测试失败:', e.message);
  process.exit(1);
});
