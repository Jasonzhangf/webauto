#!/usr/bin/env node
/**
 * 启动脚本外壳 - 仅负责 CLI 解析并调用 launcher
 * 业务逻辑全部在 launcher/core/launcher.mjs 中
 */

import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const launcherPath = path.resolve(__dirname, '../launcher/core/launcher.mjs');

function main() {
  const { values } = parseArgs({
    options: {
      profile: { type: 'string', short: 'p' },
      url:     { type: 'string', short: 'u' },
      headless:{ type: 'boolean', short: 'h' }
    }
  });

  const profile = values.profile || 'weibo_fresh';
  const url     = values.url     || 'https://weibo.com';
  const headless= !!values.headless;

  const child = spawn('node', [launcherPath, profile, url], {
    stdio: 'inherit',
    env: {
      ...process.env,
      WEBAUTO_HEADLESS: headless ? '1' : '0'
    }
  });

  child.on('exit', (code) => {
    process.exit(code);
  });
}

main();
