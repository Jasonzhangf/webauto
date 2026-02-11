#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

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
      windowsHide: true,
    });
    child.on('error', () => resolve());
    child.on('exit', () => resolve());
  });
}

async function tryShutdownBrowserService() {
  try {
    await fetch('CORE_DAEMON_URL/command', {
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
    await fetch('CORE_DAEMON_URL/shutdown', { method: 'POST' });
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

      const browserPid = Number(data?.browserPid);
      if (Number.isFinite(browserPid)) {
        try {
          process.kill(browserPid, 'SIGTERM');
          log(`killed browserPid=${browserPid} from lock ${file}`);
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

function killPhaseProcesses() {
  const ps = spawn('ps', ['aux']);
  let output = '';
  ps.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  ps.on('close', () => {
    const lines = output.split('\n');
    const targets = lines
      .filter((line) => /phase2-collect\.mjs|phase3-interact\.mjs|phase4-harvest\.mjs/.test(line))
      .map((line) => Number(line.trim().split(/\s+/)[1]))
      .filter((pid) => Number.isFinite(pid));
    for (const pid of targets) {
      try {
        process.kill(pid, 'SIGTERM');
        log(`killed phase process pid=${pid}`);
      } catch {
        // ignore
      }
    }
  });
}

async function killCamoufox(profileId) {
  const profilePath = path.join(os.homedir(), '.webauto', 'profiles', profileId);
  const ps = spawn('ps', ['aux']);
  let output = '';
  ps.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  await new Promise((resolve) => ps.on('close', resolve));

  const lines = output.split('\n');
  const targets = lines
    .filter((line) => line.includes('camoufox') && line.includes(profilePath))
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return Number(parts[1]);
    })
    .filter((pid) => Number.isFinite(pid));

  if (!targets.length) return;

  for (const pid of targets) {
    try {
      process.kill(pid, 'SIGTERM');
      log(`killed camoufox pid=${pid}`);
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
  killPhaseProcesses();
  await killCamoufox(PROFILE);
  log('done');
}

main().catch((err) => {
  console.error('[stop] failed:', err?.message || String(err));
  process.exit(1);
});
