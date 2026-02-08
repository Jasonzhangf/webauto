#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { ensureCoreServices } from '../lib/ensure-core-services.mjs';

ensureUtf8Console();

import { ensureServicesHealthy, restoreBrowserState } from './lib/recovery.mjs';
import { recordStageCheck, recordStageRecovery } from './lib/stage-checks.mjs';
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
  await ensureServicesHealthy();
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

  const foreground = args.foreground === true || args.foreground === '1' || args.foreground === 1;
  const shouldDaemonize = !foreground && process.env.WEBAUTO_DAEMON !== '1';
  
  if (shouldDaemonize) {
    const wrapperPath = path.join(__dirname, 'shared', 'daemon-wrapper.mjs');
    const scriptPath = fileURLToPath(import.meta.url);
    const scriptArgs = process.argv.slice(2).filter((arg) => arg !== '--foreground');
    await runNode(wrapperPath, [scriptPath, ...scriptArgs]);
    console.log('✅ Phase3 started in daemon mode');
    return;
  }

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

    for (const a of assignments) {
      await runShard(a);
    }
    console.log('\n✅ Phase3 multi-profile done');
    return;
  }

  const profile = String(args.profile || 'xiaohongshu_fresh').trim();
  const likeKeywordsRaw = String(args['like-keywords'] || '黄金,走势,涨,跌,投资,理财').trim();
  const likeKeywords = likeKeywordsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const maxLikesPerRound = parseInt(String(args['max-likes-per-round'] || '2'), 10);
  const maxCommentsPerTab = parseInt(String(args['max-comments-per-tab'] || '50'), 10);
  const tabCount = 4;

  const runId = initRunLogging({ keyword, env, noWrite: dryRun });
