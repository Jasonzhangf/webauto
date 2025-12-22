#!/usr/bin/env node
/**
 * Core CLI
 * 全局状态查看、配置管理、日志清理、健康检查、广播服务
 */

import { initCore, unifiedHealthCheck, getStateBroadcaster } from './src/index.mjs';

const commands = {
  status: async () => {
    const { bus, config } = await initCore();
    const modules = bus.listModules();
    const state = bus.getState();
    const cfg = config.getAll();
    console.log('=== WebAuto Core 状态 ===');
    console.log('模块列表:', modules);
    console.log('模块状态:', state);
    console.log('端口配置:', cfg.ports);
    console.log('路径配置:', cfg.paths);
  },
  config: async (args) => {
    const { config } = await initCore();
    const sub = args[0];
    if (sub === 'get') {
      const path = args[1];
      console.log(path ? config.get(path) : config.getAll());
    } else if (sub === 'set') {
      const path = args[1];
      const value = args[2];
      if (!path || value === undefined) {
        console.error('用法: config set <path> <value>');
        process.exit(1);
      }
      await config.set(path, value);
      console.log(`已设置: ${path} = ${value}`);
    } else if (sub === 'reset') {
      await config.reset();
      console.log('配置已重置为默认');
    } else {
      console.log('子命令: get | set | reset');
    }
  },
  logs: async (args) => {
    const { err } = await initCore();
    const sub = args[0];
    if (sub === 'recent') {
      const recent = err.recent(20);
      console.log('最近错误:', recent);
    } else if (sub === 'stats') {
      const stats = err.stats(24);
      console.log('错误统计:', stats);
    } else if (sub === 'clean') {
      await err.cleanup();
      console.log('日志已清理');
    } else {
      console.log('子命令: recent | stats | clean');
    }
  },
  health: async () => {
    const result = await unifiedHealthCheck();
    console.log('=== 统一健康检查 ===');
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exit(1);
    }
  },
  broadcaster: async (args) => {
    const { bus } = await initCore();
    const port = Number(args[0]) || 8790;
    const broadcaster = await getStateBroadcaster();
    broadcaster.startBroadcasterServer(port);
    console.log(`广播服务已启动: ws://127.0.0.1:${port}`);
    // 保持运行
    process.stdin.resume();
  },
  help: () => {
    console.log(`
用法: node cli.mjs <command> [args]

命令:
  status           查看全局状态
  config get       获取配置（可指定路径）
  config set       设置配置项
  config reset     重置为默认
  logs recent      查看最近错误
  logs stats       错误统计（24h）
  logs clean       清理旧日志
  health           统一健康检查
  broadcaster [port] 启动状态广播 WebSocket 服务
  help             显示本帮助
`);
  }
};

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const fn = commands[cmd];
  if (!fn) {
    console.error(`未知命令: ${cmd}`);
    commands.help();
    process.exit(1);
  }
  try {
    await fn(args);
  } catch (err) {
    console.error('执行失败:', err.message);
    process.exit(1);
  }
}

main();
