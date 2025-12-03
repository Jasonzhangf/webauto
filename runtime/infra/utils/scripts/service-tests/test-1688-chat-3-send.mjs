#!/usr/bin/env node
// Self-test: run 1688 3-send workflow sequentially and validate results
// - Reuses REST API service at 127.0.0.1:7701
// - Prepares a fresh session on search page, then runs the send workflow 3 times (index 0..2)
// - Verifies: no repeated company (by keyNorm/uidDecoded), chat tabs closed each round, and at least 3 'sent'

const host = process.env.WORKFLOW_HOST || 'http://127.0.0.1:7701';

function arg(k, d){
  const a = process.argv.find(x=>x.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : d;
}

function sid(){ return 'sess-test-'+Date.now()+'-'+Math.floor(Math.random()*1e6); }
const sessionId = arg('sessionId', sid());
const keyword = arg('keyword','钢化膜');
const message = arg('message','你好');
const delayMs = (ms)=>new Promise(r=>setTimeout(r,ms));

async function j(u,opt){
  const r = await fetch(host+u, opt);
  let body = null;
  try{ body = await r.json(); }catch{ body={}; }
  return { status:r.status, body };
}

async function ensureSearch(){
  // Run the small search-only workflow to prepare search tab
  return await j('/v1/workflows/run', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ workflowPath:'sharedmodule/libraries/workflows/1688/relay/1688-search-only.json', parameters:{ sessionId, keyword } })
  });
}

async function runSend(index){
  return await j('/v1/workflows/run', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ workflowPath:'sharedmodule/libraries/workflows/1688/relay/1688-search-wangwang-chat-send.json', parameters:{ sessionId, keyword, chatMessage: message, startIndex:index, skipPreflows:true } })
  });
}

async function attach(urlPattern){
  return await j('/v1/browser/tab/attach', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId, urlPattern, bringToFront:false, waitUntil:'domcontentloaded', timeout:10000 }) });
}

async function listContacts(){
  const r = await j('/v1/contacts/1688/list');
  return r.body?.items || [];
}

function recentSince(items, ts){ return items.filter(e=> (e.lastSentAt||0) >= ts); }

function summarize(entries){
  const sent = entries.filter(e=> (e.extra?.reason||'').includes('sent'));
  const uniqKey = new Set();
  const uniqUid = new Set();
  for(const e of sent){ if (e.keyNorm) uniqKey.add(e.keyNorm); if (e.uidDecoded) uniqUid.add(e.uidDecoded); }
  return { total: entries.length, sent: sent.length, uniqKey: uniqKey.size, uniqUid: uniqUid.size, companies: Array.from(uniqKey) };
}

async function main(){
  const t0 = Date.now();
  const res0 = await ensureSearch();
  if(!res0.body?.success){
    console.log(JSON.stringify({ ok:false, stage:'prepare', error: res0.body?.error || 'prepare failed' }));
    process.exit(1);
  }

  const details = [];
  for (let i=0;i<3;i++){
    const r = await runSend(i);
    const ok = !!r.body?.success;
    // After each send, ensure chat tab closed and search tab present
    const attSearch = await attach('s\\.1688\\.com/.*');
    const attChat = await attach('air\\.1688\\.com/.*');
    details.push({ index:i, ok, error:r.body?.error||null, attachSearch: attSearch.body?.success===true, chatStillOpen: attChat.body?.success===true });
    await delayMs(1200);
  }

  const items = await listContacts();
  const recent = recentSince(items, t0);
  const sum = summarize(recent);

  const pass = details.every(d=>d.ok) && sum.sent >= 3 && sum.uniqKey >= 3 && details.every(d=> d.attachSearch===true && d.chatStillOpen===false);
  console.log(JSON.stringify({ ok: pass, sessionId, keyword, message, details, summary: sum }, null, 2));
  process.exit(pass?0:1);
}

main().catch(e=>{ console.error(e); process.exit(1); });

