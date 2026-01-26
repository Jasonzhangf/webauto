/**
 * Phase 2 Block: 采集安全链接
 * 
 * 职责：通过容器点击进入详情，获取带 xsec_token 的安全 URL
 */

import { ContainerRegistry } from '../../../../container-registry/src/index.js';
import { execute as waitSearchPermit } from '../../../../workflow/blocks/WaitSearchPermitBlock.js';
import { execute as phase2Search } from './Phase2SearchBlock.js';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface CollectLinksInput {
  keyword: string;
  targetCount: number;
  profile?: string;
  unifiedApiUrl?: string;
  env?: string;
}

export interface CollectLinksOutput {
  links: Array<{
    noteId: string;
    safeUrl: string;
    searchUrl: string;
    ts: string;
  }>;
  totalCollected: number;
}

async function controllerAction(action: string, payload: any, apiUrl: string) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

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

export async function execute(input: CollectLinksInput): Promise<CollectLinksOutput> {
  const {
    keyword,
    targetCount,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
    env = 'debug',
  } = input;

  console.log(`[Phase2CollectLinks] 目标: ${targetCount} 条链接`);

  const links: CollectLinksOutput['links'] = [];
  const seen = new Set<string>();
  const seenExploreIds = new Set<string>();
  const registry = new ContainerRegistry();
  await registry.load();
  let attempts = 0;
  const maxAttempts = targetCount * 6;
  let scrollCount = 0;
  const debugArtifactsEnabled = isDebugArtifactsEnabled();
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

  const ensureOnExpectedSearch = async () => {
    const currentUrl = await controllerAction('browser:execute', {
      profile,
      script: 'window.location.href',
    }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

    if (!currentUrl || typeof currentUrl !== 'string') {
      throw new Error('[Phase2Collect] 无法读取当前 URL');
    }

    if (!currentUrl.includes('/search_result')) {
      // 可能还在详情页或被弹窗遮挡，尝试 ESC 回退到搜索页
      await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' }, unifiedApiUrl);
      await delay(1200);
      const afterEsc = await controllerAction('browser:execute', {
        profile,
        script: 'window.location.href',
      }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');
      if (typeof afterEsc === 'string' && afterEsc.includes('/search_result')) {
        return afterEsc;
      }
      throw new Error(`[Phase2Collect] ESC 后仍未回到搜索页: ${String(afterEsc || currentUrl)}`);
    }

    if (matchesKeywordFromSearchUrlStrict(currentUrl, keyword)) {
      return currentUrl;
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
    // 开发阶段不做“自动纠错重搜”，避免连续多次搜索触发风控；留证据后直接停下让人看截图/日志。
    throw new Error(`[Phase2Collect] 搜索关键词漂移，已截图并落盘 trace，停止执行（避免重复搜索触发风控）。url=${currentUrl}`);
  };

  // 进入采集前，先固定一个“期望 searchUrl”（严格等于 keyword）
  let expectedSearchUrl = await ensureOnExpectedSearch();

  while (links.length < targetCount && attempts < maxAttempts) {
    attempts++;

    // 0. 每轮开始确保仍在目标搜索页，避免误点到推荐关键词
    expectedSearchUrl = await ensureOnExpectedSearch();
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
      script: `(function(){\n  const sel = ${JSON.stringify(itemSelector)};\n  const seen = new Set(${JSON.stringify(Array.from(seenExploreIds))});\n  const nodes = Array.from(document.querySelectorAll(sel));\n  const pad = 8;\n  const vh = window.innerHeight;\n\n  function clampAmount(v){\n    const n = Math.ceil(Number(v) || 0);\n    if (n <= 0) return 200;\n    return Math.min(800, n);\n  }\n\n  for (let i = 0; i < nodes.length; i++) {\n    const node = nodes[i];\n    const exploreA = node.querySelector('a[href*=\"/explore/\"]');\n    const exploreHref = exploreA ? (exploreA.getAttribute('href') || '') : '';\n    const m = exploreHref.match(/\\/explore\\/([a-f0-9]+)/);\n    const exploreId = m ? m[1] : '';\n    if (!exploreId || seen.has(exploreId)) continue;\n\n    const r = node.getBoundingClientRect();\n    if (!(r.width > 0 && r.height > 0)) continue;\n\n    if (r.top < pad) {\n      return {\n        action: 'scroll',\n        index: i,\n        exploreId,\n        rect: { top: r.top, bottom: r.bottom, width: r.width, height: r.height },\n        scroll: { direction: 'up', amount: clampAmount((pad - r.top) + 24), reason: 'top_clipped' },\n        debug: { total: nodes.length, pad, viewportH: vh },\n      };\n    }\n\n    if (r.bottom > (vh - pad)) {\n      return {\n        action: 'scroll',\n        index: i,\n        exploreId,\n        rect: { top: r.top, bottom: r.bottom, width: r.width, height: r.height },\n        scroll: { direction: 'down', amount: clampAmount((r.bottom - (vh - pad)) + 24), reason: 'bottom_clipped' },\n        debug: { total: nodes.length, pad, viewportH: vh },\n      };\n    }\n\n    return {\n      action: 'ok',\n      index: i,\n      exploreId,\n      rect: { top: r.top, bottom: r.bottom, width: r.width, height: r.height },\n      debug: { total: nodes.length, pad, viewportH: vh },\n    };\n  }\n\n  return {\n    action: 'scroll',\n    scroll: { direction: 'down', amount: 800, reason: 'no_unseen_candidates' },\n    debug: { total: nodes.length, pad, viewportH: vh },\n  };\n})()`,
    }, unifiedApiUrl).then(res => res?.result || res?.data?.result || null);

    if (!pick || typeof pick !== 'object') {
      throw new Error('[Phase2Collect] pick target failed: empty result');
    }

    if (pick.action === 'scroll' && pick.scroll) {
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
      await delay(1200);
      continue;
    }

    const domIndex = Number(pick.index ?? -1);
    if (!Number.isFinite(domIndex) || domIndex < 0) {
      throw new Error(`[Phase2Collect] invalid picked index: ${String(pick.index)}`);
    }

    const exploreId = String(pick.exploreId || '');
    if (exploreId) {
      seenExploreIds.add(exploreId);
    }

    // 4. 点击第 N 个搜索结果卡片（通过 DOM 下标精确定位，避免依赖 href）
    let highlightInfo: any = null;
    try {
      highlightInfo = await controllerAction('container:operation', {
        containerId: 'xiaohongshu_search.search_result_item',
        operationId: 'highlight',
        sessionId: profile,
        config: { index: domIndex, duration: 900 },
      }, unifiedApiUrl);
    } catch {
      highlightInfo = null;
    }

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

    const clickResult = await controllerAction('container:operation', {
      containerId: 'xiaohongshu_search.search_result_item',
      operationId: 'click',
      sessionId: profile,
      config: { index: domIndex },
    }, unifiedApiUrl);
    if (clickResult?.success === false) {
      console.warn(`[Phase2Collect] 点击失败 index=${domIndex} err=${clickResult?.error || 'unknown'}，刷新索引后重试`);
      continue;
    }
    await delay(1800);

    const urlAfterClick = await controllerAction('browser:execute', {
      profile,
      script: 'window.location.href'
    }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

    await appendTrace({
      type: 'click_after',
      ts: new Date().toISOString(),
      attempt: attempts,
      domIndex,
      urlAfterClick,
    });

    // 5. 等待详情页加载并获取安全 URL
    let safeUrl = '';
    for (let i = 0; i < 20; i++) {
      const url = await controllerAction('browser:execute', {
        profile,
        script: 'window.location.href'
      }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');
      
      if (url.includes('/explore/') && url.includes('xsec_token')) {
        safeUrl = url;
        break;
      }
      await delay(500);
    }

    if (!safeUrl) {
      console.warn(`[Phase2Collect] 未获取到 xsec_token URL，跳过 index=${domIndex}`);
      // 尝试返回搜索页
      await controllerAction('keyboard:press', {
        profileId: profile,
        key: 'Escape',
      }, unifiedApiUrl);
      await delay(1000);
      continue;
    }

    // 6. 校验 searchUrl（防止采集到推荐流等非目标搜索结果）
    if (!isValidSearchUrl(searchUrl, keyword)) {
      console.warn(`[Phase2Collect] searchUrl invalid, skip: ${searchUrl}`);
      await controllerAction('keyboard:press', {
        profileId: profile,
        key: 'Escape',
      }, unifiedApiUrl);
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
    if (!matchesKeywordFromSearchUrlStrict(searchUrl, keyword)) {
      console.warn(`[Phase2Collect] searchUrl keyword 不严格等于目标词，移除漂移项: ${safeUrl}`);
      await controllerAction('keyboard:press', {
        profileId: profile,
        key: 'Escape',
      }, unifiedApiUrl);
      await delay(1000);
      continue;
    }

    // 7. 提取 noteId
    const noteId = safeUrl.match(/\/explore\/([a-f0-9]+)/)?.[1] || '';
    if (!noteId || seen.has(noteId)) {
      console.log(`[Phase2Collect] Duplicate noteId=${noteId}`);
      // 仍然需要返回搜索页，否则下一轮会在详情页上循环
      await controllerAction('keyboard:press', {
        profileId: profile,
        key: 'Escape',
      }, unifiedApiUrl);
      await delay(1000);
      continue;
    }
    seen.add(noteId);

    links.push({
      noteId,
      safeUrl,
      searchUrl,
      ts: new Date().toISOString(),
    });

    console.log(`[Phase2Collect] ✅ ${links.length}/${targetCount}: ${noteId}`);

    // 8. ESC 返回搜索页（系统键盘）
    await controllerAction('keyboard:press', {
      profileId: profile,
      key: 'Escape',
    }, unifiedApiUrl);
    await delay(1500);
  }

  console.log(`[Phase2Collect] 完成，滚动次数: ${scrollCount}`);

  return {
    links,
    totalCollected: links.length,
  };
}
