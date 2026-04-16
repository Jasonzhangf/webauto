// 1688 商品链接采集模块 - 使用 camo 协议级操作
// 禁止使用页面 JS 触发任何交互行为
// 仅在采集链接时使用 evaluateReadonly（低频单次）

import { evaluateReadonly, sleep } from './dom-ops.mjs';
import { COLLECT_OFFER_LINKS_SCRIPT, extractOfferIdFromHref } from './selectors.mjs';
import { gotoSearchResult } from './search-ops.mjs';

// 采集当前搜索结果页的商品信息（单次 evaluateReadonly）
export async function collectOfferInfo(profileId, options = {}) {
  const result = await evaluateReadonly(profileId, COLLECT_OFFER_LINKS_SCRIPT, { timeoutMs: 10000 });
  
  if (!result || !result.ok) {
    return {
      ok: false,
      reason: result?.reason || 'evaluate_failed',
      count: 0,
      results: [],
    };
  }
  
  return {
    ok: true,
    count: result.count || 0,
    results: result.results || [],
    url: result.url || null,
  };
}

// 采集并去重商品信息（单次 evaluateReadonly + 内存去重）
export async function collectOfferInfoDedup(profileId, existingOfferIds, options = {}) {
  const existing = new Set(existingOfferIds || []);
  const result = await collectOfferInfo(profileId, options);
  
  if (!result.ok) {
    return result;
  }
  
  // 内存去重（不使用 JS）
  const newResults = result.results.filter(item => !existing.has(item.offerId));
  const newOfferIds = newResults.map(item => item.offerId);
  
  return {
    ok: true,
    count: result.count,
    newCount: newResults.length,
    existingCount: existing.size,
    newResults: newResults,
    newOfferIds: newOfferIds,
    allResults: result.results,
    url: result.url,
  };
}

// 批量采集（多关键字采集，每个关键字一次 evaluateReadonly）
export async function collectOfferInfoBatch(profileId, keywords, options = {}) {
  const results = [];
  const allOfferIds = new Set();
  const allShopUrls = new Set();
  
  for (const keyword of keywords) {
    // 搜索（协议级 goto）
    const searchResult = await gotoSearchResult(profileId, keyword, options);
    if (!searchResult.ok) {
      results.push({
        keyword,
        ok: false,
        reason: searchResult.reason,
      });
      continue;
    }
    
    // 等待间隔（避免高频操作）
    await sleep(1500);
    
    // 采集信息（单次 evaluateReadonly）
    const collectResult = await collectOfferInfoDedup(profileId, allOfferIds, options);
    
    // 提取店铺链接
    const newShopUrls = collectResult.newResults
      .filter(item => item.shopUrl)
      .map(item => item.shopUrl)
      .filter(url => !allShopUrls.has(url));
    
    results.push({
      keyword,
      ok: true,
      resultCount: collectResult.count,
      newCount: collectResult.newCount,
      newShopUrls: newShopUrls.length,
      newResults: collectResult.newResults,
    });
    
    // 累加新的 offerId 和 shopUrl 到内存集合
    for (const id of collectResult.newOfferIds) {
      allOfferIds.add(id);
    }
    for (const url of newShopUrls) {
      allShopUrls.add(url);
    }
    
    // 等待间隔（避免高频操作）
    await sleep(1500);
  }
  
  return {
    ok: true,
    totalKeywords: keywords.length,
    totalOfferIds: allOfferIds.size,
    totalShopUrls: allShopUrls.size,
    results,
    allOfferIds: Array.from(allOfferIds),
    allShopUrls: Array.from(allShopUrls),
  };
}

// 旧函数名兼容
export async function collectOfferLinks(profileId, options = {}) {
  return collectOfferInfo(profileId, options);
}

export async function collectOfferLinksDedup(profileId, existingOfferIds, options = {}) {
  return collectOfferInfoDedup(profileId, existingOfferIds, options);
}
