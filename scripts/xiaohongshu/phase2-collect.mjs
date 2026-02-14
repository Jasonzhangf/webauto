#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { ensureCoreServices } from '../lib/ensure-core-services.mjs';
import { restoreBrowserState } from './lib/recovery.mjs';
import { ensureRuntimeReady } from './lib/runtime-ready.mjs';
import { createRealtimeJsonlWriter } from './lib/realtime-jsonl.mjs';

ensureUtf8Console();

/**
 * Phase 2 - 搜索与链接采集
 * 
 * 功能：
 * - 执行关键字搜索
 * - 滚动并采集指定数量的安全详情链接（包含 xsec_token）
 * - 保存到 ~/.webauto/download/xiaohongshu/{env}/{keyword}/links.json
 * 
 * 用法：
 *   node scripts/xiaohongshu/phase2-collect.mjs --keyword "手机膜" --target 50 --env debug
 */

import { resolveKeyword, resolveTarget, resolveEnv, PROFILE, getNextDevKeyword, CONFIG } from './lib/env.mjs';
import { listProfilesForPool } from './lib/profilepool.mjs';
import { initRunLogging, emitRunEvent, safeStringify } from './lib/logger.mjs';
import { createSessionLock } from './lib/session-lock.mjs';
import { execute as waitSearchPermit } from '../../dist/modules/workflow/blocks/WaitSearchPermitBlock.js';
// NOTE: xiaohongshu/app is compiled with rootDir=../.. so output is nested under xiaohongshu/app/src.
import { execute as phase2Search } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase2SearchBlock.js';
import { execute as phase2CollectLinks } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase2CollectLinksBlock.js';
import { resolveDownloadRoot } from '../../dist/modules/state/src/paths.js';
import { updateXhsCollectState, markXhsCollectFailed } from '../../dist/modules/state/src/xiaohongshu-collect-state.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { UNIFIED_API_URL } from './lib/core-daemon.mjs';
const ownerPidArg = Number(String((process.argv.slice(2).includes('--owner-pid') ? process.argv[process.argv.indexOf('--owner-pid') + 1] : process.env.WEBAUTO_OWNER_PID) || process.pid));

function nowMs() {
  return Date.now();
}

function formatDurationMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, '0')}s`;
}

async function ensureDir(dir) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
}

async function safeRm(targetPath) {
  const { rm } = await import('node:fs/promises');
  try {
    await rm(targetPath, { force: true, recursive: true });
  } catch {
    // ignore
  }
}

async function readExistingJsonl(filePath) {
  const { readFile } = await import('node:fs/promises');
  try {
    const text = await readFile(filePath, 'utf8');
    return text.split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeJsonl(filePath, rows, { append = true, dedupeKey = 'noteId' } = {}) {
  const { writeFile } = await import('node:fs/promises');
  const existing = append ? await readExistingJsonl(filePath) : [];
  const seen = new Set(existing.map((r) => r[dedupeKey]).filter(Boolean));
  const newRows = rows.filter((r) => !seen.has(r[dedupeKey]));
  const merged = [...existing, ...newRows];
  const body = merged.map((r) => JSON.stringify(r)).join('\n') + (merged.length ? '\n' : '');
  await writeFile(filePath, body, 'utf8');
  return { total: merged.length, added: newRows.length, existing: existing.length };
}

async function maybeDaemonize(argv) {
  if (!argv.includes('--daemon') || process.env.WEBAUTO_DAEMON === '1') return false;
  const wrapperPath = path.join(__dirname, 'shared', 'daemon-wrapper.mjs');
  const scriptPath = fileURLToPath(import.meta.url);
  const args = argv.filter((a) => a !== '--daemon');
  const { spawn } = await import('node:child_process');
  spawn(process.execPath, [wrapperPath, scriptPath, ...args], { stdio: 'inherit', cwd: process.cwd(), env: process.env });
  return true;
}

async function showStatus({ keyword, env, downloadRoot }) {
  const { readFile } = await import('node:fs/promises');
  const statePath = path.join(downloadRoot, 'xiaohongshu', env, keyword, '.collect-state.json');
  try {
    const raw = await readFile(statePath, 'utf8');
    const state = JSON.parse(raw);
    const collected = state?.listCollection?.collectedUrls?.length || 0;
    const target = state?.listCollection?.targetCount || 0;
    console.log(`Phase2 status: ${state?.status || 'unknown'} ${collected}/${target} updated=${state?.lastUpdateTime || 'n/a'}`);
    if (state?.error) console.log(`error: ${String(state.error).slice(0, 200)}`);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.log('Phase2 status: not_started');
      return;
    }
    throw err;
  }
}

async function main() {
  // Single source of truth for service lifecycle: core-daemon.
  await ensureCoreServices();

  const argv = process.argv.slice(2);
  const downloadRoot = resolveDownloadRoot();

  if (argv.includes('--status')) {
    await showStatus({ keyword: resolveKeyword(), env: resolveEnv(), downloadRoot });
    return;
  }

  // Default to daemon mode unless --foreground is passed
  const foreground = argv.includes('--foreground');
  const filteredArgv = argv.filter(a => a !== '--foreground');
  
  if (!foreground && await maybeDaemonize([...filteredArgv, '--daemon'])) {
    console.log('✅ Phase2 started in daemon mode');
    return;
  }

  let keyword = resolveKeyword();
  const target = resolveTarget();
  const env = resolveEnv();
  const poolIdx = argv.indexOf('--profilepool');
  const profilesIdx = argv.indexOf('--profiles');
  // CLI overrides first: Phase2 must be driven by explicit input (no hidden fallback).
  let runtimeProfile = String((argv.includes('--profile') ? argv[argv.indexOf('--profile') + 1] : '') || '').trim() || PROFILE;

  if (poolIdx !== -1 && argv[poolIdx + 1]) {
    const poolKeyword = String(argv[poolIdx + 1]).trim();
    const poolProfiles = listProfilesForPool(poolKeyword);
    if (poolProfiles.length > 0) runtimeProfile = poolProfiles[0];
  } else if (profilesIdx !== -1 && argv[profilesIdx + 1]) {
    const list = String(argv[profilesIdx + 1])
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) runtimeProfile = list[0];
  }

  // Phase2 only supports a single runtime profile
  const PROFILE_RUNTIME = runtimeProfile;
  // downloadRoot already resolved above

  await ensureRuntimeReady({
    phase: 'phase2',
    profile: PROFILE_RUNTIME,
    keyword,
    env,
    unifiedApiUrl: UNIFIED_API_URL,
    headless: argv.includes('--headless'),
    requireCheckpoint: true,
    ownerPid: Number.isFinite(ownerPidArg) ? ownerPidArg : process.pid,
  });

  // 清理旧产物（同 env + keyword 下）
  const baseDir = path.join(downloadRoot, 'xiaohongshu', env, keyword);
  // await safeRm(`${baseDir}/phase2-links.jsonl`); // 保留已有进度
  // await safeRm(`${baseDir}/run.log`);
  // await safeRm(`${baseDir}/run-events.jsonl`);
  // await safeRm(`${baseDir}/click-trace`);

  // 初始化日志
  const runContext = initRunLogging({ env, keyword, logMode: 'single' });

  console.log(`🔍 Phase 2: 搜索与链接采集 [runId: ${runContext.runId}]`);
  console.log(`关键字: ${keyword}`);
  console.log(`目标数量: ${target}`);
  console.log(`环境: ${env}`);

  // 获取会话锁
  const lock = createSessionLock({ profileId: PROFILE_RUNTIME, lockType: 'phase2' });
  let lockHandle = null;
  const outPath = path.join(downloadRoot, 'xiaohongshu', env, keyword, 'phase2-links.jsonl');
  let collectResult = null;
  try {
    lockHandle = lock.acquire({ phase: 'phase2', keyword, target, runId: runContext.runId });
  } catch (e) {
    console.log('⚠️  会话锁已被其他进程持有，退出');
    console.log(String(e?.message || e));
    process.exit(1);
  }

  try {
    emitRunEvent('phase2_start', { keyword, target, env, runId: runContext.runId });
    await updateXhsCollectState({ keyword, env, downloadRoot, targetCount: target }, (draft) => {
      if (!draft.startTime) draft.startTime = new Date().toISOString();
      draft.status = 'running';
      draft.listCollection.targetCount = target;
      draft.resume.lastStep = 'phase2_start';
    });

    const t0 = nowMs();
    emitRunEvent('phase2_timing', { stage: 'start', t0 });

    // 1. SearchGate 节流许可申请
    console.log(`⏳ 申请搜索许可...`);
    const tPermit0 = nowMs();
    const isDev = process.env.DEBUG === '1' || process.env.WEBAUTO_DEV === '1';
    const forcePermit = process.env.WEBAUTO_SEARCH_GATE_FORCE_PERMIT === '1';
    let permitResult = await waitSearchPermit({
      sessionId: PROFILE_RUNTIME,
      keyword,
      dev: isDev,
      devTag: isDev ? 'phase2-dev' : '',
      skipIfAlreadyOnSearchResult: !forcePermit,
    });
    // Dev/test ergonomics: if SearchGate denies due to dev-only consecutive keyword rule,
    // rotate keyword from the pool and retry permit with the NEW keyword (no extra search yet).
    // IMPORTANT: Do NOT retry with the same keyword that was just denied - it will be denied again.
    // Instead, request permit with the NEXT keyword from the pool.
    if (!permitResult.granted && (permitResult.reason === 'dev_consecutive_keyword_limit' || permitResult.deny?.code === 'dev_consecutive_keyword_limit')) {
      const originalKeyword = keyword;
      const next = getNextDevKeyword(originalKeyword);
      if (next && next !== keyword) {
        console.warn(`[Phase2] SearchGate denied consecutive keyword in dev, rotating keyword: "${keyword}" -> "${next}"`);
        // Request permit with the NEW keyword (not the denied one) to avoid history pollution
        permitResult = await waitSearchPermit({
          sessionId: PROFILE_RUNTIME,
          keyword: next,
          dev: isDev,
          devTag: isDev ? 'phase2-dev' : '',
          skipIfAlreadyOnSearchResult: !forcePermit,
        });
        // Update keyword to the new one for subsequent search
        keyword = next;
      }
    }
    const tPermit1 = nowMs();
    console.log(`⏱️  许可申请耗时: ${formatDurationMs(tPermit1 - tPermit0)}`);
    emitRunEvent('phase2_timing', { stage: 'permit_done', ms: tPermit1 - tPermit0 });
    if (!permitResult.granted) {
      throw new Error(`搜索许可申请失败: ${permitResult.error || '未知错误'}`);
    }

    // 2. 执行搜索（输入 + 触发）
    const tSearch0 = nowMs();
    const searchResult = await phase2Search({ keyword, profile: PROFILE_RUNTIME });
    const tSearch1 = nowMs();
    console.log(`⏱️  搜索耗时: ${formatDurationMs(tSearch1 - tSearch0)}`);
    emitRunEvent('phase2_timing', { stage: 'search_done', ms: tSearch1 - tSearch0 });
    if (!searchResult.success) {
      throw new Error(`搜索失败: ${searchResult.finalUrl}`);
    }
    const outDir = path.dirname(outPath);
    await ensureDir(outDir);

    const existingRows = await readExistingJsonl(outPath);
    const existingNoteIds = Array.from(new Set(existingRows
      .map((r) => String(r?.noteId || '').trim())
      .filter(Boolean)));
    const realtimeWriter = await createRealtimeJsonlWriter(outPath, {
      dedupeKey: 'noteId',
      seedRows: existingRows,
    });
    const remainingTarget = Math.max(0, Number(target) - existingNoteIds.length);

    console.log(`[Phase2] resume: existing=${existingNoteIds.length}, remaining=${remainingTarget}, target=${target}`);
    emitRunEvent('phase2_resume', {
      existing: existingNoteIds.length,
      remaining: remainingTarget,
      target,
      outPath,
    });

    const tCollect0 = nowMs();
    let newlyCollected = [];
    let termination = null;
    if (remainingTarget > 0) {
      collectResult = await phase2CollectLinks({
        keyword,
        targetCount: remainingTarget,
        profile: PROFILE_RUNTIME,
        env,
        alreadyCollectedNoteIds: existingNoteIds,
        onLink: async (linkRow) => {
          await realtimeWriter.append(linkRow);
        },
      });
      newlyCollected = Array.isArray(collectResult?.links) ? collectResult.links : [];
      termination = collectResult?.termination || null;
    } else {
      termination = 'reached_target';
      console.log('[Phase2] resume target already reached, skip collect run');
    }
    const tCollect1 = nowMs();
    console.log(`⏱️  采集耗时: ${formatDurationMs(tCollect1 - tCollect0)}`);
    emitRunEvent('phase2_timing', { stage: 'collect_done', ms: tCollect1 - tCollect0, count: newlyCollected.length });

    const realtimeStats = realtimeWriter.stats();
    // Reconcile any rows that might not be flushed by callback (best-effort safety net).
    const persist = await writeJsonl(outPath, newlyCollected, { append: true, dedupeKey: 'noteId' });
    const results = await readExistingJsonl(outPath);
    const addedByRealtime = Math.max(0, Number(realtimeStats.added) || 0);
    const addedByFinalMerge = Math.max(0, Number(persist.added) || 0);
    const effectiveAdded = Math.max(0, results.length - existingNoteIds.length);
    console.log(`[Phase2] persist(realtime): existingBefore=${existingNoteIds.length} addedRealtime=${addedByRealtime} addedFinalMerge=${addedByFinalMerge} addedTotal=${effectiveAdded} total=${results.length}`);

    const t1 = nowMs();
    const totalMs = t1 - t0;
    console.log(`⏱️  总耗时: ${formatDurationMs(totalMs)}`);
    emitRunEvent('phase2_timing', { stage: 'done', ms: totalMs, count: results.length });

    if (termination && termination !== 'reached_target') {
      console.log(`⚠️  采集提前结束，原因: ${termination}`);
    }
    console.log(`✅ 采集完成，共 ${results.length} 条链接`);
    console.log(`📁 保存路径: ${outPath}`);
    emitRunEvent('phase2_done', { outPath, count: results.length, target, termination });

    await updateXhsCollectState({ keyword, env, downloadRoot, targetCount: target }, (draft) => {
      draft.status = 'completed';
      draft.listCollection.targetCount = target;
      draft.listCollection.collectedUrls = results.map((r) => ({
        noteId: String(r?.noteId || '').trim(),
        safeUrl: String(r?.safeUrl || '').trim(),
        ...(String(r?.searchUrl || '').trim() ? { searchUrl: String(r.searchUrl).trim() } : {}),
        ...(typeof r?.timestamp === 'number' ? { timestamp: r.timestamp } : {}),
      }));
      draft.stats.phase2DurationMs = totalMs;
      draft.resume.lastStep = 'phase2_done';
      if (draft.error) draft.error = null;
    });

    console.log('\n📊 采集结果：');
    console.log(`   总链接数: ${results.length}`);
    console.log(`   输出路径: ${outPath}`);
    console.log('\n✅ Phase 2 完成');

  } catch (err) {
    emitRunEvent('phase2_error', { error: safeStringify(err) });
    
    const partialResults = collectResult?.links || [];
    if (partialResults.length > 0) {
      const fallbackPath = path.join(downloadRoot, 'xiaohongshu', env, keyword, 'phase2-links.jsonl');
      const fallbackDir = path.dirname(fallbackPath);
      await ensureDir(fallbackDir).catch(() => {});
      await writeJsonl(fallbackPath, partialResults, { append: true, dedupeKey: 'noteId' }).catch(() => {});
      const merged = await readExistingJsonl(fallbackPath).catch(() => partialResults);
      console.log(`📁 部分结果已保存: ${fallbackPath} (added=${partialResults.length}, merged=${merged.length})`);
      
      await updateXhsCollectState({ keyword, env, downloadRoot, targetCount: target }, (draft) => {
        draft.status = 'failed_partial';
        draft.listCollection.targetCount = target;
        draft.listCollection.collectedUrls = merged.map((r) => ({
          noteId: String(r?.noteId || '').trim(),
          safeUrl: String(r?.safeUrl || '').trim(),
          ...(String(r?.searchUrl || '').trim() ? { searchUrl: String(r.searchUrl).trim() } : {}),
          ...(typeof r?.timestamp === 'number' ? { timestamp: r.timestamp } : {}),
        }));
        draft.error = err?.message || String(err);
      }).catch(() => {});
    }
    
    await markXhsCollectFailed({ keyword, env, downloadRoot, error: safeStringify(err) }).catch(() => {});
    console.error('\n❌ Phase 2 失败:', err?.message || String(err));
    process.exit(1);
  } finally {
    await restoreBrowserState(PROFILE_RUNTIME, UNIFIED_API_URL);
    lockHandle?.release?.();
  }
}

main();
