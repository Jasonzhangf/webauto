#!/usr/bin/env node

import { program } from 'commander';
process.env.WEBAUTO_BACKEND = process.env.WEBAUTO_BACKEND || 'ws';
import path from 'path';
import { CommandRouter } from '../dist';

// 设置程序基本信息
program
  .name('webauto')
  .description('WebAuto Browser CLI - 浏览器自动化命令行工具')
  .version('1.0.0')
  .option('--websocket-url <url>', 'WebSocket服务器地址', 'ws://localhost:8765')
  .option('--session <id>', '默认会话ID')
  .option('--format <type>', '输出格式', 'table')
  .option('--verbose, -v', '详细输出')
  .option('--config <path>', '配置文件路径');

// 初始化命令路由器
const router = new CommandRouter({
  websocketUrl: program.opts().websocketUrl,
  sessionId: program.opts().session,
  outputFormat: program.opts().format,
  verbose: program.opts().verbose,
  configPath: program.opts().config
});

// 注册所有命令
router.registerCommands(program);

// 错误处理
program.exitOverride();

process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error.message);
  if (program.opts().verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason);
  if (program.opts().verbose) {
    console.error(promise);
  }
  process.exit(1);
});

// 解析命令行参数
program.parse();
