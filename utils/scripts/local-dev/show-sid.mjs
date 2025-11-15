#!/usr/bin/env node
// Ensure the persistent SID mini panel is installed for a session
import { argv, exit } from 'node:process';

function parseArgs(){ const args={}; for(const a of argv.slice(2)){ const m=a.match(/^--([^=]+)=(.*)$/); if(m){ args[m[1]]=m[2]; continue; } if(a.startsWith('--')) args[a.slice(2)]=true; } return args; }
async function post(url, body){ const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})}); if(!r.ok) throw new Error(`${url} -> ${r.status}`); return await r.json(); }

async function main(){
  const args=parseArgs();
  const sid=args.sid||args.sessionId;
  if(!sid){ console.error('Usage: node utils/scripts/local-dev/show-sid.mjs --sid=<sessionId>'); exit(1); }
  await post('http://127.0.0.1:7701/v1/browser/session/overlay/install', { sessionId: sid });
  console.log('SID mini panel installed');
}

main().catch(e=>{ console.error('install failed:', e?.message||String(e)); exit(2); });

