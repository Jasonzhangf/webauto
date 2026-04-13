/**
 * New Post Detection
 * 
 * 检测用户主页的最新微博
 */

import { devtoolsEval } from './common.mjs';
import { isLoginPage } from './selectors.mjs';

/**
 * 从用户主页提取最新微博
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @returns {Promise<{success: boolean, weiboId?: string, weiboLink?: string, contentPreview?: string, timeText?: string, error?: string}>}
 */
export async function extractLatestWeibo(profileId) {
  // 1. 检查是否为登录页
  const url = await devtoolsEval(profileId, 'location.href');
  if (isLoginPage(String(url || ''))) {
    return {
      success: false,
      error: 'login_page_detected',
      message: '当前页面为登录页，请先手动登录',
    };
  }
  
  // 2. 提取第一条微博（使用 article 选择器）
  const script = `
(() => {
  const articles = document.querySelectorAll("article");
  if (articles.length === 0) {
    return { hasWeibo: false, message: "没有找到微博卡片" };
  }
  
  const firstArticle = articles[0];
  
  // 查找微博链接（格式：https://weibo.com/{uid}/{shortId}）
  const links = firstArticle.querySelectorAll("a[href]");
  const weiboLink = Array.from(links).find(l => {
    const href = l.href;
    // 匹配 /数字/字母数字 的短链接格式
    return href.match(/\\/\\d+\\/[A-Za-z0-9]+$/) && l.className.includes("_time");
  });
  
  if (!weiboLink) {
    return { hasWeibo: false, message: "没有找到微博链接" };
  }
  
  // 提取微博 ID（短链接 ID）
  const href = weiboLink.href;
  const match = href.match(/\\/\\d+\\/([A-Za-z0-9]+)$/);
  const weiboId = match ? match[1] : null;
  
  // 提取时间
  const timeText = weiboLink.textContent?.trim() || "";
  
  // 提取内容预览
  const contentPreview = firstArticle.textContent?.trim().slice(0, 200);
  
  return {
    hasWeibo: true,
    weiboId,
    weiboLink: href,
    timeText,
    contentPreview
  };
})()
`;

  const evalResult = await devtoolsEval(profileId, script);
  
  if (!evalResult) {
    return {
      success: false,
      error: 'eval_failed',
      message: '提取微博失败',
    };
  }
  
  if (!evalResult.hasWeibo) {
    return {
      success: false,
      error: 'no_weibo_found',
      message: evalResult.message || '没有找到微博',
    };
  }
  
  return {
    success: true,
    weiboId: evalResult.weiboId,
    weiboLink: evalResult.weiboLink,
    timeText: evalResult.timeText,
    contentPreview: evalResult.contentPreview,
  };
}

/**
 * 检测新帖
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {string} uid - 用户 UID
 * @param {string} lastWeiboId - 上次记录的微博 ID
 * @returns {Promise<{hasNew: boolean, newWeiboId?: string, newWeiboLink?: string, contentPreview?: string, timeText?: string}>}
 */
export async function detectNewWeibo(profileId, uid, lastWeiboId) {
  // 导航到用户主页（需要外部调用 camo goto）
  // 这里假设已经在用户主页
  
  const result = await extractLatestWeibo(profileId);
  
  if (!result.success) {
    return {
      hasNew: false,
      error: result.error,
      message: result.message,
    };
  }
  
  // 对比微博 ID
  const currentWeiboId = result.weiboId;
  const hasNew = currentWeiboId !== lastWeiboId && lastWeiboId !== null;
  
  return {
    hasNew,
    newWeiboId: currentWeiboId,
    newWeiboLink: result.weiboLink,
    contentPreview: result.contentPreview,
    timeText: result.timeText,
    isSame: currentWeiboId === lastWeiboId,
  };
}

export default {
  extractLatestWeibo,
  detectNewWeibo,
};
