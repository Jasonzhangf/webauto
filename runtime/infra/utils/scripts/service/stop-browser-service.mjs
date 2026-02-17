#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const RUN_DIR = path.join(os.homedir(), '.webauto', 'run');
const PID_FILE = path.join(RUN_DIR, 'browser-service.pid');
const DEFAULT_PORT = Number(process.env.WEBAUTO_BROWSER_PORT || 7704);

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killByPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set();
      out.split(/\r?\n/).forEach((line) => {
        const match = line.trim().match(/\s(\d+)\s*$/);
        if (match) pids.add(Number(match[1]));
      });
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        } catch {
          // ignore
        }
      }
      return pids.size > 0;
    }

    const out = execSync(`lsof -ti :${port} || true`, { encoding: 'utf8' });
    const pids = out.split(/\s+/).map((item) => Number(item.trim())).filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // ignore
      }
    }
    return pids.length > 0;
  } catch {
    return false;
  }
}

async function main() {
  if (!fs.existsSync(PID_FILE)) {
    const killed = killByPort(DEFAULT_PORT);
    console.log(killed ? `Killed processes on :${DEFAULT_PORT}` : 'No PID file found. Service may not be running.');
    return;
  }

  const pid = Number(fs.readFileSync(PID_FILE, 'utf8'));
  if (!pid) {
    fs.rmSync(PID_FILE, { force: true });
    killByPort(DEFAULT_PORT);
    console.log('Invalid PID file. Performed port cleanup.');
    return;
  }

  if (!isAlive(pid)) {
    fs.rmSync(PID_FILE, { force: true });
    killByPort(DEFAULT_PORT);
    console.log(`Process ${pid} is not running. Cleaned stale PID.`);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // ignore
  }

  for (let i = 0; i < 15; i += 1) {
    if (!isAlive(pid)) break;
    await wait(200);
  }

  if (isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }

  fs.rmSync(PID_FILE, { force: true });
  killByPort(DEFAULT_PORT);
  console.log(`Browser service stopped (pid=${pid}).`);
}

main().catch((err) => {
  console.error(`[browser-service] stop failed: ${err?.message || String(err)}`);
  process.exit(1);
});
