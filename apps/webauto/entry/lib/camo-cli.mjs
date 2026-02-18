import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function resolveOnPath(candidates) {
  const pathEnv = process.env.PATH || process.env.Path || '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidates) {
      const full = path.join(dir, name);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

function resolveInDir(dir, candidates) {
  for (const name of candidates) {
    const full = path.join(dir, name);
    if (existsSync(full)) return full;
  }
  return null;
}

export function wrapWindowsRunner(cmdPath, prefix = []) {
  if (process.platform !== 'win32') return { cmd: cmdPath, prefix };
  const lower = String(cmdPath || '').toLowerCase();
  if (lower.endsWith('.ps1')) {
    return {
      cmd: 'powershell.exe',
      prefix: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', cmdPath, ...prefix],
    };
  }
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    const useCmd = /\s/u.test(cmdPath) ? path.basename(cmdPath) : cmdPath;
    return {
      cmd: 'cmd.exe',
      prefix: ['/d', '/s', '/c', useCmd, ...prefix],
    };
  }
  return { cmd: cmdPath, prefix };
}

export function getCamoRunner(rootDir = process.cwd()) {
  const isWin = process.platform === 'win32';
  const localBin = path.join(rootDir, 'node_modules', '.bin');
  const camoNames = isWin ? ['camo.cmd', 'camo.exe', 'camo.bat', 'camo.ps1'] : ['camo'];
  const npxNames = isWin ? ['npx.cmd', 'npx.exe', 'npx.bat', 'npx.ps1'] : ['npx'];

  const local = resolveInDir(localBin, camoNames);
  if (local) return wrapWindowsRunner(local);

  const global = resolveOnPath(camoNames);
  if (global) return wrapWindowsRunner(global);

  const npx = resolveOnPath(npxNames) || (isWin ? 'npx.cmd' : 'npx');
  return wrapWindowsRunner(npx, ['--yes', '--package=@web-auto/camo', 'camo']);
}

function parseLastJson(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }
  return null;
}

export function runCamo(args, options = {}) {
  const rootDir = String(options.rootDir || process.cwd());
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 60000;
  const runner = getCamoRunner(rootDir);
  const ret = spawnSync(runner.cmd, [...runner.prefix, ...args], {
    cwd: rootDir,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
  });
  const stdout = String(ret.stdout || '').trim();
  const stderr = String(ret.stderr || '').trim();
  return {
    ok: ret.status === 0,
    code: ret.status,
    stdout,
    stderr,
    json: parseLastJson(stdout),
  };
}
