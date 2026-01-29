#!/usr/bin/env node
/**
 * Daemon wrapper for XHS workflow v3 runner.
 *
 * Goal: start a long-running workflow in background with stable pid/log files,
 * without relying on fragile shell backgrounding.
 *
 * Usage:
 *   node scripts/run-xiaohongshu-workflow-v3-daemon.mjs start --keyword "独立站" --count 200 --env debug
 *   node scripts/run-xiaohongshu-workflow-v3-daemon.mjs status
 *   node scripts/run-xiaohongshu-workflow-v3-daemon.mjs stop
 */

import minimist from 'minimist';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUN_DIR = path.join(os.homedir(), '.webauto', 'run');
const LOG_DIR = path.join(os.homedir(), '.webauto', 'logs');

const PID_FILE = path.join(RUN_DIR, 'xhs-full-v3.pid');
const META_FILE = path.join(RUN_DIR, 'xhs-full-v3.meta.json');

function ensureDirs() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function readPid() {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf-8').trim();
    const pid = Number(raw);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

function start(args) {
  ensureDirs();

  const existingPid = readPid();
  if (existingPid && isRunning(existingPid)) {
    const meta = readMeta();
    console.log(`[daemon] already running pid=${existingPid}`);
    if (meta?.logFile) console.log(`[daemon] log=${meta.logFile}`);
    process.exit(0);
  }

  const keyword = typeof args.keyword === 'string' && args.keyword.trim() ? String(args.keyword).trim() : '手机膜';
  const count = Number(args.count || 10);
  const env = typeof args.env === 'string' && args.env.trim() ? String(args.env).trim() : 'debug';
  const workflow = typeof args.workflow === 'string' && args.workflow.trim() ? String(args.workflow).trim() : 'xiaohongshu-collect-full-v3';

  const logFile = path.join(LOG_DIR, `xhs-full-v3-${keyword}-${count}-${nowStamp()}.log`);
  const outFd = fs.openSync(logFile, 'a');

  const runnerPath = path.resolve(__dirname, 'run-xiaohongshu-workflow-v3.mjs');
  const childArgs = [
    runnerPath,
    '--workflow',
    workflow,
    '--keyword',
    keyword,
    '--count',
    String(count),
    '--env',
    env,
  ];

  const child = spawn('node', childArgs, {
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: {
      ...process.env,
      DEBUG: process.env.DEBUG || '1',
    },
    cwd: path.resolve(__dirname, '..'),
    windowsHide: true,
  });

  child.unref();
  fs.closeSync(outFd);

  fs.writeFileSync(PID_FILE, String(child.pid), 'utf-8');
  writeMeta({
    pid: child.pid,
    workflow,
    keyword,
    count,
    env,
    logFile,
    startedAt: new Date().toISOString(),
    runnerPath,
  });

  console.log(`[daemon] started pid=${child.pid}`);
  console.log(`[daemon] log=${logFile}`);
  console.log(`[daemon] pidfile=${PID_FILE}`);
}

function status() {
  const pid = readPid();
  const meta = readMeta();
  if (!pid) {
    console.log('[daemon] not running (no pid file)');
    process.exit(1);
  }
  const alive = isRunning(pid);
  console.log(`[daemon] pid=${pid} running=${alive ? 'yes' : 'no'}`);
  if (meta?.logFile) console.log(`[daemon] log=${meta.logFile}`);
  if (!alive) process.exit(1);
}

async function stop() {
  const pid = readPid();
  const meta = readMeta();
  if (!pid) {
    console.log('[daemon] not running (no pid file)');
    return;
  }

  if (!isRunning(pid)) {
    console.log(`[daemon] pid=${pid} already exited`);
    try { fs.unlinkSync(PID_FILE); } catch {}
    return;
  }

  console.log(`[daemon] stopping pid=${pid}`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (e) {
    console.log(`[daemon] stop failed: ${e?.message || String(e)}`);
    return;
  }

  const startAt = Date.now();
  while (Date.now() - startAt < 10_000) {
    if (!isRunning(pid)) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (isRunning(pid)) {
    console.log('[daemon] still running after 10s (not force-killing)');
    if (meta?.logFile) console.log(`[daemon] log=${meta.logFile}`);
    process.exit(1);
  }

  console.log('[daemon] stopped');
  try { fs.unlinkSync(PID_FILE); } catch {}
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const cmd = String(argv._[0] || '').trim();

  if (!cmd || ['start', 'status', 'stop'].includes(cmd) === false) {
    console.log('Usage:');
    console.log('  node scripts/run-xiaohongshu-workflow-v3-daemon.mjs start --keyword \"独立站\" --count 200 --env debug');
    console.log('  node scripts/run-xiaohongshu-workflow-v3-daemon.mjs status');
    console.log('  node scripts/run-xiaohongshu-workflow-v3-daemon.mjs stop');
    process.exit(2);
  }

  if (cmd === 'start') return start(argv);
  if (cmd === 'status') return status();
  if (cmd === 'stop') return stop();
}

main().catch((e) => {
  console.error('[daemon] fatal:', e?.message || String(e));
  process.exit(1);
});

