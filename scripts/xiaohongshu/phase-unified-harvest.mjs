#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { ensureCoreServices } from '../lib/ensure-core-services.mjs';

ensureUtf8Console();

import { ensureServicesHealthy, restoreBrowserState } from './lib/recovery.mjs';
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
import { execute as multiTabHarvest } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase4MultiTabHarvestBlock.js';
import { execute as extractDetail } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34ExtractDetailBlock.js';
import { execute as persistDetail } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34PersistDetailBlock.js';
import { delay } from '../../dist/modules/xiaohongshu/app/src/utils/controllerAction.js';
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
      await fetch(`${UNIFIED_API_URL}/v1/controller/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:close_page',
          payload: { profile, pageId: tab.pageId }
        }),
      }).catch(() => null);
      await delay(200);
    } catch (err) {
      console.warn(`[phase-unified] 关闭 Tab 失败 pageId=${tab.pageId}:`, err?.message || String(err));
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
  
  // 统一采集控制参数
  const doComments = args['do-comments'] !== false;
  const doLikes = args['do-likes'] === true;
  const doHomepage = args['do-homepage'] === true;
  const doImages = args['do-images'] === true;
  const doOcr = args['do-ocr'] === true;  // 占位，后续实现
  const maxComments = Number(args['max-comments'] || 50);
  const maxLikes = Number(args['max-likes'] || 2);
  const likeKeywordsRaw = String(args['like-keywords'] || '').trim();
  const likeKeywords = likeKeywordsRaw ? likeKeywordsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  
  // Dry-run 默认开启（UI 勾选控制）
  const dryRun = args['dry-run'] !== false;  // 默认 true，显式 --no-dry-run 才真实点赞

  const foreground = args.foreground === true || args.foreground === '1' || args.foreground === 1;
  const shouldDaemonize = !foreground && process.env.WEBAUTO_DAEMON !== '1';
  
  if (shouldDaemonize) {
    const wrapperPath = path.join(__dirname, 'shared', 'daemon-wrapper.mjs');
    const scriptPath = fileURLToPath(import.meta.url);
    const scriptArgs = process.argv.slice(2).filter((arg) => arg !== '--foreground');
    await runNode(wrapperPath, [scriptPath, ...scriptArgs]);
    console.log('✅ Phase Unified Harvest started in daemon mode');
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
    console.log(`🧩 Unified Harvest multi-profile: ${assignments.length} shards`);
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
        await runNode(path.join(__dirname, 'phase1-boot.mjs'), ['--profile', a.profileId, '--once', ...(headless ? ['--headless'] : [])]);
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
    console.log('\n✅ Unified Harvest multi-profile done');
    return;
  }

  const profile = String(args.profile || 'xiaohongshu_fresh').trim();
  const runCtx = initRunLogging({ keyword, env, noWrite: dryRun });
  const runId = runCtx?.runId || runCtx;

  console.log(`\n📝 Phase Unified Harvest: 统一采集与点赞 [runId: ${runId}]`);
  console.log(`关键字: ${keyword}`);
  console.log(`环境: ${env}`);
  console.log(`Profile: ${profile}`);
  console.log(`\n🎯 采集配置:`);
  console.log(`  - 采集评论: ${doComments ? '✅' : '❌'} (maxComments=${maxComments})`);
  console.log(`  - 点赞评论: ${doLikes ? '✅' : '❌'} (maxLikes=${maxLikes}, keywords=[${likeKeywords.join(', ') || '无'}])`);
  console.log(`  - 采集主页: ${doHomepage ? '✅' : '❌'}`);
  console.log(`  - 采集图片: ${doImages ? '✅' : '❌'}`);
  console.log(`  - OCR识别: ${doOcr ? '✅ (占位)' : '❌'}`);
  console.log(`  - Dry Run: ${dryRun ? '✅ (测试不点赞)' : '❌ (真实点赞)'}`);

  const lock = createSessionLock({ profileId: profile, lockType: 'phase-unified' });
  let lockHandle = null;
  try {
    lockHandle = lock.acquire();
  } catch (e) {
    console.log('⚠️ 会话锁已被持有，退出');
    process.exit(1);
  }

  try {
    const t0 = nowMs();
    emitRunEvent('phase_unified_start', { keyword, env, doComments, doLikes, doHomepage, doImages, doOcr, dryRun });

    // 1. 校验链接
    console.log(`\n🔍 步骤 1: 校验链接...`);
    const validateResult = await validateLinks({
      keyword,
      env,
      profile,
      linksPath: undefined,
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

    // 2. 主页内容 + 图片采集（如果启用）
    let homepageResult = { notesProcessed: 0, imagesDownloaded: 0 };
    if (doHomepage || doImages) {
      console.log(`\n📄 步骤 2: 主页内容 + 图片采集...`);
      let hpCount = 0;
      let imgCount = 0;
      
      for (const link of validLinks.slice(0, Math.min(validLinks.length, 20))) {
        try {
          // 导航到详情页
          await fetch(`${UNIFIED_API_URL}/v1/controller/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'browser:goto',
              payload: { profile, url: link.safeUrl }
            }),
          });
          await delay(1500);

          // 提取主页内容
          if (doHomepage) {
            const extractRes = await extractDetail({ profile, noteId: link.noteId, unifiedApiUrl: UNIFIED_API_URL });
            if (extractRes.success) {
              hpCount++;
            }
          }

          // 持久化（含图片下载）
          if (doImages || doHomepage) {
            const persistRes = await persistDetail({
              profile,
              noteId: link.noteId,
              keyword,
              env,
              unifiedApiUrl: UNIFIED_API_URL,
            });
            if (persistRes.success) {
              if (doImages) imgCount += persistRes.imageCount;
            }
          }

          if (hpCount % 5 === 0) {
            console.log(`  进度: ${hpCount}/${validLinks.length} 帖子主页已采集`);
          }
        } catch (err) {
          console.warn(`  [${link.noteId}] 主页采集失败: ${err?.message || String(err)}`);
        }
      }
      
      homepageResult.notesProcessed = hpCount;
      homepageResult.imagesDownloaded = imgCount;
      console.log(`✅ 主页采集完成: ${hpCount} 帖子, ${imgCount} 张图片`);
    }

    // 3. 评论采集（如果启用）
    let tabs = [];
    let commentsResult = { totalNotes: 0, totalComments: 0 };
    if (doComments || doLikes) {
      const openRes = await openTabs({ profile, tabCount: 4, unifiedApiUrl: UNIFIED_API_URL });
      tabs = openRes.tabs || [];
      console.log(`\n📂 Tab 池已准备: ${tabs.length} 个 tab`);
    }

    if (doComments) {
      console.log(`\n💬 步骤 3: 多 Tab 轮转采集评论...`);
      commentsResult = await multiTabHarvest({
        profile,
        keyword,
        env,
        links: validLinks,
        maxCommentsPerNote: maxComments,
        unifiedApiUrl: UNIFIED_API_URL,
      });
      console.log(`✅ 评论采集完成: ${commentsResult.totalNotes} 帖子, ${commentsResult.totalComments} 条评论`);
    }

    // 4. 评论点赞（如果启用）
    let likesResult = { totalLiked: 0 };
    if (doLikes && likeKeywords.length > 0) {
      console.log(`\n❤️  步骤 4: 多 Tab 轮转点赞评论...`);
      console.log(`🎯 点赞关键字: [${likeKeywords.join(', ')}]`);
      console.log(`⏱️  每帖最多点赞: ${maxLikes} 条`);
      
      const noteState = new Map();
      for (const link of validLinks) {
        noteState.set(link.noteId, { reachedBottom: false, totalLiked: 0 });
      }
      
      const tabAssignments = tabs.slice(0, 4).map((t, i) => ({
        slotIndex: i + 1,
        tabRealIndex: t.index,
        linkIndex: i,
        commentsScanned: 0,
      }));
      
      console.log(`\n[Tabs] 固定帖子页 slots:`);
      tabAssignments.forEach(t => {
        const note = validLinks[t.linkIndex];
        console.log(`  slot-${t.slotIndex} -> tab-${t.tabRealIndex} -> note ${note.noteId}`);
      });
      
      let round = 0;
      const maxRounds = 10_000;
      const maxCommentsPerTab = 200;
      
      while (round < maxRounds) {
        round += 1;
        const activeSlot = tabAssignments[(round - 1) % tabAssignments.length];
        
        if (activeSlot.commentsScanned >= maxCommentsPerTab) {
          console.log(`[Round ${round}] slot-${activeSlot.slotIndex} 已扫描 ${activeSlot.commentsScanned} 条评论，强制切换下一个 slot 规避风控`);
          activeSlot.commentsScanned = 0;
          await delay(800);
          continue;
        }
        
        const link = validLinks[activeSlot.linkIndex];
        const state = noteState.get(link.noteId);
        
        if (state?.reachedBottom) {
          const nextIdx = validLinks.findIndex((l) => !noteState.get(l.noteId)?.reachedBottom);
          if (nextIdx === -1) {
            console.log('\n🎉 所有帖子均已到达评论区底部，结束点赞');
            break;
          }
          activeSlot.linkIndex = nextIdx;
          console.log(`[slot-${activeSlot.slotIndex}] 当前帖子到底，切换到下一个未完成的帖子`);
        }
        
        const link2 = validLinks[activeSlot.linkIndex];
        const state2 = noteState.get(link2.noteId);
        
        console.log(`\n[Round ${round}] slot-${activeSlot.slotIndex}(tab-${activeSlot.tabRealIndex}) -> note ${link2.noteId}`);
        
        await fetch(`${UNIFIED_API_URL}/v1/controller/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'browser:page:switch',
            payload: { profile, index: activeSlot.tabRealIndex }
          }),
        });
        await delay(800);
        
        const res = await interact({
          sessionId: profile,
          noteId: link2.noteId,
          safeUrl: link2.safeUrl,
          likeKeywords,
          maxLikesPerRound: maxLikes,
          dryRun,
          keyword,
          env,
          unifiedApiUrl: UNIFIED_API_URL,
        });
        
        activeSlot.commentsScanned += Number(res?.scannedCount || 0);
        
        if (!res?.success) {
          console.log(`[slot-${activeSlot.slotIndex}] ❌ 失败: ${res?.error || 'unknown error'}`);
          emitRunEvent('phase_unified_note_error', { slot: activeSlot.slotIndex, noteId: link2.noteId, error: res?.error });
          await delay(800);
          continue;
        }
        
        state2.totalLiked += res.likedCount;
        state2.reachedBottom = !!res.reachedBottom;
        
        console.log(`[slot-${activeSlot.slotIndex}] ✅ 本轮点赞 ${res.likedCount} 条，总点赞 ${state2.totalLiked} 条，到底=${state2.reachedBottom}`);
        emitRunEvent('phase_unified_note_round_done', {
          slot: activeSlot.slotIndex,
          noteId: link2.noteId,
          likedCount: res.likedCount,
          totalLiked: state2.totalLiked,
          reachedBottom: state2.reachedBottom,
        });
        
        if (!dryRun) {
          await updateXhsCollectState({ keyword, env, downloadRoot }, (draft) => {
            draft.resume.lastNoteId = link2.noteId;
            draft.resume.lastStep = 'phase_unified_round_done';
          });
        }
        
        await delay(1200);
      }
      
      likesResult.totalLiked = Array.from(noteState.values()).reduce((sum, s) => sum + (s.totalLiked || 0), 0);
      console.log(`\n✅ 点赞完成: 总点赞数 ${likesResult.totalLiked}`);
    }

    // 5. OCR识别（占位）
    if (doOcr) {
      console.log(`\n🔍 步骤 5: OCR识别（占位，暂未实现）`);
      console.log(`⚠️  OCR 功能待实现，已放入 BD 管理`);
    }

    const totalMs = nowMs() - t0;
    console.log(`\n⏱️  总耗时: ${formatDurationMs(totalMs)}`);
    console.log(`📊 结果汇总:`);
    console.log(`  - 采集主页: ${homepageResult.notesProcessed} 个帖子`);
    console.log(`  - 下载图片: ${homepageResult.imagesDownloaded} 张`);
    console.log(`  - 采集评论: ${commentsResult.totalNotes} 个帖子, ${commentsResult.totalComments} 条评论`);
    console.log(`  - 点赞评论: ${likesResult.totalLiked} 条`);
    emitRunEvent('phase_unified_done', { 
      homepageNotes: homepageResult.notesProcessed,
      imagesDownloaded: homepageResult.imagesDownloaded,
      totalNotes: commentsResult.totalNotes, 
      totalComments: commentsResult.totalComments,
      totalLiked: likesResult.totalLiked,
      ms: totalMs, 
      dryRun 
    });
    
    if (!dryRun) {
      await updateXhsCollectState({ keyword, env, downloadRoot }, (draft) => {
        draft.stats.phaseUnifiedDurationMs = totalMs;
        draft.resume.lastStep = 'phase_unified_done';
      });
    }

    console.log(`\n✅ Phase Unified Harvest 完成`);

  } catch (err) {
    emitRunEvent('phase_unified_error', { error: safeStringify(err), dryRun });
    if (!dryRun) {
      await updateXhsCollectState({ keyword, env, downloadRoot }, (draft) => {
        draft.resume.lastStep = 'phase_unified_error';
      }).catch(() => {});
    }
    console.error('\n❌ Phase Unified Harvest 失败:', err?.message || String(err));
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
