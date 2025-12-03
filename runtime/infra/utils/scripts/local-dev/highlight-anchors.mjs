#!/usr/bin/env node
// Highlight anchors manually for a given sessionId
import { argv, exit } from 'node:process';

function parseArgs() {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/); if (m) { args[m[1]] = m[2]; continue; }
    if (a.startsWith('--')) { args[a.slice(2)] = true; continue; }
  }
  return args;
}

async function post(url, body){
  const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body||{}) });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.json();
}

async function main(){
  const args = parseArgs();
  const sid = args.sid || args.sessionId;
  const type = args.type || 'captcha';
  if (!sid) { console.error('Usage: node runtime/infra/utils/scripts/local-dev/highlight-anchors.mjs --sid=<sessionId> [--type=captcha|login]'); exit(1); }

  if (type === 'login') {
    // green highlight on avatar
    const sel = '.userAvatarLogo > div:nth-child(2)';
    try { await post('http://127.0.0.1:7701/v1/browser/highlight', { sessionId: sid, selector: sel, color: '#00C853', label: 'LOGIN', durationMs: 3000, requireLoginAnchor: false }); console.log('highlighted login anchor'); return; } catch {}
    await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; var r=el.getBoundingClientRect(); var o=document.createElement('div'); o.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;border:3px solid #00C853;z-index:2147483647;pointer-events:none;'; document.documentElement.appendChild(o); setTimeout(()=>{try{o.remove();}catch{}},3000); return true; }catch(e){ return false; } })()` });
    console.log('login anchor fallback highlighted');
    return;
  }

  // captcha default
  const selectors = ['.nc-lang-cnt','[data-nc-lang]','.nc-container','[id*="nocaptcha"]','[class*="nocaptcha"]'];
  for (const sel of selectors) {
    try { await post('http://127.0.0.1:7701/v1/browser/highlight', { sessionId: sid, selector: sel, color: '#FF3B30', label: 'CAPTCHA', durationMs: 3000, requireLoginAnchor: false }); console.log('highlighted', sel); return; } catch {}
  }
  // fallback eval in main frame
  await post('http://127.0.0.1:7701/v1/dev/eval-code', { sessionId: sid, code: `(()=>{ try{ var el=document.querySelector('.nc-lang-cnt')||document.querySelector('[data-nc-lang]')||document.querySelector('.nc-container')||document.querySelector('[id*="nocaptcha"],[class*="nocaptcha"]'); if(!el){ var nodes=Array.from(document.querySelectorAll('span,div,p')); el = nodes.find(n=>{ var t=(n.textContent||'').trim(); return t.includes('拖动')||t.includes('滑块')||t.includes('完成验证'); }); } if(!el) return false; var r=el.getBoundingClientRect(); var o=document.createElement('div'); o.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;border:3px solid #FF3B30;z-index:2147483647;pointer-events:none;'; document.documentElement.appendChild(o); setTimeout(()=>{try{o.remove();}catch{}},3000); return true; }catch(e){ return false; } })()` });
  console.log('captcha fallback highlighted');
}

main().catch(e=>{ console.error('highlight failed:', e?.message||String(e)); exit(2); });

