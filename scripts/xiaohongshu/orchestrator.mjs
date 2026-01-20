#!/usr/bin/env node
/**
 * 小红书采集流程调度器（串联既有脚本）
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
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

async function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..'),
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  const args = parseArgs();
  if (!args.keyword) {
    console.error('❌ 缺少参数: --keyword');
    process.exit(1);
  }

  console.log('🚀 小红书采集流程启动');
  console.log(`   关键字: ${args.keyword}`);
  console.log(`   目标: ${args.count} 条`);
  console.log(`   环境: ${args.env}`);
  console.log('');

  try {
    // Phase1：登录 + SearchGate
    console.log('1️⃣ Phase1: 登录 & SearchGate...');
    await runScript(path.join(__dirname, 'tests/phase1-session-login-with-gate.mjs'));
    console.log('✅ Phase1 完成\n');

    // Phase2-4：列表 + 详情 + 评论（多 Tab 并行）
    console.log('2️⃣ Phase2-4: 列表/详情/评论采集（多 Tab 并行）...');
    await runScript(
      path.join(__dirname, 'tests/phase2-4-loop-multitab.mjs'),
      ['--keyword', args.keyword, '--target', String(args.count), '--env', args.env],
    );
    console.log('✅ Phase2-4 完成\n');

    console.log('✅ 全流程采集完成');
    console.log(`   输出目录: ~/.webauto/download/xiaohongshu/${args.keyword}/`);
  } catch (err) {
    console.error('❌ 流程执行失败:', err.message);
    process.exit(1);
  }
}

// 后台执行（复用 daemon-wrapper）
const args = parseArgs();
if (args.daemon && process.env.WEBAUTO_DAEMON !== '1') {
  const wrapperPath = path.join(__dirname, 'shared/daemon-wrapper.mjs');
  const currentScript = fileURLToPath(import.meta.url);
  const scriptArgs = process.argv.slice(2).filter((arg) => arg !== '--daemon');
  spawn('node', [wrapperPath, currentScript, ...scriptArgs], { stdio: 'inherit' });
} else {
  main();
}
