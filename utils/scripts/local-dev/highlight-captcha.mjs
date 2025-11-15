#!/usr/bin/env node
// Highlight captcha anchor on the current page (works even if highlight-service is not injected)
// Usage:
//   node utils/scripts/local-dev/highlight-captcha.mjs --sid <SESSION_ID> [--host http://127.0.0.1:7701] [--frame nocaptcha]

const args = process.argv.slice(2);
function arg(name, d) { const p = args.find(a => a.startsWith(`--${name}=`)); return p ? p.slice(name.length+3) : d; }

const SID = arg('sid', '') || process.env.SID || '';
const HOST = arg('host', process.env.WF_HOST || 'http://127.0.0.1:7701');
const FRAME = arg('frame', '') || process.env.FRAME || '';

if (!SID) {
  console.error('Usage: node utils/scripts/local-dev/highlight-captcha.mjs --sid <SESSION_ID> [--host http://127.0.0.1:7701] [--frame nocaptcha]');
  process.exit(1);
}

async function highlight(selector, color, label){
  try {
    const payload = { sessionId: SID, selector, color: color||'#FF3B30', label: label||'CAPTCHA', durationMs: 2500, requireLoginAnchor: false };
    const r = await fetch(`${HOST}/v1/browser/highlight`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) return true;
  } catch {}
  return false;
}

async function evalHighlight(frameHint){
  const code = `(()=>{ try {
    function vis(el){ if(!el) return false; const st=getComputedStyle(el); return st.display!=='none'&&st.visibility!=='hidden'&&el.offsetWidth>0&&el.offsetHeight>0; }
    let el = document.querySelector('.nc-lang-cnt') || document.querySelector('[data-nc-lang]') || document.querySelector('.nc-container') || document.querySelector('[id*=nocaptcha],[class*=nocaptcha]');
    if (!el){ var nodes = Array.from(document.querySelectorAll('span,div,p')); el = nodes.find(n=>{ var t=(n.textContent||'').trim(); return t.includes('拖动')||t.includes('滑块')||t.includes('完成验证'); }); }
    if (!vis(el)) return false;
    var r = el.getBoundingClientRect(); var ov = document.createElement('div'); ov.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;border:2px solid #FF3B30;z-index:2147483647;pointer-events:none;box-sizing:border-box;'; document.documentElement.appendChild(ov); setTimeout(()=>{ try{ ov.remove(); }catch{} }, 2500); return true;
  } catch(e) { return String(e); } })()`;
  const body = { sessionId: SID, code };
  if (frameHint) body.frame = { urlIncludes: frameHint };
  const r = await fetch(`${HOST}/v1/dev/eval-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) return false;
  const j = await r.json();
  return !!(j && j.success && j.value === true);
}

async function main(){
  const selectors = ['.nc-lang-cnt','[data-nc-lang]','.nc-container','[id*="nocaptcha"]','[class*="nocaptcha"]'];
  for (const s of selectors) { const ok = await highlight(s, '#FF3B30', 'CAPTCHA'); if (ok) { console.log('OK: highlighted via service:', s); return; } }
  const frameHints = FRAME ? [FRAME] : ['', 'nocaptcha', 'captcha', 'aliyun', 'alicdn'];
  for (const h of frameHints) { const ok = await evalHighlight(h); if (ok) { console.log('OK: highlighted via eval-code (frameHint='+ (h||'top') +')'); return; } }
  console.error('ERR: could not highlight captcha'); process.exit(2);
}

main().catch(e=>{ console.error('ERR:', e?.message||String(e)); process.exit(1); });

