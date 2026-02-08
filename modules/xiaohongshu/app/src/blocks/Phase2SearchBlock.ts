/**
 * Phase 2 Block: 执行搜索
 *
 * 职责：通过容器系统执行搜索操作（全系统级操作）
 */

import { detectXhsCheckpoint, ensureXhsCheckpoint } from '../utils/checkpoints.js';

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

async function readActiveInputValue(profile: string, unifiedApiUrl: string) {
  const value = await controllerAction(
    'browser:execute',
    {
      profile,
      script: `(() => {
        const el = document.activeElement;
        if (!el) return null;
        const input = (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
          ? el
          : (el.querySelector?.('input, textarea') || el);
        if (input && 'value' in input) {
          // @ts-ignore
          const v = input.value;
          return typeof v === 'string' ? v : String(v ?? '');
        }
        const text = (input && 'textContent' in input) ? (input.textContent ?? '') : '';
        return typeof text === 'string' ? text : String(text ?? '');
      })()`,
    },
    unifiedApiUrl,
  ).then((res) => res?.result || res?.data?.result || null);
  return typeof value === 'string' ? value : null;
}

async function systemFillSearchInputValue(profile: string, unifiedApiUrl: string, keyword: string) {
  // System-level requirement: prefer keyboard/mouse. `browser:execute` is JS mutation and should be avoided.
  // We implement a system-level "fill" as: select-all + delete + type (with retries).
  const trySelectAllDeleteType = async (modifier: 'Meta' | 'Control') => {
    await controllerAction('keyboard:down', { profileId: profile, key: modifier }, unifiedApiUrl).catch(() => {});
    await controllerAction('keyboard:press', { profileId: profile, key: 'A' }, unifiedApiUrl).catch(() => {});
    await controllerAction('keyboard:up', { profileId: profile, key: modifier }, unifiedApiUrl).catch(() => {});
    await delay(60);
    await controllerAction('keyboard:press', { profileId: profile, key: 'Backspace' }, unifiedApiUrl).catch(() => {});
    await delay(60);
    await controllerAction('keyboard:type', { profileId: profile, text: keyword, delay: 70 }, unifiedApiUrl).catch(() => {});
  };

  const checkBoth = async () => {
    const v1 = await readSearchInputValue(profile, unifiedApiUrl).catch((): null => null);
    if (v1 && v1.trim() === keyword) return { ok: true, source: 'readSearchInputValue', value: v1 };
    const v2 = await readActiveInputValue(profile, unifiedApiUrl).catch((): null => null);
    if (v2 && v2.trim() === keyword) return { ok: true, source: 'readActiveInputValue', value: v2 };
    return { ok: false, value: v1 || v2 || '' };
  };

  // Try a few times; Camoufox can drop events if focus is flaky.
  for (let i = 0; i < 3; i++) {
    await trySelectAllDeleteType('Meta');
    await delay(250);
    const c1 = await checkBoth();
    if (c1.ok) return { ok: true, method: 'meta', source: c1.source };

    await trySelectAllDeleteType('Control');
    await delay(250);
    const c2 = await checkBoth();
    if (c2.ok) return { ok: true, method: 'control', source: c2.source };
  }
  const finalCheck = await checkBoth();
  return { ok: false, reason: `mismatch:${String(finalCheck.value ?? '')}` };
}

async function submitHomeSearchViaContainer(profile: string, unifiedApiUrl: string, keyword: string) {
  // Prefer container operations: type + key (all system-level), avoid generic keyboard focus flakiness.
  try {
    await controllerAction(
      'container:operation',
      { containerId: 'xiaohongshu_home.search_input', operationId: 'type', sessionId: profile, config: { text: keyword } },
      unifiedApiUrl,
    );
    await delay(200);
  } catch {
    // If container type fails, rely on existing filled input (verified before submit).
  }

  try {
    await controllerAction(
      'container:operation',
      { containerId: 'xiaohongshu_search.search_bar', operationId: 'key', sessionId: profile },
      unifiedApiUrl,
    );
    console.log('[Phase2Search] submit via container key (search_bar)');
    return true;
  } catch {
    // Fall back to keyboard enter if container key is unavailable.
    return false;
  }
}

async function canSubmitSearch(profile: string, unifiedApiUrl: string, keyword: string): Promise<{ ok: boolean; value: string | null; source: string | null }> {
  const value = await readSearchInputValue(profile, unifiedApiUrl).catch((): null => null);
  if (typeof value === 'string' && value.trim() === keyword) return { ok: true, value, source: 'readSearchInputValue' };
  const activeValue = await readActiveInputValue(profile, unifiedApiUrl).catch((): null => null);
  if (typeof activeValue === 'string' && activeValue.trim() === keyword) return { ok: true, value: activeValue, source: 'readActiveInputValue' };
  return { ok: false, value: (value ?? activeValue ?? null) as string | null, source: null };
}

