#!/usr/bin/env node
// 简单测试：验证 Camoufox 会话创建和菜单注入
import { setTimeout as wait } from 'node:timers/promises';

async function testWorkflowAPI() {
  console.log('🧪 测试 Workflow API...');
  
  // 启动服务
  const { spawn } = await import('node:child_process');
  const proc = spawn('node', ['dist/services/engines/api-gateway/server.js'], {
    stdio: 'pipe',
    env: { ...process.env, PORT_WORKFLOW: '7707' }
  });
  
  let output = '';
  proc.stdout.on('data', data => {
    output += data.toString();
  });
  
  // 等待服务启动
  console.log('等待服务启动...');
  await wait(2000);
  
  if (output.includes('listening')) {
    console.log('✅ 服务启动成功');
    
    try {
      // 测试会话创建
      const response = await fetch('http://127.0.0.1:7707/v1/browser/session/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://www.1688.com',
          options: {
            headless: false,
            browser: 'camoufox'
          }
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ 会话创建成功:', result.sessionId);
        
        // 测试菜单注入
        await wait(3000); // 等待页面加载
        
        const menuResponse = await fetch('http://127.0.0.1:7707/v1/dev/eval-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: result.sessionId,
            code: `(function(){
              const ID = '__waMiniMenu';
              let box = document.getElementById(ID);
              if (!box) {
                box = document.createElement('div');
                box.id = ID;
                box.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;background:rgba(0,0,0,0.85);color:#fff;padding:8px 12px;border-radius:8px;font:12px -apple-system,system-ui;';
                box.textContent = 'WebAuto: ${result.sessionId}';
                document.body.appendChild(box);
              }
              return { installed: true, sessionId: '${result.sessionId}' };
            })();`
          })
        });
        
        if (menuResponse.ok) {
          const menuResult = await menuResponse.json();
          console.log('✅ 菜单注入成功:', menuResult);
        } else {
          console.log('❌ 菜单注入失败');
        }
        
      } else {
        console.log('❌ 会话创建失败:', response.status);
      }
      
    } catch (e) {
      console.log('❌ 测试失败:', e.message);
    }
  } else {
    console.log('❌ 服务启动失败');
  }
  
  // 清理
  proc.kill('SIGTERM');
  await wait(1000);
  proc.kill('SIGKILL');
  console.log('🧹 测试完成');
}

testWorkflowAPI().catch(console.error);
