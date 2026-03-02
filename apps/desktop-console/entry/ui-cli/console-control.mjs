import path from 'node:path';
import {
  APP_ROOT,
  ROOT,
  DEFAULT_START_READY_TIMEOUT_MS,
  DEFAULT_START_ACTION_READY_TIMEOUT_MS,
  parseIntSafe,
  readControlFile,
  removeControlFileIfPresent,
} from './constants.mjs';
import { spawn } from 'node:child_process';
import { sleep, terminatePid, runCommandCapture, commandLineMatchesDesktopMain } from './process.mjs';
import { requestJson } from './http.mjs';
import { detectWindowsSessionMismatch } from './windows.mjs';

export async function waitForHealth(endpoint, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    try {
      const ret = await requestJson(endpoint, '/health', { timeoutMs: 2500, retries: 0 });
      if (ret.ok && ret.json?.ok) return ret.json;
    } catch {
      // keep polling
    }
    await sleep(300);
  }
  return null;
}

export async function waitForActionChannel(endpoint, timeoutMs = DEFAULT_START_ACTION_READY_TIMEOUT_MS) {
  const budget = Math.max(2_000, Number(timeoutMs) || DEFAULT_START_ACTION_READY_TIMEOUT_MS);
  const started = Date.now();
  while (Date.now() - started <= budget) {
    const ready = await probeActionChannel(endpoint, Math.min(6_000, Math.max(2_000, budget)));
    if (ready) return true;
    await sleep(300);
  }
  return false;
}

export async function waitForHealthDown(endpoint, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    try {
      const ret = await requestJson(endpoint, '/health', { timeoutMs: 1500, retries: 0 });
      if (!ret.ok || !ret.json?.ok) return true;
    } catch {
      return true;
    }
    await sleep(300);
  }
  return false;
}

export async function probeActionChannel(endpoint, timeoutMs = 6000) {
  try {
    const ret = await requestJson(endpoint, '/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'probe', selector: 'body' }),
      timeoutMs,
      retries: 0,
    });
    return ret.ok && Boolean(ret.json?.ok);
  } catch {
    return false;
  }
}

export function resolveKnownPid(statusRet = null) {
  const fromHealth = parseIntSafe(statusRet?.json?.pid, 0);
  if (fromHealth > 0) return fromHealth;
  const fromFile = parseIntSafe(readControlFile()?.pid, 0);
  if (fromFile > 0) return fromFile;
  return 0;
}

export async function findDesktopMainPids() {
  if (process.platform === 'win32') {
    const psScript = [
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
      '$rows = Get-CimInstance Win32_Process -Filter "name=\'electron.exe\'" | Select-Object ProcessId,CommandLine',
      '$rows | ConvertTo-Json -Compress',
    ].join('; ');
    const ret = await runCommandCapture('powershell', ['-NoProfile', '-Command', psScript], 12_000);
    if (!ret.ok) return [];
    let parsed = null;
    try {
      parsed = JSON.parse(String(ret.stdout || '').trim() || 'null');
    } catch {
      parsed = null;
    }
    const rows = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object' ? [parsed] : []);
    return rows
      .map((row) => ({
        pid: parseIntSafe(row?.ProcessId, 0),
        commandLine: String(row?.CommandLine || '').trim(),
      }))
      .filter((row) => row.pid > 0 && commandLineMatchesDesktopMain(row.commandLine))
      .map((row) => row.pid);
  }

  const ret = await runCommandCapture('ps', ['-ax', '-o', 'pid=', '-o', 'command='], 8_000);
  if (!ret.ok) return [];
  const lines = String(ret.stdout || '').split(/\r?\n/g);
  const pids = [];
  for (const line of lines) {
    const match = String(line || '').trim().match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const pid = parseIntSafe(match[1], 0);
    const commandLine = match[2];
    if (pid <= 0) continue;
    if (!commandLineMatchesDesktopMain(commandLine)) continue;
    pids.push(pid);
  }
  return pids;
}

