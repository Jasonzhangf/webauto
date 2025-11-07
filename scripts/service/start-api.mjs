#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';

async function health(url='http://127.0.0.1:7701/v1/health'){
  try{ const res = await fetch(url); if(!res.ok) return false; const j = await res.json(); return j && j.running; }catch{ return false; }
}

async function main(){
  const { execSync } = await import('node:child_process');
  // build
  execSync('npm run -s build:services', { stdio: 'inherit' });
  // start
  const child = spawn('node', ['dist/sharedmodule/engines/api-gateway/server.js'], {
    detached: true, stdio: 'ignore'
  });
  child.unref();
  writeFileSync('/tmp/workflow-api.pid', String(child.pid));
  // wait for health
  for(let i=0;i<20;i++){ if (await health()) { console.log('API started. PID', child.pid); return; } await wait(500); }
  console.error('API did not become healthy in time'); process.exit(1);
}

main().catch(e=>{ console.error(e); process.exit(1); });

