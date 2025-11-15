#!/usr/bin/env node
// Inject or refresh the SID mini panel on the current page (works even on captcha page)
// Usage:
//   node utils/scripts/local-dev/inject-sid-panel.mjs --sid <SESSION_ID> [--host http://127.0.0.1:7701]

const args = process.argv.slice(2);
function arg(name, d) { const p = args.find(a => a.startsWith(`--${name}=`)); return p ? p.slice(name.length+3) : d; }

const SID = arg('sid', '') || process.env.SID || '';
const HOST = arg('host', process.env.WF_HOST || 'http://127.0.0.1:7701');

if (!SID) {
  console.error('Usage: node utils/scripts/local-dev/inject-sid-panel.mjs --sid <SESSION_ID> [--host http://127.0.0.1:7701]');
  process.exit(1);
}

const code = `(()=>{ try {
  var ID = '__wa_sid_panel';
  var p = document.getElementById(ID);
  if (!p) {
    p = document.createElement('div');
    p.id = ID;
    p.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;background:rgba(0,0,0,0.7);color:#fff;padding:6px 10px;border-radius:8px;font:12px -apple-system,system-ui;';
    document.documentElement.appendChild(p);
  }
  p.innerHTML = 'SID: <span id="__wa_sid_val"></span> <button id="__wa_sid_copy" style="margin-left:6px;">复制</button>';
  var v = document.getElementById('__wa_sid_val'); if (v) v.textContent = ${JSON.stringify(SID)};
  var b = document.getElementById('__wa_sid_copy'); if (b) b.onclick = function(e){ e.stopPropagation(); try{ navigator.clipboard.writeText(${JSON.stringify(SID)}); }catch{} };
  window.__webautoSessionId = ${JSON.stringify(SID)};
  true;
} catch (e) { return String(e); } })()`;

const body = { sessionId: SID, code };

async function main(){
  const r = await fetch(`${HOST}/v1/dev/eval-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!j.success) throw new Error(j.error || 'eval failed');
  console.log('OK: SID panel injected/refreshed');
}

main().catch(e=>{ console.error('ERR:', e?.message||String(e)); process.exit(1); });

