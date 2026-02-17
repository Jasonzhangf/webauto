#!/usr/bin/env node
// Highlight search containers for 3 seconds: root -> listContainer -> first item
const host = process.env.WORKFLOW_HOST || 'http://127.0.0.1:7701';

function arg(k, d){ const a = process.argv.find(x=>x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; }
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

async function j(u,opt){ const r = await fetch(host+u, { headers:{'Content-Type':'application/json'}, ...(opt||{}) }); return await r.json(); }
async function lastSession(){ const s = await j('/v1/sessions'); const arr=s.sessions||[]; return arr[arr.length-1]||null; }

async function highlight({ sessionId, selector, label }){
  return await j('/v1/containers/highlight', { method:'POST', body: JSON.stringify({ sessionId, containerSelector: selector, label, durationMs: 3000 }) });
}

async function validate({ sessionId, selector }){ return await j('/v1/containers/validate', { method:'POST', body: JSON.stringify({ sessionId, containerSelector: selector }) }); }

async function main(){
  const sessionId = arg('sessionId', null) || await lastSession();
  if (!sessionId) { console.error('No active session.'); process.exit(1); }
  // container definitions (must match container registry)
  const rootSel = '.search-ui2024, .search-i18nUi, body';
  const listSel = '.space-common-offerlist, .offer-list, #offer-list';
  const itemSel = '.offer-item, .sm-offer, [class*=offer]';

  const out = { sessionId, checks: [] };
  for (const [label, sel] of [['ROOT', rootSel], ['LIST', listSel], ['ITEM', itemSel]]){
    const v = await validate({ sessionId, selector: sel });
    out.checks.push({ label, selector: sel, found: !!v.found });
    if (v.found) await highlight({ sessionId, selector: sel, label });
    await sleep(400);
  }
  console.log(JSON.stringify({ ok:true, ...out }, null, 2));
}

main().catch(e=>{ console.error(e); process.exit(1); });
