/**
 * Phase 2 Block: 执行搜索
 *
 * 职责：通过容器系统执行搜索操作（全系统级操作）
 */

import { detectXhsCheckpoint } from '../utils/checkpoints.js';

import os from 'node:os';
import { controllerAction, delay } from '../utils/controllerAction.js';

export interface SearchInput {
  keyword: string;
  profile?: string;
  unifiedApiUrl?: string;
}

export interface SearchOutput {
  success: boolean;
  finalUrl: string;
  keyword: string;
}

function isDebugArtifactsEnabled() {
  return (
    process.env.WEBAUTO_DEBUG === '1' ||
    process.env.WEBAUTO_DEBUG_ARTIFACTS === '1' ||
    process.env.WEBAUTO_DEBUG_SCREENSHOT === '1'
  );
}

// controllerAction/delay are shared utilities (with a safer timeout) to avoid
// per-block drift that breaks regression flows.

async function readSearchInputValue(profile: string, unifiedApiUrl: string) {
  const value = await controllerAction(
    'browser:execute',
    {
      profile,
      script: `(() => {
        const root =
          document.querySelector('#search-input') ||
          document.querySelector("input[type='search']") ||
          document.querySelector("input[placeholder*='搜索'], input[placeholder*='关键字']");
        if (!root) return null;

        // 兼容：站点更新后 #search-input 可能是 wrapper/div，而不是 input
        const el =
          ('value' in root)
            ? root
            : (root.querySelector('input, textarea, [contenteditable="true"], [contenteditable=""]') || root);

        try {
          if (el && typeof el === 'object' && 'value' in el) {
            // @ts-ignore
            const v = el.value;
            return typeof v === 'string' ? v : String(v ?? '');
          }
          const text = (el && 'textContent' in el) ? (el.textContent ?? '') : '';
          return typeof text === 'string' ? text : String(text ?? '');
        } catch {
          return null;
        }
      })()`,
    },
    unifiedApiUrl,
  ).then((res) => res?.result || res?.data?.result || null);
  return typeof value === 'string' ? value : null;
}

