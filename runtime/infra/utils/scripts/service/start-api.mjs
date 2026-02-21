#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const API_PID_FILE = process.env.WEBAUTO_API_PID_FILE
  ? path.resolve(process.env.WEBAUTO_API_PID_FILE)
  : path.join(os.tmpdir(), 'webauto-api.pid');
const DIST_SERVER = path.resolve(process.cwd(), 'dist', 'apps', 'webauto', 'server.js');

function resolveOnPath(candidates) {
  const pathEnv = process.env.PATH || process.env.Path || '';
  const dirs = String(pathEnv).split(path.delimiter).map((x) => x.trim()).filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidates) {
      const full = path.join(dir, name);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

function resolveNodeBin() {
  const explicit = String(process.env.WEBAUTO_NODE_BIN || '').trim();
  if (explicit) return explicit;
  const npmNode = String(process.env.npm_node_execpath || '').trim();
  if (npmNode) return npmNode;
  const fromPath = resolveOnPath(process.platform === 'win32' ? ['node.exe', 'node.cmd', 'node'] : ['node']);
  if (fromPath) return fromPath;
  return process.execPath;
}

function resolveNpmBin() {
  if (process.platform !== 'win32') return 'npm';
  const fromPath = resolveOnPath(['npm.cmd', 'npm.exe', 'npm.bat', 'npm.ps1']);
  return fromPath || 'npm.cmd';
}

function quoteCmdArg(value) {
  if (!value) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return `"${String(value).replace(/"/g, '""')}"`;
}

function run(command, args) {
  const lower = String(command || '').toLowerCase();
  if (process.platform === 'win32' && (lower.endsWith('.cmd') || lower.endsWith('.bat'))) {
    const cmdLine = [quoteCmdArg(command), ...args.map(quoteCmdArg)].join(' ');
    return spawnSync('cmd.exe', ['/d', '/s', '/c', cmdLine], { stdio: 'inherit', windowsHide: true });
  }
  if (process.platform === 'win32' && lower.endsWith('.ps1')) {
    return spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', command, ...args],
      { stdio: 'inherit', windowsHide: true },
    );
  }
  return spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
}

async function health(url='http://127.0.0.1:7701/health'){
  try{
    const res = await fetch(url);
    if (!res.ok) return false;
    const j = await res.json().catch(() => ({}));
    return Boolean(j?.ok ?? true);
  }catch{
    return false;
  }
}

async function main(){
  if (!existsSync(DIST_SERVER)) {
    const npmBin = resolveNpmBin();
    const buildRet = run(npmBin, ['run', '-s', 'build:services']);
    if (buildRet.status !== 0) {
      console.error('build:services failed');
      process.exit(1);
    }
  }
  // start
  const child = spawn(resolveNodeBin(), [DIST_SERVER], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      WEBAUTO_RUNTIME_MODE: 'unified',
    },
  });
  child.unref();
  try {
    mkdirSync(path.dirname(API_PID_FILE), { recursive: true });
  } catch {}
  writeFileSync(API_PID_FILE, String(child.pid));
  // wait for health
  for(let i=0;i<20;i++){ if (await health()) { console.log('API started. PID', child.pid); return; } await wait(500); }
  console.error('API did not become healthy in time'); process.exit(1);
}

main().catch(e=>{ console.error(e); process.exit(1); });
