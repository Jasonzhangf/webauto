#!/usr/bin/env node
import { argv, exit } from 'node:process';

function parse(){ const a={}; for(const s of argv.slice(2)){ const m=s.match(/^--([^=]+)=(.*)$/); if(m){ a[m[1]]=m[2]; continue; } if(s.startsWith('--')) a[s.slice(2)]=true; } return a; }
async function post(u,b){ const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})}); if(!r.ok) throw new Error(`${u} -> ${r.status}`); return r.json(); }

async function main(){
  const o=parse(); const sid=o.sid||o.sessionId; const host=o.host||'1688.com';
  if(!sid){ console.error('Usage: npm run dev:tabs -- --sid=<SID> [--host=1688.com]'); exit(1); }
  const pat = host.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&');
  await post('http://127.0.0.1:7701/v1/browser/tab/attach',{ sessionId:sid, urlPattern: pat, bringToFront:true, waitUntil:'domcontentloaded', timeout:8000 }).catch(()=>{});
  await post('http://127.0.0.1:7701/v1/browser/tab/close',{ sessionId:sid, hostIncludes:'automationcontrolled', closeAll:true }).catch(()=>{});
  await post('http://127.0.0.1:7701/v1/browser/tab/close',{ sessionId:sid, urlPattern:'^about:blank$', closeAll:true }).catch(()=>{});
  await post('http://127.0.0.1:7701/v1/browser/tab/close-unmatched',{ sessionId:sid, keepUrlPattern: pat, alsoCloseBlank:true }).catch(()=>{});
  console.log('Tabs cleaned, attached to host:', host);
}

main().catch(e=>{ console.error('close-tabs failed:', e?.message||String(e)); exit(2); });