export async function execute(input: SearchInput): Promise<SearchOutput> {
  const {
    keyword,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;
  const debugArtifactsEnabled = isDebugArtifactsEnabled();

  console.log(`[Phase2Search] 执行搜索(容器驱动): ${keyword}`);

  let currentUrl = await controllerAction(
    'browser:execute',
    { profile, script: 'window.location.href' },
    unifiedApiUrl,
  ).then((res) => res?.result || res?.data?.result || '');

  // 检查当前页面是否可搜索（优先用 DOM signals，禁止任何刷新/导航）
  const domCheck = await controllerAction('browser:execute', {
    profile,
    script: `(function(){
      const root =
        document.querySelector('#search-input') ||
        document.querySelector('input[type="search"]') ||
        document.querySelector('input[placeholder*="搜索"], input[placeholder*="关键字"]');
      const el = root && ('value' in root)
        ? root
        : (root ? (root.querySelector('input, textarea, [contenteditable="true"], [contenteditable=""]') || root) : null);
      const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      const hasSearchInput = !!el && !!rect && rect.width > 0 && rect.height > 0;
      const hasDetailMask = !!document.querySelector('.detail-mask, .note-detail-mask, .content-mask');
      return {
        hasSearchInput,
        hasDetailMask,
        rect: rect ? { x1: rect.left, y1: rect.top, x2: rect.right, y2: rect.bottom } : null,
        url: window.location.href,
      };
    })()`,
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || {});

  const hasSearchInput = Boolean(domCheck?.hasSearchInput);
  const hasDetailMask = Boolean(domCheck?.hasDetailMask);
  const domRect = domCheck?.rect || null;
  
  // 如果检测到详情遮罩，说明可能仍处于详情态。
  // 但在 Camoufox 下 /explore/<id> 可能已经回到可搜索壳页（hasSearchInput=true 且无实际遮罩）。
  // 这里不强制 stop，只在 hasSearchInput=false 时才停。
  if (hasDetailMask && !hasSearchInput) {
    throw new Error(
      `[Phase2Search] 检测到详情遮罩且无搜索输入框，当前不可搜索，停止（避免刷新）。URL=${currentUrl}`,
    );
  }
  
  // 如果有搜索输入框，说明在可搜索页面，直接继续
  if (!hasSearchInput) {
    throw new Error(
      `[Phase2Search] 未检测到搜索输入框，无法执行搜索。URL=${currentUrl}`,
    );
  }

  const probeHighlight = async (containerId: string) => {
    try {
      const res = await controllerAction(
        'container:operation',
        { containerId, operationId: 'highlight', sessionId: profile },
        unifiedApiUrl,
      );
      return res?.success ? res : null;
    } catch {
      return null;
    }
  };

  // Do not infer page type from URL (XHS can keep /explore/<id> while showing search UI).
  // Instead, probe containers first; if all fail, fallback to DOM detection (no refresh/goto).
  let searchInputContainerId = '';
  let highlightResult: any = null;
  let useDomFallback = false;

  highlightResult = await probeHighlight('xiaohongshu_home.search_input');
  if (highlightResult) {
    searchInputContainerId = 'xiaohongshu_home.search_input';
  } else {
    highlightResult = await probeHighlight('xiaohongshu_search.search_bar');
    if (highlightResult) searchInputContainerId = 'xiaohongshu_search.search_bar';
  }

  // Fallback: if container highlight fails, use DOM rect (no refresh/goto)
  if (!searchInputContainerId && domRect) {
    useDomFallback = true;
    searchInputContainerId = 'dom_fallback_search_input';
    highlightResult = { success: true, data: { rect: domRect } };
    console.log('[Phase2Search] 容器 highlight 失败，使用 DOM rect 作为搜索框');
  }

  if (!searchInputContainerId) {
    throw new Error(`[Phase2Search] 未识别页面状态，无法定位搜索框。当前 URL: ${currentUrl}`);
  }

  const isSearchResult = searchInputContainerId === 'xiaohongshu_search.search_bar';
  const isHome = searchInputContainerId === 'xiaohongshu_home.search_input' || searchInputContainerId === 'dom_fallback_search_input';

  console.log(
    `[Phase2Search] 当前页面: ${isSearchResult ? 'search_result' : 'home'}，使用容器 ${searchInputContainerId}`,
  );

  // 验证搜索框可用性（先高亮确认）
  if (!highlightResult) {
    console.log(`[Phase2Search] highlight start: ${searchInputContainerId}`);
    highlightResult = await controllerAction(
      'container:operation',
      { containerId: searchInputContainerId, operationId: 'highlight', sessionId: profile },
      unifiedApiUrl,
    );
  }
  console.log(`[Phase2Search] highlight done: success=${Boolean(highlightResult?.success)}`);
  if (!highlightResult?.success) {
    throw new Error(`[Phase2Search] 搜索框不可用: ${searchInputContainerId}`);
  }
  await delay(500);

  // Camoufox: prefer system-level coordinate click to reliably focus inputs.
  // Using container:operation click can hang in some cases.
  const anchor = highlightResult?.data || highlightResult;
  const rect = anchor?.rect;
  if (rect?.x1 !== undefined && rect?.y1 !== undefined && rect?.x2 !== undefined && rect?.y2 !== undefined) {
    const cx = (Number(rect.x1) + Number(rect.x2)) / 2;
    const cy = (Number(rect.y1) + Number(rect.y2)) / 2;
    console.log(`[Phase2Search] mouse:click at (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
    await controllerAction('mouse:click', { profileId: profile, x: cx, y: cy, clicks: 1 }, unifiedApiUrl);
    // Give the input time to receive focus in Camoufox.
    await delay(300);

    // Try selecting text via mouse (more reliable than keyboard shortcuts on some builds).
    await controllerAction('mouse:click', { profileId: profile, x: cx, y: cy, clicks: 2 }, unifiedApiUrl).catch(() => {});
    await delay(200);
  } else {
    console.warn(`[Phase2Search] missing rect for system click, fallback to no-click`);
  }

  // If the input already contains the same keyword, do not force clearing.
  // Camoufox sometimes ignores deletion events in certain states; treat "already correct" as success.
  const beforeClear = await readSearchInputValue(profile, unifiedApiUrl).catch((): null => null);
  // If input already equals keyword, don't attempt to clear/type again.
  // Camoufox can ignore key events and mis-focus; treating this as success avoids repeated actions.
  const inputAlreadyMatches = typeof beforeClear === 'string' && beforeClear.trim() === keyword;
  if (inputAlreadyMatches) {
    console.log('[Phase2Search] input already matches keyword, skip clear + type');
  } else {
    // Clear input by continuously pressing Backspace until empty (more reliable than select-all).
    // Max 50 attempts to avoid infinite loops.
    let attempt = 0;
    const maxAttempts = 50;
    while (attempt < maxAttempts) {
      const currentValue = await readSearchInputValue(profile, unifiedApiUrl).catch((): null => null);
      if (!currentValue || currentValue.trim() === '') {
        console.log(`[Phase2Search] input cleared after ${attempt} attempts`);
        break;
      }
      await controllerAction('keyboard:press', { profileId: profile, key: 'Backspace' }, unifiedApiUrl).catch(() => {});
      await delay(100);
      attempt++;
    }

    const clearedValue = await readSearchInputValue(profile, unifiedApiUrl);
    if (typeof clearedValue === 'string' && clearedValue.trim() && clearedValue.trim() !== keyword) {
      let shotLen = 0;
      if (debugArtifactsEnabled) {
        const shot = await controllerAction(
          'browser:screenshot',
          { profileId: profile, fullPage: false },
          unifiedApiUrl,
        ).then((res) => res?.data || res?.result || res?.data?.data || '');
        shotLen = typeof shot === 'string' ? shot.length : 0;
      }
      throw new Error(
        `[Phase2Search] 清空输入框失败（持续按键 ${attempt} 次后仍有残留）。value="${clearedValue}" screenshot_len=${shotLen}`,
      );
    }

    await controllerAction('keyboard:type', { profileId: profile, text: keyword, delay: 90 }, unifiedApiUrl);
    console.log(`[Phase2Search] type done: ${keyword}`);
    await delay(450);
  }

  // If we skipped typing, the input already contains keyword; proceed to submit.

  const typedValue = await readSearchInputValue(profile, unifiedApiUrl);
  // Camoufox sometimes blocks reading input value immediately after typing.
  // Treat null as non-fatal here and rely on finalUrl + container anchors to validate search.
  if (typedValue && typedValue?.trim?.() !== keyword) {
    let shotLen = 0;
    if (debugArtifactsEnabled) {
      const shot = await controllerAction(
        'browser:screenshot',
        { profileId: profile, fullPage: false },
        unifiedApiUrl,
      ).then((res) => res?.data || res?.result || res?.data?.data || '');
      shotLen = typeof shot === 'string' ? shot.length : 0;
    }
    throw new Error(
      `[Phase2Search] 输入框值不等于目标关键字：expected="${keyword}" actual="${typedValue}" screenshot_len=${shotLen}`,
    );
  }

  if (isHome) {
    // explore 主页：使用搜索图标按钮触发搜索（更贴近用户真实行为）
    console.log('[Phase2Search] search_button click start');
    // 尝试点击搜索按钮，但不强求（某些页面按钮点击无效）
    try {
      await controllerAction(
        'container:operation',
        { containerId: 'xiaohongshu_home.search_button', operationId: 'click', sessionId: profile },
        unifiedApiUrl,
      );
      console.log('[Phase2Search] search_button click done');
      await delay(500);
    } catch (e) {
      console.log('[Phase2Search] search_button click failed, fallback to Enter');
    }
    // 保险：用 Enter 触发搜索
    await controllerAction('keyboard:press', { profileId: profile, key: 'Enter' }, unifiedApiUrl);
  } else {
    // search_result：系统级 Enter 提交
    await controllerAction('keyboard:press', { profileId: profile, key: 'Enter' }, unifiedApiUrl);
  }
  // 等待搜索结果页加载：最多 15 秒。
  // 注意：XHS 在 Camoufox 下可能出现“URL 仍停留 /explore/<id>，但 DOM 已是搜索结果页”的壳页行为。
  // 这里仅做节奏控制，最终成功判定仍以 DOM/容器信号为准。
  await delay(15000);

  // 验证是否到达搜索结果页（不依赖 URL，使用 DOM 检测）
  const pageCheck = await controllerAction('browser:execute', {
    profile,
    script: `(function(){
      const hasTabs = !!document.querySelector('.tabs, .filter-tabs, [role="tablist"]');
      const hasResultList = !!document.querySelector('.feeds-container, .search-result-list, .note-list');
      const hasSearchInput = !!document.querySelector('#search-input, input[type="search"]');
      return {
        hasTabs,
        hasResultList,
        hasSearchInput,
        url: window.location.href,
      };
    })()`,
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || null);

  const finalUrl = pageCheck?.url || currentUrl;
  const success = Boolean(pageCheck?.hasSearchInput && (pageCheck?.hasTabs || pageCheck?.hasResultList));

  console.log(`[Phase2Search] 完成: success=${success} url=${finalUrl} hasTabs=${pageCheck?.hasTabs} hasResultList=${pageCheck?.hasResultList}`);

  return {
    success,
    finalUrl,
    keyword,
  };
}
