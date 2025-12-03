#!/usr/bin/env node
// Robust bring-up for local services + browser workflow with explicit fallbacks
import { execSync, spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { existsSync, mkdirSync, appendFileSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ---------- logging ----------
const DEBUG_DIR = 'debug';
const runStamp = new Date().toISOString().replace(/[:.]/g,'-');
const DEBUG_FILE = `${DEBUG_DIR}/dev-up-${runStamp}.log`;
function log(msg){ console.log(`[dev-up] ${msg}`); }
function dlog(msg){ try{ mkdirSync(DEBUG_DIR, { recursive: true }); appendFileSync(DEBUG_FILE, `[${new Date().toISOString()}] ${msg}\n`); }catch{} log(msg); }

// ---------- utils ----------
async function waitHealth(url, timeoutMs=20000, label=''){ const t0=Date.now(); let i=0; while (Date.now()-t0<timeoutMs){
  try { const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),1200); const r=await fetch(url,{signal:ctl.signal}); clearTimeout(to); if (r.ok) { if(label) dlog(`${label} healthy`); return true; } } catch {}
  if (label && (++i%4===0)) dlog(`waiting ${label}...`);
  await wait(500);
} return false; }

async function post(url, body){ const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body||{}) }); if (!r.ok) throw new Error(`${url} -> ${r.status}`); return await r.json(); }

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

// ---------- process helpers ----------
function startNode(label, entry){ try{ const p=spawn('node',[entry],{detached:true,stdio:'ignore'}); p.unref(); dlog(`spawned ${label}: ${entry}`); }catch(e){ dlog(`spawn ${label} failed: ${e?.message||String(e)}`); } }

