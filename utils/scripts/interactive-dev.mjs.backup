#!/usr/bin/env node
// 交互式开发脚本：安全启动服务 + 浏览器 + 菜单注入
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function log(msg){ console.log(`[interactive-dev] ${msg}`); }
function dlog(msg){ 
  const DEBUG_DIR = 'debug';
  try{ mkdirSync(DEBUG_DIR, { recursive: true }); }catch{}
  log(msg);
}

// 安全的overlay脚本，避免误判验证码
const safeOverlayScript = (sessionId) => `(() => {
  try {
    const ID = '__waMiniMenu';
    const STYLE_ID = '__waMiniMenu_style';
    
    function ensureStyle(){
      try{
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style'); 
        s.id = STYLE_ID; 
        s.textContent = 
          '#'+ID+'{' +
          'position:fixed !important;' +
          'top:8px !important;' +
          'right:8px !important;' +
          'z-index:2147483647 !important;' +
          'background:rgba(0,0,0,0.85) !important;' +
          'color:#fff !important;' +
          'padding:8px 12px !important;' +
          'border-radius:8px !important;' +
          'font:12px -apple-system,system-ui !important;' +
          'cursor:default !important;' +
          'user-select:text !important;' +
          'box-shadow:0 2px 10px rgba(0,0,0,0.3) !important;' +
          'border:1px solid rgba(255,255,255,0.2) !important;' +
          '}';
        document.head.appendChild(s);
      }catch{}
    }
    
    function install(){
      // 移除验证码检测，直接安装菜单
      ensureStyle();
      let box = document.getElementById(ID);
      if (!box) {
        box = document.createElement('div'); 
        box.id = ID;
        box.style.cssText = 'pointer-events:none'; // 避免影响页面交互
        
        const lab = document.createElement('span'); 
        lab.textContent = 'WebAuto:'; 
        lab.style.opacity='0.9'; 
        lab.style.marginRight='6px';
        
        const val = document.createElement('span'); 
        val.id='__waMiniMenu_sid'; 
        val.textContent = '${sessionId}';
        val.style.fontWeight='bold';
        
        box.appendChild(lab); 
        box.appendChild(val);
        
        // 安全添加到页面，等待DOM就绪
        const addToPage = () => {
          try {
            const target = document.documentElement || document.body || document;
            if (target && !document.getElementById(ID)) {
              target.appendChild(box);
            }
          } catch(e) {
            setTimeout(addToPage, 100);
          }
        };
        
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', addToPage);
        } else {
          addToPage();
        }
        
      } else {
        const v = box.querySelector('#__waMiniMenu_sid');
        if (v) v.textContent = '${sessionId}'; 
        else box.textContent = 'WebAuto: ${sessionId}';
      }
      
      // 添加更新方法
      try { 
        window.__waMiniMenu = window.__waMiniMenu || {}; 
        window.__waMiniMenu.update = function(id){ 
          try{ 
            const el = document.getElementById('__waMiniMenu_sid'); 
            if (el) el.textContent=String(id||''); 
          }catch{} 
        }; 
      } catch {}
    }
    
    // 延迟安装，避免页面加载冲突
    setTimeout(install, 500);
    
    // 定期检查并恢复菜单
    setInterval(() => { 
      try{ 
        if (!document.getElementById(ID)) install(); 
      }catch{} 
    }, 2000);
    
    return { installed: true, sessionId: '${sessionId}' };
  } catch(e) { 
    return { installed: false, error: String(e) }; 
  }
})();`;

async function waitHealth(url, timeoutMs=20000, label=''){ 
  const t0=Date.now(); 
  let i=0; 
  while (Date.now()-t0<timeoutMs){
    try { 
      const r=await fetch(url); 
      if (r.ok) { 
        if(label) log(`${label} 就绪`); 
        return true; 
      } 
    } catch {}
    if (label && (++i%8===0)) log(`等待 ${label}...`);
    await wait(500);
  } 
  return false; 
}

async function post(url, body){
  const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body||{}) });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.json();
}

