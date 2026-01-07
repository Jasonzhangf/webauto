/**
 * 自动化 UI 连线验证 (E2E) - 使用内置 Electron
 */
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import http from 'http';

const TIMEOUT = 60000;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForPort(port, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, res => {
          if (res.statusCode === 200) resolve();
          else reject(new Error('Status ' + res.statusCode));
        });
        req.on('error', reject);
        req.setTimeout(1000);
        req.end();
      });
      return true;
    } catch (e) {
      await sleep(1000);
    }
  }
  return false;
}

async function executeJavaScriptInElectron(code) {
  // 通过浮窗的 WebSocket 连接执行 JS (如果暴露了 eval 接口)
  // 或者通过 console.log 输出到日志文件中
  // 这里简化：我们通过检查日志文件来验证
}

async function main() {
  console.log('🧪 自动化 UI 连线验证...\n');
  
  const processes = [];
  const logFile = createWriteStream('/tmp/e2e-ui-test.log', { flags: 'a' });
  
  try {
    // 1. 启动后端服务
    console.log('1️⃣  启动后端服务...');
    const browserService = spawn('node', ['libs/browser/remote-service.js', '--host', '127.0.0.1', '--port', '7704'], {
      stdio: ['ignore', logFile, logFile]
    });
    processes.push(browserService);
    
    const unifiedApi = spawn('node', ['services/unified-api/server.mjs'], {
      stdio: ['ignore', logFile, logFile]
    });
    processes.push(unifiedApi);
    
    // 2. 等待服务就绪
    console.log('2️⃣  等待服务端口就绪...');
    if (!await waitForPort(7704)) throw new Error('❌ Browser Service 启动失败');
    if (!await waitForPort(7701)) throw new Error('❌ Unified API 启动失败');
    console.log('   ✅ 后端服务已就绪\n');
    
    // 3. 启动浮窗 (不通过 Playwright，直接 spawn Electron)
    console.log('3️⃣  启动浮窗 UI...');
    const floatingPanel = spawn('npm', ['start'], {
      cwd: './apps/floating-panel',
      stdio: ['ignore', logFile, logFile],
      env: { 
        ...process.env, 
        DEBUG: '1', 
        ELECTRON_ENABLE_LOGGING: '1',
        NODE_ENV: 'development'
      }
    });
    processes.push(floatingPanel);
    
    // 4. 等待浮窗启动并自动触发容器匹配
    console.log('4️⃣  等待浮窗启动 (20秒)...');
    await sleep(20000);
    console.log('   ✅ 浮窗应已启动\n');
    
    // 5. 触发容器匹配 (通过 HTTP API)
    console.log('5️⃣  触发容器匹配...');
    const matchResult = await fetch('http://127.0.0.1:7701/v1/controller/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'containers:match',
        payload: {
          profile: 'weibo_fresh',
          url: 'https://weibo.com'
        }
      })
    }).then(r => r.json());
    
    if (!matchResult.success) {
      throw new Error(`容器匹配失败: ${matchResult.error}`);
    }
    console.log('   ✅ 容器匹配成功\n');
    
    // 6. 等待UI处理匹配结果和预拉取
    console.log('6️⃣  等待 UI 预拉取子容器 DOM (10秒)...');
    await sleep(10000);
    
    // 7. 读取日志验证
    console.log('7️⃣  验证日志输出...\n');
    const logs = require('fs').readFileSync('/tmp/e2e-ui-test.log', 'utf-8');
    
    const checks = [
      { pattern: /\[ui-renderer\] 预拉取子容器DOM路径/, name: '预拉取触发' },
      { pattern: /\[renderDomNodeRecursive\] Registered deep node.*root\/1\/1\/0\/0\/0\/0\/1\/2/, name: '深层节点注册' },
      { pattern: /\[drawConnectionsForNode\] Drew connection from weibo_main_page\.feed_list/, name: '子容器连线绘制' }
    ];
    
    let passed = 0;
    let failed = 0;
    
    checks.forEach(check => {
      if (check.pattern.test(logs)) {
        console.log(`   ✅ ${check.name}`);
        passed++;
      } else {
        console.log(`   ❌ ${check.name} - 未在日志中发现`);
        failed++;
      }
    });
    
    console.log(`\n📊 验证结果: ${passed}/${checks.length} 通过`);
    
    if (failed > 0) {
      console.log('\n💡 提示: 请检查浮窗UI是否显示子容器连线');
      console.log('   日志文件: /tmp/e2e-ui-test.log');
      process.exit(1);
    }
    
    console.log('\n🎉 所有验证通过！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  } finally {
    // 清理进程
    console.log('\n🧹 清理进程...');
    processes.forEach(p => {
      try { p.kill('SIGTERM'); } catch (e) {}
    });
    logFile.end();
  }
}

main();
