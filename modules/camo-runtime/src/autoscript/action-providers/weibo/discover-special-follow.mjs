/**
 * Discover Special Follow Group URL
 * 
 * 动态发现微博"特别关注"分组的 URL
 * 
 * 风控规则：
 * - ❌ 禁止用脚本试探寻找元素
 * - ✅ 使用 devtools eval 探索页面结构
 * - ✅ 找到 selector 后单次精准 click
 * - ✅ 用户手动导航到目标页面后脚本只提取数据
 */

import { devtoolsEval } from './common.mjs';
import {
  SELECTORS_SPECIAL_FOLLOW_DISCOVERY,
  URL_PATTERNS,
  extractUidFromUrl,
  extractTabidFromHref,
  isLoginPage,
} from './selectors.mjs';

/**
 * 检查当前页面状态
 * @param {string} profileId - 浏览器 profile ID
 * @returns {Promise<{url: string, isLoginPage: boolean, currentUid: string|null}>}
 */
export async function checkPageState(profileId) {
  const url = await devtoolsEval(profileId, 'location.href');
  const currentUid = extractUidFromUrl(url, URL_PATTERNS.userHomePage) ||
                      extractUidFromUrl(url, URL_PATTERNS.followListPage);
  
  return {
    url: String(url || ''),
    isLoginPage: isLoginPage(String(url || '')),
    currentUid: currentUid,
  };
}

/**
 * 从关注列表页提取特别关注分组链接
 * 
 * 需要在关注列表页 (/u/page/follow/{uid}) 上执行
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @returns {Promise<{found: boolean, href: string|null, fullUrl: string|null, tabid: string|null, uid: string|null}>}
 */
export async function extractSpecialFollowLink(profileId) {
  const script = `
(() => {
  const result = {
    found: false,
    href: null,
    fullUrl: null,
    tabid: null,
    uid: null,
    allGroups: []
  };
  
  // 从 URL 提取当前用户 UID
  const uidMatch = location.pathname.match(/\\/u\\/page\\/follow\\/(\\d+)/);
  if (uidMatch) {
    result.uid = uidMatch[1];
  }
  
  // 查找左侧分组导航中的"特别关注"链接
  document.querySelectorAll("a[href]").forEach(el => {
    const text = el.textContent?.trim();
    const href = el.getAttribute("href") || "";
    
    // 记录所有分组链接（用于调试）
    if (href.includes("followGroup") || href.includes("mygroups")) {
      result.allGroups.push({
        text: text?.slice(0, 30),
        href: href.slice(0, 80),
        fullHref: el.href?.slice(0, 100)
      });
    }
    
    // 找到"特别关注"分组
    if (text && text.includes("特别关注") && (href.includes("followGroup") || href.includes("mygroups"))) {
      result.found = true;
      result.href = href;
      result.fullUrl = el.href;
      
      // 提取 tabid 或 gid
      const tabidMatch = href.match(/tabid=(\\d+)/);
      const gidMatch = href.match(/gid=(\\d+)/);
      result.tabid = tabidMatch?.[1] || gidMatch?.[1] || null;
    }
  });
  
  return result;
})()
`;

  const evalResult = await devtoolsEval(profileId, script);
  
  if (!evalResult) {
    return { found: false, href: null, fullUrl: null, tabid: null, uid: null, error: 'eval_failed' };
  }
  
  return {
    found: evalResult.found || false,
    href: evalResult.href || null,
    fullUrl: evalResult.fullUrl || null,
    tabid: evalResult.tabid || null,
    uid: evalResult.uid || null,
    allGroups: evalResult.allGroups || [],
  };
}

/**
 * 从首页提取用户 UID 和"我的关注"链接
 * 
 * 需要在微博首页 (weibo.com) 上执行
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @returns {Promise<{uid: string|null, followListLink: string|null, avatarLink: string|null}>}
 */
