#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书完整采集工作流（简化版）
 * Legacy: 该脚本依赖 tests/phase1-4-full-collect.mjs（当前已迁移到 tests/legacy）。
 * 建议使用唯一标准入口：scripts/xiaohongshu/collect-content.mjs
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = {
    keyword: '',
    count: 200,
    env: 'download',
    daemon: false,
  };
  
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--keyword' && i + 1 < argv.length) {
      args.keyword = argv[i + 1];
      i++;
    } else if (argv[i] === '--count' && i + 1 < argv.length) {
      args.count = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === '--env' && i + 1 < argv.length) {
      args.env = argv[i + 1];
      i++;
    } else if (argv[i] === '--daemon') {
      args.daemon = true;
    }
  }
  
  return args;
}

console.warn('[run-full-workflow] Legacy entry. Use: node scripts/xiaohongshu/collect-content.mjs ...');

function main() {
  const args = parseArgs();
  
  if (!args.keyword) {
    console.error('❌ 缺少参数: --keyword');
    console.error('\n用法:');
    console.error('  node scripts/xiaohongshu/run-full-workflow.mjs --keyword "雷军" --count 200');
    console.error('  node scripts/xiaohongshu/run-full-workflow.mjs --keyword "雷军" --count 200 --daemon');
    console.error('\n参数:');
    console.error('  --keyword  搜索关键字');
    console.error('  --count    目标采集数量（默认200）');
    console.error('  --env      环境标识（默认download）');
    console.error('  --daemon   后台执行模式');
    process.exit(1);
  }
  
  const scriptPath = path.join(__dirname, 'tests/legacy/phase1-4-full-collect.mjs');
  
  const scriptArgs = [
    '--keyword', args.keyword,
    '--count', String(args.count),
    '--env', args.env,
  ];
  
  if (args.daemon) {
    scriptArgs.push('--daemon');
  }
  
  console.log('🚀 启动小红书采集流程');
  console.log(`   关键字: ${args.keyword}`);
  console.log(`   目标: ${args.count} 条`);
  console.log(`   模式: ${args.daemon ? '后台执行' : '前台执行'}`);
  console.log('');
  
  if (args.daemon) {
    // 后台模式：使用内置的 daemon 支持
    const child = spawn('node', [scriptPath, ...scriptArgs], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..'),
      windowsHide: true,
    });
    
    child.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ 采集流程异常退出（code=${code}）`);
        process.exit(code);
      }
    });
  } else {
    // 前台模式：直接执行
    const child = spawn('node', [scriptPath, ...scriptArgs], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..'),
      windowsHide: true,
    });
    
    child.on('exit', (code) => {
      if (code === 0) {
        console.log('\n✅ 采集流程完成！');
        console.log(`   输出目录: ~/.webauto/download/xiaohongshu/${args.env}/${args.keyword}/`);
      } else {
        console.error(`\n❌ 采集流程失败（code=${code}）`);
        process.exit(code);
      }
    });
  }
}

main();
