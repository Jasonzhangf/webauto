#!/usr/bin/env node
import { readFileSync, existsSync, unlinkSync } from 'node:fs';

function killPid(pid){
  try{ process.kill(pid, 'SIGTERM'); }catch{}
  setTimeout(()=>{ try{ process.kill(pid, 'SIGKILL'); }catch{} }, 1000);
}

async function main(){
  const pidFile = '/tmp/workflow-api.pid';
  if (!existsSync(pidFile)) { console.log('No pid file.'); return; }
  const pid = Number(readFileSync(pidFile,'utf8').trim());
  if (pid>0) killPid(pid);
  try{ unlinkSync(pidFile); }catch{}
  console.log('API stopped.');
}

main().catch(e=>{ console.error(e); process.exit(1); });

