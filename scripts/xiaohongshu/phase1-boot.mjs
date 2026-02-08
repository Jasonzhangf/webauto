#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { ensureCoreServices } from '../lib/ensure-core-services.mjs';

ensureUtf8Console();

/**
 * Phase 1: 启动并复用 xiaohongshu_fresh profile（App Block 入口）
 *
 * 用法：
 *   node scripts/xiaohongshu/phase1-boot.mjs
 *   node scripts/xiaohongshu/phase1-boot.mjs --once   # 完成后退出（不保持前台阻塞）
 */

// Phase1 must be driven by explicit CLI input; do not fallback to defaults.
import { ensureBaseServices } from './lib/services.mjs';
import { createSessionLock } from './lib/session-lock.mjs';
import { execute as ensureServices } from '../../dist/modules/xiaohongshu/app/src/xiaohongshu/app/src/blocks/Phase1EnsureServicesBlock.js';
import { execute as startProfile } from '../../dist/modules/xiaohongshu/app/src/xiaohongshu/app/src/blocks/Phase1StartProfileBlock.js';
import { execute as monitorCookie } from '../../dist/modules/xiaohongshu/app/src/xiaohongshu/app/src/blocks/Phase1MonitorCookieBlock.js';
import { ensureServicesHealthy, restoreBrowserState } from './lib/recovery.mjs';
import { recordStageCheck, recordStageRecovery } from './lib/stage-checks.mjs';
import minimist from 'minimist';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function maybeDaemonize(argv) {
  if (!argv.includes('--daemon') || process.env.WEBAUTO_DAEMON === '1') return false;
  const wrapperPath = path.join(__dirname, 'shared', 'daemon-wrapper.mjs');
  const scriptPath = fileURLToPath(import.meta.url);
  const args = argv.filter((a) => a !== '--daemon');
  const { spawn } = await import('node:child_process');
  spawn(process.execPath, [wrapperPath, scriptPath, ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  return true;
}

async function main() {
  const rawArgv = process.argv.slice(2);
  // Default to daemon mode unless --foreground is passed
  const foreground = rawArgv.includes('--foreground');
  const filteredArgv = rawArgv.filter(a => a !== '--foreground');
  
  if (!foreground && await maybeDaemonize([...filteredArgv, '--daemon'])) {
    console.log('✅ Phase1 started in daemon mode');
    return;
  }

  // Single source of truth for service lifecycle: core-daemon.
  // Phase1/2/3/4 scripts should not each implement their own service orchestration.
  await ensureServicesHealthy();
  await ensureCoreServices();

  const args = minimist(process.argv.slice(2));
  const headless = args.headless === true || args.headless === 'true' || args.headless === 1 || args.headless === '1';
  const once = args.once === true || args.once === 'true' || args.once === 1 || args.once === '1';
  const profile = String(args.profile || '').trim();
  if (!profile) {
    console.error('❌ 必须提供 --profile 参数（禁止回退默认 profile）');
    process.exit(2);
  }

  console.log('🚀 Phase 1: App Block 启动');
  console.log(`Profile: ${profile}`);

  // 1) 基础服务
  await ensureBaseServices({ repoRoot: process.cwd() });
  await ensureServices();

  // 2) profile 会话
  const lock = createSessionLock({ profileId: profile, lockType: 'phase1', force: true });
  const lockHandle = lock.acquire();
  try {
    await startProfile({ profile, headless, url: 'https://www.xiaohongshu.com' });
    await restoreBrowserState(profile);
    // viewport sanity check: if abnormal, restart profile once
    try {
      const res = await fetch('http://127.0.0.1:7704/health');
      const data = await res.json().catch(() => ({}));
      const sessions = data?.sessions || [];
      const s = sessions.find((x) => x.profile === profile);
      if (s && s.viewport && (s.viewport.width < 800 || s.viewport.height < 600)) {
        console.warn('[Phase1StartProfile] viewport too small, restarting profile');
        await startProfile({ profile, headless, url: 'https://www.xiaohongshu.com' });
        await restoreBrowserState(profile);
      }
    } catch {}

    console.log('✅ Phase1: profile 启动完成');

    // 3) Cookie 监控与保存（登录成功后才保存）
    console.log('🍪 Phase1: 开始监控 cookie（每 15 秒扫描）');
    const cookieRes = await monitorCookie({
      profile,
      scanIntervalMs: 15000,
      stableCount: 1,
    });
    console.log('✅ Phase1: cookie 初次稳定保存完成');
    console.log(`   saved=${cookieRes.saved} autoCookiesStarted=${cookieRes.autoCookiesStarted} path=${cookieRes.cookiePath}`);

    console.log('✅ Phase1 完成：autoCookies 已开启，可继续执行 Phase2');
    if (!once) {
      console.log('🧷 Phase1 keepalive：使用 "xhs stop" 或 Ctrl+C 退出');
      await new Promise((resolve) => {
        const stop = () => resolve();
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
      });
    }
  } finally {
    if (lockHandle?.release) lockHandle.release();
  }
}

main().catch((err) => {
  console.error('❌ Phase 1 失败:', err?.message || String(err));
  process.exit(1);
});
