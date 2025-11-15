#!/usr/bin/env node
// 杀掉占用指定端口的进程（跨平台尽力）
import { execSync } from 'node:child_process';

const port = Number(process.argv[2] || 0);
if (!port) { console.error('Usage: node utils/scripts/service/kill-port.mjs <port>'); process.exit(1); }

try {
  if (process.platform === 'win32') {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    out.split(/\r?\n/).forEach(line=>{ const m=line.trim().match(/\s(\d+)\s*$/); if (m) pids.add(Number(m[1])); });
    for (const pid of pids) { try { execSync(`taskkill /F /PID ${pid}`); console.log(`killed pid ${pid}`); } catch {} }
    if (pids.size===0) console.log('no process found');
  } else {
    const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8' });
    const pids = out.split(/\s+/).map(s=>Number(s.trim())).filter(Boolean);
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); console.log(`killed pid ${pid}`); } catch {} }
    if (pids.length===0) console.log('no process found');
  }
} catch (e) {
  console.log('nothing to kill or command failed');
}

