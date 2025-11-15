#!/usr/bin/env node
// 启动浏览器远程服务（后台守护进程）
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { loadBrowserServiceConfig } from '../../../libs/browser/browser-service-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../..');

const args = process.argv.slice(2);
const cfg = loadBrowserServiceConfig();
const portArgIndex = args.findIndex(a => a === '--port');
const hostArgIndex = args.findIndex(a => a === '--host');
const port = portArgIndex !== -1 ? Number(args[portArgIndex + 1]) : Number(cfg.port || 7704);
const host = hostArgIndex !== -1 ? String(args[hostArgIndex + 1]) : String(cfg.host || '0.0.0.0');

const runDir = join(os.homedir(), '.webauto', 'run');
const pidFile = join(runDir, 'browser-service.pid');

function isProcessAlive(pid) {
  try { return process.kill(pid, 0), true; } catch { return false; }
}

function main() {
  mkdirSync(runDir, { recursive: true });

  if (existsSync(pidFile)) {
    try {
      const oldPid = Number(readFileSync(pidFile, 'utf8'));
      if (oldPid && isProcessAlive(oldPid)) {
        console.log(`Browser service already running (pid=${oldPid}).`);
        process.exit(0);
      }
    } catch {}
  }

  // 先强制清理占用端口的进程，避免 EADDRINUSE
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set();
      out.split(/\r?\n/).forEach(line=>{ const m=line.trim().match(/\s(\d+)\s*$/); if (m) pids.add(Number(m[1])); });
      for (const pid of pids){ try{ execSync(`taskkill /F /PID ${pid}`); }catch{} }
    } else {
      const out = execSync(`lsof -ti :${port} || true`, { encoding: 'utf8' });
      const pids = out.split(/\s+/).map(s=>Number(s.trim())).filter(Boolean);
      for (const pid of pids){ try{ process.kill(pid, 'SIGKILL'); }catch{} }
    }
  } catch {}

  const remoteService = join(projectRoot, 'libs', 'browser', 'remote-service.js');

  const child = spawn(process.execPath, [remoteService, '--host', host, '--port', String(port)], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env }
  });

  child.unref();

  writeFileSync(pidFile, String(child.pid));
  console.log(`Browser service started in background (pid=${child.pid}) on http://${host}:${port}.`);
  console.log(`PID file: ${pidFile}`);
}

main();
