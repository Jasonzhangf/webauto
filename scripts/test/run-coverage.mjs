#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = process.cwd();

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

function npmRunner() {
  if (process.platform !== 'win32') return { cmd: 'npm', prefix: [] };
  const resolved = resolveOnPath(['npm.cmd', 'npm.exe', 'npm.bat', 'npm.ps1']) || 'npm.cmd';
  const lower = String(resolved).toLowerCase();
  if (lower.endsWith('.ps1')) {
    return {
      cmd: 'powershell.exe',
      prefix: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolved],
    };
  }
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    return {
      cmd: 'cmd.exe',
      prefix: ['/d', '/s', '/c', resolved],
    };
  }
  return { cmd: resolved, prefix: [] };
}

async function run(label, cmd, args, cwd = ROOT) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${label} failed with exit ${code}`));
    });
  });
}

async function main() {
  const npm = npmRunner();
  const runNpm = async (label, args) => run(label, npm.cmd, [...npm.prefix, ...args], ROOT);

  console.log('[coverage] running root desktop main coverage');
  await runNpm('test:desktop-console:coverage', ['run', 'test:desktop-console:coverage']);

  console.log('[coverage] running desktop renderer coverage');
  await runNpm('desktop renderer coverage', ['--prefix', 'apps/desktop-console', 'run', 'test:renderer:coverage']);

  console.log('[coverage] running webauto schedule coverage');
  await runNpm('test:webauto:schedule:coverage', ['run', 'test:webauto:schedule:coverage']);

  console.log('[coverage] done');
}

main().catch((err) => {
  console.error('[coverage] failed:', err?.message || String(err));
  process.exit(1);
});
