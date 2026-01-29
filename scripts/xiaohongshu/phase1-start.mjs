#!/usr/bin/env node
/**
 * Phase 1: 启动并复用 xiaohongshu_fresh profile（App Block 入口）
 *
 * 用法：
 *   node scripts/xiaohongshu/phase1-start.mjs
 */

import { PROFILE } from './lib/env.mjs';
import { ensureBaseServices } from './lib/services.mjs';
import { createSessionLock } from './lib/session-lock.mjs';
import { execute as ensureServices } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase1EnsureServicesBlock.js';
import { execute as startProfile } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase1StartProfileBlock.js';
import { execute as monitorCookie } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase1MonitorCookieBlock.js';
import minimist from 'minimist';

async function main() {
  const args = minimist(process.argv.slice(2));
  const headless = args.headless === true || args.headless === 'true' || args.headless === 1 || args.headless === '1';

  console.log('🚀 Phase 1: App Block 启动');
  console.log(`Profile: ${PROFILE}`);

  // 1) 基础服务
  await ensureBaseServices({ repoRoot: process.cwd() });
  await ensureServices();

  // 2) profile 会话
  const lock = createSessionLock({ profileId: PROFILE, lockType: 'phase1', force: true });
  const lockHandle = lock.acquire();
  try {
    await startProfile({ profile: PROFILE, headless, url: 'https://www.xiaohongshu.com' });
    console.log('✅ Phase1: profile 启动完成');

    // 3) Cookie 监控与保存（登录成功后才保存）
    console.log('🍪 Phase1: 开始监控 cookie（每 15 秒扫描）');
    const cookieRes = await monitorCookie({
      profile: PROFILE,
      scanIntervalMs: 15000,
      stableCount: 3,
    });
    console.log('✅ Phase1: cookie 初次稳定保存完成');
    console.log(`   saved=${cookieRes.saved} autoCookiesStarted=${cookieRes.autoCookiesStarted} path=${cookieRes.cookiePath}`);

    console.log('✅ Phase1 完成：autoCookies 已开启，可继续执行 Phase2');
    console.log('🧷 Phase1 keepalive：使用 "xhs stop" 或 Ctrl+C 退出');
    await new Promise((resolve) => {
      const stop = () => resolve();
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    });
  } finally {
    if (lockHandle?.release) lockHandle.release();
  }
}

main().catch((err) => {
  console.error('❌ Phase 1 失败:', err?.message || String(err));
  process.exit(1);
});
