#!/usr/bin/env node
// 统一启动脚本：网页系统 + workflow系统 + 开发系统
import { execSync, spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function log(msg){ console.log(`[start-unified] ${msg}`); }
function dlog(msg){ 
  const DEBUG_DIR = 'debug';
  const runStamp = new Date().toISOString().replace(/[:.]/g,'-');
  const DEBUG_FILE = `${DEBUG_DIR}/start-unified-${runStamp}.log`;
  try{ mkdirSync(DEBUG_DIR, { recursive: true }); appendFileSync(DEBUG_FILE, `[${new Date().toISOString()}] ${msg}\n`); }catch{} 
  log(msg); 
}

async function waitHealth(url, timeoutMs=20000, label=''){ 
  const t0=Date.now(); 
  let i=0; 
  while (Date.now()-t0<timeoutMs){
    try { 
      const ctl=new AbortController(); 
      const to=setTimeout(()=>ctl.abort(),1200); 
      const r=await fetch(url,{signal:ctl.signal}); 
      clearTimeout(to); 
      if (r.ok) { 
        if(label) log(`${label} healthy`); 
        return true; 
      } 
    } catch {}
    if (label && (++i%4===0)) log(`waiting ${label}...`);
    await wait(500);
  } 
  return false; 
}

function startNode(label, entry){ 
  try{ 
    const p=spawn('node',[entry],{detached:true,stdio:'ignore'}); 
    p.unref(); 
    dlog(`spawned ${label}: ${entry}`); 
    return true;
  }catch(e){ 
    dlog(`spawn ${label} failed: ${e?.message||String(e)}`); 
    return false;
  } 
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

async function main(){
  const mode = process.argv[2] || 'production'; // production | development
  const browserEnv = process.env.BROWSER || '';
  const envBool = (name, def=false)=>{ const s=String(process.env[name]??'').trim().toLowerCase(); if(['1','true','yes','y'].includes(s)) return true; if(['0','false','no','n'].includes(s)) return false; return def; };
  const skipVision = envBool('SKIP_VISION', mode === 'development');
  
  log(`启动模式: ${mode}`);
  
  // 检测Camoufox
  const camo = detectCamoufoxPath();
  if (browserEnv.toLowerCase() === 'camoufox' || !browserEnv) {
    if (!camo) {
      console.error('Camoufox executable not found. Set CAMOUFOX_PATH to Camoufox binary.');
      process.exit(1);
    }
    process.env.CAMOUFOX_PATH = camo;
    dlog(`camoufox detected: ${camo}`);
  }

  // 构建
  dlog('building services');
  try { execSync('npm run -s build:services', { stdio: 'inherit' }); } catch {}

  // 清理端口
  dlog('cleaning ports');
  try { execSync('lsof -ti :7700 | xargs kill -9 || true'); } catch {}
  try { execSync('lsof -ti :7701 | xargs kill -9 || true'); } catch {}
  try { execSync('lsof -ti :7702 | xargs kill -9 || true'); } catch {}
  try { execSync('lsof -ti :7703 | xargs kill -9 || true'); } catch {}

  if (mode === 'development') {
    // 开发模式：直接启动三个核心服务
    log('Development mode - starting core services');
    
    startNode('workflow', 'dist/services/engines/api-gateway/server.js');
    if (!skipVision) startNode('vision', 'dist/services/engines/vision-engine/server.js');
    startNode('container', 'dist/services/engines/container-engine/server.js');

    // 等待健康检查
    const okWf = await waitHealth('http://127.0.0.1:7701/health', 20000, 'workflow');
    if (!okWf) throw new Error('workflow api not healthy');
    
    if (!skipVision) {
      const okVs = await waitHealth('http://127.0.0.1:7702/health', 25000, 'vision');
      if (!okVs) throw new Error('vision engine not healthy');
    }
    
    const okCt = await waitHealth('http://127.0.0.1:7703/health', 20000, 'container');
    if (!okCt) throw new Error('container engine not healthy');
    
  } else {
    // 生产模式：通过Orchestrator启动
    log('Production mode - starting via orchestrator');
    startNode('orchestrator', 'dist/apps/webauto/server.js');

    const okOrch = await waitHealth('http://127.0.0.1:7700/health', 30000, 'orchestrator');
    if (!okOrch) throw new Error('orchestrator not healthy');

    const okWf = await waitHealth('http://127.0.0.1:7701/health', 20000, 'workflow');
    if (!okWf) throw new Error('workflow api not healthy');
    
    if (!skipVision) {
      const okVs = await waitHealth('http://127.0.0.1:7702/health', 25000, 'vision');
      if (!okVs) throw new Error('vision engine not healthy');
    }
    
    const okCt = await waitHealth('http://127.0.0.1:7703/health', 20000, 'container');
    if (!okCt) throw new Error('container engine not healthy');
  }

  console.log('\n🚀 启动完成！');
  console.log('\n📱 网页系统 (Container Engine DevTools):');
  console.log('   http://127.0.0.1:7703/devtools/');
  console.log('\n⚡ Workflow API:');
  console.log('   http://127.0.0.1:7701/health');
  console.log('   http://127.0.0.1:7701/v1/docs (API文档)');
  if (!skipVision) {
    console.log('\n👁️  Vision Engine:');
    console.log('   http://127.0.0.1:7702/health');
  }
  if (mode === 'production') {
    console.log('\n🎯 Orchestrator:');
    console.log('   http://127.0.0.1:7700/health');
  }
  console.log('\n🔧 开发工具:');
  console.log('   npm run dev:highlight  - 高亮页面元素');
  console.log('   npm run dev:picker     - 采集器工具');
  console.log('   npm run dev:show-sid   - 显示Session ID');
}

main().catch(e=>{ 
  console.error('启动失败:', e?.message||String(e)); 
  process.exit(1); 
});
