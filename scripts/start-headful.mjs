#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 启动脚本 - 支持命令行参数
 * 用法：node scripts/start-headful.mjs [--profile <name>] [--url <url>]
 *       node scripts/start-headful.mjs                  # 使用默认配置（xiaohongshu_fresh, www.xiaohongshu.com）
 *       node scripts/start-headful.mjs --profile xiaohongshu_fresh https://www.xiaohongshu.com
 *       node scripts/start-headful.mjs --url https://www.xiaohongshu.com
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const launcherPath = path.resolve(__dirname, '../launcher/core/launcher.mjs');

/**
 * 解析命令行参数
 * 支持：--profile <name> 和 --url <url>
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    profile: null,
    url: null
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--profile' || arg === '-p') {
      if (i + 1 < args.length) {
        result.profile = args[i + 1];
        i++; // 跳过参数值
      }
    } else if (arg === '--url' || arg === '-u') {
      if (i + 1 < args.length) {
        result.url = args[i + 1];
        i++; // 跳过参数值
      }
    } else if (arg === '--headless' || arg === '-h') {
      // headless 参数传递给 launcher
      // 不在 parseArgs 中处理，直接传递所有剩余参数
      break;
    }
  }
  
  result.headless = args.includes('--headless') || args.includes('-h');
  return result;
}

function main() {
  const { profile, url, headless } = parseArgs();
  
  const defaultProfile = 'xiaohongshu_fresh';
  const defaultUrl = 'https://www.xiaohongshu.com';
  
  const profileName = profile || defaultProfile;
  const targetUrl = url || defaultUrl;
  
  // 将所有剩余参数传递给 launcher（包括 --headless）
  const extraArgs = process.argv.slice(2).filter(arg => arg !== '--profile' && arg !== '-p' && arg !== '--url' && arg !== '-u' && arg !== '-h');
  
  const args = [launcherPath, profileName, targetUrl, ...(headless ? ['--headless'] : [])];
  
  // Enable debug logging
  process.env.DEBUG = '1';

  console.log('🚀 WebAuto 一键启动');
  console.log(`  Profile: ${profileName}`);
  console.log(`  URL: ${targetUrl}`);
  console.log(`  参数: ${extraArgs.join(' ')}`);
  console.log();
  
  const child = spawn('node', args, {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });

  child.on('exit', (code) => {
    process.exit(code);
  });
}

main();
