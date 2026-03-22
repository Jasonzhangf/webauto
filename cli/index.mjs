#!/usr/bin/env node

/**
 * wa - WebAuto CLI
 */

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getCommandModule(name) {
  const modules = {
    init: () => import('./commands/init.mjs'),
    run: () => import('./commands/run.mjs'),
    status: () => import('./commands/status.mjs'),
    login: () => import('./commands/login.mjs'),
    stop: () => import('./commands/stop.mjs'),
  };
  const loader = modules[name];
  if (!loader) return null;
  const mod = await loader();
  // Each command module exports a function named <name>Command
  const key = `${name}Command`;
  return typeof mod[key] === 'function' ? mod[key] : null;
}

// Parse command and sub-args
function parseInput() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return { command: 'help', subArgs: [], opts: {} };
  }
  
  const command = args[0].replace(/^--?/, '');
  const subArgs = args.slice(1);
  
  const opts = {};
  const cleanSubArgs = [];
  for (let i = 0; i < subArgs.length; i++) {
    if (subArgs[i] === '--json') {
      opts.json = true;
    } else if (subArgs[i] === '--no-color') {
      process.env.NO_COLOR = '1';
    } else {
      cleanSubArgs.push(subArgs[i]);
    }
  }
  
  return { command, subArgs: cleanSubArgs, opts };
}

async function main() {
  const { command, subArgs, opts } = parseInput();
  
  if (command === 'help' || command === 'h') {
    printHelp();
    return;
  }
  
  const cmdFn = await getCommandModule(command);
  if (!cmdFn) {
    console.error(`未知命令: ${command}`);
    console.error('运行 wa help 查看可用命令');
    process.exit(1);
  }
  
  try {
    await cmdFn(subArgs, opts);
  } catch (err) {
    if (process.env.DEBUG) {
      console.error(err);
    } else {
      console.error(`错误: ${err.message}`);
    }
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
${'WebAuto CLI'.padEnd(50)} 轻量级小红书自动化工具

用法: wa <命令> [选项]

命令:
  init              初始化环境（检查依赖、安装 camo、创建账户）
  run               一键执行自动化任务
  status            查看任务状态
  login             登录管理
  stop              停止任务
  help              显示此帮助

全局选项:
  --json             JSON 输出
  --no-color         禁用颜色
  --debug            显示调试信息

运行 "wa <命令> -h" 查看命令详细帮助。

示例:
  wa init                                    # 检查并安装依赖
  wa run -k "梅姨" -l "吓死了" -n 50          # 搜索+点赞
  wa run -k "美食" -n 100 --headless         # 无头模式
  wa run -k "旅行" -n 30 --detach           # 后台运行
  wa status                                  # 查看状态
  wa stop --all                              # 停止所有

文档: docs/cli-design.md
  `);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
