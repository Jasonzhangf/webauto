#!/usr/bin/env node
import { argv } from 'node:process';

function args(){ const a={}; for(const s of argv.slice(2)){ const m=s.match(/^--([^=]+)=(.*)$/); if(m){ a[m[1]]=m[2]; continue; } if(s.startsWith('--')) a[s.slice(2)]=true; } return a; }
async function post(u,b){ const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})}); if(!r.ok) throw new Error(`${u} -> ${r.status}`); return r.json(); }

async function main(){
  const o=args(); const sid=o.sid||o.sessionId; const step=Number(o.step||1);
  if(!sid){ console.error('Usage: npm run dev:overlay-step -- --sid=<SID> --step=<1..7>'); process.exit(1); }
  await post('http://127.0.0.1:7701/v1/dev/eval-code',{ sessionId:sid, code:`(function(){ window.__waOverlayStepperStep=${JSON.stringify(step)}; return true; })()` });
  const r = await post('http://127.0.0.1:7701/v1/dev/eval-file',{ sessionId:sid, filePath:'local-dev/overlay-stepper.js' });
  console.log('overlay step result:', JSON.stringify(r,null,2));
}

main().catch(e=>{ console.error('overlay-step failed:', e?.message||String(e)); process.exit(2); });

