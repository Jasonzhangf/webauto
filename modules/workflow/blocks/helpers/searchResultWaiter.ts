/**
 * SearchResultWaiter helper
 *
 * 处理搜索结果等待和列表锚点验证
 */

import { getCurrentUrl, urlKeywordEquals, probeSearchPageState } from './searchPageState.js';

export interface SearchResultWaiterConfig {
  profile: string;
  controllerUrl: string;
  keyword: string;
  maxWaitMs?: number;
}

export interface ListAnchor {
  selector?: string;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface WaitForSearchResultsResult {
  ok: boolean;
  noResults: boolean;
  listAnchor?: ListAnchor;
  url: string;
}

async function verifySearchResultListAnchor(
  profile: string,
  controllerUrl: string
): Promise<{ found: boolean; selector?: string; rect?: any; error?: string }> {
  try {
    const serviceUrl = controllerUrl.replace('/v1/controller/action', '');
    const { verifyAnchorByContainerId } = await import('./containerAnchors.js');
    const anchor = await verifyAnchorByContainerId('xiaohongshu_search.search_result_list', profile, serviceUrl);
    
    if (!anchor.found) {
      return {
        found: false,
        error: anchor.error || 'anchor_not_found',
        selector: anchor.selector,
        rect: anchor.rect
      };
    }
    
    return {
      found: true,
      selector: anchor.selector,
      rect: anchor.rect
    };
  } catch (error: any) {
    return { found: false, error: error.message };
  }
}

export async function waitForSearchResultsReady(
  config: SearchResultWaiterConfig
): Promise<WaitForSearchResultsResult> {
  const {
    profile,
    controllerUrl,
    keyword,
    maxWaitMs = 30000
  } = config;
  
  const start = Date.now();
  let lastUrl = '';

  while (Date.now() - start < maxWaitMs) {
    lastUrl = await getCurrentUrl({ profile, controllerUrl });
    
    if (lastUrl.includes('captcha') || lastUrl.includes('verify')) {
      return { ok: false, noResults: false, url: lastUrl };
    }

    const urlLooksRight = lastUrl.includes('/search_result') && urlKeywordEquals(lastUrl, keyword);
    if (!urlLooksRight) {
      await new Promise(resolve => setTimeout(resolve, 800));
      continue;
    }

    const listAnchor = await verifySearchResultListAnchor(profile, controllerUrl);
    if (listAnchor.found && listAnchor.rect) {
      return {
        ok: true,
        noResults: false,
        listAnchor: { selector: listAnchor.selector, rect: listAnchor.rect },
        url: lastUrl,
      };
    }

    const probe = await probeSearchPageState({ profile, controllerUrl });
    if (probe.hasNoResultText) {
      return { ok: false, noResults: true, url: lastUrl };
    }
    
    if (probe.hasItems) {
      return { ok: true, noResults: false, url: lastUrl };
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { ok: false, noResults: false, url: lastUrl };
}