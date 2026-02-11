#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { ensureCoreServices } from '../lib/ensure-core-services.mjs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

ensureUtf8Console();

/**
 * Phase 1: 鍚姩骞跺鐢?xiaohongshu_fresh profile锛圓pp Block 鍏ュ彛锛?
 *
 * 鐢ㄦ硶锛?
 *   node scripts/xiaohongshu/phase1-boot.mjs
 *   node scripts/xiaohongshu/phase1-boot.mjs --once   # 瀹屾垚鍚庨€€鍑猴紙涓嶄繚鎸佸墠鍙伴樆濉烇級
 */

// Phase1 must be driven by explicit CLI input; do not fallback to defaults.
import { ensureBaseServices } from './lib/services.mjs';
import { createSessionLock } from './lib/session-lock.mjs';
import { ensureServicesHealthy, restoreBrowserState } from './lib/recovery.mjs';
import minimist from 'minimist';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));



async function withTimeout(promise, timeoutMs, timeoutMessage) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), Math.floor(timeoutMs));
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function maybeDaemonize(argv) {
  if (!argv.includes('--daemon') || process.env.WEBAUTO_DAEMON === '1') return false;
  const wrapperPath = join(SCRIPT_DIR, 'shared', 'daemon-wrapper.mjs');
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

function resolveBlockPath(filename) {
  const candidates = [
    // Standard dist layout
    join(SCRIPT_DIR, '..', '..', 'dist', 'modules', 'xiaohongshu', 'app', 'src', 'blocks', filename),
    // Legacy layout (avoid crash if older dist exists)
    join(SCRIPT_DIR, '..', '..', 'dist', 'modules', 'xiaohongshu', 'app', 'src', 'xiaohongshu', 'app', 'src', 'blocks', filename),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  throw new Error(`Phase1 block not found: ${filename}`);
}

async function loadBlocks() {
  const ensureServices = (await import(resolveBlockPath('Phase1EnsureServicesBlock.js'))).execute;
  const startProfile = (await import(resolveBlockPath('Phase1StartProfileBlock.js'))).execute;
  const monitorCookie = (await import(resolveBlockPath('Phase1MonitorCookieBlock.js'))).execute;
  return { ensureServices, startProfile, monitorCookie };
}

async function main() {
  const rawArgv = process.argv.slice(2);
  // Default to daemon mode unless --foreground is passed
  const foreground = rawArgv.includes('--foreground');
  const filteredArgv = rawArgv.filter(a => a !== '--foreground');
  
  if (!foreground && await maybeDaemonize([...filteredArgv, '--daemon'])) {
    console.log('Phase1 started in daemon mode');
    return;
  }

  // Single source of truth for service lifecycle: core-daemon.
  // Phase1/2/3/4 scripts should not each implement their own service orchestration.
  await ensureServicesHealthy();
  await ensureCoreServices();

  const args = minimist(process.argv.slice(2));
  const headless = args.headless === true || args.headless === 'true' || args.headless === 1 || args.headless === '1';
  const once = args.once === true || args.once === 'true' || args.once === 1 || args.once === '1';
  const timeoutSecRaw = Number(args['headless-login-timeout-sec'] || process.env.WEBAUTO_HEADLESS_LOGIN_TIMEOUT_SEC || 120);
  const headlessLoginTimeoutMs = Number.isFinite(timeoutSecRaw) && timeoutSecRaw > 0 ? Math.floor(timeoutSecRaw * 1000) : 120000;
  const ownerPidRaw = Number(args['owner-pid'] || process.pid || 0);
  const ownerPid = Number.isFinite(ownerPidRaw) && ownerPidRaw > 0 ? ownerPidRaw : process.pid;
  const profile = String(args.profile || '').trim();
  if (!profile) {
    console.error('ERROR: --profile is required');
    process.exit(2);
  }

  console.log('Phase1: starting app block');
  console.log(`Profile: ${profile}`);

  // 1) 鍩虹鏈嶅姟
  const { ensureServices, startProfile, monitorCookie } = await loadBlocks();
  await ensureBaseServices({ repoRoot: process.cwd() });
  await ensureServices();

  // 2) profile 浼氳瘽
  const lock = createSessionLock({ profileId: profile, lockType: 'phase1', force: true });
  const lockHandle = lock.acquire({ phase: 'phase1', headless });
  try {
    await startProfile({ profile, headless, url: 'https://www.xiaohongshu.com', ownerPid });
    await restoreBrowserState(profile);
    // viewport sanity check: if abnormal, restart profile once
    try {
      const res = await fetch(CORE_DAEMON_URL + '/health');
      const data = await res.json().catch(() => ({}));
      const sessions = data?.sessions || [];
      const s = sessions.find((x) => x.profile === profile);
      if (s && s.viewport && (s.viewport.width < 800 || s.viewport.height < 600)) {
        console.warn('[Phase1StartProfile] viewport too small, restarting profile');
        await startProfile({ profile, headless, url: 'https://www.xiaohongshu.com', ownerPid });
        await restoreBrowserState(profile);
      }
    } catch {}

    console.log('Phase1: profile started');

    // 3) Cookie 监控与保存（登录成功后才保存）
    console.log('🍪 Phase1: 开始监控 cookie（每 15 秒扫描）');
    let cookieRes;
    try {
      const monitorPromise = monitorCookie({
        profile,
        scanIntervalMs: 15000,
        stableCount: 1,
      });
      cookieRes = headless
        ? await withTimeout(
            monitorPromise,
            headlessLoginTimeoutMs,
            `[Phase1MonitorCookie] headless_login_timeout ${headlessLoginTimeoutMs}ms`,
          )
        : await monitorPromise;
    } catch (err) {
      const msg = err?.message || String(err);
      if (!headless) throw err;

      console.warn(`[Phase1MonitorCookie] headless 登录/风控未通过，切换 headful 重试: ${msg}`);
      console.warn('[Phase1MonitorCookie] 即将打开可见浏览器，请人工完成登录/过风控...');
      await startProfile({ profile, headless: false, url: 'https://www.xiaohongshu.com', ownerPid });
      await restoreBrowserState(profile);

      cookieRes = await monitorCookie({
        profile,
        scanIntervalMs: 15000,
        stableCount: 1,
      });
    }

    console.log('✅ Phase1: cookie 初次稳定保存完成');
    console.log(`   saved=${cookieRes.saved} autoCookiesStarted=${cookieRes.autoCookiesStarted} path=${cookieRes.cookiePath}`);

    console.log('Phase1 complete: autoCookies enabled, ready for Phase2');
    if (!once) {
      console.log('Phase1 keepalive: use xhs stop or Ctrl+C to exit');
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
  console.error('Phase1 failed:', err?.message || String(err));
  process.exit(1);
});

