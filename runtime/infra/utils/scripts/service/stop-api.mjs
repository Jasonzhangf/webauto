#!/usr/bin/env node
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const PID_FILE = process.env.WEBAUTO_API_PID_FILE
  ? path.resolve(process.env.WEBAUTO_API_PID_FILE)
  : path.join(os.tmpdir(), 'webauto-api.pid');

function killPid(pid){
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {}
    return;
  }
  try { process.kill(pid, 'SIGTERM'); } catch {}
  setTimeout(() => { try { process.kill(pid, 'SIGKILL'); } catch {} }, 1000);
}

async function main(){
  if (!existsSync(PID_FILE)) { console.log('No pid file.'); return; }
  const pid = Number(readFileSync(PID_FILE,'utf8').trim());
  if (pid>0) killPid(pid);
  try { unlinkSync(PID_FILE); } catch {}
  console.log('API stopped.');
}

main().catch(e=>{ console.error(e); process.exit(1); });