export async function extractUserUidAndFollowLink(profileId) {
  const script = `
(() => {
  const result = {
    uid: null,
    followListLink: null,
    avatarLink: null,
    allAvatarLinks: []
  };
  
  // 查找头像链接（获取当前用户 UID）
  document.querySelectorAll("a[href]").forEach(el => {
    const href = el.getAttribute("href") || "";
    
    // 头像链接模式: /u/{uid}
    const uidMatch = href.match(/\\/u\\/(\\d+)/);
    if (uidMatch && href.length < 20) {
      result.allAvatarLinks.push({
        href: href,
        uid: uidMatch[1],
        text: el.textContent?.trim().slice(0, 30)
      });
      
      // 优先选择头像区域（通常是最短链接）
      if (!result.uid) {
        result.uid = uidMatch[1];
        result.avatarLink = href;
      }
    }
  });
  
  // 查找"我的关注"链接（可能在用户菜单中）
  document.querySelectorAll("a[href]").forEach(el => {
    const text = el.textContent?.trim();
    const href = el.getAttribute("href") || "";
    
    if (text && (text.includes("我的关注") || text.includes("关注"))) {
      if (href.includes("/page/follow") || href.includes("/follow")) {
        result.followListLink = el.href;
      }
    }
  });
  
  return result;
})()
`;

  const evalResult = await devtoolsEval(profileId, script);
  
  if (!evalResult) {
    return { uid: null, followListLink: null, avatarLink: null, error: 'eval_failed' };
  }
  
  return {
    uid: evalResult.uid || null,
    followListLink: evalResult.followListLink || null,
    avatarLink: evalResult.avatarLink || null,
    allAvatarLinks: evalResult.allAvatarLinks || [],
  };
}

/**
 * 构建特别关注分组完整 URL
 * 
 * @param {string} uid - 用户 UID
 * @param {string} tabid - 分组 tabid
 * @returns {string} - 完整 URL
 */
export function buildSpecialFollowUrl(uid, tabid) {
  if (!uid || !tabid) return null;
  return `https://weibo.com/u/page/follow/${uid}/followGroup?tabid=${tabid}`;
}

/**
 * 完整发现流程（需要用户手动导航到关注列表页）
 * 
 * 步骤：
 * 1. 用户手动打开微博首页
 * 2. 用户手动点击头像 → 我的关注 → 进入关注列表页
 * 3. 脚本从关注列表页提取特别关注分组链接
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @returns {Promise<{success: boolean, specialFollowUrl: string|null, uid: string|null, tabid: string|null, error?: string}>}
 */
export async function discoverSpecialFollowGroup(profileId) {
  // 1. 检查当前页面状态
  const pageState = await checkPageState(profileId);
  
  if (pageState.isLoginPage) {
    return {
      success: false,
      specialFollowUrl: null,
      uid: null,
      tabid: null,
      error: 'login_page_detected',
      message: '当前页面为登录页，请先手动登录微博',
    };
  }
  
  // 2. 如果在关注列表页，直接提取特别关注链接
  if (pageState.url.includes('/page/follow') || pageState.url.includes('mygroups')) {
    const extractResult = await extractSpecialFollowLink(profileId);
    
    if (extractResult.found) {
      return {
        success: true,
        specialFollowUrl: extractResult.fullUrl,
        uid: extractResult.uid,
        tabid: extractResult.tabid,
        message: '成功提取特别关注分组链接',
      };
    } else {
      return {
        success: false,
        specialFollowUrl: null,
        uid: extractResult.uid,
        tabid: null,
        error: 'special_follow_not_found',
        allGroups: extractResult.allGroups,
        message: '未找到"特别关注"分组，可能该账号未创建分组',
      };
    }
  }
  
  // 3. 如果在首页，提示用户需要手动导航
  if (pageState.url.includes('weibo.com') && !pageState.url.includes('/u/')) {
    return {
      success: false,
      specialFollowUrl: null,
      uid: pageState.currentUid,
      tabid: null,
      error: 'need_manual_navigation',
      message: '请在微博首页手动点击：头像 → 我的关注，进入关注列表页后再执行发现',
    };
  }
  
  // 4. 其他情况
  return {
    success: false,
    specialFollowUrl: null,
    uid: pageState.currentUid,
    tabid: null,
    error: 'unknown_page',
    message: `当前页面不在已知位置: ${pageState.url}`,
  };
}

// 导出所有函数
export default {
  checkPageState,
  extractSpecialFollowLink,
  extractUserUidAndFollowLink,
  buildSpecialFollowUrl,
  discoverSpecialFollowGroup,
};
