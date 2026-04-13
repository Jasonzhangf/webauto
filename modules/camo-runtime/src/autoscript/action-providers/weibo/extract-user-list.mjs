/**
 * Extract Special Follow User List
 * 
 * 从微博"特别关注"分组页面提取用户 UID 列表
 * 
 * 支持虚拟列表滚动加载完整列表
 */

import { devtoolsEval, runCamo, sleep } from './common.mjs';
import { SELECTORS_USER_LIST, URL_PATTERNS, isLoginPage } from './selectors.mjs';

/**
 * 滚动页面到底部（加载虚拟列表完整内容）
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {object} options - 滚动选项
 * @param {number} options.maxScrolls - 最大滚动次数（保护）
 * @param {number} options.stallRounds - 连续无新内容停止轮数
 * @param {number} options.scrollStep - 每次滚动像素
 * @param {number} options.waitMs - 滚动后等待时间
 * @returns {Promise<{scrolls: number, stalled: boolean, lastUserCount: number}>}
 */
export async function scrollToLoadAllUsers(profileId, options = {}) {
  const maxScrolls = options.maxScrolls || 50;
  const stallRounds = options.stallRounds || 3;
  const scrollStep = options.scrollStep || 500;
  const waitMs = options.waitMs || 800;
  
  let scrolls = 0;
  let stalledRounds = 0;
  let lastUserCount = 0;
  
  while (scrolls < maxScrolls && stalledRounds < stallRounds) {
    // 滚动
    runCamo(['scroll', profileId, '--delta', String(scrollStep)]);
    scrolls++;
    
    // 等待加载
    await sleep(waitMs);
    
    // 检查当前用户数量
    const script = `
(() => {
  const cards = document.querySelectorAll(".vue-recycle-scroller__item-view, .vue-recycle-scroller__item-wrapper");
  const uids = [];
  cards.forEach(card => {
    const link = card.querySelector("a[href]");
    if (link) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/\\/u\\/(\\d+)/);
      if (match) uids.push(match[1]);
    }
  });
  return { count: uids.length, uniqueCount: new Set(uids).size };
})()
`;
    
    const evalResult = await devtoolsEval(profileId, script);
    const currentCount = evalResult?.uniqueCount || 0;
    
    // 判断是否停止增长
    if (currentCount === lastUserCount) {
      stalledRounds++;
    } else {
      stalledRounds = 0;
      lastUserCount = currentCount;
    }
  }
  
  return {
    scrolls,
    stalled: stalledRounds >= stallRounds,
    lastUserCount,
  };
}

/**
 * 从当前页面提取用户列表
 * 
 * 需要在特别关注分组页 (/u/page/follow/{uid}/followGroup?tabid={tabid}) 上执行
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {boolean} scrollFirst - 是否先滚动加载完整列表
 * @returns {Promise<{success: boolean, users: Array<{uid: string, name: string}>, total: number, error?: string}>}
 */