function normalizeHostRe(host){ return String(host||'').replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&'); }

// ---------- main ----------
async function main(){
  const openUrl = process.env.OPEN_URL || '';
  const browserEnv = process.env.BROWSER || '';
  const envBool = (name, def=false)=>{ const s=String(process.env[name]??'').trim().toLowerCase(); if(['1','true','yes','y'].includes(s)) return true; if(['0','false','no','n'].includes(s)) return false; return def; };
  const skipVision = envBool('SKIP_VISION', true);
  const safeOverlay = envBool('SAFE_OVERLAY', false); // 默认注入菜单（仅安装不启用）

  // Preflight
  const camo = detectCamoufoxPath();
  if (browserEnv.toLowerCase() === 'camoufox' || !browserEnv) {
    if (!camo) throw new Error('Camoufox executable not found');
    process.env.CAMOUFOX_PATH = camo; dlog(`camoufox detected: ${camo}`);
  }

  // build
  dlog('build services');
  try { execSync('npm run -s build:services', { stdio: 'inherit' }); } catch {}

  // clean ports
  try { execSync('lsof -ti :7701 | xargs kill -9 || true'); } catch {}
  try { execSync('lsof -ti :7702 | xargs kill -9 || true'); } catch {}
  try { execSync('lsof -ti :7703 | xargs kill -9 || true'); } catch {}
  try { execSync('lsof -ti :7704 | xargs kill -9 || true'); } catch {}

  // bring up 3 services directly (skip orchestrator)
  // Pass SID_OVERLAY env to API Gateway so launch can disable SID panel if needed
  try { spawn('node', ['dist/services/engines/api-gateway/server.js'], { detached:true, stdio:'ignore', env: { ...process.env, SID_OVERLAY: safeOverlay? '0':'1', SINGLE_WINDOW_GUARD: safeOverlay? 'minimal':'full', COOKIE_RELOAD: safeOverlay? '0':'1' } }).unref(); } catch(e){ dlog('spawn workflow failed:'+ (e?.message||String(e))); }
  if (!skipVision) startNode('vision',   'dist/services/engines/vision-engine/server.js');
  startNode('container','dist/services/engines/container-engine/server.js');
  // start browser remote-service (background)
  try { const bs = spawn('node', ['libs/browser/remote-service.js', '--host', String(BROWSER_HOST), '--port', String(BROWSER_PORT)], { detached:true, stdio:'ignore', env: { ...process.env } }); bs.unref(); } catch {}

  const okWf = await waitHealth('http://127.0.0.1:7701/health', 20000, 'workflow'); if (!okWf) throw new Error('workflow api not healthy');
  if (skipVision) { dlog('vision skipped'); }
  else { const okVs = await waitHealth('http://127.0.0.1:7702/health', 25000, 'vision'); if (!okVs) throw new Error('vision engine not healthy'); }
  const okCt = await waitHealth('http://127.0.0.1:7703/health', 20000, 'container'); if (!okCt) throw new Error('container engine not healthy');
  const okBs = await waitHealth(`http://127.0.0.1:${BROWSER_PORT}/health`, 15000, 'browser-service'); if (!okBs) dlog('browser-service not healthy');

  // run prelogin preflow to get session
  dlog('run prelogin workflow (1688-login-preflow)');
  const run = await post('http://127.0.0.1:7701/v1/workflows/run', { workflowPath: 'libs/workflows/preflows/1688-login-preflow.json', parameters: { allowLaunch: true } });
  if (!run?.success) throw new Error(`prelogin failed: ${run?.error||'unknown'}`);
  const sid = (run?.variables?.sessionId) || (run?.variables?.session?.id) || (run?.sessionId);
  if (!sid) throw new Error('prelogin returned no sessionId');
  dlog(`sessionId = ${sid} (from prelogin)`);

  // Ensure persistent SID overlay
  try { await post('http://127.0.0.1:7701/v1/browser/session/overlay/install', { sessionId: sid }); dlog('overlay mini SID panel installed'); } catch (e) { dlog(`overlay install failed: ${e?.message||String(e)}`); }

  // Navigate (optional)
  if (openUrl) {
    dlog(`navigate to ${openUrl}`);
    await post('http://127.0.0.1:7701/v1/browser/navigate', { sessionId: sid, url: openUrl, waitUntil: 'domcontentloaded' });
    // attach & cleanup
    try {
      const hostRe = normalizeHostRe(new URL(openUrl).hostname);
      const pat = hostRe.includes('1688.com') ? '1688\\.com' : hostRe;
      await post('http://127.0.0.1:7701/v1/browser/tab/attach', { sessionId: sid, urlPattern: pat, bringToFront: true, waitUntil: 'domcontentloaded', timeout: 15000 });
      await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, hostIncludes: 'baidu.com', closeAll: true }).catch(()=>{});
      await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, urlPattern: '^about:blank$', closeAll: true }).catch(()=>{});
      await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, hostIncludes: 'automationcontrolled', closeAll: true }).catch(()=>{});
      await post('http://127.0.0.1:7701/v1/browser/tab/close-unmatched', { sessionId: sid, keepUrlPattern: pat, alsoCloseBlank: true }).catch(()=>{});
      dlog(`attached and cleaned tabs for /${pat}/`);
    } catch (e) { dlog(`attach/cleanup tabs failed: ${e?.message||String(e)}`); }

    // Monitor anchors and inject
    dlog('monitoring anchors (captcha + login-success)...');
    const isVisible = `(el)=>{ if(!el) return false; const st=getComputedStyle(el); return st.display!=='none'&&st.visibility!=='hidden'&&el.offsetWidth>0&&el.offsetHeight>0; }`;
    const successCheck = `(()=>{ try{ const isHome=location.hostname.endsWith('1688.com'); const el=document.querySelector('.userAvatarLogo > div:nth-child(2)'); const vis=(${isVisible})(el); return !!(isHome&&vis); }catch{return false;} })()`;
    const captchaCheck = `(()=>{ try{ const el=document.querySelector('.nc-lang-cnt'); if(!el) return false; const st=getComputedStyle(el); if(st.display==='none'||st.visibility==='hidden'||el.offsetWidth===0||el.offsetHeight===0) return false; const txt=(el.textContent||'').trim(); return txt.includes('请按住滑块') || (el.getAttribute('data-nc-lang')||'').toUpperCase()==='SLIDE'; }catch{return false;} })()`;
    async function highlight(sel, color, label){ try{ await post('http://127.0.0.1:7701/v1/browser/highlight', { sessionId: sid, selector: sel, color, label, durationMs: 2500, requireLoginAnchor: false }); }catch{} }
    async function highlightCaptcha(){ const sels=['.nc-lang-cnt','[data-nc-lang]','.nc-container','[id*="nocaptcha"]','[class*="nocaptcha"]']; for(const s of sels){ try{ await highlight(s,'#FF3B30','CAPTCHA'); return; }catch{} } }
    let lastAttach=0; let lastAnchorHi=0; let lastCaptchaHi=0; let lastNoCaptchaTs=0; let injected=false; const endAt=Date.now()+10*60*1000;
    while(Date.now()<endAt && !injected){
      // periodic attach & cleanup
      try{
        const now=Date.now();
        if (now-lastAttach>2500){
          lastAttach=now;
          const hostRe = normalizeHostRe(new URL(openUrl).hostname);
          const pat = hostRe.includes('1688.com') ? '1688\\.com' : hostRe;
          await post('http://127.0.0.1:7701/v1/browser/tab/attach', { sessionId: sid, urlPattern: pat, bringToFront:true, waitUntil:'domcontentloaded', timeout:8000 });
          await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, hostIncludes:'automationcontrolled', closeAll:true }).catch(()=>{});
          await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, urlPattern:'^about:blank$', closeAll:true }).catch(()=>{});
          await post('http://127.0.0.1:7701/v1/browser/tab/close-unmatched', { sessionId: sid, keepUrlPattern: pat, alsoCloseBlank:true }).catch(()=>{});
        }
      }catch{}
      let succ=false, capt=false;
      try{ const r=await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: successCheck }); succ=!!(r?.success && r?.value===true); }catch{}
      try{ const r=await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: captchaCheck }); capt=!!(r?.success && r?.value===true); }catch{}
      const now=Date.now();
      if (capt){ lastNoCaptchaTs=0; if (now-lastCaptchaHi>3000){ await highlightCaptcha(); lastCaptchaHi=now; } await wait(1200); continue; }
      if (!capt){ lastNoCaptchaTs = lastNoCaptchaTs || now; }
      if (succ){ if (now-lastAnchorHi>3000){ await highlight('.userAvatarLogo > div:nth-child(2)', '#00C853', 'LOGIN'); lastAnchorHi=now; } }
      if (succ && lastNoCaptchaTs && (now-lastNoCaptchaTs)>2000){ injected=true; break; }
      await wait(1000);
    }
    // Inject picker & container library after success
    if (injected){
      try {
        if (!safeOverlay) {
          await post('http://127.0.0.1:7703/v1/debug/picker/install', { sessionId: sid });
          dlog('picker installed (disabled by default)');
        } else {
          dlog('SAFE_OVERLAY on: skip picker/menu injection');
        }
      } catch(e){ dlog(`picker install failed: ${e?.message||String(e)}`); }
      try {
        const eTLD1 = (h)=>{ const p=String(h||'').split('.').filter(Boolean); return p.length>=2?p.slice(-2).join('.'):(h||''); };
        const site = eTLD1(new URL(openUrl).hostname);
        const rootsRes = await fetch(`http://127.0.0.1:7703/v1/debug/library/roots?site=${encodeURIComponent(site)}`);
        if (rootsRes.ok){
          const rj = await rootsRes.json(); const roots = rj.roots||[]; async function enrich(node){ const dRes = await fetch(`http://127.0.0.1:7703/v1/debug/library/container/${encodeURIComponent(node.id)}?site=${encodeURIComponent(site)}`); let selectors=[],name=''; if(dRes.ok){ const dj=await dRes.json(); const def=dj.def||{}; name=def.name||''; const first=(def.selectors && def.selectors[0] && def.selectors[0].classes)||[]; selectors=Array.isArray(first)?first:[]; } const kids=Array.isArray(node.children)?node.children:[]; const enrichedChildren=[]; for(const c of kids){ const ec=await enrich(c); enrichedChildren.push(ec);} return { id:node.id, name, selectors, children:enrichedChildren}; }
          const trees = []; for (const rid of roots){ const tRes = await fetch(`http://127.0.0.1:7703/v1/debug/library/tree?site=${encodeURIComponent(site)}&rootId=${encodeURIComponent(rid)}`); if (tRes.ok){ const tj = await tRes.json(); if (tj.tree){ const full=await enrich(tj.tree); trees.push(full); } } }
          await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ window.__webautoContainerLibrary = window.__webautoContainerLibrary||{}; window.__webautoContainerLibrary[${JSON.stringify(site)}] = ${JSON.stringify({ site, roots: trees })}; window.__webautoSessionId = ${JSON.stringify(sid)}; }catch{} })()` });
          dlog(`injected container library for site ${site}, roots=${trees.length}`);
        }
      } catch(e){ dlog(`inject container library failed: ${e?.message||String(e)}`); }
    } else {
      dlog('anchor conditions not satisfied; skip picker install');
    }
  }

  console.log('\nAll services up (dev-up)!');
  console.log('- Workflow API:   http://127.0.0.1:7701/health');
  console.log(`- Vision Engine:  ${skipVision ? '(skipped)' : 'http://127.0.0.1:7702/health'}`);
  console.log('- Container Eng.: http://127.0.0.1:7703/health');
}

main().catch(e=>{ console.error('dev-up failed:', e?.message||String(e)); process.exit(1); });
import { loadBrowserServiceConfig } from '../../../../libs/browser/browser-service-config.js';
  const bsc = loadBrowserServiceConfig();
  const BROWSER_HOST = bsc.host || '0.0.0.0';
  const BROWSER_PORT = Number(bsc.port || 7704);
