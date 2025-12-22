#!/usr/bin/env node
/**
 * Browser CLI
 * 独立 CLI：start/stop/status/health
 */

import { BrowserService } from './src/service.mjs';
import { getStateBus } from '../core/src/state-bus.mjs';

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function getService() {
  return new BrowserService({ host: '127.0.0.1', port: 7704, wsHost: '127.0.0.1', wsPort: 8765 });
}

const commands = {
  start: async (args) => {
    const profile = args.find(a => a.startsWith('--profile'))?.split('=')[1] || 'default';
    const url = args.find(a => a.startsWith('--url'))?.split('=')[1];
    const headless = args.includes('--headless');

    log(`[Browser] 启动 profile=${profile} headless=${headless}`, 'blue');
    const service = await getService();

    // 注册到状态总线
    const bus = getStateBus();
    bus.register('browser', { version: '0.1.0', profile, url });

    try {
      await service.start();
      const session = await service.createSession({ profile, url, headless });
      bus.setState('browser', { status: 'running', sessionId: session.sessionId });
      log(`✅ 浏览器启动成功 (session=${session.sessionId})`, 'green');
      if (profile === 'weibo_fresh' && url?.includes('weibo.com')) {
        await service.loadCookies(profile, '/Users/fanzhang/.webauto/cookies/weibo_fresh_cookies.json');
        log('✅ Cookie 注入完成', 'green');
      }
    } catch (err) {
      bus.setState('browser', { status: 'error', error: err.message });
      log(`❌ 启动失败: ${err.message}`, 'red');
      process.exit(1);
    }
  },
  stop: async (args) => {
    const profile = args.find(a => a.startsWith('--profile'))?.split('=')[1] || 'default';
    log(`[Browser] 停止 profile=${profile}`, 'blue');
    const service = await getService();
    const bus = getStateBus();
    try {
      await service.stop();
      bus.setState('browser', { status: 'stopped' });
      log('✅ 已停止', 'green');
    } catch (err) {
      log(`⚠️  停止时出错: ${err.message}`, 'yellow');
    }
  },
  status: async () => {
    const bus = getStateBus();
    const state = bus.getState('browser');
    console.log('Browser 状态:', state);
  },
  health: async () => {
    const service = await getService();
    const result = await service.health();
    console.log(JSON.stringify(result, null, 2));
  },
  help: () => {
    console.log(`
用法: node cli.mjs <command> [选项]

命令:
  start --profile <id> [--url <url>] [--headless]   启动浏览器会话
  stop --profile <id>                               停止会话
  status                                            查看状态
  health                                            健康检查
  help                                              显示本帮助

示例:
  node cli.mjs start --profile weibo_fresh --url https://weibo.com
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
