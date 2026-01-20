/**
 * SearchExecutor helper
 *
 * 处理搜索输入、焦点检查和搜索执行
 */

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
}

export async function controllerAction(
  controllerUrl: string,
  action: string,
  payload: any = {}
): Promise<any> {
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
  return data.data || data;
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
    return document.activeElement === el;
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
    return (el as HTMLInputElement).value || '';
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

    const typeResp = await controllerAction(controllerUrl, 'container:operation', {
      containerId: searchInputContainerId,
      operationId: 'type',
      config: {
        selector,
        text: keyword,
        clear_first: true,
      },
      sessionId: profile
    });

    const typePayload = (typeResp as any)?.data ?? typeResp;
    if (!typePayload?.success) {
      return {
        success: false,
        error: `Search input type failed: ${typePayload?.error || 'unknown'}`
      };
    }

    if (searchInputContainerId === 'xiaohongshu_search.search_bar') {
      await controllerAction(controllerUrl, 'container:operation', {
        containerId: searchInputContainerId,
        operationId: 'key',
        config: { key: 'Enter' },
        sessionId: profile,
      }).catch(() => {});
    } else {
      await controllerAction(controllerUrl, 'keyboard:press', { profileId: profile, key: 'Enter' }).catch(() => {});
    }

    console.log('[SearchExecutor] Search triggered, waiting for results...');
    return { success: true };
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