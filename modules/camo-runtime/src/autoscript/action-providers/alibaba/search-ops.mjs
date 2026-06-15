// Alibaba.com 搜索操作模块

import { gotoUrl, waitForAnchor, evaluateReadonly } from './dom-ops.mjs';
import { buildSearchUrl, SEARCH_RESULT_READY_SCRIPT } from './selectors.mjs';

// 访问搜索结果页
export async function gotoSearchResult(profileId, keyword, options = {}) {
  const url = buildSearchUrl(keyword);
  await gotoUrl(profileId, url, { timeoutMs: options.timeoutMs || 15000 });
  
  // 等待搜索结果加载
  const ready = await waitForAnchor(profileId, ['a[href*="company"]'], {
    timeoutMs: options.waitMs || 10000,
  });
  
  return {
    ok: ready,
    url: url,
    keyword: keyword,
  };
}

// 检查搜索结果页是否就绪
export async function checkSearchReady(profileId) {
  const result = await evaluateReadonly(profileId, SEARCH_RESULT_READY_SCRIPT);
  return result || { ok: false, ready: false };
}