export async function extractUserList(profileId, scrollFirst = true) {
  // 1. 检查是否为登录页
  const url = await devtoolsEval(profileId, 'location.href');
  if (isLoginPage(String(url || ''))) {
    return {
      success: false,
      users: [],
      total: 0,
      error: 'login_page_detected',
      message: '当前页面为登录页，请先手动登录',
    };
  }
  
  // 2. 检查是否在特别关注分组页
  const urlMatch = String(url || '').match(URL_PATTERNS.specialFollowGroup);
  const inSpecialFollowPage = urlMatch || String(url || '').includes('followGroup');
  
  // 3. 如果需要，先滚动加载完整列表
  if (scrollFirst && inSpecialFollowPage) {
    const scrollResult = await scrollToLoadAllUsers(profileId);
    console.log(`[extract-user-list] scrolled ${scrollResult.scrolls} times, loaded ${scrollResult.lastUserCount} users`);
  }
  
  // 4. 提取用户列表
  const script = `
(() => {
  const result = {
    url: location.href,
    users: [],
    total: 0,
    pageHeight: document.body.scrollHeight
  };
  
  // 查找用户卡片（虚拟列表）
  document.querySelectorAll(".vue-recycle-scroller__item-view, .vue-recycle-scroller__item-wrapper").forEach(card => {
    const scrollerItem = card.querySelector(".wbpro-scroller-item") || card.querySelector(".wbpro-side-card4");
    const link = scrollerItem ? scrollerItem.querySelector("a[href]") : card.querySelector("a[href]");
    if (link) {
      const href = link.getAttribute("href") || "";
      const uidMatch = href.match(/\\/u\\/(\\d+)/);
      if (uidMatch) {
        const uid = uidMatch[1];
        
        // 提取真实用户名（从第一个 span，不包含帖子内容）
        const contentArea = link.querySelector("[class*=_con]");
        const firstSpan = contentArea ? contentArea.querySelector("span") : null;
        let name = firstSpan ? firstSpan.textContent.trim() : "";
        
        // 如果找不到 span，fallback 到链接文本的前 30 字符
        if (!name) {
          const text = link.textContent?.trim() || "";
          name = text.slice(0, 30);
        }
        
        // 去重
        if (!result.users.find(u => u.uid === uid)) {
          result.users.push({
            uid: uid,
            name: name,
            textPreview: link.textContent?.trim()?.slice(0, 80)
          });
        }
      }
    }
  });
  
  result.total = result.users.length;
  return result;
})()
`;

  const evalResult = await devtoolsEval(profileId, script);
  
  if (!evalResult) {
    return {
      success: false,
      users: [],
      total: 0,
      error: 'eval_failed',
      message: '提取用户列表失败',
    };
  }
  
  return {
    success: true,
    users: evalResult.users || [],
    total: evalResult.total || 0,
    url: evalResult.url,
    pageHeight: evalResult.pageHeight,
  };
}

/**
 * 检查是否有更多用户需要加载
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @returns {Promise<{hasMore: boolean, message?: string}>}
 */
export async function checkHasMoreUsers(profileId) {
  const script = `
(() => {
  // 检查是否有"没有更多内容了"提示
  const noMoreText = document.body.textContent?.includes("没有更多内容了");
  
  // 检查滚动条位置
  const scrollBottom = window.innerHeight + window.scrollY;
  const pageHeight = document.body.scrollHeight;
  const nearBottom = scrollBottom >= pageHeight - 100;
  
  return {
    hasMore: !noMoreText && !nearBottom,
    noMoreText: noMoreText,
    nearBottom: nearBottom,
    scrollBottom: scrollBottom,
    pageHeight: pageHeight
  };
})()
`;

  const evalResult = await devtoolsEval(profileId, script);
  
  return {
    hasMore: evalResult?.hasMore || false,
    details: evalResult,
  };
}

/**
 * 完整用户列表提取流程
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {object} options - 提取选项
 * @param {boolean} options.autoScroll - 是否自动滚动加载完整列表
 * @param {number} options.maxScrolls - 最大滚动次数
 * @returns {Promise<{success: boolean, users: Array<{uid: string, name: string}>, total: number, scrollStats?: object}>}
 */
export async function extractCompleteUserList(profileId, options = {}) {
  const autoScroll = options.autoScroll !== false;
  const maxScrolls = options.maxScrolls || 100;
  
  // 1. 提取初始用户列表
  const initialResult = await extractUserList(profileId, false);
  
  if (!initialResult.success) {
    return initialResult;
  }
  
  if (!autoScroll || initialResult.total === 0) {
    return initialResult;
  }
  
  // 2. 检查是否需要滚动
  const hasMoreCheck = await checkHasMoreUsers(profileId);
  
  if (!hasMoreCheck.hasMore) {
    return {
      ...initialResult,
      message: '已加载完整用户列表',
    };
  }
  
  // 3. 滚动加载完整列表
  const scrollResult = await scrollToLoadAllUsers(profileId, { maxScrolls });
  
  // 4. 再次提取用户列表
  const finalResult = await extractUserList(profileId, false);
  
  return {
    ...finalResult,
    scrollStats: scrollResult,
    message: `通过滚动加载了 ${finalResult.total - initialResult.total} 个额外用户`,
  };
}

// 导出所有函数
export default {
  scrollToLoadAllUsers,
  extractUserList,
  checkHasMoreUsers,
  extractCompleteUserList,
};
