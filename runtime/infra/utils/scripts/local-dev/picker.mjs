#!/usr/bin/env node
import { argv, exit } from 'node:process';

function parseArgs(){ const a={}; for(const s of argv.slice(2)){ const m=s.match(/^--([^=]+)=(.*)$/); if(m){ a[m[1]]=m[2]; continue; } if(s.startsWith('--')) a[s.slice(2)]=true; else a._=(a._||[]).concat([s]); } return a; }
async function post(u,b){ const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})}); if(!r.ok) throw new Error(`${u} -> ${r.status}`); return await r.json(); }

async function main(){
  const args=parseArgs();
  const sid=args.sid||args.sessionId;
  const cmd=(args._&&args._[0])||'install';
  if(!sid){ console.error('Usage: npm run dev:picker -- --sid=<sessionId> [install|enable|disable|state]'); exit(1); }
  if(cmd==='install'){ await post('http://127.0.0.1:7703/v1/debug/picker/install',{sessionId:sid}); console.log('picker installed'); return; }
  if(cmd==='enable'){ await post('http://127.0.0.1:7703/v1/debug/picker/toggle',{sessionId:sid, enabled:true}); console.log('picker enabled'); return; }
  if(cmd==='disable'){ await post('http://127.0.0.1:7703/v1/debug/picker/toggle',{sessionId:sid, enabled:false}); console.log('picker disabled'); return; }
  if(cmd==='state'){ const r=await fetch(`http://127.0.0.1:7703/v1/debug/picker/state?sessionId=${encodeURIComponent(sid)}`); const j=await r.json(); console.log(JSON.stringify(j,null,2)); return; }
  console.log('Unknown cmd'); exit(2);
}

main().catch(e=>{ console.error('picker cmd failed:', e?.message||String(e)); exit(2); });

