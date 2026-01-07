#!/usr/bin/env node
/**
 * Search Gate CLI
 * 用于启动、停止、重启、查询 search-gate 服务
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const GATE_SCRIPT = path.join(repoRoot, 'modules/search-gate/src/index.mjs');
const PID_FILE = path.join(repoRoot, '.search-gate.pid');
const LOG_FILE = path.join(repoRoot, 'logs/search-gate.log');

const command = process.argv[2] || 'status';

function log(message) {
  console.log(`[search-gate-cli] ${message}`);
}

async function getPid() {
  try {
    const pid = await fs.readFile(PID_FILE, 'utf-8');
    return parseInt(pid.trim(), 10);
  } catch {
    return null;
  }
}

async function savePid(pid) {
  await fs.writeFile(PID_FILE, String(pid), 'utf-8');
}

async function removePid() {
  try {
    await fs.unlink(PID_FILE);
  } catch {}
}

async function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function start() {
  const pid = await getPid();
  if (pid && await isRunning(pid)) {
    log(`服务已在运行中（PID: ${pid}）`);
    return;
  }

  log('启动 search-gate...');
  const child = spawn('node', [GATE_SCRIPT], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: repoRoot,
  });

  // 日志写入文件（可选）
  const logStream = await fs.open(LOG_FILE, 'a');
  child.stdout.pipe(logStream.createWriteStream());
  child.stderr.pipe(logStream.createWriteStream());

  child.unref();
  await savePid(child.pid);
  log(`服务已启动（PID: ${child.pid}）`);
  log(`日志文件: ${LOG_FILE}`);
}

async function stop() {
  const pid = await getPid();
  if (!pid || !await isRunning(pid)) {
    log('服务未运行');
    await removePid();
    return;
  }

  log(`停止服务（PID: ${pid}）...`);
  process.kill(pid, 'SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (await isRunning(pid)) {
    log('强制终止...');
    process.kill(pid, 'SIGKILL');
  }

  await removePid();
  log('服务已停止');
}

async function restart() {
  log('重启服务...');
  await stop();
  await new Promise(resolve => setTimeout(resolve, 1000));
  await start();
}

async function status() {
  const pid = await getPid();
  if (!pid || !await isRunning(pid)) {
    log('❌ 服务未运行');
    await removePid();
    return;
  }

  log(`✅ 服务运行中（PID: ${pid}）`);

  // 查询健康状态
  try {
    const res = await fetch('http://127.0.0.1:7710/health');
    const data = await res.json();
    log(`健康状态: ${data.status} | 队列大小: ${data.queueSize}`);
  } catch (error) {
    log(`⚠️ 无法连接到服务（可能正在启动）`);
  }

  // 查询统计
  try {
    const res = await fetch('http://127.0.0.1:7710/stats');
    const data = await res.json();
    log(`统计: pending=${data.pending}, granted=${data.granted}`);
  } catch {}
}

async function main() {
  switch (command) {
    case 'start':
      await start();
      break;
    case 'stop':
      await stop();
      break;
    case 'restart':
      await restart();
      break;
    case 'status':
      await status();
      break;
    default:
      console.log('用法: search-gate-cli.mjs [start|stop|restart|status]');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('[search-gate-cli] 错误:', err.message);
  process.exit(1);
});
