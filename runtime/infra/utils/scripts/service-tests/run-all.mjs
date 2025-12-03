#!/usr/bin/env node
import { spawn } from 'node:child_process';

const ORCH = `http://127.0.0.1:${process.env.PORT_ORCH || 7700}`;
const WF = `http://127.0.0.1:${process.env.PORT_WORKFLOW || 7701}`;
const VP = `http://127.0.0.1:${process.env.PORT_VISION || 7702}`;

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function waitHealth(url, timeoutMs=30000){
  const t0=Date.now();
  while(Date.now()-t0<timeoutMs){
    try{
      const ctl=new AbortController();
      const to=setTimeout(()=>ctl.abort(),1500);
      const r=await fetch(url,{signal:ctl.signal});
      clearTimeout(to);
      if(r.ok) return true;
    }catch{}
    await sleep(1000);
  }
  return false;
}

async function main(){
  console.log('Starting orchestrator for tests...');
  const child = spawn(process.execPath, ['dist/sharedmodule/engines/orchestrator/server.js'], { stdio: ['ignore','pipe','pipe'] });
  child.stdout.on('data', d=>process.stdout.write(`[orch] ${d}`));
  child.stderr.on('data', d=>process.stderr.write(`[orch] ${d}`));

  const ok = await waitHealth(`${ORCH}/health`, 40000);
  if(!ok){
    console.error('Orchestrator health check failed');
    child.kill('SIGKILL');
    process.exit(1);
  }
  console.log('Orchestrator is up.');

  // Workflow API tests
  console.log('\n[TEST] Workflow API');
  let r = await fetch(`${WF}/health`);
  console.log('GET /health', r.status);
  let j = await r.json();
  console.log('health:', j);

  r = await fetch(`${WF}/sessions/start`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ browserOptions: { headless: true } }) });
  j = await r.json();
  if(!j.success){ console.error('sessions/start failed', j); process.exit(1); }
  const sessionId = j.sessionId;
  console.log('sessionId:', sessionId);

  // navigate to blank (safe)
  await fetch(`${WF}/browser/navigate`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sessionId, url: 'about:blank' }) });

  // check login anchor (should be false)
  r = await fetch(`${WF}/browser/check-login-anchor`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sessionId }) });
  j = await r.json();
  console.log('check-login-anchor:', j);

  // click should be blocked by anchor gate
  r = await fetch(`${WF}/browser/click`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sessionId, selector: 'body' }) });
  console.log('click status:', r.status);

  // screenshot should succeed
  r = await fetch(`${WF}/browser/screenshot`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sessionId }) });
  j = await r.json();
  console.log('screenshot ok:', j.success, 'image-len:', j.image?.length);

  // close session
  await fetch(`${WF}/sessions/close`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sessionId }) });

  // Vision proxy health
  console.log('\n[TEST] Vision Proxy');
  r = await fetch(`${VP}/health`);
  console.log('vision health status:', r.status);
  j = await r.json().catch(()=>({}));
  console.log('vision health:', j);
  if(!j?.python?.reachable){
    console.warn('Python service not reachable (dependencies likely missing). Skipping /recognize test.');
  }

  child.kill('SIGTERM');
}

main().catch(e=>{ console.error(e); process.exit(1); });
