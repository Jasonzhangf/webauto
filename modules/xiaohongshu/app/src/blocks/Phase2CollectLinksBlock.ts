/**
 * Phase 2 Block: 采集安全链接
 * 
 * 职责：通过容器点击进入详情，获取带 xsec_token 的安全 URL
 */

import { ContainerRegistry } from '../../../../container-registry/src/index.js';
import { execute as waitSearchPermit } from '../../../../workflow/blocks/WaitSearchPermitBlock.js';
import { execute as phase2Search } from './Phase2SearchBlock.js';
import { execute as discoverFallback } from './XhsDiscoverFallbackBlock.js';
import { detectXhsCheckpoint, ensureXhsCheckpoint } from '../utils/checkpoints.js';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { controllerAction, delay } from '../utils/controllerAction.js';

export interface CollectLinksInput {
  keyword: string;
  targetCount: number;
  profile?: string;
  unifiedApiUrl?: string;
  env?: string;
  alreadyCollectedNoteIds?: string[];
  onLink?: (link: {
    noteId: string;
    safeUrl: string;
    searchUrl: string;
    ts: string;
  }, meta: { collected: number; targetCount: number }) => Promise<void> | void;
}

export interface CollectLinksOutput {
  links: Array<{
    noteId: string;
    safeUrl: string;
    searchUrl: string;
    ts: string;
  }>;
  totalCollected: number;
  termination?: 'reached_target' | 'no_progress_after_3_retries';
}

