#!/usr/bin/env node
/**
 * 启动脚本外壳 - 仅负责 CLI 解析并调用 launcher
 * 业务逻辑全部在 launcher/headful-launcher.mjs 中
 */

import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const launcherPath = path.resolve(__dirname, '../launcher/headful-launcher.mjs');

function main() {
  const args = process.argv.slice(2);
  
  // 参数解析并透传给 launcher
  const launchArgs = [];
  if (args.includes('--profile')) {
    const idx = args.indexOf('--profile');
    if (args[idx+1]) launchArgs.push('--profile=' + args[idx+1]);
  }
  if (args.includes('--url')) {
    const idx = args.indexOf('--url');
    if (args[idx+1]) launchArgs.push('--url=' + args[idx+1]);
  }
  if (args.includes('--headless')) {
    launchArgs.push('--headless');
  }
  
  // 调用真正的启动器
  const child = spawn('node', [launcherPath, ...launchArgs], {
    stdio: 'inherit',
    shell: true
  });
  
  child.on('exit', (code) => {
    process.exit(code);
  });
}

main();
