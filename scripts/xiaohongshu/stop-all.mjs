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

function resolveProfilesRoot() {
  const envProfiles = String(process.env.WEBAUTO_PATHS_PROFILES || '').trim();
  if (envProfiles) return envProfiles;
  const portableRoot = String(process.env.WEBAUTO_PORTABLE_ROOT || process.env.WEBAUTO_ROOT || '').trim();
  if (portableRoot) return path.join(portableRoot, '.webauto', 'profiles');
  return path.join(os.homedir(), '.webauto', 'profiles');
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

function normalizeMatchTarget(value) {
  return String(value || '').toLowerCase().replace(/\\/g, '/');
}

async function collectProcessListPosix() {
  return await new Promise((resolve) => {
    const ps = spawn('ps', ['aux'], { windowsHide: true });
    let output = '';
    ps.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    ps.on('error', () => resolve([]));
    ps.on('close', () => {
      const lines = output.split('\n').filter(Boolean);
      const entries = lines
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          const pid = Number(parts[1]);
          return Number.isFinite(pid) ? { pid, cmd: line } : null;
        })
        .filter(Boolean);
      resolve(entries);
    });
  });
}

async function collectProcessListWindows() {
  return await new Promise((resolve) => {
    const args = [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress',
    ];
    const child = spawn('powershell', args, { windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', () => resolve([]));
    child.on('close', () => {
      const raw = output.trim();
      if (!raw) return resolve([]);
      try {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const entries = list
          .map((item) => {
            const pid = Number(item?.ProcessId);
            const cmd = String(item?.CommandLine || '');
            return Number.isFinite(pid) ? { pid, cmd } : null;
          })
          .filter(Boolean);
        resolve(entries);
      } catch {
        resolve([]);
      }
    });
  });
}

async function collectProcessList() {
  if (process.platform === 'win32') return await collectProcessListWindows();
  return await collectProcessListPosix();
}

async function killPhaseProcesses() {
  const list = await collectProcessList();
  const targets = list
    .filter((entry) => /phase2-collect\.mjs|phase3-interact\.mjs|phase4-harvest\.mjs/.test(entry.cmd || ''))
    .map((entry) => entry.pid)
    .filter((pid) => Number.isFinite(pid));
  for (const pid of targets) {
    try {
      process.kill(pid, 'SIGTERM');
      log(`killed phase process pid=${pid}`);
    } catch {
      // ignore
    }
  }
}

async function killCamoufox(profileId) {
  const profilePath = path.join(resolveProfilesRoot(), profileId);
  const profileMatch = normalizeMatchTarget(profilePath);
  const list = await collectProcessList();
  const targets = list
    .filter((entry) => {
      const cmd = normalizeMatchTarget(entry.cmd || '');
      return cmd.includes('camoufox') && cmd.includes(profileMatch);
    })
    .map((entry) => entry.pid)
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
  await killPhaseProcesses();
  await killCamoufox(PROFILE);
  log('done');
}

main().catch((err) => {
  console.error('[stop] failed:', err?.message || String(err));
  process.exit(1);
});
