#!/usr/bin/env node
/**
 * Stop all background processes for xiaohongshu profile.
 *
 * - Stops core services via core-daemon (if available)
 * - Shuts down Browser Service and SearchGate if reachable
 * - Kills any phase locks for the profile
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROFILE } from './lib/env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

function log(msg) {
  console.log(`[stop] ${msg}`);
}

async function runNodeScript(scriptPath, args = [], cwd = repoRoot) {
  await new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      stdio: 'inherit',
    });
    child.on('error', () => resolve());
    child.on('exit', () => resolve());
  });
}

async function tryShutdownBrowserService() {
  try {
    await fetch('http://127.0.0.1:7704/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'service:shutdown' }),
    });
    log('browser-service shutdown requested');
  } catch {
    // ignore
  }
}

async function tryShutdownSearchGate() {
  try {
    await fetch('http://127.0.0.1:7790/shutdown', { method: 'POST' });
    log('search-gate shutdown requested');
  } catch {
    // ignore
  }
}

function killLocks(profileId) {
  const lockDir = path.join(os.homedir(), '.webauto', 'locks');
  if (!fs.existsSync(lockDir)) return;

  const prefix = `${profileId}.`;
  const files = fs.readdirSync(lockDir).filter((f) => f.startsWith(prefix) && f.endsWith('.lock'));

  for (const file of files) {
    const lockPath = path.join(lockDir, file);
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const data = JSON.parse(raw);
      const pid = Number(data?.pid);
      if (Number.isFinite(pid)) {
        try {
          process.kill(pid, 'SIGTERM');
          log(`killed ${file} (pid=${pid})`);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // ignore
    }
  }
}

async function main() {
  await tryShutdownBrowserService();
  await tryShutdownSearchGate();

  const daemonPath = path.join(repoRoot, 'scripts', 'core-daemon.mjs');
  if (fs.existsSync(daemonPath)) {
    await runNodeScript(daemonPath, ['stop'], repoRoot);
  }

  killLocks(PROFILE);
  log('done');
}

main().catch((err) => {
  console.error('[stop] failed:', err?.message || String(err));
  process.exit(1);
});
