// 1688 搜索操作模块 - 使用 camo 协议级操作
// 禁止使用页面 JS 触发任何交互行为

import { evaluateReadonly, sleep, waitForAnchor, gotoUrl, scrollPage } from './dom-ops.mjs';
import { SEARCH_RESULT_READY_SCRIPT, buildSearchUrl, SELECTORS } from './selectors.mjs';

// 跳转到搜索结果页（协议级 goto）
export async function gotoSearchResult(profileId, keyword, options = {}) {
  const url = buildSearchUrl(keyword);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
  
  // 使用协议级 goto
  const result = await gotoUrl(profileId, url, { timeoutMs });
  if (!result?.ok) {
    return { ok: false, reason: 'goto_failed', error: result, url };
  }
  
  // 等待页面加载
  await sleep(2000);
  
  // 等待搜索结果页锚点出现
  const anchorResult = await waitForAnchor(profileId, SELECTORS.search.feedsColumn, { timeoutMs: 10000 });
  if (!anchorResult.ok) {
    return { ok: false, reason: 'search_anchor_not_found', url, anchorResult };
  }
  
  // 检测搜索结果页状态（单次 evaluateReadonly）
  const readyResult = await evaluateReadonly(profileId, SEARCH_RESULT_READY_SCRIPT);
  
  return {
    ok: true,
    url: readyResult?.url || url,
    linkCount: readyResult?.linkCount || 0,
    anchorFound: anchorResult.selector,
  };
}

// 等待搜索结果页就绪（单次 evaluateReadonly）
export async function waitForSearchResultReady(profileId, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 10000;
  
  // 先等待锚点出现
  const anchorResult = await waitForAnchor(profileId, SELECTORS.search.feedsColumn, { timeoutMs });
  if (!anchorResult.ok) {
    return { ok: false, reason: 'anchor_timeout', timeoutMs };
  }
  
  // 检测商品数量（单次 evaluateReadonly）
  const readyResult = await evaluateReadonly(profileId, SEARCH_RESULT_READY_SCRIPT);
  
  return {
    ok: readyResult?.ready && readyResult?.linkCount > 0,
    ready: readyResult?.ready || false,
    linkCount: readyResult?.linkCount || 0,
    url: readyResult?.url || null,
  };
}

// 滚动搜索结果页（协议级 scroll）
export async function scrollSearchResult(profileId, options = {}) {
  const amount = Number(options.amount) > 0 ? Number(options.amount) : 300;
  const direction = String(options.direction || 'down').trim().toLowerCase();
  
  // 使用协议级 scroll
  const result = await scrollPage(profileId, { amount, direction });
  
  // 等待滚动完成
  await sleep(1000);
  
  // 检测当前商品数量（单次 evaluateReadonly）
  const readyResult = await evaluateReadonly(profileId, SEARCH_RESULT_READY_SCRIPT);
  
  return {
    ok: result?.ok,
    scrolled: { amount, direction },
    linkCount: readyResult?.linkCount || 0,
  };
}

// 检测是否在搜索结果页（单次 evaluateReadonly）
export async function isOnSearchResultPage(profileId) {
  const result = await evaluateReadonly(profileId, SEARCH_RESULT_READY_SCRIPT);
  return result && result.ready === true;
}

// 提取搜索结果中的公司名和店铺URL（单次 evaluateReadonly）
export async function extractSearchResults(profileId, options = {}) {
  const maxItems = Number(options.maxItems) > 0 ? Number(options.maxItems) : 20;
  const outputPath = options.outputPath || null;
  
  // 提取脚本 - 从 .feeds-wrapper 容器中提取店铺链接
  const extractScript = `(() => {
    var container = document.querySelector('.feeds-wrapper');
    if (!container) return { ok: false, reason: 'container_not_found' };
    
    var links = container.querySelectorAll('a');
    var results = [];
    var seen = new Set();
    
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href || '';
      // 只提取店铺链接（包含 shop）
      if (href.includes('.1688.com/') && href.includes('shop') && !seen.has(href)) {
        seen.add(href);
        var text = links[i].innerText?.trim() || '';
        // 只保留公司名（包含 公司/厂/贸易/商行）
        if (text && (text.includes('公司') || text.includes('厂') || text.includes('贸易') || text.includes('商行'))) {
          results.push({
            companyName: text.slice(0, 40),
            shopUrl: href
          });
        }
      }
      if (results.length >= ${maxItems}) break;
    }
    
    return { ok: true, count: results.length, results: results };
  })()`;
  
  const result = await evaluateReadonly(profileId, extractScript, { timeoutMs: 10000 });
  
  // 如果有 outputPath，保存到文件
  if (result?.ok && outputPath && result.results?.length > 0) {
    const fs = require('fs');
    const keyword = options.keyword || '';
    const lines = result.results.map(r => JSON.stringify({
      keyword: keyword,
      companyName: r.companyName,
      shopUrl: r.shopUrl,
      collectedAt: new Date().toISOString()
    })).join('\n');
    
    // 确保目录存在
    const dir = require('path').dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.appendFileSync(outputPath, lines + '\n');
  }
  
  return result;
}
