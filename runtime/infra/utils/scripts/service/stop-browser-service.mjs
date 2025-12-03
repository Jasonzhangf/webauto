#!/usr/bin/env node
// 停止浏览器远程服务（后台守护进程）
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { loadBrowserServiceConfig } from '../../../../libs/browser/browser-service-config.js';

const runDir = join(os.homedir(), '.webauto', 'run');
const pidFile = join(runDir, 'browser-service.pid');

function isProcessAlive(pid) {
  try { return process.kill(pid, 0), true; } catch { return false; }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function killByPort(port){
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set();
      out.split(/\r?\n/).forEach(line=>{
        const m = line.trim().match(/\s(\d+)\s*$/); if (m) pids.add(Number(m[1]));
      });
      for (const pid of pids){ try { execSync(`taskkill /F /PID ${pid}`); } catch {} }
      return pids.size>0;
    }
    // macOS/Linux
    const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8' });
    const pids = out.split(/\s+/).map(s=>Number(s.trim())).filter(Boolean);
    for (const pid of pids){ try { process.kill(pid, 'SIGKILL'); } catch {} }
    return pids.length>0;
  } catch { return false; }
}

async function main() {
  const cfg = loadBrowserServiceConfig();
  const port = Number(cfg.port || 7704);

  if (!existsSync(pidFile)) {
    // 没有 PID 文件，尝试按端口关闭
    const killed = killByPort(port);
    console.log(killed ? `Killed processes on :${port}.` : 'No PID file found. Service may not be running.');
    return;
  }

  const pid = Number(readFileSync(pidFile, 'utf8'));
  if (!pid) {
    console.log('Invalid PID file.');
    rmSync(pidFile, { force: true });
    // 回退按端口关闭
    killByPort(port);
    return;
  }

  if (!isProcessAlive(pid)) {
    console.log(`Process ${pid} is not running.`);
    rmSync(pidFile, { force: true });
    // 回退按端口关闭
    killByPort(port);
    return;
  }

  try { process.kill(pid, 'SIGTERM'); } catch {}
  for (let i = 0; i < 10; i++) { if (!isProcessAlive(pid)) break; await sleep(200); }
  if (isProcessAlive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch {} }

  rmSync(pidFile, { force: true });
  console.log(`Browser service stopped (pid=${pid}).`);

  // 兜底：再按端口强制清理一次（避免孤儿进程）
  killByPort(port);
}

main();
