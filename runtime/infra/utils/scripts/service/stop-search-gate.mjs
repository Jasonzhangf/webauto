#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function removePid() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {}
}

async function main() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('SearchGate not running (pid file missing).');
    return;
  }
  let pid = 0;
  try {
    pid = Number(fs.readFileSync(PID_FILE, 'utf8'));
  } catch {
    removePid();
    console.log('SearchGate pid file unreadable; removed.');
    return;
  }

  if (!pid || !isAlive(pid)) {
    removePid();
    console.log('SearchGate not running.');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    console.error(`[search-gate] stop failed: ${err?.message || String(err)}`);
    removePid();
    return;
  }

  // best-effort cleanup
  removePid();
  console.log(`SearchGate stopped (pid=${pid}).`);
}

main().catch((err) => {
  console.error(`[search-gate] stop failed: ${err?.message || String(err)}`);
  process.exit(1);
});
