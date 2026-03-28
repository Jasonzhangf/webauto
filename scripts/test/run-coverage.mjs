#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

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
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(npmCli)) {
    return { cmd: process.execPath, prefix: [npmCli], wrap: false };
  }
  const resolved = resolveOnPath(['npm.cmd', 'npm.exe', 'npm.bat', 'npm.ps1']) || 'npm.cmd';
  const lower = String(resolved).toLowerCase();
  if (lower.endsWith('.ps1')) {
    return {
      cmd: 'powershell.exe',
      prefix: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolved],
      wrap: false,
    };
  }
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    return {
      cmd: 'cmd.exe',
      prefix: ['/d', '/s', '/c'],
      wrap: true,
      bin: resolved,
    };
  }
  return { cmd: resolved, prefix: [], wrap: false };
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
  const runNpm = async (label, args) => {
    if (npm.wrap) {
      const quotedArgs = args.map((arg) => (
        /\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
      ));
      const command = `"${npm.bin}" ${quotedArgs.join(' ')}`.trim();
      return run(label, npm.cmd, [...npm.prefix, command], ROOT);
    }
    return run(label, npm.cmd, [...npm.prefix, ...args], ROOT);
  };

  const rootPkgPath = path.join(ROOT, 'package.json');
  const rootPkg = existsSync(rootPkgPath)
    ? JSON.parse(readFileSync(rootPkgPath, 'utf8'))
    : { scripts: {} };
  const rootScripts = rootPkg?.scripts || {};

  if (rootScripts['test:desktop-console:coverage']) {
    console.log('[coverage] running root desktop main coverage');
    await runNpm('test:desktop-console:coverage', ['run', 'test:desktop-console:coverage']);
  } else {
    console.log('[coverage] skip desktop console coverage (script missing)');
  }

  // Renderer suites are already enforced by `test:ci`.
  // Keep this stage focused on deterministic coverage gates that are stable in CI.
  if (existsSync(path.join(ROOT, 'apps', 'desktop-console', 'package.json'))) {
    console.log('[coverage] running desktop renderer smoke tests');
    await runNpm('desktop renderer tests', ['--prefix', 'apps/desktop-console', 'run', 'test:renderer']);
  } else {
    console.log('[coverage] skip desktop renderer tests (package missing)');
  }

  console.log('[coverage] running webauto schedule coverage');
  await runNpm('test:webauto:schedule:coverage', ['run', 'test:webauto:schedule:coverage']);

  console.log('[coverage] done');
}

main().catch((err) => {
  console.error('[coverage] failed:', err?.message || String(err));
  process.exit(1);
});
