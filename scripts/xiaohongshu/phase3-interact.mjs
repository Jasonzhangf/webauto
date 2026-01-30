#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

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

import { resolveKeyword, resolveEnv, PROFILE } from './lib/env.mjs';
import { initRunLogging, emitRunEvent, safeStringify } from './lib/logger.mjs';
import { createSessionLock } from './lib/session-lock.mjs';

import { execute as validateLinks } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34ValidateLinksBlock.js';
import { execute as openTabs } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34OpenTabsBlock.js';
import { execute as interact } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase3InteractBlock.js';
import { controllerAction, delay } from '../../dist/modules/xiaohongshu/app/src/utils/controllerAction.js';

const UNIFIED_API_URL = 'http://127.0.0.1:7701';

function nowMs() {
  return Date.now();
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeRepeated(value, maxRounds = 3) {
  let current = value;
  for (let i = 0; i < maxRounds; i += 1) {
    const next = decodeURIComponentSafe(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function matchesKeywordFromSearchUrl(searchUrl, keyword) {
  try {
    const url = new URL(searchUrl);
    const raw = url.searchParams.get('keyword') || '';
    if (raw) {
      const decoded = decodeRepeated(raw);
      return decoded === keyword || decoded.includes(keyword);
    }
  } catch {
    // ignore
  }
  const enc1 = encodeURIComponent(keyword);
  const enc2 = encodeURIComponent(enc1);
  return searchUrl.includes(keyword) || searchUrl.includes(enc1) || searchUrl.includes(enc2);
}

async function listPages(profile) {
  const res = await controllerAction('browser:page:list', { profile }, UNIFIED_API_URL).catch(() => null);
  const pages = res?.pages || res?.data?.pages || [];
  const activeIndexRaw = res?.activeIndex ?? res?.data?.activeIndex;
  const activeIndex = Number.isFinite(Number(activeIndexRaw)) ? Number(activeIndexRaw) : null;
  return { pages: Array.isArray(pages) ? pages : [], activeIndex };
}

function pickSearchTabIndex(pages, keyword) {
  const searchPages = pages.filter((p) => {
    const url = typeof p?.url === 'string' ? p.url : '';
    return url.includes('/search_result');
  });
  const keywordPages = searchPages.filter((p) => {
    const url = typeof p?.url === 'string' ? p.url : '';
    return matchesKeywordFromSearchUrl(url, keyword);
  });
  const candidates = keywordPages.length > 0 ? keywordPages : searchPages;
  if (candidates.length === 0) return null;
  const indices = candidates
    .map((p) => Number(p?.index))
    .filter((v) => Number.isFinite(v));
  if (indices.length === 0) return null;
  return Math.min(...indices);
}

function formatDurationMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, '0')}s`;
}

async function closeTabsExcept(profile, keepIndex) {
  const after = await listPages(profile);
  const indices = after.pages
    .map((p) => Number(p?.index))
    .filter((v) => Number.isFinite(v) && v !== keepIndex)
    .sort((a, b) => b - a);
  let currentKeep = Number.isFinite(Number(keepIndex)) ? Number(keepIndex) : null;
  for (const index of indices) {
    try {
      await controllerAction('browser:page:close', { profile, index }, UNIFIED_API_URL);
      if (Number.isFinite(Number(currentKeep)) && index < currentKeep) {
        currentKeep -= 1;
      }
      await delay(200);
    } catch (err) {
      console.warn(`[phase3-interact] 关闭 Tab 失败 index=${index}:`, err?.message || String(err));
    }
  }
  return currentKeep;
}

async function main() {
  const args = minimist(process.argv.slice(2));

  const keyword = resolveKeyword();
  const env = resolveEnv();
  const likeKeywords = String(args['like-keywords'] || '').trim()
    ? String(args['like-keywords']).split(',').map((k) => k.trim()).filter(Boolean)
    : [];
  const dryRun = Boolean(args['dry-run'] || args.dryrun);
  const dryRunDir = typeof args['dry-run-dir'] === 'string' ? String(args['dry-run-dir']).trim() : '';
  const maxRoundsRaw = Number(args['max-rounds'] ?? process.env.WEBAUTO_PHASE3_MAX_ROUNDS ?? 10000);
  const maxRounds = Number.isFinite(maxRoundsRaw) && maxRoundsRaw > 0 ? Math.floor(maxRoundsRaw) : 10000;

  if (likeKeywords.length === 0) {
    console.error('❌ 必须提供 --like-keywords，例如：--like-keywords "好评,推荐"');
    process.exit(1);
  }

  const tabCount = 5;
  const maxLikesPerRound = 2;

  const runContext = initRunLogging({ env, keyword, logMode: 'single' });

  console.log(`❤️  Phase 3: 评论互动 [runId: ${runContext.runId}]`);
  console.log(`Profile: ${PROFILE}`);
  console.log(`关键字: ${keyword}`);
  console.log(`评论筛选关键字: ${likeKeywords.join(', ')}`);
  console.log(`Tab: ${tabCount} (固定)`);
  console.log(`每 Tab 每轮点赞: ${maxLikesPerRound}`);
  console.log(`环境: ${env}`);
  console.log(`dry-run: ${dryRun ? 'true' : 'false'}`);
  console.log(`maxRounds: ${maxRounds}`);

  const lock = createSessionLock({ profileId: PROFILE, lockType: 'phase3' });
  const acquired = lock.acquire();
  if (!acquired) {
    console.log('⚠️  会话锁已被其他进程持有，退出');
    process.exit(1);
  }

  const t0 = nowMs();
  let tabs = [];
  let baselinePages = [];
  let baselineActiveIndex = null;

  try {
    emitRunEvent('phase3_start', { keyword, env, likeKeywords, tabCount, maxLikesPerRound });

    const baseline = await listPages(PROFILE);
    baselinePages = baseline.pages;
    baselineActiveIndex = baseline.activeIndex;

    console.log(`\n🔍 步骤 1: 校验 Phase2 链接...`);
    const validateResult = await validateLinks({ keyword, env });
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
    const openTabsResult = await openTabs({ profile: PROFILE, tabCount, unifiedApiUrl: UNIFIED_API_URL });
    tabs = openTabsResult?.tabs || [];
    if (tabs.length === 0) {
      throw new Error('打开 Tab 失败：tabs 为空');
    }
    console.log(`✅ 已打开 ${tabs.length} 个 Tab`);

    // 为每个 tab 分配一个 note（循环分配），并持久使用该 tab 直到 note 到底。
    const tabAssignments = tabs.map((tab, idx) => ({
      tabIndex: idx,
      index: tab.index,
      linkIndex: idx % validLinks.length,
    }));

    const noteState = new Map();
    for (const link of validLinks) {
      noteState.set(link.noteId, { reachedBottom: false, totalLiked: 0 });
    }

    console.log(`\n❤️  步骤 3: 轮转 Tab 点赞（直到各自帖子到底）...`);
    let round = 0;
    while (round < maxRounds) {
      round += 1;
      const activeTab = tabAssignments[(round - 1) % tabAssignments.length];
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
      await controllerAction('browser:page:switch', { profile: PROFILE, index: activeTab.index }, UNIFIED_API_URL);
      await delay(500);

      const res = await interact({
        sessionId: PROFILE,
        noteId: link2.noteId,
        safeUrl: link2.safeUrl,
        keyword,
        env,
        likeKeywords,
        maxLikesPerRound,
        unifiedApiUrl: UNIFIED_API_URL,
        dryRun,
        dryRunDir: dryRunDir || undefined,
      });

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

      // 轮转节奏
      await delay(1200);
    }

    const totalLiked = Array.from(noteState.values()).reduce((sum, s) => sum + (s.totalLiked || 0), 0);
    const totalMs = nowMs() - t0;
    console.log(`\n⏱️  总耗时: ${formatDurationMs(totalMs)}`);
    console.log(`✅ 总点赞数: ${totalLiked}`);
    emitRunEvent('phase3_done', { totalLiked, ms: totalMs });

  } catch (err) {
    emitRunEvent('phase3_error', { error: safeStringify(err) });
    console.error('\n❌ Phase 3 失败:', err?.message || String(err));
    process.exit(1);
  } finally {
    const after = await listPages(PROFILE);
    let keepIndex = pickSearchTabIndex(after.pages, keyword);
    if (!Number.isFinite(Number(keepIndex))) {
      keepIndex = Number.isFinite(Number(baselineActiveIndex)) ? baselineActiveIndex : after.activeIndex;
    }
    console.log(`\n📂 收尾: 关闭除搜索页外的所有 Tab...`);
    const resolvedKeepIndex = await closeTabsExcept(PROFILE, keepIndex);
    if (Number.isFinite(Number(resolvedKeepIndex))) {
      await controllerAction('browser:page:switch', { profile: PROFILE, index: resolvedKeepIndex }, UNIFIED_API_URL);
      console.log(`[phase3-interact] 返回搜索页 tab index=${resolvedKeepIndex}`);
    } else {
      console.log('[phase3-interact] 未找到可回退的 Tab，跳过切换');
    }
    lock.release();
  }
}

main();

