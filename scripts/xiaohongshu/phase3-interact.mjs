#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { ensureCoreServices } from '../lib/ensure-core-services.mjs';

ensureUtf8Console();

/**
 * Phase 3: 评论互动（Interact）
 *
 * 策略（按你的要求）：
 * - 5 个 Tab 轮转
 * - 每个 Tab 在当前帖子中：找到 1 条关键字评论就点赞 1 条
 * - 每个 Tab 点赞到 2 条就切换到下一个 Tab
 * - 轮转 5 个 Tab 一圈后回到第一个 Tab，继续滚动/点赞直到评论到底
 */

import minimist from 'minimist';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveKeyword, resolveEnv } from './lib/env.mjs';
import { initRunLogging, emitRunEvent, safeStringify } from './lib/logger.mjs';
import { createSessionLock } from './lib/session-lock.mjs';
import { assignShards, listProfilesForPool } from './lib/profilepool.mjs';

import { execute as validateLinks } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34ValidateLinksBlock.js';
import { execute as openTabs } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34OpenTabsBlock.js';
import { execute as interact } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase3InteractBlock.js';
import { controllerAction, delay } from '../../dist/modules/xiaohongshu/app/src/utils/controllerAction.js';
import { resolveDownloadRoot } from '../../dist/modules/state/src/paths.js';
import { updateXhsCollectState } from '../../dist/modules/state/src/xiaohongshu-collect-state.js';

const UNIFIED_API_URL = 'http://127.0.0.1:7701';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function nowMs() {
  return Date.now();
}

function formatDurationMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, '0')}s`;
}

async function closeTabs(profile, tabs) {
  for (const tab of tabs) {
    if (!tab?.pageId) continue;
    try {
      await controllerAction('browser:close_page', { profile, pageId: tab.pageId }, UNIFIED_API_URL);
      await delay(200);
    } catch (err) {
      console.warn(`[phase3-interact] 关闭 Tab 失败 pageId=${tab.pageId}:`, err?.message || String(err));
    }
  }
}

function stripArgs(argv, keys) {
  const drop = new Set(keys);
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (drop.has(a)) {
      // drop this flag and its value if it looks like --flag value
      if (i + 1 < argv.length && !String(argv[i + 1] || '').startsWith('--')) i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
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

async function main() {
  // Single source of truth for service lifecycle: core-daemon.
  await ensureCoreServices();

  const args = minimist(process.argv.slice(2));

  const keyword = resolveKeyword();
  const env = resolveEnv();
  const downloadRoot = resolveDownloadRoot();
  const profilesArg = String(args.profiles || '').trim();
  const poolKeyword = String(args.profilepool || '').trim();
  const shardedChild = args['sharded-child'] === true || args['sharded-child'] === '1' || args['sharded-child'] === 1;
  const skipPhase1 = args['skip-phase1'] === true || args['skip-phase1'] === '1' || args['skip-phase1'] === 1;
  const dryRun = args['dry-run'] === true || args['dry-run'] === 'true' || args['dry-run'] === 1 || args['dry-run'] === '1';

  // Daemon mode: delegate to shared daemon-wrapper so UI can launch and exit safely.
  if (args.daemon === true && process.env.WEBAUTO_DAEMON !== '1') {
    const wrapperPath = path.join(__dirname, 'shared', 'daemon-wrapper.mjs');
    const scriptPath = fileURLToPath(import.meta.url);
    const scriptArgs = process.argv.slice(2).filter((arg) => arg !== '--daemon');
    await runNode(wrapperPath, [scriptPath, ...scriptArgs]);
    return;
  }

  // dry-run is "no-write": run the flow but avoid persisting outputs.

  // Multi-profile orchestrator (auto-sharding)
  if (!shardedChild && (profilesArg || poolKeyword)) {
    const profiles = profilesArg
      ? profilesArg.split(',').map((s) => s.trim()).filter(Boolean)
      : listProfilesForPool(poolKeyword);
    if (profiles.length === 0) {
      console.error('❌ 未找到可用 profiles');
      console.error(`   profilesRoot: ~/.webauto/profiles`);
      console.error(`   hint: node scripts/profilepool.mjs add "${poolKeyword || keyword}"`);
      process.exit(2);
    }

    const assignments = assignShards(profiles);
    console.log(`🧩 Phase3 multi-profile: ${assignments.length} shards`);
    assignments.forEach((a) => console.log(`- ${a.profileId} => shard ${a.shardIndex}/${a.shardCount}`));

    const scriptPath = fileURLToPath(import.meta.url);
    const baseArgs = stripArgs(process.argv.slice(2), [
      '--profiles',
      '--profilepool',
      '--profile',
      '--shard-index',
      '--shard-count',
      '--sharded-child',
      '--skip-phase1',
    ]);

    const runShard = async (a) => {
      console.log(`\n➡️  shard ${a.shardIndex}/${a.shardCount} profile=${a.profileId}`);
      if (!skipPhase1) {
        await runNode(path.join(__dirname, 'phase1-boot.mjs'), ['--profile', a.profileId, '--once']);
      }
      await runNode(scriptPath, [
        ...baseArgs,
        '--profile',
        a.profileId,
        '--shard-index',
        String(a.shardIndex),
        '--shard-count',
        String(a.shardCount),
        '--sharded-child',
        '1',
      ]);
    };

    await Promise.all(assignments.map((a) => runShard(a)));
    return;
  }

  const linksPath = String(args.links || '').trim() || undefined;
  const shardIndex = args['shard-index'] != null ? Number(args['shard-index']) : undefined;
  const shardCount = args['shard-count'] != null ? Number(args['shard-count']) : undefined;
  const profile = String(args.profile || '').trim();
  const likeKeywords = String(args['like-keywords'] || '').trim()
    ? String(args['like-keywords']).split(',').map((k) => k.trim()).filter(Boolean)
    : [];

  if (!profile) {
    console.error('❌ 必须提供 --profile 参数（禁止回退默认 profile）');
    process.exit(2);
  }

  if (likeKeywords.length === 0) {
    console.error('❌ 必须提供 --like-keywords，例如：--like-keywords "好评,推荐"');
    process.exit(1);
  }

  const tabCount = 4; // 4-Tab 轮询策略
  const maxLikesPerRound = 2; // 每轮最多点赞 2 条
  const maxCommentsPerTab = 50; // 每个 Tab 刷 50 评论后切换
  const commentsPerScroll = 3; // 估算：每次滚动约加载 3 条新评论

  const runContext = initRunLogging({ env, keyword, logMode: 'single', noWrite: dryRun });

  console.log(`❤️  Phase 3: 评论互动 [runId: ${runContext.runId}]`);
  console.log(`Profile: ${profile}`);
  console.log(`关键字: ${keyword}`);
  console.log(`评论筛选关键字: ${likeKeywords.join(', ')}`);
  console.log(`Tab: ${tabCount} (固定)`);
  console.log(`每 Tab 每轮点赞: ${maxLikesPerRound}`);
  console.log(`环境: ${env}`);
  console.log(`dry-run: ${dryRun}`);
  if (linksPath) console.log(`links: ${linksPath}`);
  if (shardIndex != null && shardCount != null) console.log(`shard: ${shardIndex}/${shardCount}`);

  const lock = createSessionLock({ profileId: profile, lockType: 'phase3' });
  let lockHandle = null;
  try {
    lockHandle = lock.acquire();
  } catch (e) {
    console.log('⚠️  会话锁已被其他进程持有，退出');
    console.log(String(e?.message || e));
    process.exit(1);
  }

  const t0 = nowMs();
  let tabs = [];

  try {
    emitRunEvent('phase3_start', { keyword, env, likeKeywords, tabCount, maxLikesPerRound, dryRun });
    // IMPORTANT:
    // Phase3/4 must NOT invalidate Phase2 completion state.
    // This state file is used as the gate for Phase34ValidateLinks.
    // We only record phase3 metadata without changing `status` away from `completed`.
    if (!dryRun) {
      await updateXhsCollectState({ keyword, env, downloadRoot }, (draft) => {
        if (!draft.startTime) draft.startTime = new Date().toISOString();
        draft.resume.lastStep = 'phase3_start';
        draft.legacy = {
          ...(draft.legacy || {}),
          phase3: {
            ...(draft.legacy?.phase3 || {}),
            likeKeywords,
            tabCount,
            maxLikesPerRound,
            startedAt: new Date().toISOString(),
          },
        };
      });
    }

    console.log(`\n🔍 步骤 1: 校验 Phase2 链接...`);
    const validateResult = await validateLinks({
      keyword,
      env,
      profile,
      ...(linksPath ? { linksPath } : {}),
      ...(shardIndex != null ? { shardIndex } : {}),
      ...(shardCount != null ? { shardCount } : {}),
    });
    if (!validateResult?.success) {
      throw new Error(`链接校验失败: ${validateResult?.error || 'unknown error'}`);
    }
    const validLinks = validateResult.links || [];
    console.log(`✅ 有效链接: ${validLinks.length} 条`);
    if (validLinks.length === 0) {
      console.log('⚠️  没有有效链接，请先运行 Phase2 采集链接');
      return;
    }

    console.log(`\n📂 步骤 2: 打开 ${tabCount} 个 Tab...`);
    const openTabsResult = await openTabs({ profile, tabCount, unifiedApiUrl: UNIFIED_API_URL });
    tabs = openTabsResult?.tabs || [];
    if (tabs.length === 0) {
      throw new Error('打开 Tab 失败：tabs 为空');
    }
    console.log(`✅ 已打开 ${tabs.length} 个 Tab`);

    // 为每个 tab 分配一个 note（循环分配），并持久使用该 tab 直到 note 到底。
    const tabAssignments = tabs.map((tab, idx) => ({
      tabIndex: idx,
      pageId: tab.pageId,
      linkIndex: idx % validLinks.length,
      commentsScanned: 0,
    }));

    const noteState = new Map();
    for (const link of validLinks) {
      noteState.set(link.noteId, { reachedBottom: false, totalLiked: 0 });
    }

    console.log(`\n❤️  步骤 3: 轮转 Tab 点赞（直到各自帖子到底）...`);
    let round = 0;
    const maxRounds = 10_000; // 纯保护

    while (round < maxRounds) {
      round += 1;
      const activeTab = tabAssignments[(round - 1) % tabAssignments.length];

      // 风控规避：每个 Tab 连续处理(扫描) 50 条评论后强制切换到下一个 Tab
      if (activeTab.commentsScanned >= maxCommentsPerTab) {
        console.log(
          `[Round ${round}] Tab ${activeTab.tabIndex} 已扫描 ${activeTab.commentsScanned} 条评论，强制切换到下一个 Tab 规避风控`,
        );
        activeTab.commentsScanned = 0;
        await delay(800);
        continue;
      }

      const link = validLinks[activeTab.linkIndex];
      const state = noteState.get(link.noteId);

      if (state?.reachedBottom) {
        // 该 tab 当前帖子已到底，换一个还没到底的帖子
        const nextIdx = validLinks.findIndex((l) => !noteState.get(l.noteId)?.reachedBottom);
        if (nextIdx === -1) {
          console.log('\n🎉 所有帖子均已到达评论区底部，结束');
          break;
        }
        activeTab.linkIndex = nextIdx;
      }

      const link2 = validLinks[activeTab.linkIndex];
      const state2 = noteState.get(link2.noteId);

      console.log(`\n[Round ${round}] Tab ${activeTab.tabIndex} -> note ${link2.noteId}`);

      // 切换 Tab
      await controllerAction('browser:switch_to_page', { profile, pageId: activeTab.pageId }, UNIFIED_API_URL);
      await delay(500);

      const res = await interact({
        sessionId: profile,
        noteId: link2.noteId,
        safeUrl: link2.safeUrl,
        likeKeywords,
        maxLikesPerRound,
        dryRun,
        keyword,
        env,
        unifiedApiUrl: UNIFIED_API_URL,
      });

      // 计数：把本轮扫描的评论数计入 Tab（无论是否点赞成功）
      activeTab.commentsScanned += Number(res?.scannedCount || 0);

      if (!res?.success) {
        console.log(`[Tab ${activeTab.tabIndex}] ❌ 失败: ${res?.error || 'unknown error'}`);
        emitRunEvent('phase3_note_error', { tabIndex: activeTab.tabIndex, noteId: link2.noteId, error: res?.error });
        // 失败时先切换到下一个 tab
        await delay(800);
        continue;
      }

      state2.totalLiked += res.likedCount;
      state2.reachedBottom = !!res.reachedBottom;

      console.log(`[Tab ${activeTab.tabIndex}] ✅ 本轮点赞 ${res.likedCount} 条，总点赞 ${state2.totalLiked} 条，到底=${state2.reachedBottom}`);
      emitRunEvent('phase3_note_round_done', {
        tabIndex: activeTab.tabIndex,
        noteId: link2.noteId,
        likedCount: res.likedCount,
        totalLiked: state2.totalLiked,
        reachedBottom: state2.reachedBottom,
      });
      if (!dryRun) {
        await updateXhsCollectState({ keyword, env, downloadRoot }, (draft) => {
          draft.resume.lastNoteId = link2.noteId;
          draft.resume.lastStep = 'phase3_round_done';
          const prev = (draft.legacy?.phase3?.notes || {});
          const next = {
            ...prev,
            [link2.noteId]: {
              totalLiked: state2.totalLiked,
              reachedBottom: state2.reachedBottom,
              updatedAt: new Date().toISOString(),
            },
          };
          draft.legacy = {
            ...(draft.legacy || {}),
            phase3: {
              ...(draft.legacy?.phase3 || {}),
              notes: next,
            },
          };
        });
      }

      // 轮转节奏
      await delay(1200);
    }

    const totalLiked = Array.from(noteState.values()).reduce((sum, s) => sum + (s.totalLiked || 0), 0);
    const totalMs = nowMs() - t0;
    console.log(`\n⏱️  总耗时: ${formatDurationMs(totalMs)}`);
    console.log(`✅ 总点赞数: ${totalLiked}`);
    emitRunEvent('phase3_done', { totalLiked, ms: totalMs, dryRun });
    if (!dryRun) {
      await updateXhsCollectState({ keyword, env, downloadRoot }, (draft) => {
        draft.stats.phase3DurationMs = totalMs;
        draft.resume.lastStep = 'phase3_done';
        draft.legacy = {
          ...(draft.legacy || {}),
          phase3: {
            ...(draft.legacy?.phase3 || {}),
            totalLiked,
            doneAt: new Date().toISOString(),
          },
        };
      });
    }

  } catch (err) {
    emitRunEvent('phase3_error', { error: safeStringify(err), dryRun });
    if (!dryRun) {
      await updateXhsCollectState({ keyword, env, downloadRoot }, (draft) => {
        draft.resume.lastStep = 'phase3_error';
        draft.legacy = {
          ...(draft.legacy || {}),
          phase3: {
            ...(draft.legacy?.phase3 || {}),
            error: safeStringify(err),
            failedAt: new Date().toISOString(),
          },
        };
      }).catch(() => {});
    }
    console.error('\n❌ Phase 3 失败:', err?.message || String(err));
    process.exit(1);
  } finally {
    // 尽量关闭 tab，避免资源泄漏
    if (tabs.length > 0) {
      console.log(`\n📂 收尾: 关闭 ${tabs.length} 个 Tab...`);
      await closeTabs(profile, tabs);
    }
    lockHandle?.release?.();
  }
}

main();
