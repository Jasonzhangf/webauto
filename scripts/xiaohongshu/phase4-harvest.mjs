#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { ensureCoreServices } from '../lib/ensure-core-services.mjs';

ensureUtf8Console();

import { resolveKeyword, resolveEnv } from './lib/env.mjs';
import { initRunLogging, emitRunEvent, safeStringify } from './lib/logger.mjs';
import { createSessionLock } from './lib/session-lock.mjs';
import { execute as validateLinks } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34ValidateLinksBlock.js';
import { execute as multiTabHarvest } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase4MultiTabHarvestBlock.js';
import { resolveDownloadRoot } from '../../dist/modules/state/src/paths.js';
import {
  markXhsCollectCompleted,
  markXhsCollectFailed,
} from '../../dist/modules/state/src/xiaohongshu-collect-state.js';
import { ensureServicesHealthy, restoreBrowserState } from './lib/recovery.mjs';
import { recordStageCheck, recordStageRecovery } from './lib/stage-checks.mjs';
import minimist from 'minimist';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function nowMs() {
  return Date.now();
}

async function runNode(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..'),
      env: process.env,
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.on('error', reject);
  });
}

async function ensureProfileSession(profile) {
  // Check if session exists via browser-service
  try {
    const res = await fetch('http://127.0.0.1:7704/health');
    const data = await res.json().catch(() => ({}));
    const sessions = data?.sessions || [];
    const hasSession = sessions.some((s) => s.profile === profile && s.state === 'active');
    if (hasSession) {
      console.log(`[Phase4] Profile ${profile} session already active`);
      return;
    }
  } catch (e) {
    console.log(`[Phase4] Health check failed: ${e.message}`);
  }
  
  // Start session via phase1-boot
  console.log(`[Phase4] Booting profile ${profile}...`);
  const phase1Path = path.join(__dirname, 'phase1-boot.mjs');
  await runNode(phase1Path, ['--profile', profile, '--once']);
  console.log(`[Phase4] Profile ${profile} booted`);
  
  // Wait a bit for session to be ready
  await new Promise(r => setTimeout(r, 2000));
}

async function main() {
  await ensureServicesHealthy();
  await ensureCoreServices();

  const keyword = resolveKeyword();
  const env = resolveEnv();
  const downloadRoot = resolveDownloadRoot();
  const args = minimist(process.argv.slice(2));
  const linksPath = String(args.links || '').trim() || undefined;
  const shardIndex = args['shard-index'] !== undefined ? Number(args['shard-index']) : undefined;
  const shardCount = args['shard-count'] !== undefined ? Number(args['shard-count']) : undefined;
  const dryRun = args['dry-run'] === true || args['dry-run'] === 'true' || args['dry-run'] === 1 || args['dry-run'] === '1';

  const foreground = args.foreground === true || args.foreground === '1' || args.foreground === 1;
  const shouldDaemonize = !foreground && process.env.WEBAUTO_DAEMON !== '1';

  if (shouldDaemonize) {
    const wrapperPath = path.join(__dirname, 'shared', 'daemon-wrapper.mjs');
    const scriptPath = fileURLToPath(import.meta.url);
    const scriptArgs = process.argv.slice(2).filter((arg) => arg !== '--foreground');
    await runNode(wrapperPath, [scriptPath, ...scriptArgs]);
    console.log('✅ Phase4 started in daemon mode');
    return;
  }

  const profile = String(args.profile || '').trim();
  if (!profile) {
    console.error('❌ 必须提供 --profile 参数');
    process.exit(2);
  }

  const runCtx = initRunLogging({ env, keyword, noWrite: dryRun });
  const runId = runCtx?.runId || runCtx;

  console.log(`📝 Phase 4 Multi-Tab: 评论采集 [runId: ${runId}]`);
  console.log(`关键字: ${keyword}`);
  console.log(`环境: ${env}`);
  console.log(`Profile: ${profile}`);

  const lock = createSessionLock({ profileId: profile, lockType: 'phase4' });
  let lockHandle = null;
  try {
    lockHandle = lock.acquire();
  } catch (e) {
    console.log('⚠️ 会话锁已被持有，退出');
    process.exit(1);
  }

  try {
    const t0 = nowMs();
    emitRunEvent('phase4_start', { keyword, env, dryRun });

    // 0. 确保 profile session 已启动
    await ensureProfileSession(profile);

    // 1. 校验链接
    console.log(`\n🔍 步骤 1: 校验链接...`);
    const validateResult = await validateLinks({
      keyword,
      env,
      profile,
      linksPath,
      shardIndex,
      shardCount,
    });

    if (!validateResult.success) {
      throw new Error(`链接校验失败: ${validateResult.error}`);
    }

    const validLinks = validateResult.links || [];
    console.log(`✅ 有效链接: ${validLinks.length} 条`);

    if (validLinks.length === 0) {
      console.log('⚠️ 没有有效链接');
      process.exit(0);
    }

    // 2. 多Tab轮转采集
    console.log(`\n📝 步骤 2: 多Tab轮转采集评论...`);
    const harvestResult = await multiTabHarvest({
      profile,
      keyword,
      env,
      links: validLinks,
      maxCommentsPerNote: 50,
    });

    const t1 = nowMs();
    const totalMs = t1 - t0;

    console.log(`\n⏱️ 总耗时: ${Math.floor(totalMs / 1000)}s`);
    console.log(`📊 结果: ${harvestResult.totalNotes} 帖子, ${harvestResult.totalComments} 条评论`);

    emitRunEvent('phase4_done', {
      success: harvestResult.totalNotes,
      failed: harvestResult.errors.length,
      totalComments: harvestResult.totalComments,
      dryRun,
    });

    if (!dryRun) {
      await markXhsCollectCompleted({ keyword, env, downloadRoot });
    }

    console.log(`\n✅ Phase 4 完成`);

  } catch (err) {
    emitRunEvent('phase4_error', { error: safeStringify(err), dryRun });
    if (!dryRun) {
      await markXhsCollectFailed({ keyword, env, downloadRoot, error: safeStringify(err) }).catch(() => {});
    }
    console.error('\n❌ Phase 4 失败:', err?.message || String(err));
    process.exit(1);
  } finally {
    lockHandle?.release?.();
  }
}

main();
