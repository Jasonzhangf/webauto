#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const RUN_DIR = path.join(os.homedir(), '.webauto', 'run');
const PID_FILE = path.join(RUN_DIR, 'browser-service.pid');
const DEFAULT_HOST = process.env.WEBAUTO_BROWSER_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.WEBAUTO_BROWSER_PORT || 7704);

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function health(host = DEFAULT_HOST, port = DEFAULT_PORT) {
  try {
    const res = await fetch(`http://${host}:${port}/health`);
    if (!res.ok) return false;
    const body = await res.json().catch(() => ({}));
    return Boolean(body?.ok ?? true);
  } catch {
    return false;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const hostIdx = args.findIndex((item) => item === '--host');
  const portIdx = args.findIndex((item) => item === '--port');
  const host = hostIdx >= 0 && args[hostIdx + 1] ? String(args[hostIdx + 1]) : DEFAULT_HOST;
  const port = portIdx >= 0 && args[portIdx + 1] ? Number(args[portIdx + 1]) : DEFAULT_PORT;
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
  };
}

function ensureBuild() {
  const distEntry = path.resolve('dist/modules/camo-backend/src/index.js');
  if (fs.existsSync(distEntry)) return distEntry;
  console.log('[browser-service] backend entry missing, running npm run -s build:services');
  execSync('npm run -s build:services', { stdio: 'inherit' });
  if (!fs.existsSync(distEntry)) {
    throw new Error(`backend entry missing after build: ${distEntry}`);
  }
  return distEntry;
}

async function main() {
  const { host, port } = parseArgs();
  fs.mkdirSync(RUN_DIR, { recursive: true });

  if (await health(host, port)) {
    console.log(`Browser service already healthy on http://${host}:${port}`);
    return;
  }

  if (fs.existsSync(PID_FILE)) {
    try {
      const oldPid = Number(fs.readFileSync(PID_FILE, 'utf8'));
      if (oldPid && isAlive(oldPid)) {
        console.log(`Browser service already running (pid=${oldPid}).`);
        return;
      }
    } catch {
      // stale pid file will be overwritten
    }
  }

  const entry = ensureBuild();
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      BROWSER_SERVICE_HOST: host,
      BROWSER_SERVICE_PORT: String(port),
      WEBAUTO_BROWSER_HOST: host,
      WEBAUTO_BROWSER_PORT: String(port),
    },
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));

  for (let i = 0; i < 30; i += 1) {
    if (await health(host, port)) {
      console.log(`Browser service started (pid=${child.pid}) on http://${host}:${port}`);
      return;
    }
    await wait(300);
  }

  throw new Error('browser service did not become healthy in time');
}

main().catch((err) => {
  console.error(`[browser-service] start failed: ${err?.message || String(err)}`);
  process.exit(1);
});
