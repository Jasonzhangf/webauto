#!/usr/bin/env node
// 高级交互式开发脚本：集成防风控和错误恢复
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';

// 导入防风控模块
import {
  getRandomUserAgent,
  getRandomViewport,
  getRandomTimezone,
  getRandomLocale,
  randomDelay,
  getHumanMouseMove,
  getAntiDetectionScript,
  getWaitStrategies
} from './anti-detection.mjs';

function log(msg){ console.log(`[advanced-dev] ${msg}`); }
function dlog(msg){ 
  const DEBUG_DIR = 'debug';
  try{ mkdirSync(DEBUG_DIR, { recursive: true }); }catch{}
  log(msg);
}

// 更安全的overlay脚本，集成防风控
const safeOverlayScript = (sessionId) => `(() => {
  try {
    // 注入防检测脚本
    ${getAntiDetectionScript()}
    
    const ID = '__waMiniMenu';
    const STYLE_ID = '__waMiniMenu_style';
    let installAttempts = 0;
    const maxAttempts = 3;
    
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
          'transition:opacity 0.3s ease !important;' +
          'opacity:0;' +
          '} ' +
          '#'+ID+'.show{' +
          'opacity:1;' +
          '}';
        document.head.appendChild(s);
      }catch{}
    }
    
    function safeInstall(){
      installAttempts++;
      if (installAttempts > maxAttempts) {
        console.warn('[WebAuto] Menu install failed after', maxAttempts, 'attempts');
        return false;
      }
      
      // 检查页面是否处于可用状态
      if (document.hidden || document.visibilityState === 'hidden') {
        setTimeout(safeInstall, 2000);
        return false;
      }
      
      // 检查是否有关键的错误页面
      const errorKeywords = ['error', '404', 'blocked', 'forbidden', 'access denied'];
      const pageText = document.body?.innerText?.toLowerCase() || '';
      const hasError = errorKeywords.some(keyword => pageText.includes(keyword));
      if (hasError) {
        console.warn('[WebAuto] Error page detected, skipping menu install');
        return false;
      }
      
      ensureStyle();
      let box = document.getElementById(ID);
      
      if (!box) {
        box = document.createElement('div'); 
        box.id = ID;
        box.setAttribute('data-webauto', 'true');
        
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
        
        // 添加点击事件
        box.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          // 复制 sessionId 到剪贴板
          if (navigator.clipboard) {
            navigator.clipboard.writeText('${sessionId}').then(() => {
              val.textContent = '已复制!';
              setTimeout(() => {
                val.textContent = '${sessionId}';
              }, 1500);
            });
          }
        });
        
        // 安全添加到页面
        const addToPage = () => {
          try {
            // 寻找安全的容器
            let target = document.body || document.documentElement;
            if (target) {
              target.appendChild(box);
              
              // 延迟显示，避免白屏
              setTimeout(() => {
                box.classList.add('show');
              }, 300);
              
              return true;
            }
          } catch(e) {
            console.warn('[WebAuto] Add to page failed:', e.message);
          }
          return false;
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
        
        box.classList.add('show');
      }
      
      // 添加全局方法
      try { 
        window.__waMiniMenu = window.__waMiniMenu || {}; 
        window.__waMiniMenu.update = function(id){ 
          try{ 
            const el = document.getElementById('__waMiniMenu_sid'); 
            if (el) el.textContent=String(id||''); 
          }catch{} 
        };
        window.__waMiniMenu.hide = function(){ 
          try{ 
            const el = document.getElementById(ID); 
            if (el) el.classList.remove('show'); 
          }catch{} 
        };
        window.__waMiniMenu.show = function(){ 
          try{ 
            const el = document.getElementById(ID); 
            if (el) el.classList.add('show'); 
          }catch{} 
        };
      } catch {}
      
      return true;
    }
    
    // 智能延迟安装
    const delayTime = 500 + Math.random() * 1000; // 0.5-1.5秒随机延迟
    setTimeout(safeInstall, delayTime);
    
    // 定期检查并恢复菜单
    setInterval(() => { 
      try{ 
        if (!document.getElementById(ID)) {
          console.log('[WebAuto] Menu lost, reinstalling...');
          safeInstall();
        }
      }catch{} 
    }, 3000);
    
    return { installed: true, sessionId: '${sessionId}' };
  } catch(e) { 
    console.error('[WebAuto] Menu installation error:', e.message);
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

// 生成防风控的启动选项
function getLaunchOptions(browser) {
  const viewport = getRandomViewport();
  const userAgent = getRandomUserAgent();
  const timezone = getRandomTimezone();
  const locale = getRandomLocale();
  
  const options = {
    headless: false,
    browser: browser,
    viewport: viewport,
    userAgent: userAgent,
    locale: locale,
    timezoneId: timezone,
    // 额外的防检测选项
    ignoreDefaultArgs: [
      '--enable-blink-features=IdleDetection',
      '--enable-automation',
      '--password-store=basic'
    ],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  };
  
  return { options, config: { viewport, userAgent, timezone, locale } };
}

// 页面加载等待策略
async function waitForPageReady(sessionId) {
  const strategies = getWaitStrategies();
  const strategyNames = Object.keys(strategies);
  
  log('等待页面稳定...');
  
  for (const strategyName of strategyNames) {
    try {
      const result = await post('http://127.0.0.1:7701/v1/dev/eval-code', {
        sessionId,
        code: strategies[strategyName]
      });
      
      if (result.success && result.value) {
        log(`✅ ${strategyName} 策略成功`);
        return true;
      }
    } catch (e) {
      log(`⚠️  ${strategyName} 策略失败: ${e.message}`);
    }
    
    await randomDelay(500, 1000);
  }
  
  log('页面加载完成');
  return true;
}

async function main(){
  log('🚀 WebAuto 高级交互式开发环境');
  log('🛡️  集成防风控和错误恢复机制');
  console.log('');
  
  // 1. 检测浏览器和配置
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
  
  const { options: launchOptions, config } = getLaunchOptions(browser);
  log(`🎯 防风控配置: ${JSON.stringify(config, null, 2)}`);
  
  // 2. 启动服务
  log('\n📦 启动后端服务...');
  const { spawn } = await import('node:child_process');
  
  // 清理端口
  const ports = [7701, 7702, 7703];
  for (const port of ports) {
    try {
      spawn('lsof', ['-ti', `:${port}`, '|', 'xargs', 'kill', '-9'], { stdio: 'ignore', shell: true });
      await wait(500);
    } catch {}
  }
  
  // 构建
  log('构建服务...');
  try {
    spawn('npm', ['run', '-s', 'build:services'], { stdio: 'inherit', shell: true });
    await wait(1000);
  } catch {}
  
  // 启动核心服务
  const services = [
    { name: 'Workflow API', cmd: 'node', args: ['dist/services/engines/api-gateway/server.js'], port: 7701 },
    { name: 'Container Engine', cmd: 'node', args: ['dist/services/engines/container-engine/server.js'], port: 7703 }
  ];
  
  // Vision Engine 可选启动
  const startVision = await question('是否启动 Vision Engine? (y/N, 默认:N): ');
  if (startVision.toLowerCase().startsWith('y')) {
    services.push({ name: 'Vision Engine', cmd: 'node', args: ['dist/services/engines/vision-engine/server.js'], port: 7702 });
  }
  
  for (const svc of services) {
    log(`启动 ${svc.name}...`);
    spawn(svc.cmd, svc.args, { 
      detached: true, 
      stdio: 'ignore', 
      env: { ...process.env, BROWSER: browser } 
    }).unref();
    
    if (!await waitHealth(`http://127.0.0.1:${svc.port}/health`, 20000, svc.name)) {
      log(`⚠️  ${svc.name} 启动超时，但继续...`);
    }
  }
  
  console.log('\n✅ 服务启动完成！');
  console.log('📱 容器编辑器: http://127.0.0.1:7703/devtools/');
  console.log('⚡ Workflow API: http://127.0.0.1:7701/health');
  if (startVision.toLowerCase().startsWith('y')) {
    console.log('👁️  Vision Engine: http://127.0.0.1:7702/health');
  }
  console.log('');
  
  // 3. 高级交互式会话管理
  while (true) {
    const action = await question('\n🔧 选择操作:\n1. 创建新会话 + 浏览器\n2. 安全注入菜单\n3. 智能高亮元素\n4. 检查页面状态\n5. 显示会话列表\n6. 会话管理\n7. 退出\n请选择 (1-7): ');
    
    if (action === '1') {
      const url = await question('目标URL (例如: https://www.1688.com): ');
      if (!url) {
        log('❌ URL 不能为空');
        continue;
      }
      
      const stealth = await question('启用隐身模式? (y/N, 默认:N): ');
      const enableStealth = stealth.toLowerCase().startsWith('y');
      
      try {
        const launchConfig = { ...launchOptions };
        if (enableStealth) {
          launchConfig.stealth = true;
          launchConfig.ignoreHTTPSErrors = true;
        }
        
        log(`🚀 启动浏览器访问: ${url}`);
        const result = await post('http://127.0.0.1:7701/v1/session/launch', { 
          url,
          options: launchConfig
        });
        
        if (result.success && result.sessionId) {
          log(`✅ 会话已创建: ${result.sessionId}`);
          
          // 等待页面加载
          await waitForPageReady(result.sessionId);
          
          // 安全注入菜单
          log('注入开发菜单...');
          await wait(1000);
          try {
            await post('http://127.0.0.1:7701/v1/dev/eval-code', {
              sessionId: result.sessionId,
              code: safeOverlayScript(result.sessionId)
            });
            log('✅ 开发菜单已注入 (高级安全模式)');
            log('💡 点击菜单可复制 Session ID');
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
        log('✅ 开发菜单已注入 (高级安全模式)');
      } catch (e) {
        log(`❌ 菜单注入失败: ${e.message}`);
      }
      
    } else if (action === '3') {
      const sessionId = await question('输入会话ID: ');
      if (!sessionId) {
        log('❌ 会话ID 不能为空');
        continue;
      }
      
      const type = await question('高亮类型 (1:验证码, 2:登录按钮, 3:自定义选择器, 默认:验证码): ');
      
      try {
        if (type === '3') {
          const selector = await question('输入CSS选择器: ');
          await post('http://127.0.0.1:7701/v1/browser/highlight', {
            sessionId,
            selector,
            color: '#FF3B30',
            label: 'CUSTOM',
            durationMs: 5000,
            requireLoginAnchor: false
          });
          log('✅ 自定义元素已高亮');
        } else {
          const highlightType = type === '2' ? 'login' : 'captcha';
          const child = spawn('node', ['runtime/infra/utils/scripts/local-dev/highlight-anchors.mjs', '--sid', sessionId, '--type', highlightType], { 
            stdio: 'inherit',
            cwd: process.cwd() 
          });
          
          await new Promise((resolve) => {
            child.on('close', resolve);
          });
        }
      } catch (e) {
        log(`❌ 高亮失败: ${e.message}`);
      }
      
    } else if (action === '4') {
      const sessionId = await question('输入会话ID: ');
      if (!sessionId) {
        log('❌ 会话ID 不能为空');
        continue;
      }
      
      try {
        const checks = [
          { name: 'URL', code: 'window.location.href' },
          { name: 'Title', code: 'document.title' },
          { name: 'Body可见性', code: '!!document.body && document.body.offsetHeight > 0' },
          { name: '错误元素', code: '!!document.querySelector("[class*=error], [id*=error], .error, #error")' },
          { name: '验证码元素', code: '!!document.querySelector(".nc-lang-cnt, [data-nc-lang], .nc-container")' }
        ];
        
        log('🔍 页面状态检查:');
        for (const check of checks) {
          try {
            const result = await post('http://127.0.0.1:7701/v1/dev/eval-code', {
              sessionId,
              code: check.code
            });
            console.log(`  ${check.name}: ${result.value || 'null'}`);
          } catch (e) {
            console.log(`  ${check.name}: 检查失败`);
          }
        }
      } catch (e) {
        log(`❌ 状态检查失败: ${e.message}`);
      }
      
    } else if (action === '5') {
      try {
        const sessions = await fetch('http://127.0.0.1:7701/sessions');
        if (sessions.ok) {
          const data = await sessions.json();
        log(`📋 活跃会话 ($/);(data) ? data.length : 0}个):`);
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
      
    } else if (action === '6') {
      const sessionId = await question('输入会话ID (留空返回): ');
      if (!sessionId) continue;
      
      const subAction = await question('操作: (1:关闭, 2:截图, 3:获取当前URL, 4:刷新): ');
      
      try {
        if (subAction === '1') {
          await post('http://127.0.0.1:7701/v1/session/close', { sessionId });
          log('✅ 会话已关闭');
        } else if (subAction === '2') {
          const result = await post('http://127.0.0.1:7701/v1/browser/screenshot', { sessionId });
          if (result.success && result.screenshot) {
            log(`✅ 截图已生成 (${result.screenshot.length} 字节)`);
          }
        } else if (subAction === '3') {
          const result = await post('http://127.0.0.1:7701/v1/browser/current-url', { sessionId });
          if (result.success) {
            log(`📍 当前URL: ${result.url}`);
          }
        } else if (subAction === '4') {
          await post('http://127.0.0.1:7701/v1/browser/navigate', { sessionId, url: null }); // 刷新
          log('✅ 页面已刷新');
        }
      } catch (e) {
        log(`❌ 操作失败: ${e.message}`);
      }
      
    } else if (action === '7') {
      break;
      
    } else {
      log('❌ 无效选择');
    }
  }
  
  log('\n👋 高级开发环境已退出');
  rl.close();
}

main().catch(e=>{ 
  console.error('❌ 启动失败:', e?.message||String(e)); 
  process.exit(1); 
});