async function browserFillSearchInputValue(profile: string, unifiedApiUrl: string, keyword: string) {
  // Preferred: use browser-service page.fill via unified-api controller action.
  // IMPORTANT: Camoufox can append text instead of replacing; we MUST clear input.value first.
  const selector =
    '#search-input input, #search-input textarea, input#search-input, input[type="search"], input[placeholder*="搜索"], input[placeholder*="关键字"]';
  
  // Step 1: force clear the input value via JS (system operations alone can fail to clear in some cases)
  const escapedSelector = selector.replace(/'/g, "\\'" );
  await controllerAction(
    'browser:execute',
    {
      profile,
      script: `(() => {
        const el = document.querySelector('${escapedSelector}');
        if (el && 'value' in el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
      })()`,
    },
    unifiedApiUrl,
  ).catch(() => {});

  // Step 2: use browser:fill to set the value (now that it's cleared)
  const res = await controllerAction(
    'browser:fill',
    { profile, selector, text: keyword },
    unifiedApiUrl,
  ).catch((e) => ({ success: false, error: e?.message || String(e) }));
  return res;
}

async function clearSearchInput(profile: string, unifiedApiUrl: string) {
  // Prefer deterministic select-all deletion. Fallback to repeated Backspace.
  // IMPORTANT: only system keyboard operations allowed.
  const tryCombo = async (combo: 'Meta+A' | 'Control+A') => {
    const mod = combo.startsWith('Meta') ? 'Meta' : 'Control';
    await controllerAction('keyboard:down', { profileId: profile, key: mod }, unifiedApiUrl).catch(() => {});
    await controllerAction('keyboard:press', { profileId: profile, key: 'A' }, unifiedApiUrl).catch(() => {});
    await controllerAction('keyboard:up', { profileId: profile, key: mod }, unifiedApiUrl).catch(() => {});
    await delay(80);
    // Use both Delete and Backspace to cover different input implementations.
    await controllerAction('keyboard:press', { profileId: profile, key: 'Backspace' }, unifiedApiUrl).catch(() => {});
    await controllerAction('keyboard:press', { profileId: profile, key: 'Delete' }, unifiedApiUrl).catch(() => {});
  };

  // 1) Cmd+A (Mac) then delete
  await tryCombo('Meta+A');
  await delay(120);
  let v = await readSearchInputValue(profile, unifiedApiUrl);
  if (!v || !v.trim()) return;

  // 2) Ctrl+A then delete
  await tryCombo('Control+A');
  await delay(120);
  v = await readSearchInputValue(profile, unifiedApiUrl);
  if (!v || !v.trim()) return;

  // 3) Fallback: repeated Backspace
  for (let i = 0; i < 80; i++) {
    await controllerAction('keyboard:press', { profileId: profile, key: 'Backspace' }, unifiedApiUrl).catch(() => {});
    if (i % 10 === 0) {
      await delay(40);
      v = await readSearchInputValue(profile, unifiedApiUrl);
      if (!v || !v.trim()) return;
    }
  }
}

export async function execute(input: SearchInput): Promise<SearchOutput> {
  const {
    keyword,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;
  const debugArtifactsEnabled = isDebugArtifactsEnabled();

  console.log(`[Phase2Search] 执行搜索(容器驱动): ${keyword}`);

  // Ensure we are in a safe starting state (home/search). Recover from detail/comments if needed.
  const ensureRes = await ensureXhsCheckpoint({
    sessionId: profile,
    target: 'search_ready',
    serviceUrl: unifiedApiUrl,
    timeoutMs: 15000,
    allowOneLevelUpFallback: true,
  });
  if (!ensureRes.success && ensureRes.reached !== 'home_ready' && ensureRes.reached !== 'search_ready') {
    throw new Error(`[Phase2Search] ensure checkpoint failed: reached=${ensureRes.reached} url=${ensureRes.url}`);
  }

  let currentUrl = await controllerAction(
    'browser:execute',
    { profile, script: 'window.location.href' },
    unifiedApiUrl,
  ).then((res) => res?.result || res?.data?.result || '');

  // 开发期硬门禁：每个大环节开始先定位，不做容错兜底。
  const det = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });
  console.log(`[Phase2Search] locate: checkpoint=${det.checkpoint} url=${det.url}`);
  if (det.checkpoint === 'risk_control' || det.checkpoint === 'login_guard' || det.checkpoint === 'offsite') {
    throw new Error(`[Phase2Search] hard_stop checkpoint=${det.checkpoint} url=${det.url}`);
  }

  async function waitCheckpoint(maxWaitMs: number) {
    const start = Date.now();
    let last = det;
    while (Date.now() - start < maxWaitMs) {
      await delay(500);
      last = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });
      if (last.checkpoint !== 'detail_ready' && last.checkpoint !== 'comments_ready') return last;
    }
    return last;
  }

  async function exitDetailOrCommentsState() {
    let d = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });
    if (d.checkpoint !== 'detail_ready' && d.checkpoint !== 'comments_ready') return d;

    // 详情/评论态：先尝试点击关闭按钮（更贴近用户行为），然后等待状态变化。
    console.log('[Phase2Search] 处于详情/评论态，尝试点击关闭按钮关闭详情页...');
    try {
      const r = await controllerAction(
        'container:operation',
        { containerId: 'xiaohongshu_detail.close_button', operationId: 'click', sessionId: profile, timeoutMs: 15000 },
        unifiedApiUrl,
      );
      console.log(`[Phase2Search] close_button click: success=${Boolean(r?.success !== false)}`);
    } catch {
      console.log('[Phase2Search] close_button click failed (ignored)');
    }
    d = await waitCheckpoint(8000);
    if (d.checkpoint !== 'detail_ready' && d.checkpoint !== 'comments_ready') return d;

    // 若仍在详情/评论态：使用 ESC 退出（系统级），每次后等待状态稳定。
    for (let i = 0; i < 2; i += 1) {
      console.log(`[Phase2Search] still in ${d.checkpoint}, press ESC to exit (round=${i + 1})`);
      await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' }, unifiedApiUrl);
      d = await waitCheckpoint(8000);
      if (d.checkpoint !== 'detail_ready' && d.checkpoint !== 'comments_ready') return d;
    }

    // 最终仍失败：留证据（截图长度），停止（不刷新）。
    let shotLen = 0;
    if (isDebugArtifactsEnabled()) {
      const shot = await controllerAction(
        'browser:screenshot',
        { profileId: profile, fullPage: false },
        unifiedApiUrl,
      ).then((res) => res?.data || res?.result || res?.data?.data || '');
      shotLen = typeof shot === 'string' ? shot.length : 0;
    }
    throw new Error(
      `[Phase2Search] 关闭详情页后仍未回到搜索/首页（checkpoint=${d.checkpoint}）。停止（避免刷新）。URL=${d.url} screenshot_len=${shotLen}`,
    );
  }

  // If starting from detail/comments state, exit to a stable checkpoint before doing anything else.
  if (det.checkpoint === 'detail_ready' || det.checkpoint === 'comments_ready') {
    await exitDetailOrCommentsState();
  }

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
  
  // Priority 1: If detail mask exists or we're still in detail/comments, close the modal.
  // NOTE: On XHS, ESC is unreliable in Camoufox; prefer clicking the close button (system click via container).
  if (hasDetailMask || det.checkpoint === 'detail_ready' || det.checkpoint === 'comments_ready') {
    console.log('[Phase2Search] 处于详情/评论态，尝试点击关闭按钮关闭详情页...');

    // Best-effort click the close button by container operation (system-level click).
    // If container is missing (layout changed), we fail fast (no refresh) with evidence.
    const clickRes = await controllerAction(
      'container:operation',
      { containerId: 'xiaohongshu_detail.modal_shell', operationId: 'click', sessionId: profile },
      unifiedApiUrl,
    );
    console.log(`[Phase2Search] close_button click: success=${Boolean(clickRes?.success)}`);
    await delay(1500);

    const detAfterClose = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: unifiedApiUrl });
    if (detAfterClose.checkpoint !== 'search_ready' && detAfterClose.checkpoint !== 'home_ready') {
      throw new Error(
        `[Phase2Search] 关闭详情页后仍未回到搜索/首页（checkpoint=${detAfterClose.checkpoint}）。停止（避免刷新）。URL=${currentUrl}`,
      );
    }
  }

  // Priority 2: Without search input we cannot search
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
    await clearSearchInput(profile, unifiedApiUrl);
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
        `[Phase2Search] 清空输入框失败（组合键 + 退格后仍有残留）。value="${clearedValue}" screenshot_len=${shotLen}`,
      );
    }

    // Camoufox: keyboard typing can be flaky (focus/IME). Use a fill-style set + input/change events.
    const fillRes = await browserFillSearchInputValue(profile, unifiedApiUrl, keyword);
    const fillSuccess = Boolean(fillRes?.success !== false);
    console.log(`[Phase2Search] browser:fill done: success=${fillSuccess}`);
    if (!fillSuccess) {
      const fallback = await systemFillSearchInputValue(profile, unifiedApiUrl, keyword);
      console.log(`[Phase2Search] keyboard fill fallback: ok=${Boolean(fallback?.ok)} reason=${fallback?.reason || ''}`);
    }
    await delay(450);
  }

  // If we skipped typing, the input already contains keyword; proceed to submit.

  // 强制验证：提交前必须确认 input 值等于 keyword，否则直接失败（不点击搜索按钮）
  const canSubmit = await canSubmitSearch(profile, unifiedApiUrl, keyword);
  const beforeSubmitValue = await readSearchInputValue(profile, unifiedApiUrl).catch((): null => null);
  const activeBeforeSubmitValue = await readActiveInputValue(profile, unifiedApiUrl).catch((): null => null);
  console.log(`[Phase2Search] Before submit: input value="${String(beforeSubmitValue)}" active="${String(activeBeforeSubmitValue)}" keyword="${keyword}"`);
  if (!canSubmit.ok) {
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
      `[Phase2Search] 提交前 input 值不等于关键字：expected="${keyword}" actual="${String(canSubmit.value)}" source=${String(canSubmit.source)} screenshot_len=${shotLen}。停止执行（不点击搜索按钮）。`,
    );
  }

  if (isHome) {
    const ok = await submitHomeSearchViaContainer(profile, unifiedApiUrl, keyword);
    if (!ok) {
      console.log('[Phase2Search] submit via Enter (fallback)');
      await controllerAction('keyboard:press', { profileId: profile, key: 'Enter' }, unifiedApiUrl);
    }
  } else {
    // search_result：系统级 Enter 提交
    await controllerAction('keyboard:press', { profileId: profile, key: 'Enter' }, unifiedApiUrl);
  }
  // 等待搜索结果页加载：最多 15 秒。
  // 注意：XHS 在 Camoufox 下可能出现“URL 仍停留 /explore/<id>，但 DOM 已是搜索结果页”的壳页行为。
  // 这里仅做节奏控制，最终成功判定仍以 DOM/容器信号为准。
  await delay(15000);

  // 验证是否到达搜索结果页（不依赖 URL，使用 DOM 检测），失败则最多重试 3 次 Enter 提交
  let finalUrl = currentUrl;
  let success = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
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

    finalUrl = pageCheck?.url || finalUrl;
    const urlStr = String(finalUrl || '');
    const urlLooksSearch = urlStr.includes('/search_result') || urlStr.includes('search_result');
    success = Boolean(pageCheck?.hasSearchInput && (pageCheck?.hasTabs || pageCheck?.hasResultList || urlLooksSearch));

    console.log(`[Phase2Search] 完成: success=${success} url=${finalUrl} hasTabs=${pageCheck?.hasTabs} hasResultList=${pageCheck?.hasResultList} attempt=${attempt}`);

    if (success) break;
    if (attempt < 3) {
      console.log(`[Phase2Search] retry search submit (attempt=${attempt + 1})`);
      // 重新聚焦输入框（系统级点击）再输入关键字，避免焦点丢失
      try {
        const rect = await controllerAction('browser:execute', {
          profile,
          script: `(function(){
            const el = document.querySelector('#search-input') || document.querySelector('input[type="search"]') || document.querySelector('input[placeholder*="搜索"], input[placeholder*="关键字"]');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom };
          })()`,
        }, unifiedApiUrl).then(res => res?.result || res?.data?.result || null);
        if (rect && rect.x1 !== undefined) {
          const cx = (Number(rect.x1) + Number(rect.x2)) / 2;
          const cy = (Number(rect.y1) + Number(rect.y2)) / 2;
          await controllerAction('mouse:click', { profileId: profile, x: cx, y: cy, clicks: 1 }, unifiedApiUrl).catch(() => {});
          await delay(200);
        }
      } catch {
        // ignore refocus errors
      }

      await systemFillSearchInputValue(profile, unifiedApiUrl, keyword).catch(() => {});
      await delay(300);
      await controllerAction('keyboard:press', { profileId: profile, key: 'Enter' }, unifiedApiUrl);
      await delay(5000);
    }
  }

  return {
    success,
    finalUrl,
    keyword,
  };
}