function detectCamoufoxPath(){
  if (process.env.CAMOUFOX_PATH && existsSync(process.env.CAMOUFOX_PATH)) return process.env.CAMOUFOX_PATH;
  try { const mod = require('camoufox'); const p = mod?.executablePath || mod?.default?.executablePath; if (p && existsSync(p)) return p; } catch {}
  const home = homedir();
  const candidates = [
    join(home, 'Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox'),
    join(home, 'Library/Camoufox/Camoufox.app/Contents/MacOS/camoufox'),
    '/Applications/Camoufox.app/Contents/MacOS/camoufox'
  ];
  for (const p of candidates) { if (existsSync(p)) return p; }
  return '';
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main(){
  log('🚀 WebAuto 交互式开发环境');
  console.log('');
  
  // 1. 检测浏览器
  const browserType = await question('选择浏览器 (1:Camoufox, 2:Chrome, 3:Firefox, 默认:Camoufox): ');
  let browser = 'camoufox';
  if (browserType === '2') browser = 'chromium';
  else if (browserType === '3') browser = 'firefox';
  
  const camo = detectCamoufoxPath();
  if (browser === 'camoufox') {
    if (!camo) {
      console.error('❌ Camoufox 未找到，请先安装或设置 CAMOUFOX_PATH');
      process.exit(1);
    }
    process.env.CAMOUFOX_PATH = camo;
    log(`✅ Camoufox: ${camo}`);
  }
  
  // 2. 启动服务
  log('\n📦 启动后端服务...');
  const { spawn } = await import('node:child_process');
  
  // 清理端口
  try { spawn('lsof', ['-ti', ':7701', '|', 'xargs', 'kill', '-9'], { stdio: 'ignore', shell: true }); } catch {}
  try { spawn('lsof', ['-ti', ':7702', '|', 'xargs', 'kill', '-9'], { stdio: 'ignore', shell: true }); } catch {}
  try { spawn('lsof', ['-ti', ':7703', '|', 'xargs', 'kill', '-9'], { stdio: 'ignore', shell: true }); } catch {}
  
  // 构建
  log('构建服务...');
  try { spawn('npm', ['run', '-s', 'build:services'], { stdio: 'inherit', shell: true }); } catch {}
  
  // 启动核心服务
  const services = [
    { name: 'Workflow API', cmd: 'node', args: ['dist/services/engines/api-gateway/server.js'], port: 7701 },
    { name: 'Vision Engine', cmd: 'node', args: ['dist/services/engines/vision-engine/server.js'], port: 7702 },
    { name: 'Container Engine', cmd: 'node', args: ['dist/services/engines/container-engine/server.js'], port: 7703 }
  ];
  
  for (const svc of services) {
    log(`启动 ${svc.name}...`);
    spawn(svc.cmd, svc.args, { detached: true, stdio: 'ignore', env: { ...process.env, BROWSER: browser } }).unref();
    if (!await waitHealth(`http://127.0.0.1:${svc.port}/health`, 15000, svc.name)) {
      log(`❌ ${svc.name} 启动失败`);
    }
  }
  
  console.log('\n✅ 服务启动完成！');
  console.log('📱 容器编辑器: http://127.0.0.1:7703/devtools/');
  console.log('⚡ Workflow API: http://127.0.0.1:7701/health');
  console.log('👁️  Vision Engine: http://127.0.0.1:7702/health');
  console.log('');
  
  // 3. 交互式会话管理
  while (true) {
    const action = await question('\n选择操作:\n1. 创建新会话 + 打开浏览器\n2. 注入菜单到现有会话\n3. 高亮页面元素\n4. 显示会话列表\n5. 退出\n请选择 (1-5): ');
    
    if (action === '1') {
      const url = await question('目标URL (例如: https://www.1688.com): ');
      if (!url) {
        log('❌ URL 不能为空');
        continue;
      }
      
      try {
        const result = await post('http://127.0.0.1:7701/v1/session/launch', { 
          url,
          options: {
            headless: false,
            browser: browser,
            viewport: { width: 1920, height: 1080 }
          }
        });
        
        if (result.success && result.sessionId) {
          log(`✅ 会话已创建: ${result.sessionId}`);
          log(`🌐 浏览器已打开: ${url}`);
          
          // 安全注入菜单
          await wait(2000); // 等待页面加载
          try {
            await post('http://127.0.0.1:7701/v1/dev/eval-code', {
              sessionId: result.sessionId,
              code: safeOverlayScript(result.sessionId)
            });
            log('✅ 菜单已注入 (安全模式)');
          } catch (e) {
            log(`⚠️  菜单注入失败: ${e.message}`);
          }
        } else {
          log(`❌ 创建会话失败: ${result.error || '未知错误'}`);
        }
      } catch (e) {
        log(`❌ 请求失败: ${e.message}`);
      }
      
    } else if (action === '2') {
      const sessionId = await question('输入会话ID: ');
      if (!sessionId) {
        log('❌ 会话ID 不能为空');
        continue;
      }
      
      try {
        await post('http://127.0.0.1:7701/v1/dev/eval-code', {
          sessionId,
          code: safeOverlayScript(sessionId)
        });
        log('✅ 菜单已注入 (安全模式)');
      } catch (e) {
        log(`❌ 菜单注入失败: ${e.message}`);
      }
      
    } else if (action === '3') {
      const sessionId = await question('输入会话ID: ');
      if (!sessionId) {
        log('❌ 会话ID 不能为空');
        continue;
      }
      
      const type = await question('高亮类型 (1:验证码, 2:登录按钮, 默认:验证码): ');
      const highlightType = type === '2' ? 'login' : 'captcha';
      
      try {
        // 导入highlight脚本
        const { spawn } = await import('node:child_process');
        const child = spawn('node', ['utils/scripts/local-dev/highlight-anchors.mjs', '--sid', sessionId, '--type', highlightType], { 
          stdio: 'inherit',
          cwd: process.cwd() 
        });
        
        await new Promise((resolve) => {
          child.on('close', resolve);
        });
      } catch (e) {
        log(`❌ 高亮失败: ${e.message}`);
      }
      
    } else if (action === '4') {
      try {
        const sessions = await fetch('http://127.0.0.1:7701/sessions');
        if (sessions.ok) {
          const data = await sessions.json();
          log(`📋 活跃会话 (${data.length || 0}个):`);
          if (Array.isArray(data) && data.length > 0) {
            data.forEach((sid, i) => log(`  ${i+1}. ${sid}`));
          } else {
            log('  (无活跃会话)');
          }
        } else {
          log('❌ 获取会话列表失败');
        }
      } catch (e) {
        log(`❌ 请求失败: ${e.message}`);
      }
      
    } else if (action === '5') {
      break;
      
    } else {
      log('❌ 无效选择');
    }
  }
  
  log('\n👋 开发环境已退出');
  rl.close();
}

main().catch(e=>{ 
  console.error('❌ 启动失败:', e?.message||String(e)); 
  process.exit(1); 
});