export async function cleanupStaleDesktopProcesses(options = {}) {
  const excluded = new Set((Array.isArray(options.excludePids) ? options.excludePids : [])
    .map((pid) => parseIntSafe(pid, 0))
    .filter((pid) => pid > 0));
  const discovered = await findDesktopMainPids();
  const targets = discovered.filter((pid) => pid > 0 && !excluded.has(pid));
  const killed = [];
  const failed = [];
  for (const pid of targets) {
    const ret = await terminatePid(pid);
    if (ret?.ok) killed.push(pid);
    else failed.push({ pid, error: ret?.error || 'unknown_error' });
  }
  if (killed.length > 0) {
    removeControlFileIfPresent();
  }
  return {
    targets,
    killed,
    failed,
  };
}

export async function startConsoleIfNeeded(args, endpoint) {
  const health = await waitForHealth(endpoint, 3000);
  if (health) {
    const pid = parseIntSafe(health?.pid, 0) || parseIntSafe(readControlFile()?.pid, 0);
    const sessionMismatch = await detectWindowsSessionMismatch(pid);
    if (sessionMismatch.mismatch) {
      if (!args.json) {
        console.log(`[ui-console] Existing UI session=${sessionMismatch.targetSessionId}, current=${sessionMismatch.currentSessionId}; restarting for visible desktop.`);
      }
      if (pid > 0) await terminatePid(pid);
      removeControlFileIfPresent();
      await sleep(700);
    } else {
      const channelReady = await probeActionChannel(endpoint);
      if (channelReady) return health;
      if (pid > 0) await terminatePid(pid);
      removeControlFileIfPresent();
      await sleep(500);
    }
  } else {
    const stalePid = parseIntSafe(readControlFile()?.pid, 0);
    if (stalePid > 0) {
      await terminatePid(stalePid);
      removeControlFileIfPresent();
      await sleep(500);
    }
    const stale = await cleanupStaleDesktopProcesses({
      excludePids: stalePid > 0 ? [stalePid] : [],
    });
    if (stale.killed.length > 0) {
      await sleep(800);
    }
  }

  const uiConsoleScript = path.join(APP_ROOT, 'entry', 'ui-console.mjs');
  const runUiConsole = async (extraArgs = []) => {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [uiConsoleScript, ...extraArgs], {
        cwd: ROOT,
        env: process.env,
        stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ui console command failed with code=${code}: ${extraArgs.join(' ') || 'start'}`));
      });
    });
  };

  if (args.build) await runUiConsole(['--build']);
  if (args.install || args.build) await runUiConsole(['--install']);
  await runUiConsole([]);

  const readyWaitMs = Math.max(20_000, parseIntSafe(args.timeout, DEFAULT_START_READY_TIMEOUT_MS));
  let ready = await waitForHealth(endpoint, readyWaitMs);
  if (!ready) {
    const stale = await cleanupStaleDesktopProcesses();
    if (stale.killed.length > 0) {
      await sleep(800);
      await runUiConsole([]);
      ready = await waitForHealth(endpoint, readyWaitMs);
    }
  }
  if (!ready) throw new Error('ui cli bridge is not ready after start');
  let readyPid = parseIntSafe(ready?.pid, 0);
  let readySessionMismatch = await detectWindowsSessionMismatch(readyPid);
  if (readySessionMismatch.mismatch) {
    if (readyPid > 0) await terminatePid(readyPid);
    removeControlFileIfPresent();
    await sleep(700);
    await runUiConsole([]);
    ready = await waitForHealth(endpoint, readyWaitMs);
    readyPid = parseIntSafe(ready?.pid, 0);
    readySessionMismatch = await detectWindowsSessionMismatch(readyPid);
  }
  if (readySessionMismatch.mismatch) {
    throw new Error(`ui_started_in_session0_current=${readySessionMismatch.currentSessionId}`);
  }
  const readyChannel = await waitForActionChannel(endpoint);
  if (!readyChannel) {
    const pid = parseIntSafe(ready?.pid, 0);
    if (pid > 0) await terminatePid(pid);
    removeControlFileIfPresent();
    throw new Error('ui cli bridge action channel is not ready after start');
  }
  return ready;
}
