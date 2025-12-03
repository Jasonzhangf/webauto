#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { existsSync, mkdirSync, appendFileSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function log(msg){ console.log(`[dev-all] ${msg}`); }
const DEBUG_DIR = 'debug';
const runStamp = new Date().toISOString().replace(/[:.]/g,'-');
const DEBUG_FILE = `${DEBUG_DIR}/dev-all-${runStamp}.log`;
function dlog(msg){ try{ mkdirSync(DEBUG_DIR, { recursive: true }); appendFileSync(DEBUG_FILE, `[${new Date().toISOString()}] ${msg}\n`); }catch{} log(msg); }

async function waitHealth(url, timeoutMs=20000, label=''){ const t0=Date.now(); let i=0; while (Date.now()-t0<timeoutMs){
  try { const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),1200); const r=await fetch(url,{signal:ctl.signal}); clearTimeout(to); if (r.ok) { if(label) log(`${label} healthy`); return true; } } catch {}
  if (label && (++i%4===0)) log(`waiting ${label}...`);
  await wait(500);
} return false; }

async function post(url, body){
  const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body||{}) });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.json();
}

function detectCamoufoxPath(){
  if (process.env.CAMOUFOX_PATH && existsSync(process.env.CAMOUFOX_PATH)) return process.env.CAMOUFOX_PATH;
  try {
    // eslint-disable-next-line global-require
    const mod = require('camoufox');
    const p = mod?.executablePath || mod?.default?.executablePath;
    if (p && existsSync(p)) return p;
  } catch {}
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
  const headless = process.env.HEADLESS === '1' ? true : false;
  const browserEnv = process.env.BROWSER || '';
  const openUrl = process.env.OPEN_URL || '';

  // Detect Camoufox path before starting services
  const camo = detectCamoufoxPath();
  if (browserEnv.toLowerCase() === 'camoufox' || !browserEnv) {
    if (!camo) {
      console.error('Camoufox executable not found. Set CAMOUFOX_PATH to Camoufox binary.');
      process.exit(1);
    }
    process.env.CAMOUFOX_PATH = camo;
    dlog(`camoufox detected: ${camo}`);
  }

  dlog('build services');
  try { execSync('npm run -s build:services', { stdio: 'inherit' }); } catch {}

  // clean ports to avoid orphan conflicts (macOS)
  try { execSync('lsof -ti :7701 | xargs kill -9 || true'); } catch {}
  try { execSync('lsof -ti :7702 | xargs kill -9 || true'); } catch {}
  try { execSync('lsof -ti :7703 | xargs kill -9 || true'); } catch {}
  try { execSync('lsof -ti :7704 | xargs kill -9 || true'); } catch {}

  const envBool = (name, def=false)=>{ const s=String(process.env[name]??'').trim().toLowerCase(); if(['1','true','yes','y'].includes(s)) return true; if(['0','false','no','n'].includes(s)) return false; return def; };
  const skipVision = envBool('SKIP_VISION', true);
  const useOrch = envBool('USE_ORCH', false);
  const safeOverlay = envBool('SAFE_OVERLAY', false); // 默认为注入菜单

  if (useOrch) {
    // start browser remote-service (background)
    try { const bs = spawn('node', ['libs/browser/remote-service.js', '--host', String(BROWSER_HOST), '--port', String(BROWSER_PORT)], { detached:true, stdio:'ignore', env: { ...process.env } }); bs.unref(); } catch {}
    const okBs = await waitHealth(`http://127.0.0.1:${BROWSER_PORT}/health`, 15000, 'browser-service');
    if (!okBs) { dlog('browser-service not healthy, continue but remote control may be unavailable'); }
    dlog('start orchestrator');
    const orch = spawn('node', ['dist/apps/webauto/server.js'], { detached: true, stdio:'ignore', env: { ...process.env, SID_OVERLAY: safeOverlay? '0':'1' } });
    orch.unref();
    const okOrch = await waitHealth('http://127.0.0.1:7700/health', 30000, 'orchestrator');
    if (!okOrch) throw new Error('orchestrator not healthy');
    let okWf = await waitHealth('http://127.0.0.1:7701/health', 10000, 'workflow');
    let okVs = skipVision ? true : await waitHealth('http://127.0.0.1:7702/health', 10000, 'vision');
    let okCt = await waitHealth('http://127.0.0.1:7703/health', 10000, 'container');
    if (!okWf || !okVs || !okCt) {
      dlog('start services directly (workflow/vision/container)');
      try { const wf = spawn('node', ['dist/services/engines/api-gateway/server.js'], { detached:true, stdio:'ignore', env: { ...process.env, SID_OVERLAY: safeOverlay? '0':'1', SINGLE_WINDOW_GUARD: safeOverlay? 'minimal':'full', COOKIE_RELOAD: safeOverlay? '0':'1' } }); wf.unref(); } catch {}
  if (!skipVision) { try { const vs = spawn('node', ['dist/services/engines/vision-engine/server.js'], { detached:true, stdio:'ignore' }); vs.unref(); } catch {} }
  try { const ct = spawn('node', ['dist/services/engines/container-engine/server.js'], { detached:true, stdio:'ignore' }); ct.unref(); } catch {}
      // ensure browser remote-service (background) when not using orchestrator
      try { const bs = spawn('node', ['libs/browser/remote-service.js', '--host', String(BROWSER_HOST), '--port', String(BROWSER_PORT)], { detached:true, stdio:'ignore', env: { ...process.env } }); bs.unref(); } catch {}
      const okBs2 = await waitHealth(`http://127.0.0.1:${BROWSER_PORT}/health`, 15000, 'browser-service');
      if (!okBs2) { dlog('browser-service not healthy, continue'); }
      okWf = await waitHealth('http://127.0.0.1:7701/health', 20000, 'workflow');
      if (!okWf) throw new Error('workflow api not healthy');
      if (!skipVision) { okVs = await waitHealth('http://127.0.0.1:7702/health', 25000, 'vision'); if (!okVs) throw new Error('vision engine not healthy'); } else { dlog('vision skipped'); }
      okCt = await waitHealth('http://127.0.0.1:7703/health', 20000, 'container');
      if (!okCt) throw new Error('container engine not healthy');
    }
  } else {
    dlog('skip orchestrator; start services directly');
    try {
      mkdirSync(DEBUG_DIR, { recursive: true });
      const wfOut = openSync(`${DEBUG_DIR}/workflow-${runStamp}.log`, 'a');
      const wf = spawn('node', ['dist/services/engines/api-gateway/server.js'], { detached:true, stdio:['ignore', wfOut, wfOut], env: { ...process.env, SID_OVERLAY: safeOverlay? '0':'1', SINGLE_WINDOW_GUARD: safeOverlay? 'minimal':'full', COOKIE_RELOAD: safeOverlay? '0':'1' } });
      wf.unref();
    } catch {}
    if (!skipVision) {
      try { const vsOut = openSync(`${DEBUG_DIR}/vision-${runStamp}.log`, 'a'); const vs = spawn('node', ['dist/services/engines/vision-engine/server.js'], { detached:true, stdio:['ignore', vsOut, vsOut] }); vs.unref(); } catch {}
    }
    try { const ctOut = openSync(`${DEBUG_DIR}/container-${runStamp}.log`, 'a'); const ct = spawn('node', ['dist/services/engines/container-engine/server.js'], { detached:true, stdio:['ignore', ctOut, ctOut] }); ct.unref(); } catch {}
    const okWf = await waitHealth('http://127.0.0.1:7701/health', 20000, 'workflow');
    if (!okWf) throw new Error('workflow api not healthy');
    if (!skipVision) { const okVs = await waitHealth('http://127.0.0.1:7702/health', 25000, 'vision'); if (!okVs) throw new Error('vision engine not healthy'); } else { dlog('vision skipped'); }
    const okCt = await waitHealth('http://127.0.0.1:7703/health', 20000, 'container');
    if (!okCt) throw new Error('container engine not healthy');
  }

  dlog('run prelogin workflow (1688-login-preflow)');
  const wfPath = 'libs/workflows/preflows/1688-login-preflow.json';
  const run = await post('http://127.0.0.1:7701/v1/workflows/run', {
    workflowPath: wfPath,
    parameters: { allowLaunch: true }
  });
  if (!run?.success) throw new Error(`prelogin failed: ${run?.error||'unknown'}`);
  const sid = (run?.variables?.sessionId) || (run?.variables?.session?.id) || (run?.sessionId);
  if (!sid) throw new Error('prelogin returned no sessionId');
  dlog(`sessionId = ${sid} (from prelogin)`);

  // Ensure persistent SID mini panel is installed right after session creation
  try {
    await post('http://127.0.0.1:7701/v1/browser/session/overlay/install', { sessionId: sid });
    dlog('overlay mini SID panel installed');
  } catch (e) { dlog(`overlay install failed: ${e?.message||String(e)}`); }

  if (openUrl) {
    dlog(`navigate to ${openUrl}`);
    await post('http://127.0.0.1:7701/v1/browser/navigate', { sessionId: sid, url: openUrl, waitUntil: 'domcontentloaded' });
    // Attach to the correct tab (avoid eval on wrong page)
    try {
      const host = new URL(openUrl).hostname.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
      const pat = host.includes('1688.com') ? '1688\\.com' : host;
      await post('http://127.0.0.1:7701/v1/browser/tab/attach', { sessionId: sid, urlPattern: pat, bringToFront: true, waitUntil: 'domcontentloaded', timeout: 15000 });
      dlog(`attached to tab matching /${pat}/`);
      // Close warmup and blank tabs to prevent multi-instance perception
      try { await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, hostIncludes: 'baidu.com', closeAll: true }); } catch {}
      try { await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, urlPattern: '^about:blank$', closeAll: true }); } catch {}
      try { await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, hostIncludes: 'automationcontrolled', closeAll: true }); } catch {}
    } catch (e) { dlog(`attach/cleanup tabs failed: ${e?.message||String(e)}`); }

    // In SAFE_OVERLAY mode: do nothing more, avoid any eval/injection
    if (safeOverlay) {
      dlog('SAFE_OVERLAY on: skip anchors/monitoring/injection');
      console.log('\nAll services up (safe mode).');
      console.log('- Workflow API:   http://127.0.0.1:7701/health');
      console.log('- Container Eng.: http://127.0.0.1:7703/health');
      return;
    }

    // Continuous monitor: keep SID alive, highlight anchors and inject only when success true and no captcha for >2s
    dlog('monitoring anchors (captcha + login-success)...');
    const isVisible = `(el)=>{ if(!el) return false; const st=getComputedStyle(el); return st.display!=='none'&&st.visibility!=='hidden'&&el.offsetWidth>0&&el.offsetHeight>0; }`;
    const successCheck = `(()=>{ try{ const isHome=location.hostname.endsWith('1688.com'); const el=document.querySelector('.userAvatarLogo > div:nth-child(2)'); const vis=(${isVisible})(el); return !!(isHome&&vis); }catch{return false;} })()`;
    const captchaCheck = `(()=>{ try{ const el=document.querySelector('.nc-lang-cnt'); if(!el) return false; const st=getComputedStyle(el); if(st.display==='none'||st.visibility==='hidden'||el.offsetWidth===0||el.offsetHeight===0) return false; const txt=(el.textContent||'').trim(); return txt.includes('请按住滑块') || (el.getAttribute('data-nc-lang')||'').toUpperCase()==='SLIDE'; }catch{return false;} })()`;
    async function highlight(sel, color, label){
      // try service highlight first
      try{ dlog(`highlight via service: ${label||''} ${sel}`); await post('http://127.0.0.1:7701/v1/browser/highlight', { sessionId: sid, selector: sel, color, label, durationMs: 2500, requireLoginAnchor: false }); return; }catch(e){ dlog(`highlight service failed: ${e?.message||String(e)}`); }
      // fallback: outline elements for 2.5s via eval-code
      try{
        const code = (()=>{
          const s = JSON.stringify(sel);
          const c = JSON.stringify(color||'#FF3B30');
          return `(()=>{ try{ var els=document.querySelectorAll(${s}); for(var i=0;i<els.length;i++){ var el=els[i]; el.dataset.__wa_prev_outline = el.style.outline || ''; el.style.outline='2px solid ' + ${c}; el.style.outlineOffset='2px'; } setTimeout(function(){ try{ var els=document.querySelectorAll(${s}); for(var i=0;i<els.length;i++){ var el=els[i]; if (el && el.dataset){ el.style.outline = el.dataset.__wa_prev_outline || ''; delete el.dataset.__wa_prev_outline; } } }catch(e){} }, 2500); return true; }catch(e){ return false; } })()`;
        })();
        dlog(`highlight via eval fallback: ${label||''} ${sel}`);
        await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code });
      }catch{}
    }

    async function highlightCaptcha(){
      // try service highlight with some common selectors first
      const selCandidates = ['.nc-lang-cnt','[data-nc-lang]','.nc-container','[id*="nocaptcha"]','[class*="nocaptcha"]'];
      for (const s of selCandidates){ try{ await highlight(s, '#FF3B30', 'CAPTCHA'); return; }catch(e){ dlog(`captcha highlight failed for ${s}: ${e?.message||String(e)}`); } }
      // fallback: eval-code in top frame and likely subframes
      const frameHints = ['', 'captcha', 'nocaptcha', 'aliyun', 'alicdn'];
      for (const hint of frameHints){
        try{
          const code = `(()=>{ try{
            function vis(el){ if(!el) return false; const st=getComputedStyle(el); return st.display!=='none'&&st.visibility!=='hidden'&&el.offsetWidth>0&&el.offsetHeight>0; }
            let el = document.querySelector('.nc-lang-cnt') || document.querySelector('[data-nc-lang]') || document.querySelector('.nc-container') || document.querySelector('[id*="nocaptcha"], [class*="nocaptcha"]');
            if(!el){ var nodes = Array.from(document.querySelectorAll('span,div,p')); el = nodes.find(n=>{ var t=(n.textContent||'').trim(); return t.includes('拖动')||t.includes('滑块')||t.includes('完成验证'); }); }
            if(!vis(el)) return false;
            var rect = el.getBoundingClientRect(); var ov = document.createElement('div'); ov.style.cssText='position:fixed;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px;border:2px solid #FF3B30;z-index:2147483647;pointer-events:none;box-sizing:border-box;'; document.documentElement.appendChild(ov); setTimeout(()=>{ try{ ov.remove(); }catch{} }, 2500); return true;
          }catch(e){ return false; } })()`;
          const body = { sessionId: sid, code };
          if (hint) body.frame = { urlIncludes: hint };
          const r = await post('http://127.0.0.1:7701/v1/dev/eval-code', body);
          if (r?.success && r?.value===true) return;
        }catch{}
      }
    }
    let injected=false; let lastAnchorHi=0; let lastCaptchaHi=0; let lastNoCaptchaTs=0; let lastAttachTs=0; let lastPickerCheck=0; let didReloadOnce=false;
    const endAt = Date.now()+10*60*1000; // monitor up to 10 minutes
    let lastSidEnsureLog = 0;
    while (Date.now()<endAt && !injected){
      // periodic attach + cleanup to ensure commands run on correct tab
      try {
        const nowTs = Date.now();
        if (nowTs - lastAttachTs > 2500) {
          lastAttachTs = nowTs;
          const host = new URL(openUrl).hostname.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&');
          const pat = host.includes('1688.com') ? '1688\\.com' : host;
          await post('http://127.0.0.1:7701/v1/browser/tab/attach', { sessionId: sid, urlPattern: pat, bringToFront: true, waitUntil: 'domcontentloaded', timeout: 8000 });
          await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, hostIncludes: 'automationcontrolled', closeAll: true }).catch(()=>{});
          await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, urlPattern: '^about:blank$', closeAll: true }).catch(()=>{});
          await post('http://127.0.0.1:7701/v1/browser/tab/close-unmatched', { sessionId: sid, keepUrlPattern: pat, alsoCloseBlank: true }).catch(()=>{});
        }
      } catch {}
      // periodic attach + cleanup to ensure commands run on correct tab
      try {
        const now = Date.now();
        if (now - lastAttachTs > 2500) {
          lastAttachTs = now;
          const host = new URL(openUrl).hostname.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&');
          const pat = host.includes('1688.com') ? '1688\\.com' : host;
          await post('http://127.0.0.1:7701/v1/browser/tab/attach', { sessionId: sid, urlPattern: pat, bringToFront: true, waitUntil: 'domcontentloaded', timeout: 8000 });
          await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, hostIncludes: 'automationcontrolled', closeAll: true }).catch(()=>{});
          await post('http://127.0.0.1:7701/v1/browser/tab/close', { sessionId: sid, urlPattern: '^about:blank$', closeAll: true }).catch(()=>{});
        }
      } catch {}
      // Keep SID mini panel alive (install + hard fallback) + detect blank and reinstall picker in non-safe mode
      try {
        const checkCode = `(()=>{ try{ var el=document.getElementById('__waMiniMenu'); return !!el; }catch(e){ return 'ERR:'+String(e); } })()`;
        const hasSid = await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: checkCode });
        const ok = !!(hasSid?.success && hasSid?.value===true);
        if (!ok) {
          const now = Date.now();
          if (now - lastSidEnsureLog > 2000) { dlog('mini SID missing -> reinstall overlay'); lastSidEnsureLog = now; }
          try { await post('http://127.0.0.1:7701/v1/browser/session/overlay/install', { sessionId: sid }); } catch {}
          // Hard fallback: inject directly via eval-code
          try {
            const inj = `(()=>{ try{ var ID='__waMiniMenu'; var el=document.getElementById(ID); if(!el){ el=document.createElement('div'); el.id=ID; el.style.cssText='position:fixed;top:8px;right:8px;z-index:2147483647;background:rgba(0,0,0,0.7);color:#fff;padding:6px 10px;border-radius:8px;font:12px -apple-system,system-ui;user-select:text;'; var lab=document.createElement('span'); lab.textContent='SID:'; lab.style.opacity='0.8'; lab.style.marginRight='6px'; var val=document.createElement('span'); val.id='__waMiniMenu_sid'; val.textContent=${JSON.stringify(sid)}; el.appendChild(lab); el.appendChild(val); (document.documentElement||document.body||document).appendChild(el); } else { var v=el.querySelector('#__waMiniMenu_sid'); if(v) v.textContent=${JSON.stringify(sid)}; } return !!document.getElementById(ID); }catch(e){ return false; } })()`;
            await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: inj });
          } catch {}
        }
        // blank detection + one-time reload
        const blank = await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ var b=document.body; if(!b) return true; var st=getComputedStyle(b); var hidden=(st.display==='none'||st.visibility==='hidden'||st.opacity==='0'); return (b.children.length===0 && (b.innerText||'').trim().length===0) || hidden; }catch{return false;} })()` }).catch(()=>null);
        if (blank && blank.success && blank.value===true && !didReloadOnce){ dlog('page looks blank -> soft reload'); await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ location.reload(); return true; }catch{return false;} })()` }); didReloadOnce=true; }
        // picker ensure only in non-safe mode
        if (!safeOverlay){
          const chk = await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ return !!(window.__webautoPicker && typeof window.__webautoPicker.getState==='function'); }catch{return false;} })()` }).catch(()=>null);
          if (!(chk && chk.success && chk.value===true)) { try{ await post('http://127.0.0.1:7703/v1/debug/picker/install', { sessionId: sid }); }catch{} }
        }
      } catch {}

      let succ=false, capt=false;
      try{ const r=await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: successCheck }); succ=!!(r?.success && r?.value===true); }catch{}
      try{ const r=await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: captchaCheck }); capt=!!(r?.success && r?.value===true); }catch{}
      const now=Date.now();
      // detect blank page and try a one-time soft reload
      if (now-lastPickerCheck>2500) {
        lastPickerCheck=now;
        try {
          const blank = await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ var b=document.body; if(!b) return true; var style=getComputedStyle(b); var hidden=(style.display==='none'||style.visibility==='hidden'||style.opacity==='0'); return (b.children.length===0 && (b.innerText||'').trim().length===0) || hidden; }catch{return false;} })()` });
          if (!didReloadOnce && blank?.success && blank?.value===true) {
            dlog('page looks blank -> soft reload');
            await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ location.reload(); return true; }catch{return false;} })()` });
            didReloadOnce = true;
          }
        } catch {}
        // keep picker installed, but do NOT auto-enable (避免事件捕获干扰)
        try{
          const chk = await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ return !!(window.__webautoPicker && typeof window.__webautoPicker.getState==='function'); }catch{return false;} })()` });
          const ok = !!(chk?.success && chk?.value===true);
          if (!ok){ dlog('picker missing -> reinstall'); await post('http://127.0.0.1:7703/v1/debug/picker/install', { sessionId: sid }); }
        }catch(e){ dlog(`picker ensure failed: ${e?.message||String(e)}`); }
      }
      if (capt){ lastNoCaptchaTs=0; if (now-lastCaptchaHi>3000){ dlog('captcha detected -> highlight red'); await highlightCaptcha(); lastCaptchaHi=now; } await wait(1500); continue; }
      if (!capt){ lastNoCaptchaTs = lastNoCaptchaTs || now; }
      if (succ){ if (now-lastAnchorHi>3000){ dlog('login-success anchor -> highlight green'); await highlight('.userAvatarLogo > div:nth-child(2)', '#00C853', 'LOGIN'); lastAnchorHi=now; } }
      // inject if success and no captcha for at least 2s
      if (succ && lastNoCaptchaTs && (now-lastNoCaptchaTs) > 2000){ injected=true; break; }
      await wait(1200);
    }
    if (!injected) dlog('anchor conditions not satisfied within monitor window; continue cautiously');

    // After anchor, inject container library and sessionId for overlay usage
    try {
      const eTLD1 = (h)=>{ const p=String(h||'').split('.').filter(Boolean); return p.length>=2?p.slice(-2).join('.'):(h||''); };
      const site = eTLD1(new URL(openUrl).hostname);
      const rootsRes = await fetch(`http://127.0.0.1:7703/v1/debug/library/roots?site=${encodeURIComponent(site)}`);
      if (rootsRes.ok){
        const rj = await rootsRes.json();
        const roots = rj.roots||[];
        async function enrich(node){
          const dRes = await fetch(`http://127.0.0.1:7703/v1/debug/library/container/${encodeURIComponent(node.id)}?site=${encodeURIComponent(site)}`);
          let selectors = [];
          let name = '';
          if (dRes.ok){
            const dj = await dRes.json();
            const def = dj.def||{};
            name = def.name || '';
            const first = (def.selectors && def.selectors[0] && def.selectors[0].classes) || [];
            selectors = Array.isArray(first)? first: [];
          }
          const kids = Array.isArray(node.children)? node.children: [];
          const enrichedChildren = [];
          for (const c of kids){ const ec = await enrich(c); enrichedChildren.push(ec); }
          return { id: node.id, name, selectors, children: enrichedChildren };
        }
        const trees = [];
        for (const rid of roots){
          const tRes = await fetch(`http://127.0.0.1:7703/v1/debug/library/tree?site=${encodeURIComponent(site)}&rootId=${encodeURIComponent(rid)}`);
          if (tRes.ok){ const tj = await tRes.json(); if (tj.tree){ const full = await enrich(tj.tree); trees.push(full); } }
        }
        const payload = { site, roots: trees };
        await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ window.__webautoContainerLibrary = window.__webautoContainerLibrary||{}; window.__webautoContainerLibrary[${JSON.stringify(site)}] = ${JSON.stringify(payload)}; window.__webautoSessionId = ${JSON.stringify(sid)}; }catch{} })()` });
        dlog(`injected container library for site ${site}, roots=${trees.length}`);
      }
    } catch (e) { log(`inject container library failed: ${e?.message||String(e)}`); }
  }

  // Install picker overlay only if anchor injection succeeded（只安装不默认启用）
  if (openUrl) {
    try {
      // double-check success anchor before installing picker
      const r=await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ const isHome=location.hostname.endsWith('1688.com'); const el=document.querySelector('.userAvatarLogo > div:nth-child(2)'); const st=el?getComputedStyle(el):null; return !!(isHome && el && st && st.display!=='none' && st.visibility!=='hidden' && el.offsetWidth>0 && el.offsetHeight>0); }catch{return false;} })()` });
      if (r?.success && r?.value===true) {
        dlog('install picker overlay (disabled by default)');
        await post('http://127.0.0.1:7703/v1/debug/picker/install', { sessionId: sid });
      } else {
        dlog('skip picker install: success anchor not confirmed');
      }
    } catch (e) { console.warn('picker install failed:', e?.message||String(e)); dlog(`picker install failed: ${e?.message||String(e)}`); }
  }

  console.log('\nAll services up!');
  console.log('- Workflow API:   http://127.0.0.1:7701/health');
  console.log('- Container Eng.: http://127.0.0.1:7703/devtools');
  console.log('- Orchestrator:   (未使用，改为直接启动三项服务)');
  console.log(`\nTips:`);
  console.log('1) 浏览器已启动（Camoufox，预登录 Cookie 已注入）。');
  console.log('2) 右上角已显示容器选择菜单（自动注入）。悬浮蓝色高亮，点击选中。');
  console.log('3) 如需编辑/保存容器：打开 http://127.0.0.1:7703/devtools 并选择 1688.com。');
}

main().catch(e=>{ console.error('dev-all failed:', e?.message||String(e)); process.exit(1); });
import { loadBrowserServiceConfig } from '../../../../libs/browser/browser-service-config.js';
  const bsc = loadBrowserServiceConfig();
  const BROWSER_HOST = bsc.host || '0.0.0.0';
  const BROWSER_PORT = Number(bsc.port || 7704);