const runEventsPath = path.join(downloadRoot, 'xiaohongshu', env, keyword, 'run-events.jsonl');
function emitEvent(type, payload) {
  try {
    const row = { ts: new Date().toISOString(), type, ...payload };
    fs.appendFileSync(runEventsPath, JSON.stringify(row) + '\n', 'utf8');
  } catch {}
}


  console.log(`\n❤️  Phase 3: 评论互动 [runId: ${runId}]`);
  console.log(`Profile: ${profile}`);
  console.log(`关键字: ${keyword}`);
  console.log(`评论筛选关键字: ${likeKeywords.join(', ')}`);
  console.log(`Tab: ${tabCount} (固定)`);
  console.log(`每 Tab 每轮点赞: ${maxLikesPerRound}`);
  console.log(`环境: ${env}`);
  console.log(`dry-run: ${dryRun}\n`);

  let lockHandle = null;
  let tabs = [];
  const t0 = nowMs();

  try {
    lockHandle = await createSessionLock({ profileId: profile });

    console.log('\n🔍 步骤 1: 校验 Phase2 链接...');
    const vres = await validateLinks({ profile, keyword, env, downloadRoot, unifiedApiUrl: UNIFIED_API_URL });
    const validLinks = vres?.links || [];
    console.log(`✅ 有效链接: ${validLinks.length} 条\n`);

    if (validLinks.length === 0) {
      console.error('❌ 无有效链接，无法继续 Phase3');
      process.exit(1);
    }

    console.log(`\n📂 步骤 2: 确保固定 5-tab 池（tab0=搜索页, tab1~4=帖子页）...`);
    // validate tab pool, reset if invalid URLs
    const preList = await controllerAction('browser:page:list', { profile }, UNIFIED_API_URL).catch(() => null);
    const pages = preList?.pages || preList?.data?.pages || [];
    const bad = pages.filter((p) => !String(p?.url || '').includes('xiaohongshu.com/explore'));
    if (bad.length > 0) {
      console.log(`[Phase3] tab pool invalid (${bad.length}), restoring browser state`);
      await restoreBrowserState(profile, UNIFIED_API_URL);
    }
    const openTabsResult = await openTabs({ profile, tabCount, unifiedApiUrl: UNIFIED_API_URL });
    tabs = openTabsResult?.tabs || [];
    if (tabs.length === 0) {
      throw new Error('打开 Tab 失败：tabs 为空');
    }
    console.log(`✅ 已准备 ${tabs.length} 个帖子页 tab\n`);

    const postTabs = tabs.slice(0, tabCount);
    
    const tabAssignments = postTabs.map((tab, idx) => ({
      tabRealIndex: tab.index,
      slotIndex: idx + 1,
      linkIndex: idx % validLinks.length,
      commentsScanned: 0,
    }));

    console.log(`[TabPool] 固定帖子页 slots:`);
    tabAssignments.forEach(t => {
      const note = validLinks[t.linkIndex];
      console.log(`  slot-${t.slotIndex} -> tab-${t.tabRealIndex} -> note ${note.noteId}`);
    });

    const noteState = new Map();
    for (const link of validLinks) {
      noteState.set(link.noteId, { reachedBottom: false, totalLiked: 0 });
    }

    console.log(`\n❤️  步骤 3: 轮转 slot1~4 点赞（固定 tab 池，各自帖子到底后换新帖子）...\n`);
    let round = 0;
    const maxRounds = 10_000;

    while (round < maxRounds) {
      round += 1;
      const activeSlot = tabAssignments[(round - 1) % tabAssignments.length];

      if (activeSlot.commentsScanned >= maxCommentsPerTab) {
        console.log(
          `[Round ${round}] slot-${activeSlot.slotIndex} 已扫描 ${activeSlot.commentsScanned} 条评论，强制切换到下一个 slot 规避风控`,
        );
        activeSlot.commentsScanned = 0;
        await delay(800);
        continue;
      }

      const link = validLinks[activeSlot.linkIndex];
      const state = noteState.get(link.noteId);

      if (state?.reachedBottom) {
        const nextIdx = validLinks.findIndex((l) => !noteState.get(l.noteId)?.reachedBottom);
        if (nextIdx === -1) {
          console.log('\n🎉 所有帖子均已到达评论区底部，结束');
          break;
        }
        activeSlot.linkIndex = nextIdx;
        console.log(`[slot-${activeSlot.slotIndex}] 当前帖子到底，切换到下一个未完成的帖子`);
      }

      const link2 = validLinks[activeSlot.linkIndex];
      const state2 = noteState.get(link2.noteId);

      console.log(`\n[Round ${round}] slot-${activeSlot.slotIndex}(tab-${activeSlot.tabRealIndex}) -> note ${link2.noteId}`);

      const switchRes = await controllerAction('browser:page:switch', { profile, index: activeSlot.tabRealIndex }, UNIFIED_API_URL);
      await delay(800);
      
      const listRes = await controllerAction('browser:page:list', { profile }, UNIFIED_API_URL);
      const currentActive = listRes?.activeIndex ?? listRes?.data?.activeIndex ?? -1;
      const currentUrl = listRes?.pages?.find(p => p.active)?.url ?? listRes?.data?.pages?.find(p => p.active)?.url ?? 'N/A';
      console.log(`  [Verify] switch -> tab-${activeSlot.tabRealIndex}, activeIndex=${currentActive}, url=${currentUrl.substring(0, 60)}`);

      emitEvent('phase3_round_start', { slotIndex: active.slotIndex, tabIndex: active.tabIndex, noteId: link.noteId });
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

      activeSlot.commentsScanned += Number(res?.scannedCount || 0);

      if (!res?.success) {
        console.log(`[slot-${activeSlot.slotIndex}] ❌ 失败: ${res?.error || 'unknown error'}`);
        emitRunEvent('phase3_note_error', { slot: activeSlot.slotIndex, tabRealIndex: activeSlot.tabRealIndex, noteId: link2.noteId, error: res?.error });
        await delay(800);
        continue;
      }

      state2.totalLiked += res.likedCount;
emitEvent('phase3_round_done', { slotIndex: active.slotIndex, tabIndex: active.tabIndex, noteId: link.noteId, likedCount: res.likedCount });
      state2.reachedBottom = !!res.reachedBottom;

      console.log(`[slot-${activeSlot.slotIndex}] ✅ 本轮点赞 ${res.likedCount} 条，总点赞 ${state2.totalLiked} 条，到底=${state2.reachedBottom}`);
      emitRunEvent('phase3_note_round_done', {
        slot: activeSlot.slotIndex,
        tabRealIndex: activeSlot.tabRealIndex,
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
    await restoreBrowserState(profile, UNIFIED_API_URL);
    if (tabs.length > 0) {
      console.log(`\n📂 收尾: 关闭 ${tabs.length} 个 Tab...`);
      await closeTabs(profile, tabs);
    }
    lockHandle?.release?.();
  }
}

main();
