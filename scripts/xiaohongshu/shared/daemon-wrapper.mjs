#!/usr/bin/env node
/**
 * 后台执行包装器
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function daemonize(scriptPath, args, logFile, pidFile) {
  const absScriptPath = path.resolve(scriptPath);
  const absLogFile = path.resolve(logFile);
  const absPidFile = path.resolve(pidFile);
  
  const logDir = path.dirname(absLogFile);
  fs.mkdirSync(logDir, { recursive: true });
  
  const out = fs.openSync(absLogFile, 'a');
  const err = fs.openSync(absLogFile, 'a');
  
  const child = spawn('node', [absScriptPath, ...args], {
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, WEBAUTO_DAEMON: '1' },
    windowsHide: true,
  });
  
  child.unref();
  fs.writeFileSync(absPidFile, String(child.pid), 'utf8');
  
  console.log('✅ 后台进程已启动:');
  console.log('   PID:', child.pid);
  console.log('   日志:', absLogFile);
  console.log('\n查看日志：tail -f', absLogFile);
  console.log('停止进程：kill', child.pid);
  
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('用法: daemon-wrapper.mjs <script> [...args]');
    process.exit(1);
  }
  
  const [scriptPath, ...scriptArgs] = args;
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logFile = process.env.DAEMON_LOG || path.join(process.env.HOME, '.webauto', 'logs', `daemon.${ts}.log`);
  const pidFile = process.env.DAEMON_PID || path.join(process.env.HOME, '.webauto', 'logs', `daemon.${ts}.pid`);
  
  daemonize(scriptPath, scriptArgs, logFile, pidFile);
}

main();
