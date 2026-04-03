#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

function resolveWebautoRoot() {
  const explicitHome = String(process.env.WEBAUTO_HOME || '').trim();
  if (explicitHome) return path.resolve(explicitHome);

  const legacyRoot = String(process.env.WEBAUTO_ROOT || process.env.WEBAUTO_PORTABLE_ROOT || '').trim();
  if (legacyRoot) {
    const normalized = path.resolve(legacyRoot);
    const base = path.basename(normalized).toLowerCase();
    if (base === '.webauto' || base === 'webauto') return normalized;
    return path.join(normalized, '.webauto');
  }

  if (process.platform === 'win32') {
    try {
      if (fs.existsSync('D:\\')) return 'D:\\webauto';
    } catch {
      // ignore probing errors
    }
  }
  return path.join(os.homedir(), '.webauto');
}

const RUN_DIR = path.join(resolveWebautoRoot(), 'run');
const PID_FILE = path.join(RUN_DIR, 'search-gate.pid');
const DEFAULT_HOST = process.env.WEBAUTO_SEARCH_GATE_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.WEBAUTO_SEARCH_GATE_PORT || 7790);

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

function latestMtimeMs(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return Number(stat.mtimeMs || 0);
  if (!stat.isDirectory()) return 0;
  let latest = Number(stat.mtimeMs || 0);
  const stack = [targetPath];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      let entryStat;
      try {
        entryStat = fs.statSync(full);
      } catch {
        continue;
      }
      const mtime = Number(entryStat.mtimeMs || 0);
      if (mtime > latest) latest = mtime;
      if (entryStat.isDirectory()) stack.push(full);
    }
  }
  return latest;
}

function shouldRebuild(distEntry) {
  if (!fs.existsSync(distEntry)) return true;
  if (String(process.env.WEBAUTO_SKIP_BUILD_CHECK || '') === '1') return false;
  if (!fs.existsSync(path.resolve('tsconfig.services.json'))) return false;
  const distMtime = Number(fs.statSync(distEntry).mtimeMs || 0);
  const watchRoots = [
    path.resolve('modules/camo-backend/src'),
    path.resolve('modules/logging/src'),
    path.resolve('modules/camo-runtime/src'),
    path.resolve('scripts'),
  ];
  const latestSourceMtime = Math.max(...watchRoots.map((root) => latestMtimeMs(root)));
  return latestSourceMtime > distMtime;
}

function ensureBuild() {
  const distEntry = path.resolve('dist/apps/webauto/server.js');
  if (!shouldRebuild(distEntry)) return distEntry;
  console.log('[search-gate] core build missing/stale, running npm run -s build:services');
  execSync('npm run -s build:services', { stdio: 'inherit' });
  if (!fs.existsSync(distEntry)) {
    throw new Error(`service entry missing after build: ${distEntry}`);
  }
  return distEntry;
}

async function main() {
  const host = String(process.env.WEBAUTO_SEARCH_GATE_HOST || DEFAULT_HOST);
  const port = Number(process.env.WEBAUTO_SEARCH_GATE_PORT || DEFAULT_PORT);
  fs.mkdirSync(RUN_DIR, { recursive: true });

  if (await health(host, port)) {
    console.log(`SearchGate already healthy on http://${host}:${port}`);
    return;
  }

  if (fs.existsSync(PID_FILE)) {
    try {
      const oldPid = Number(fs.readFileSync(PID_FILE, 'utf8'));
      if (oldPid && isAlive(oldPid)) {
        console.log(`SearchGate already running (pid=${oldPid}).`);
        return;
      }
    } catch {
      // stale pid file will be overwritten
    }
  }

  ensureBuild();
  const entry = path.resolve('scripts/search-gate-server.mjs');
  if (!fs.existsSync(entry)) {
    throw new Error(`search gate entry missing: ${entry}`);
  }

  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBAUTO_SEARCH_GATE_HOST: host,
      WEBAUTO_SEARCH_GATE_PORT: String(port),
    },
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));

  for (let i = 0; i < 30; i += 1) {
    if (await health(host, port)) {
      console.log(`SearchGate started (pid=${child.pid}) on http://${host}:${port}`);
      return;
    }
    await wait(300);
  }

  // Health check failed — kill orphaned child to prevent leak
  try { child.kill('SIGTERM'); } catch {}
  throw new Error('search gate did not become healthy in time');
}

main().catch((err) => {
  console.error(`[search-gate] start failed: ${err?.message || String(err)}`);
  process.exit(1);
});