// controllerAction/delay are shared utilities (with safer timeouts) to avoid per-block drift.

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeRepeated(value: string, maxRounds = 3) {
  let current = value;
  for (let i = 0; i < maxRounds; i++) {
    const next = decodeURIComponentSafe(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function getKeywordFromSearchUrl(searchUrl: string) {
  try {
    const url = new URL(searchUrl);
    const raw = url.searchParams.get('keyword') || '';
    if (raw) {
      const decoded = decodeRepeated(raw);
      return decoded.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function matchesKeywordFromSearchUrlStrict(searchUrl: string, keyword: string) {
  return getKeywordFromSearchUrl(searchUrl) === keyword;
}

function resolveDownloadRoot() {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

function isDebugArtifactsEnabled() {
  return (
    process.env.WEBAUTO_DEBUG === '1' ||
    process.env.WEBAUTO_DEBUG_ARTIFACTS === '1' ||
    process.env.WEBAUTO_DEBUG_SCREENSHOT === '1'
  );
}

function isValidSearchUrl(searchUrl: string, keyword: string) {
  try {
    const url = new URL(searchUrl);
    if (!url.hostname.endsWith('xiaohongshu.com')) return false;
    if (!url.pathname.includes('/search_result')) return false;
    return matchesKeywordFromSearchUrlStrict(searchUrl, keyword);
  } catch {
    return false;
  }
}

function isValidSafeUrl(safeUrl: string) {
  try {
    const url = new URL(safeUrl);
    if (!url.hostname.endsWith('xiaohongshu.com')) return false;
    if (!/\/explore\/[a-f0-9]+/.test(url.pathname)) return false;
    if (!url.searchParams.get('xsec_token')) return false;
    return true;
  } catch {
    return false;
  }
}

async function clickDiscoverAndRetrySearch(opts: {
  profile: string;
  unifiedApiUrl: string;
  keyword: string;
  env: string;
  appendTrace: (row: Record<string, any>) => Promise<void>;
}) {
  const { profile, unifiedApiUrl, keyword, env, appendTrace } = opts;
  await appendTrace({ type: 'discover_fallback_block_start', ts: new Date().toISOString() });
  const out = await discoverFallback({ profile, unifiedApiUrl, keyword, env });
  await appendTrace({ type: 'discover_fallback_block_done', ts: new Date().toISOString(), out });
  if (!out.success) {
    throw new Error(`[Phase2Collect] Discover fallback block failed: checkpoint=${out.finalCheckpoint} url=${out.finalUrl} screenshot=${out.screenshotPath || ''} dom=${out.domDumpPath || ''}`);
  }
}

function getExploreIdFromUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    const m = url.pathname.match(/\/explore\/([a-f0-9]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function normalizeNoteId(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const fromPath = value.match(/\/explore\/([a-f0-9]+)/i);
  if (fromPath?.[1]) return fromPath[1].toLowerCase();
  if (/^[a-f0-9]{8,}$/i.test(value)) return value.toLowerCase();
  return null;
}

export async function execute(input: CollectLinksInput): Promise<CollectLinksOutput> {
  const {
    keyword,
    targetCount,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
    env = 'debug',
    alreadyCollectedNoteIds = [],
    onLink,
  } = input;

 console.log(`[Phase2CollectLinks] 目标: ${targetCount} 条链接`);

  // Ensure we are in a safe starting state (search). Recover from detail/comments if needed.
  const ensureRes = await ensureXhsCheckpoint({
    sessionId: profile,
    target: 'search_ready',
    serviceUrl: unifiedApiUrl,
    timeoutMs: 15000,
    allowOneLevelUpFallback: true,
  });
  if (!ensureRes.success && ensureRes.reached !== 'home_ready' && ensureRes.reached !== 'search_ready') {
    throw new Error(`[Phase2CollectLinks] ensure checkpoint failed: reached=${ensureRes.reached} url=${ensureRes.url}`);
  }

  // 开发期硬门禁：进入采集前先定位，避免在详情/风控态继续执行。
  const det = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });
  console.log(`[Phase2CollectLinks] locate: checkpoint=${det.checkpoint} url=${det.url}`);
  if (det.checkpoint === 'risk_control' || det.checkpoint === 'login_guard' || det.checkpoint === 'offsite') {
    throw new Error(`[Phase2CollectLinks] hard_stop checkpoint=${det.checkpoint} url=${det.url}`);
  }

  const links: CollectLinksOutput['links'] = [];
  const seen = new Set<string>();
  const seenNoteIds = new Set<string>(
    alreadyCollectedNoteIds
      .map((id) => normalizeNoteId(String(id || '')))
      .filter((id): id is string => Boolean(id)),
  );
  const seenExploreIds = new Set<string>(Array.from(seenNoteIds));
  const registry = new ContainerRegistry();
  await registry.load();
  let attempts = 0;
  const maxAttempts = targetCount * 6;
  let scrollCount = 0;
  let scrollLocked = false;
  const debugArtifactsEnabled = isDebugArtifactsEnabled();
  let scrollForVisibilityCount = 0; // Separate counter for visibility scrolls
  let noProgressRetryCount = 0;
  const maxNoProgressRetries = 3;
  let lastLinksCount = 0;
  const traceDir = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'click-trace');
  const tracePath = path.join(traceDir, 'trace.jsonl');

  const ensureTraceDir = async () => {
    if (!debugArtifactsEnabled) return;
    await fs.mkdir(traceDir, { recursive: true });
  };

  const appendTrace = async (row: Record<string, any>) => {
    if (!debugArtifactsEnabled) return;
    await ensureTraceDir();
    await fs.appendFile(tracePath, `${JSON.stringify(row)}\n`, 'utf8');
  };

  const saveScreenshot = async (base64: string, fileName: string) => {
    if (!debugArtifactsEnabled) return null;
    await ensureTraceDir();
    const buf = Buffer.from(base64, 'base64');
    const filePath = path.join(traceDir, fileName);
    await fs.writeFile(filePath, buf);
    return filePath;
  };

  let preClickStallCount = 0;
  const preClickStallThreshold = 12;
  const recoverFromPreClickStall = async (reason: string, extra: Record<string, any> = {}) => {
    preClickStallCount += 1;
    if (preClickStallCount < preClickStallThreshold) return;

    console.log(
      `[Phase2Collect] pre-click stall ${preClickStallCount}/${preClickStallThreshold} reason=${reason}, forcing scroll`,
    );
    await appendTrace({
      type: 'pre_click_stall_scroll',
      ts: new Date().toISOString(),
      reason,
      stallCount: preClickStallCount,
      ...extra,
    });

    await controllerAction('container:operation', {
      containerId: 'xiaohongshu_search.search_result_list',
      operationId: 'scroll',
      sessionId: profile,
      config: { direction: 'down', amount: 700 },
    }, unifiedApiUrl);
    scrollCount++;
    preClickStallCount = 0;
    await delay(600);
  };

  const readCurrentUrl = async () =>
    controllerAction('browser:execute', {
      profile,
      script: 'window.location.href',
    }, unifiedApiUrl).then((res) => String(res?.result || res?.data?.result || ''));

  const waitForSafeExploreUrl = async (timeoutMs = 4800, intervalMs = 250) => {
    const startMs = Date.now();
    let lastUrl = '';
    while (Date.now() - startMs < timeoutMs) {
      const url = await readCurrentUrl();
      if (url) lastUrl = url;
      if (url.includes('/explore/') && url.includes('xsec_token=')) {
        return { safeUrl: url, lastUrl: url, waitedMs: Date.now() - startMs };
      }
      await delay(intervalMs);
    }
    return { safeUrl: '', lastUrl, waitedMs: Date.now() - startMs };
  };

  type ClickPoint = { x: number; y: number; name?: string };
  const performCoordinateClick = async (point: ClickPoint): Promise<{ ok: boolean; error?: string }> => {
    try {
      const x = Math.round(Number(point?.x));
      const y = Math.round(Number(point?.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, error: 'invalid_click_point' };
      }
      await controllerAction('mouse:click', { profileId: profile, x, y, clicks: 1 }, unifiedApiUrl);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e || 'mouse_click_failed') };
    }
  };

  // Updated by ensureOnExpectedSearch once we confirmed we are on the correct search_result.
  // Used as a safe fallback to return from detail pages without triggering a new search.
  let expectedSearchUrl = '';

  const ensureOnExpectedSearch = async () => {
    const currentUrl = await controllerAction('browser:execute', {
      profile,
      script: 'window.location.href',
    }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

    if (!currentUrl || typeof currentUrl !== 'string') {
      throw new Error('[Phase2Collect] 无法读取当前 URL');
    }

    // XHS 在某些情况下 URL 会停留在 /explore/<id>，但 DOM 已经是搜索结果页。
    // 这里不能只依赖 URL，需要用 DOM 信号判断是否已经在 search_result。
    const looksLikeSearchResult = await controllerAction('browser:execute', {
      profile,
      script: `(function(){
        const hasResultList = !!document.querySelector('.feeds-container, .search-result-list, .note-list');
        const hasFilter = !!document.querySelector('.tabs, .filter-tabs, [role="tablist"], .filter');
        return Boolean(hasResultList || hasFilter);
      })()`,
    }, unifiedApiUrl).then(res => Boolean(res?.result || res?.data?.result));

    if (!currentUrl.includes('/search_result') && !looksLikeSearchResult) {
      const waitForSearchResult = async (maxWaitMs: number) => {
        const start = Date.now();
        let url = '';
        while (Date.now() - start < maxWaitMs) {
          await delay(400);
          url = await controllerAction('browser:execute', {
            profile,
            script: 'window.location.href',
          }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');
          if (typeof url === 'string' && url.includes('/search_result')) return url;
        }
        return url;
      };

      // 先基于 checkpoint 做状态确认
      const det = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });

      // 详情页：先用 ESC 回退
      if (det.checkpoint === 'detail_ready' || det.checkpoint === 'comments_ready') {
        for (let i = 0; i < 3; i += 1) {
          await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' }, unifiedApiUrl);
          const afterEsc = await waitForSearchResult(5000);
          if (typeof afterEsc === 'string' && afterEsc.includes('/search_result')) return afterEsc;
        }
      }

  // 禁止刷新兜底：不使用 goto 回到 search_result（高风控）。
       // 如果无法回到搜索页，直接停止交由人工处理。
       if (!expectedSearchUrl) {
         throw new Error(`[Phase2Collect] expectedSearchUrl 为空，且当前不在搜索结果页（URL/DOM），停止（避免刷新）。current=${String(currentUrl)}`);
       }

       throw new Error(
       `[Phase2Collect] 当前不在搜索结果页（checkpoint=${det.checkpoint}），停止（避免 goto 刷新）。current=${String(currentUrl)} expected=${String(expectedSearchUrl)}`,
      );
    }
    
    // 如果仍然是 /explore/<id> URL 但 DOM 已渲染搜索结果（XHS shell-page 行为），
    // 避免任何 refresh/goto/Discover 回退：直接合成 search_result URL 作为 expectedSearchUrl。
    if (currentUrl.includes('/explore/') && looksLikeSearchResult) {
      const inputVal = await controllerAction(
        'browser:execute',
        {
          profile,
          script: `(function(){
            const el = document.querySelector('#search-input') || document.querySelector('input[type="search"]') || document.querySelector('input[placeholder*="搜索"], input[placeholder*="关键字"]');
            if (!el) return '';
            return String(el.value || '').trim();
          })()`,
        },
        unifiedApiUrl,
      ).then((res) => String(res?.result || res?.data?.result || '').trim());

      if (inputVal && inputVal === keyword) {
        console.warn(`[Phase2Collect] shell-page detected (input matches); using current URL`);
        return String(currentUrl || '') || '';
      }
    }

    // If we're already on /search_result and keyword matches, accept.
    if (matchesKeywordFromSearchUrlStrict(currentUrl, keyword)) {
      return currentUrl;
    }

    // If DOM looks like search results but URL is not /search_result, treat as shell-page.
    // Avoid any Enter/refresh/goto; synthesize expectedSearchUrl from the input value.
    if (!currentUrl.includes('/search_result') && looksLikeSearchResult) {
      const inputVal = await controllerAction('browser:execute', {
        profile,
        script: `(function(){
          const el = document.querySelector('#search-input') || document.querySelector('input[type="search"]') || document.querySelector('input[placeholder*="搜索"], input[placeholder*="关键字"]');
          if (!el) return '';
          return String(el.value || '').trim();
        })()`,
      }, unifiedApiUrl).then(res => String(res?.result || res?.data?.result || '').trim());

      if (inputVal && inputVal === keyword) {
        const synthesized = new URL('https://www.xiaohongshu.com/search_result');
        synthesized.searchParams.set('keyword', keyword);
        console.warn(`[Phase2Collect] shell-page detected (non-search URL); proceed without synth, using DOM results`);
        return String(currentUrl || '') || '';
      }
      // Fall through: shell-page with matching DOM is allowed (no synth URL)
      console.warn(`[Phase2Collect] shell-page with matching DOM allowed, using current URL`);
      return String(currentUrl || '') || '';
    }

    const actual = getKeywordFromSearchUrl(currentUrl);
    console.warn(`[Phase2Collect] 检测到搜索漂移：expected="${keyword}" actual="${actual}" url=${currentUrl}`);
    if (debugArtifactsEnabled) {
      try {
        const shot = await controllerAction('browser:screenshot', { profileId: profile, fullPage: false }, unifiedApiUrl)
          .then(res => res?.data || res?.result || res?.data?.data || '');
        if (typeof shot === 'string' && shot) {
          const file = await saveScreenshot(shot, `drift-${Date.now()}.png`);
          await appendTrace({ type: 'drift', ts: new Date().toISOString(), expected: keyword, actual, url: currentUrl, screenshot: file });
        }
      } catch {
        // ignore screenshot failures
      }
    }
    // 开发阶段允许一次 Discover 回退（轻度风控），避免连续重搜触发风控。
    console.warn('[Phase2Collect] Drift detected: attempting Discover fallback (once)');
    await appendTrace({ type: 'discover_fallback_start', ts: new Date().toISOString(), url: currentUrl });
    try {
      await clickDiscoverAndRetrySearch({ profile, unifiedApiUrl, keyword, env, appendTrace });
      const urlAfter = await controllerAction('browser:execute', { profile, script: 'window.location.href' }, unifiedApiUrl)
        .then(res => res?.result || res?.data?.result || '');
      if (typeof urlAfter === 'string' && matchesKeywordFromSearchUrlStrict(urlAfter, keyword)) {
        await appendTrace({ type: 'discover_fallback_ok', ts: new Date().toISOString(), url: urlAfter });
        return urlAfter;
      }
    } catch (fallbackError) {
      await appendTrace({ type: 'discover_fallback_fail', ts: new Date().toISOString(), error: String(fallbackError) });
    }

    // Discover fallback failed; stop to avoid repeated searches.
    throw new Error(`[Phase2Collect] 搜索关键词漂移，Discover fallback 失败，停止执行。url=${currentUrl}`);
  };

  // 进入采集前，先固定一个"期望 searchUrl"（必须为 /search_result?keyword=<keyword> 且严格匹配）
  let fallbackAttempts = 0;
  while (fallbackAttempts < 1) {
    try {
      expectedSearchUrl = await ensureOnExpectedSearch();
      break; // Success, exit loop
    } catch (e: any) {
      throw e; // Other errors: rethrow
    }
  }
  if (!expectedSearchUrl) {
    throw new Error('[Phase2Collect] Failed to resolve expectedSearchUrl after fallback');
  }
  if (!isValidSearchUrl(expectedSearchUrl, keyword)) {
    throw new Error(`[Phase2Collect] expectedSearchUrl invalid for keyword="${keyword}": ${String(expectedSearchUrl)}`);
  }
  console.log(`[Phase2Collect] expectedSearchUrl=${expectedSearchUrl}`);

  // Now that we have a confirmed expectedSearchUrl, we can enable scrollLocked if the first view
  // already contains enough cards to meet targetCount.
  const initialCheckResult = await controllerAction('browser:execute', {
    profile,
    script: `(function(){
      const itemSelector = '.note-item, [data-note-id], a[href*="/explore/"]';
      const nodes = Array.from(document.querySelectorAll(itemSelector));
      return { totalCards: nodes.length };
    })()`,
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || { totalCards: 0 });

  const initialTotalCards = Number(initialCheckResult?.totalCards ?? 0);
  if (Number.isFinite(initialTotalCards) && initialTotalCards >= targetCount) {
    scrollLocked = false;
    console.log(`[Phase2Collect] scrollLocked=false (allow scrolling even if total>=target)`);
  }

  try {
  while (links.length < targetCount && attempts < maxAttempts) {
    await appendTrace({ type: 'while_loop_start', ts: new Date().toISOString(), attempt: attempts + 1, collected: links.length, targetCount });
    attempts++;

    // 0. 每轮开始应该处于搜索结果页，但避免每轮都通过 URL/DOM 重新定位（风控敏感）。
    // Phase2 输出强绑定“冻结的 expectedSearchUrl”，并在 per-note 校验处做严格 gate。
    const searchUrl = expectedSearchUrl;

    // 2. 解析搜索结果卡片 selector（来自容器定义）
    const defs: any = registry.getContainersForUrl(searchUrl);
    const itemDef: any = defs?.['xiaohongshu_search.search_result_item'];
    const selectorDefs: any[] = Array.isArray(itemDef?.selectors) ? itemDef.selectors : [];
    const primarySelectorDef = selectorDefs.find((s: any) => s?.variant === 'primary') || selectorDefs[0];
    const itemSelector = String(primarySelectorDef?.css || '.note-item');

    // 3. “一次只挑一个目标”：按 DOM 顺序找下一个未处理且可见的 item；如果顶部/底部被遮挡，先滚动到完全可见再操作。
    type PickResult = {
      action: 'ok' | 'scroll';
      index?: number;
      exploreId?: string;
      scroll?: { direction: 'up' | 'down'; amount: number; reason: string };
      rect?: { top: number; bottom: number; width: number; height: number };
      debug?: { total: number; pad: number; viewportH: number };
    };

    const pick: PickResult = await controllerAction('browser:execute', {
      profile,
      script: `(function(){
  const sel = ${JSON.stringify(itemSelector)};
  const seen = new Set(${JSON.stringify(Array.from(seenExploreIds))});
  const nodes = Array.from(document.querySelectorAll(sel));
  const pad = 8;
  const vh = window.innerHeight;

  function clampAmount(v){
    const n = Math.ceil(Number(v) || 0);
    if (n <= 0) return 200;
    return Math.min(800, n);
  }

  const candidates = [];
  let scrollUp = null;
  let scrollDown = null;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const exploreA = node.querySelector('a[href*="/explore/"]');
    const exploreHref = exploreA ? (exploreA.getAttribute('href') || '') : '';
    const m = exploreHref.match(/\\/explore\\/([a-f0-9]+)/);
    const exploreId = m ? m[1] : '';
    if (!exploreId || seen.has(exploreId)) continue;

    const r = node.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;

    if (r.top < pad) {
      const amount = clampAmount((pad - r.top) + 24);
      if (!scrollUp || amount > scrollUp.amount) {
        scrollUp = {
          direction: 'up',
          amount,
          reason: 'top_clipped',
          index: i,
          exploreId,
          rect: { top: r.top, bottom: r.bottom, width: r.width, height: r.height },
        };
      }
      continue;
    }

    if (r.bottom > (vh - pad)) {
      const amount = clampAmount((r.bottom - (vh - pad)) + 24);
      if (!scrollDown || amount > scrollDown.amount) {
        scrollDown = {
          direction: 'down',
          amount,
          reason: 'bottom_clipped',
          index: i,
          exploreId,
          rect: { top: r.top, bottom: r.bottom, width: r.width, height: r.height },
        };
      }
      continue;
    }

    candidates.push({
      index: i,
      exploreId,
      rect: { top: r.top, bottom: r.bottom, width: r.width, height: r.height },
    });
  }

  if (candidates.length > 0) {
    const randomIdx = Math.floor(Math.random() * candidates.length);
    const chosen = candidates[randomIdx];
    return {
      action: 'ok',
      index: chosen.index,
      exploreId: chosen.exploreId,
      rect: chosen.rect,
      debug: {
        total: nodes.length,
        pad,
        viewportH: vh,
        candidatesCount: candidates.length,
        pick: 'random',
        chosenIdx: randomIdx,
      },
    };
  }

  if (scrollUp || scrollDown) {
    const scroll = scrollUp || scrollDown;
    return {
      action: 'scroll',
      index: scroll.index,
      exploreId: scroll.exploreId,
      rect: scroll.rect,
      scroll: { direction: scroll.direction, amount: scroll.amount, reason: scroll.reason },
      debug: {
        total: nodes.length,
        pad,
        viewportH: vh,
        candidatesCount: 0,
      },
    };
  }

  return {
    action: 'scroll',
    scroll: { direction: 'down', amount: 800, reason: 'no_unseen_candidates' },
    debug: { total: nodes.length, pad, viewportH: vh, candidatesCount: 0 },
  };
})()`,
    }, unifiedApiUrl).then(res => res?.result || res?.data?.result || null);

    if (!pick || typeof pick !== 'object') {
      throw new Error('[Phase2Collect] pick target failed: empty result');
    }

    // Safety: if we haven't made progress for too long, re-verify the checkpoint to avoid shell-page drift.
    if (noProgressRetryCount >= maxNoProgressRetries) {
      const det = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });
      console.log(`[Phase2Collect] noProgress detected, checkpoint=${det.checkpoint} url=${det.url}`);
      if (det.checkpoint !== 'search_ready' && det.checkpoint !== 'home_ready') {
        throw new Error(`[Phase2Collect] 进入异常状态，停止采集。checkpoint=${det.checkpoint} url=${det.url}`);
      }
      // reset retry counter after checkpoint check
      noProgressRetryCount = 0;
    }

    await appendTrace({ type: 'pick_done', ts: new Date().toISOString(), attempt: attempts, pick });

    if (pick.action === 'scroll' && pick.scroll) {
      const total = Number((pick as any)?.debug?.total ?? 0);
      const candidatesCount = Number((pick as any)?.debug?.candidatesCount ?? 0);
      
      // Only lock scroll if we have both:
      // 1) Enough total cards in DOM (total >= targetCount)
      // 2) At least one visible candidate we can click
      // If candidatesCount=0 even with total>=target, we MUST keep scrolling to find visible items.
      const visibleEnough = Number.isFinite(total) && total >= targetCount && candidatesCount > 0;
      if (visibleEnough) {
        if (!scrollLocked) {
          scrollLocked = true;
          console.log(`[Phase2Collect] scrollLocked=true (total=${total} >= target=${targetCount}) - skip scroll`);
        }
        // Continue to next attempt; pick() should now return action=ok because we won't scroll.
        attempts++;
        await delay(200);
        continue;
      }
      console.log(`[Phase2Collect] scroll: reason=${pick.scroll.reason} dir=${pick.scroll.direction} amount=${pick.scroll.amount} visibleCount=${(pick as any)?.debug?.visibleCount ?? 'n/a'} total=${(pick as any)?.debug?.total ?? 'n/a'}`);
      await appendTrace({
        type: 'pick_scroll',
        ts: new Date().toISOString(),
        attempt: attempts,
        collected: links.length,
        searchUrl,
        itemSelector,
        pick,
      });

      await controllerAction('container:operation', {
        containerId: 'xiaohongshu_search.search_result_list',
        operationId: 'scroll',
        sessionId: profile,
        config: { direction: pick.scroll.direction, amount: pick.scroll.amount },
      }, unifiedApiUrl);
      scrollCount++;

      // No-progress detection: if links.length hasn't changed after scroll
      if (links.length === lastLinksCount) {
        noProgressRetryCount++;
        console.log(`[Phase2Collect] no progress after scroll: retry ${noProgressRetryCount}/${maxNoProgressRetries}`);

        if (noProgressRetryCount >= maxNoProgressRetries) {
          console.log(`[Phase2Collect] terminating: no_progress_after_${maxNoProgressRetries}_retries, collected=${links.length}/${targetCount}`);
          await appendTrace({
            type: 'terminate_no_progress',
            ts: new Date().toISOString(),
            collected: links.length,
            targetCount,
            scrollCount,
            noProgressRetryCount,
          });
          break; // Exit while loop
        }

        // Backtrack strategy: scroll up then down to try different viewport
        console.log(`[Phase2Collect] backtrack: scroll up 400 then down 800`);
        await controllerAction('container:operation', {
          containerId: 'xiaohongshu_search.search_result_list',
          operationId: 'scroll',
          sessionId: profile,
          config: { direction: 'up', amount: 400 },
        }, unifiedApiUrl);
        await delay(800);

        await controllerAction('container:operation', {
          containerId: 'xiaohongshu_search.search_result_list',
          operationId: 'scroll',
          sessionId: profile,
          config: { direction: 'down', amount: 800 },
        }, unifiedApiUrl);
      } else {
        // Reset counter when we make progress
        noProgressRetryCount = 0;
        lastLinksCount = links.length;
      }

      await delay(1200);
      continue;
    }

    const domIndex = Number(pick.index ?? -1);
    if (!Number.isFinite(domIndex) || domIndex < 0) {
      throw new Error(`[Phase2Collect] invalid picked index: ${String(pick.index)}`);
    }

    // Ensure candidate is fully visible before highlight + click.
    // Fully visible = rect.top >= pad && rect.bottom <= viewportH - pad
    // This prevents unstable clicks on partially clipped cards.
    const ensureVisibleMaxRounds = 4;
    const ensureVisiblePad = 12;
    let lastRect: any = null;
    for (let vr = 0; vr < ensureVisibleMaxRounds; vr++) {
      const rectCheck = await controllerAction('browser:execute', {
        profile,
        script: `(function(){
  const sel = ${JSON.stringify(itemSelector)};
  const idx = ${JSON.stringify(domIndex)};
  const nodes = Array.from(document.querySelectorAll(sel));
  if (idx < 0 || idx >= nodes.length) return { ok: false, error: 'index_out_of_range', idx, len: nodes.length };
  const node = nodes[idx];
  const r = node.getBoundingClientRect();
  const pad = ${ensureVisiblePad};
  const vh = window.innerHeight;
  return {
    ok: true,
    idx,
    rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height },
    visible: {
      fully: (r.top >= pad && r.bottom <= (vh - pad)),
      topClipped: r.top < pad,
      bottomClipped: r.bottom > (vh - pad),
    },
    viewportH: vh,
    pad,
  };
})()`,
      }, unifiedApiUrl).then(res => res?.result || res?.data?.result || null);

      if (!rectCheck || rectCheck.ok !== true) {
        throw new Error(`[Phase2Collect] ensureVisible rect check failed: ${JSON.stringify(rectCheck)}`);
      }

      lastRect = rectCheck.rect || lastRect;
      if (rectCheck.visible?.fully) {
        if (vr > 0) {
          console.log(`[Phase2Collect] ensureVisible satisfied after ${vr} round(s), index=${domIndex}`);
        }
        break;
      }

      const scrollDir = rectCheck.visible?.topClipped ? 'up' : 'down';
      const scrollAmount = Math.ceil(
        rectCheck.visible?.topClipped
          ? (ensureVisiblePad - rectCheck.rect.top) + 24
          : (rectCheck.rect.bottom - (rectCheck.viewportH - ensureVisiblePad)) + 24,
      );

      console.log(`[Phase2Collect] ensureVisible round=${vr + 1}/${ensureVisibleMaxRounds} index=${domIndex} dir=${scrollDir} amount=${scrollAmount}`);
      await appendTrace({
        type: 'ensure_visible_scroll',
        ts: new Date().toISOString(),
        attempt: attempts,
        collected: links.length,
        domIndex,
        scrollForVisibilityCount,
        scrollDir,
        scrollAmount,
        rectBefore: rectCheck.rect,
      });

      await controllerAction('container:operation', {
        containerId: 'xiaohongshu_search.search_result_list',
        operationId: 'scroll',
        sessionId: profile,
        config: { direction: scrollDir, amount: scrollAmount },
      }, unifiedApiUrl);
      scrollForVisibilityCount++;
      await delay(400);
    }

    const exploreId = normalizeNoteId(String(pick.exploreId || '')) || '';
    if (exploreId && seenNoteIds.has(exploreId)) {
      console.log(`[Phase2Collect] skip pre-click: already_collected noteId=${exploreId}`);
      await appendTrace({ type: 'skip_existing_note_preclick', ts: new Date().toISOString(), domIndex, noteId: exploreId });
      await recoverFromPreClickStall('skip_existing_note_preclick', { domIndex, noteId: exploreId });
      await delay(80);
      continue;
    }
    // 4. 点击第 N 个搜索结果卡片（通过 DOM 下标精确定位，避免依赖 href）
        await appendTrace({ type: 'highlight_start', ts: new Date().toISOString(), attempt: attempts, domIndex, exploreId });
    let highlightInfo: any = null;

    try {
      await appendTrace({ type: 'highlight_calling', ts: new Date().toISOString(), domIndex });
      highlightInfo = await controllerAction('container:operation', {
        containerId: 'xiaohongshu_search.search_result_item',
        operationId: 'highlight',
        sessionId: profile,
        config: { index: domIndex, duration: 900 },
      }, unifiedApiUrl);
    } catch {
      highlightInfo = null;
    }

    await appendTrace({ type: 'highlight_done', ts: new Date().toISOString(), attempt: attempts, domIndex, highlightInfo });

    let preScreenshotPath: string | null = null;
    if (debugArtifactsEnabled) {
      try {
        const shot = await controllerAction('browser:screenshot', { profileId: profile, fullPage: false }, unifiedApiUrl)
          .then(res => res?.data || res?.result || res?.data?.data || '');
        if (typeof shot === 'string' && shot) {
          const name = `click-${String(attempts).padStart(4, '0')}-idx-${String(domIndex).padStart(4, '0')}-${Date.now()}.png`;
          preScreenshotPath = await saveScreenshot(shot, name);
        }
      } catch {
        preScreenshotPath = null;
      }
    }

    await appendTrace({
      type: 'click_before',
      ts: new Date().toISOString(),
      attempt: attempts,
      collected: links.length,
      domIndex,
      scrollCount,
      searchUrl,
      exploreId,
      pick,
      highlight: highlightInfo,
      screenshot: preScreenshotPath,
    });

    // === RIGID CLICK GATE: Re-verify before click ===
    // Gate 1: Re-read element signature at same index, must match pick
    const preClickVerifyRaw = await controllerAction('browser:execute', {
      profile,
      script: `(function(){
        const items = document.querySelectorAll('.note-item, [data-note-id], a[href*="/explore/"]');
        if (${domIndex} >= items.length) return {ok:false, reason:'index_out_of_range'};
        const el = items[${domIndex}];
        const rect = el.getBoundingClientRect();
        // Hit-test center point
        const cx = rect.left + rect.width/2;
        const cy = rect.top + rect.height/2;
        const hitEl = document.elementFromPoint(cx, cy);
        const hitOk = hitEl && (el === hitEl || el.contains(hitEl) || hitEl.contains(el));
        const x1 = Math.max(0, rect.left);
        const y1 = Math.max(0, rect.top);
        const x2 = Math.min(window.innerWidth, rect.right);
        const y2 = Math.min(window.innerHeight, rect.bottom);
        const points = [
          { name: 'center', x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
          { name: 'left_mid', x: x1 + 14, y: (y1 + y2) / 2 },
          { name: 'right_mid', x: x2 - 14, y: (y1 + y2) / 2 },
          { name: 'top_mid', x: (x1 + x2) / 2, y: y1 + 14 },
          { name: 'bottom_mid', x: (x1 + x2) / 2, y: y2 - 14 },
        ];
        const clickPoints = [];
        for (const p of points) {
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
          if (p.x < 0 || p.y < 0 || p.x > window.innerWidth || p.y > window.innerHeight) continue;
          const hp = document.elementFromPoint(p.x, p.y);
          if (hp && (el === hp || el.contains(hp) || hp.contains(el))) {
            clickPoints.push({ name: p.name, x: Math.round(p.x), y: Math.round(p.y) });
          }
        }
        const noteLike =
          el.getAttribute('data-note-id') ||
          el.getAttribute('href') ||
          (el.querySelector && el.querySelector('a[href*="/explore/"]')
            ? el.querySelector('a[href*="/explore/"]').getAttribute('href')
            : '') || '';
        return {
          ok: hitOk,
          reason: hitOk ? 'hit_test_pass' : 'hit_test_fail',
          rect: {left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom},
          clickPoints,
          noteId: noteLike,
        };
      })()`,
    }, unifiedApiUrl);
    const preClickVerify = preClickVerifyRaw?.data?.result ?? preClickVerifyRaw?.result ?? preClickVerifyRaw?.data ?? preClickVerifyRaw ?? {ok:false};

    const preClickReason = String(preClickVerify?.reason || 'unknown');
    const softHitTestPass = !preClickVerify?.ok && preClickReason === 'hit_test_fail';
    if (!preClickVerify?.ok && !softHitTestPass) {
      console.warn(`[Phase2Collect] Rigid gate blocked click index=${domIndex}: ${preClickReason}`);
      await recoverFromPreClickStall('rigid_gate_blocked', { domIndex, gateReason: preClickReason });
      await delay(300);
      continue; // Re-pick next iteration
    }
    const preClickNoteId = normalizeNoteId(String(preClickVerify?.noteId || '')) || '';
    if (!preClickNoteId) {
      console.warn(`[Phase2Collect] Rigid gate blocked click index=${domIndex}: missing_note_id`);
      await appendTrace({ type: 'skip_missing_noteid_gate', ts: new Date().toISOString(), domIndex });
      await recoverFromPreClickStall('missing_noteid_gate', { domIndex });
      await delay(120);
      continue;
    }
    if (seenNoteIds.has(preClickNoteId)) {
      console.log(`[Phase2Collect] skip by gate: already_collected noteId=${preClickNoteId}`);
      await appendTrace({ type: 'skip_existing_note_gate', ts: new Date().toISOString(), domIndex, noteId: preClickNoteId });
      await recoverFromPreClickStall('skip_existing_note_gate', { domIndex, noteId: preClickNoteId });
      await delay(80);
      continue;
    }
    if (softHitTestPass) {
      console.warn(`[Phase2Collect] Rigid gate soft-pass index=${domIndex}: hit_test_fail, continue with coordinate click points`);
      await appendTrace({ type: 'rigid_gate_soft_pass', ts: new Date().toISOString(), domIndex, reason: preClickReason, noteId: preClickNoteId });
    } else {
      console.log(`[Phase2Collect] Rigid gate passed index=${domIndex}, hit-test ok noteId=${preClickNoteId}`);
    }

    // Phase-based timeout tracking.
    // Click using verified in-card points and only accept if URL has /explore/ + xsec_token.
    const gateRect = preClickVerify?.rect || lastRect;
    const clickStartMs = Date.now();
    const clickPointsFromGate = Array.isArray(preClickVerify?.clickPoints) ? preClickVerify.clickPoints : [];
    const clickPoints: ClickPoint[] = [];
    const pushPoint = (p: any, name?: string) => {
      const x = Math.round(Number(p?.x));
      const y = Math.round(Number(p?.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (clickPoints.some((it) => it.x === x && it.y === y)) return;
      clickPoints.push({ x, y, name: String(name || p?.name || 'point') });
    };
    for (const p of clickPointsFromGate) pushPoint(p, p?.name);
    if (gateRect && gateRect.left !== undefined && gateRect.top !== undefined) {
      pushPoint(
        {
          x: Math.round((Number(gateRect.left) + Number(gateRect.right)) / 2),
          y: Math.round((Number(gateRect.top) + Number(gateRect.bottom)) / 2),
        },
        'center_fallback',
      );
    }
    const clickErrors: Array<{ strategy: string; error: string }> = [];
    let safeUrl = '';
    let urlAfterClick = '';
    let navWaitMs = 0;
    for (const point of clickPoints.slice(0, 3)) {
      const strategy = `point:${String(point?.name || 'unknown')}`;
      const clickRes = await performCoordinateClick(point);
      if (!clickRes.ok) {
        const errText = String(clickRes.error || 'unknown_click_error');
        clickErrors.push({ strategy, error: errText });
        console.warn(`[Phase2Collect] Click strategy failed: strategy=${strategy} reason=${errText}`);
        continue;
      }
      await delay(450);
      const navProbe = await waitForSafeExploreUrl(4800, 250);
      navWaitMs += Number(navProbe.waitedMs || 0);
      if (navProbe.lastUrl) urlAfterClick = navProbe.lastUrl;
      if (navProbe.safeUrl) {
        safeUrl = navProbe.safeUrl;
        break;
      }

      await appendTrace({
        type: 'click_strategy_miss',
        ts: new Date().toISOString(),
        domIndex,
        strategy,
        point,
        url: navProbe.lastUrl,
        waitedMs: navProbe.waitedMs,
      });
      console.warn(
        `[Phase2Collect] Click strategy no-open: strategy=${strategy} url=${String(navProbe.lastUrl || '')} waitedMs=${Number(navProbe.waitedMs || 0)}`,
      );

      // When detail opened but URL lacks xsec_token, exit and retry next strategy.
      if (navProbe.lastUrl.includes('/explore/') && !navProbe.lastUrl.includes('xsec_token=')) {
        await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' }, unifiedApiUrl).catch(() => {});
        await delay(500);
      }
    }

    const clickPhaseMs = Date.now() - clickStartMs;
    if (clickPoints.length === 0) {
      clickErrors.push({ strategy: 'point:none', error: 'no_click_point' });
    }
    const clickStrategies = clickPoints.slice(0, 3).map((p) => `point:${String(p?.name || 'unknown')}`);
    console.log(`[Phase2Collect] click phase took ${clickPhaseMs}ms strategies=${clickStrategies.join('->')}`);

    // Rigid post-click gate: must have /explore/ and xsec_token
    if (!safeUrl) {
      const hasExplore = urlAfterClick.includes('/explore/');
      const hasXsec = urlAfterClick.includes('xsec_token=');
      console.warn(`[Phase2Collect] Post-click gate FAILED: explore=${hasExplore} xsec=${hasXsec}, will retry same index`);
      await appendTrace({
        type: 'click_no_xsec_retry',
        ts: new Date().toISOString(),
        index: domIndex,
        url: urlAfterClick,
        clickPhaseMs,
        navWaitMs,
        clickStrategies,
        clickErrors,
      });
      await recoverFromPreClickStall('click_no_xsec_retry', { domIndex, hasExplore, hasXsec, clickErrors });
      // Back to search results if stuck in detail without xsec
      if (!urlAfterClick.includes('search_result')) {
        await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' }, unifiedApiUrl).catch(()=>{});
        await delay(500);
      }
      continue; // Retry same index
    }
    console.log(`[Phase2Collect] Post-click gate PASSED: xsec_token present`);

    await appendTrace({
      type: 'click_after',
      ts: new Date().toISOString(),
      attempt: attempts,
      domIndex,
      urlAfterClick: safeUrl,
      clickPhaseMs,
      navWaitMs,
    });

    // 6. 校验 searchUrl（严格匹配 keyword）
    if (!isValidSearchUrl(searchUrl, keyword)) {
      console.warn(`[Phase2Collect] drop: search_url_mismatch expectedKeyword="${keyword}" searchUrl=${String(searchUrl)}`);
      await appendTrace({ type: 'drop', ts: new Date().toISOString(), reason: 'search_url_mismatch', expectedKeyword: keyword, searchUrl });
      await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' }, unifiedApiUrl);
      await delay(1000);
      continue;
    }
    if (!isValidSafeUrl(safeUrl)) {
      console.warn(`[Phase2Collect] safeUrl invalid, skip: ${safeUrl}`);
      await controllerAction('keyboard:press', {
        profileId: profile,
        key: 'Escape',
      }, unifiedApiUrl);
      await delay(1000);
      continue;
    }
    // NOTE: We already validated searchUrl strictly via isValidSearchUrl().

    // 7. 提取 noteId + 去重（按 noteId 全局唯一）
    const noteId = normalizeNoteId(getExploreIdFromUrl(safeUrl) || '') || '';
    if (!noteId) {
      console.warn(`[Phase2Collect] drop: missing_note_id safeUrl=${safeUrl}`);
      await appendTrace({ type: 'drop', ts: new Date().toISOString(), reason: 'missing_note_id', safeUrl });
      await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' }, unifiedApiUrl);
      await delay(1000);
      continue;
    }
    if (seenNoteIds.has(noteId)) {
      console.warn(`[Phase2Collect] drop: duplicate_note_id noteId=${noteId}`);
      await appendTrace({ type: 'drop', ts: new Date().toISOString(), reason: 'duplicate_note_id', noteId, safeUrl });
      if (preClickNoteId) {
        // Prevent repeatedly re-opening the same source card when mapped URL resolves to an already-seen note.
        seenExploreIds.add(preClickNoteId);
        seenNoteIds.add(preClickNoteId);
      }
      await recoverFromPreClickStall('duplicate_note_id', { domIndex, noteId, preClickNoteId });
      await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' }, unifiedApiUrl);
      await delay(1000);
      continue;
    }
    seenNoteIds.add(noteId);
    // Mark as seen only after a verified successful open to avoid dropping candidates on pre-click failures.
    seenExploreIds.add(noteId);
    if (preClickNoteId) {
      seenExploreIds.add(preClickNoteId);
    }
    preClickStallCount = 0;

    const linkRow = {
      noteId,
      safeUrl,
      // Bind to strict search_result?keyword=<keyword>.
      searchUrl: expectedSearchUrl,
      ts: new Date().toISOString(),
    };
    links.push(linkRow);

    if (typeof onLink === 'function') {
      try {
        await onLink(linkRow, { collected: links.length, targetCount });
      } catch (persistErr) {
        console.warn(`[Phase2Collect] onLink callback failed: ${String(persistErr)}`);
        await appendTrace({
          type: 'on_link_callback_error',
          ts: new Date().toISOString(),
          noteId,
          error: String(persistErr),
        });
      }
    }

    console.log(`[Phase2Collect] ✅ ${links.length}/${targetCount}: ${noteId}`);

    // 8. Close detail modal: prefer system-level container close, then ESC fallback.
    let backOk = false;
    try {
      await controllerAction(
        'container:operation',
        {
          containerId: 'xiaohongshu_detail.modal_shell',
          operationId: 'click',
          sessionId: profile,
          config: {
            selector: '.note-detail-mask .close-box, .note-detail-mask .close-circle',
            useSystemMouse: true,
            retries: 1,
          },
        },
        unifiedApiUrl,
      );
      await delay(1500);
    } catch {
      // ignore, fallback to ESC below
    }

    // ESC fallback (system keyboard)
    await controllerAction(
      'keyboard:press',
      { profileId: profile, key: 'Escape' },
      unifiedApiUrl,
    );

    for (let i = 0; i < 30; i++) {
      const res = await controllerAction(
        'browser:execute',
        {
          profile,
          script: `(function(){
            const url = window.location.href;
            const hasResultList = !!document.querySelector('.feeds-container, .search-result-list, .note-list');
            const hasTabs = !!document.querySelector('.tabs, .filter-tabs, [role="tablist"], .filter');
            const hasSearchInput = !!document.querySelector('#search-input, input[type="search"], input[placeholder*="搜索"], input[placeholder*="关键字"]');
            const selectors = [
              '.note-detail-mask',
              '.note-detail-page',
              '.note-detail-dialog',
              '.note-detail',
              '.detail-container',
              '.media-container'
            ];
            const isVisible = (el) => {
              if (!el) return false;
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height) return false;
              if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
              return true;
            };
            let visibleOverlay = null;
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && isVisible(el)) { visibleOverlay = el; break; }
            }
            return { url, hasResultList, hasTabs, hasSearchInput, hasDetailOverlay: !!visibleOverlay };
          })()`,
        },
        unifiedApiUrl,
      ).then((r) => r?.result || r?.data?.result || null);

      if (res && (res.hasResultList || res.hasTabs) && res.hasSearchInput && !res.hasDetailOverlay) {
        backOk = true;
        break;
      }
      await delay(500);
    }

    if (!backOk) {
      const urlNow = await controllerAction(
        'browser:execute',
        { profile, script: 'window.location.href' },
        unifiedApiUrl,
      ).then((r) => r?.result || r?.data?.result || '');
      throw new Error(`[Phase2Collect] close detail failed: still not on search/home (overlay visible) url=${urlNow}`);
    }
  }

  } finally {
    // Always calculate termination reason based on final state.
    // If we did not reach target, treat as no_progress to avoid false "reached_target" when max attempts are exhausted.
    const termination = links.length >= targetCount ? 'reached_target' : 'no_progress_after_3_retries';
    console.log(`[Phase2Collect] 完成，滚动次数: ${scrollCount}, 终止原因: ${termination}`);
    // Always try to restore to search_result page on exit (success or failure)
    try {
      const det = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });
      if (det.checkpoint === 'detail_ready' || det.checkpoint === 'comments_ready') {
        console.log('[Phase2Collect] Exit cleanup: restoring to search_result from detail page');
        for (let i = 0; i < 3; i++) {
          await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' }, unifiedApiUrl);
          await delay(1500);
          const afterEsc = await controllerAction('browser:execute', {
            profile,
            script: 'window.location.href',
          }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');
          if (typeof afterEsc === 'string' && afterEsc.includes('/search_result')) {
            console.log('[Phase2Collect] Exit cleanup: ✅ restored to search_result');
            break;
          }
        }
      }
    } catch (cleanupErr) {
      console.warn('[Phase2Collect] Exit cleanup failed:', String(cleanupErr));
    }
  }

  const termination = links.length >= targetCount ? 'reached_target' : 'no_progress_after_3_retries';
  return {
    links,
    totalCollected: links.length,
    termination,
  };
}
