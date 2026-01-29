/**
 * SearchExecutor helper
 *
 * 处理搜索输入、焦点检查和搜索执行
 */

import os from 'node:os';
import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
} from './operationLogger.js';

export interface SearchExecutorConfig {
  profile: string;
  controllerUrl: string;
  searchInputContainerId: string;
  keyword: string;
}

export interface SearchInputAnchor {
  found: boolean;
  error?: string;
  selector?: string;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface ExecuteSearchResult {
  success: boolean;
  error?: string;
  debug?: Record<string, any>;
}

export async function controllerAction(
  controllerUrl: string,
  action: string,
  payload: any = {}
): Promise<any> {
  const opId = logControllerActionStart(action, payload, { source: 'searchExecutor' });
  try {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const result = data.data || data;
    logControllerActionResult(opId, action, result, { source: 'searchExecutor' });
    return result;
  } catch (error) {
    logControllerActionError(opId, action, error, payload, { source: 'searchExecutor' });
    throw error;
  }
}

export async function verifySearchBarAnchor(
  config: SearchExecutorConfig
): Promise<SearchInputAnchor> {
  const { profile, controllerUrl, searchInputContainerId } = config;
  
  try {
    const { verifyAnchorByContainerId } = await import('./containerAnchors.js');
    const anchor = await verifyAnchorByContainerId(searchInputContainerId, profile, controllerUrl.replace('/v1/controller/action', ''));
    
    if (!anchor.found) {
      return { 
        found: false, 
        error: anchor.error || 'anchor_not_found', 
        selector: anchor.selector 
      };
    }
    
    return {
      found: true,
      selector: anchor.selector || '#search-input',
      rect: anchor.rect
    };
  } catch (error: any) {
    return { found: false, error: error.message };
  }
}

export async function isSearchInputFocused(
  config: SearchExecutorConfig,
  selector: string | undefined
): Promise<boolean> {
  const { profile, controllerUrl } = config;
  if (!selector) return false;
  
  const script = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const active = document.activeElement;
    if (!active) return false;
    return active === el || (el instanceof Element && el.contains(active));
  })()`;

  const response = await fetch(controllerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'browser:execute',
      payload: {
        profile,
        script,
      },
    }),
  });
  const data = await response.json();
  return Boolean(data.data?.result ?? data.result);
}

export async function readSearchInputValue(
  config: SearchExecutorConfig,
  selector: string | undefined
): Promise<string> {
  const { profile, controllerUrl } = config;
  
  const sel =
    selector ||
    '#search-input, input[type="search"], .search-input';

  const script = `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return '';
    try {
      if ('value' in el) return String(el.value || '');
      if (el.isContentEditable) return String(el.textContent || '');
      return String(el.textContent || '');
    } catch {
      return '';
    }
  })()`;

  const response = await fetch(controllerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'browser:execute',
      payload: {
        profile,
        script,
      },
    }),
  });
  const data = await response.json();
  const value = data.data?.result ?? data.result ?? '';
  return typeof value === 'string' ? value : '';
}

export async function executeSearch(
  config: SearchExecutorConfig,
  anchorSelector?: string
): Promise<ExecuteSearchResult> {
  const { profile, controllerUrl, searchInputContainerId, keyword } = config;
  
  try {
    console.log(`[SearchExecutor] Typing keyword "${keyword}"...`);

    const selector =
      anchorSelector ||
      '#search-input, input[type="search"], .search-input';

    // ✅ 系统级输入：禁止 container:operation type（底层为 session.fill，属于非系统行为）
    // 依赖上游已完成 focus；这里额外做一次清空 + 输入 + Enter
    // 注意：在 mac 上 Control+A 可能导致光标跳到行首，反而造成“关键字拼接”。
    let typedByContainer = false;
    try {
      const typeResp = await controllerAction(controllerUrl, 'container:operation', {
        containerId: searchInputContainerId,
        operationId: 'type',
        sessionId: profile,
        config: {
          selector,
          text: keyword,
          clear_first: true,
          human_typing: true,
          pause_after: 320,
        },
      });
      const ok = Boolean(typeResp?.success !== false && (typeResp?.data?.success ?? true));
      if (!ok) {
        console.warn('[SearchExecutor] container type failed', typeResp);
      } else {
        typedByContainer = true;
      }
    } catch (error: any) {
      console.warn('[SearchExecutor] container type failed', error?.message || String(error));
    }

    if (!typedByContainer) {
      const platform = os.platform();
      const selectAllKey = platform === 'darwin' ? 'Meta+A' : 'Control+A';
      await controllerAction(controllerUrl, 'keyboard:press', { profileId: profile, key: selectAllKey }).catch(() => {});
      await controllerAction(controllerUrl, 'keyboard:press', { profileId: profile, key: 'Backspace' }).catch(() => {});
      await controllerAction(controllerUrl, 'keyboard:press', { profileId: profile, key: 'Delete' }).catch(() => {});
      await controllerAction(controllerUrl, 'keyboard:type', {
        profileId: profile,
        text: keyword,
        delay: 80 + Math.floor(Math.random() * 60),
      }).catch(() => {});
    }

    // 操作之间要等待：给输入法/站内联想一点稳定时间
    await new Promise((r) => setTimeout(r, 420));

    // 仅用于诊断：记录“相关搜索/推荐词”是否出现及其内容（不做点击/纠错）
    let suggestionProbe: any = null;
    try {
      const raw = await controllerAction(controllerUrl, 'browser:execute', {
        profile,
        script: `(() => {
          const wrap = document.querySelector('.query-note-wrapper');
          if (!wrap) return { visible: false, items: [], active: null };
          const r = wrap.getBoundingClientRect();
          const visible =
            r.width > 10 && r.height > 10 && r.bottom > 0 && r.top < (window.innerHeight || 0);
          const items = Array.from(wrap.querySelectorAll('.item-text'))
            .map((el) => (el && el.textContent ? el.textContent.trim() : ''))
            .filter(Boolean)
            .slice(0, 8);
          const activeEl =
            wrap.querySelector('.rec-query.active, .rec-query.selected, .rec-query.current, [aria-selected=\"true\"]') ||
            null;
          const active = activeEl && activeEl.textContent ? activeEl.textContent.trim().slice(0, 80) : null;
          return { visible, items, active };
        })()`,
      });
      suggestionProbe = (raw as any)?.result ?? (raw as any)?.data?.result ?? raw ?? null;
    } catch {
      suggestionProbe = null;
    }

    // 开发阶段：必须保证输入框中确实出现目标 keyword，否则直接失败（不做无脑重试）
    let activeValue: any = '';
    try {
      const raw = await controllerAction(controllerUrl, 'browser:execute', {
        profile,
        script: `(() => {
          const el = document.activeElement;
          if (!el) return '';
          const tag = (el.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea') {
            const v = el.value || '';
            return (typeof v === 'string') ? v : String(v || '');
          }
          if (el.isContentEditable) return (el.textContent || '');
          return '';
        })()`,
      });
      activeValue = (raw as any)?.result ?? (raw as any)?.data?.result ?? raw ?? '';
    } catch {
      activeValue = '';
    }

    const rawValue = await readSearchInputValue(config, selector).catch(() => '');
    const trimmedExpected = String(keyword || '').trim();
    const trimmedActive = typeof activeValue === 'string' ? activeValue.trim() : '';
    const trimmedRaw = typeof rawValue === 'string' ? rawValue.trim() : '';

    const matches = (trimmedActive && trimmedActive === trimmedExpected) || (trimmedRaw && trimmedRaw === trimmedExpected);
    const valueMismatch = !matches;
    if (valueMismatch) {
      console.warn(
        `[SearchExecutor] keyword not detected in input, continue to press Enter. active="${trimmedActive}", selectorValue="${trimmedRaw}", expected="${trimmedExpected}"`,
      );
    }

    async function readUrl(): Promise<string> {
      try {
        const raw = await controllerAction(controllerUrl, 'browser:execute', {
          profile,
          script: 'location.href',
        });
        const v = (raw as any)?.result ?? (raw as any)?.data?.result ?? raw ?? '';
        return typeof v === 'string' ? v : String(v || '');
      } catch {
        return '';
      }
    }

    async function waitForSearchResultUrl(maxWaitMs: number): Promise<{ ok: boolean; url: string }> {
      const start = Date.now();
      let last = '';
      while (Date.now() - start < maxWaitMs) {
        last = await readUrl();
        if (typeof last === 'string' && last.includes('/search_result')) {
          return { ok: true, url: last };
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      return { ok: false, url: last };
    }

    // 中文输入法下 Enter 可能先“确认输入”而不触发搜索：最多 2 次 Enter（不循环重搜）
    let navigated = false;
    let lastUrl = '';
    const useSearchButton = searchInputContainerId === 'xiaohongshu_home.search_input';

    if (useSearchButton) {
      console.log('[SearchExecutor] Trigger search via home search button ...');
      try {
        const clickResp = await controllerAction(controllerUrl, 'container:operation', {
          containerId: 'xiaohongshu_home.search_button',
          operationId: 'click',
          sessionId: profile,
        });
        const ok = Boolean(clickResp?.success !== false && (clickResp?.data?.success ?? true));
        if (!ok) {
          console.warn('[SearchExecutor] search button click failed', clickResp);
        }
      } catch (error: any) {
        console.warn('[SearchExecutor] search button click failed', error?.message || String(error));
      }
      await new Promise((r) => setTimeout(r, 650));
      const waited = await waitForSearchResultUrl(9000);
      lastUrl = waited.url;
      navigated = waited.ok;
    }

    if (!navigated) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        console.log(`[SearchExecutor] Press Enter (attempt=${attempt}/2) ...`);
        await controllerAction(controllerUrl, 'keyboard:press', { profileId: profile, key: 'Enter' }).catch(() => {});
        await new Promise((r) => setTimeout(r, 450));
        const waited = await waitForSearchResultUrl(7000);
        lastUrl = waited.url;
        if (waited.ok) {
          navigated = true;
          break;
        }
      }
    }

    console.log('[SearchExecutor] Search triggered, waiting for results...');
    if (!navigated) {
      return {
        success: false,
        error: `search_not_navigated_after_enter (url="${lastUrl || ''}")`,
        debug: {
          selector,
          searchInputContainerId,
          suggestions: suggestionProbe,
          valueMismatch,
          activeValue: trimmedActive,
          selectorValue: trimmedRaw,
        },
      };
    }
    return {
      success: true,
      debug: {
        selector,
        searchInputContainerId,
        suggestions: suggestionProbe,
        valueMismatch,
        activeValue: trimmedActive,
        selectorValue: trimmedRaw,
      },
    };
  } catch (error: any) {
    console.error(`[SearchExecutor] Search failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function performSystemClickFocus(
  config: SearchExecutorConfig,
  selector: string
): Promise<{ success: boolean; focused: boolean; error?: string }> {
  const { profile, controllerUrl, searchInputContainerId } = config;
  
  try {
    const clickResp = await controllerAction(controllerUrl, 'container:operation', {
      containerId: searchInputContainerId,
      operationId: 'click',
      config: { selector, useSystemMouse: true },
      sessionId: profile
    });
    console.log('[SearchExecutor] System click on search bar executed', clickResp);

    const focused = await isSearchInputFocused(config, selector);
    return { success: true, focused };
  } catch (error: any) {
    console.warn('[SearchExecutor] System click on search bar failed:', error.message);
    return { success: false, focused: false, error: error.message };
  }
}
