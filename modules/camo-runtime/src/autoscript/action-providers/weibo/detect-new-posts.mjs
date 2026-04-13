/**
 * Detect New Posts from User Home Page
 * 
 * 从微博用户主页检测新帖（只提取目标用户的原创帖子）
 */

import { devtoolsEval, runCamo, sleep } from './common.mjs';
import { SELECTORS_USER_POSTS, URL_PATTERNS, isLoginPage } from './selectors.mjs';

/**
 * 访问用户主页并提取最新微博
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {string} uid - 用户 UID
 * @returns {Promise<{success: boolean, uid: string, posts: Array, latestWeiboId: string|null, error?: string}>}
 */
export async function fetchUserLatestPosts(profileId, uid) {
  // 1. 导航到用户主页
  const userHomeUrl = `https://weibo.com/u/${uid}`;
  runCamo(['goto', profileId, '--url', userHomeUrl]);
  
  // 2. 等待页面加载
  await sleep(3000);
  
  // 3. 检查是否为登录页
  const url = await devtoolsEval(profileId, 'location.href');
  if (isLoginPage(String(url || ''))) {
    return {
      success: false,
      uid,
      posts: [],
      latestWeiboId: null,
      error: 'login_page_detected',
      message: '检测到登录页，可能触发风控',
    };
  }
  
  // 4. 提取微博列表（只提取目标用户的帖子）
  const script = `
const targetUid = "${uid}";
const result = {
  uid: targetUid,
  posts: [],
  articleCount: 0,
  ownPostCount: 0,
  pageHeight: document.body.scrollHeight
};

document.querySelectorAll("article").forEach((article, idx) => {
  if (idx >= 10) return;
  result.articleCount++;
  
  const post = {
    index: idx,
    weiboId: null,
    uid: null,
    postHref: null,
    timeRaw: null,
    timeISO: null,
    contentPreview: null,
    isOwnPost: false
  };
  
  // 检查是否是目标用户的帖子
  // 方法1：检查用户链接是否存在 /u/{targetUid}
  const userLink = article.querySelector("a[href*='/u/" + targetUid + "']");
  
  // 方法2：检查微博链接是否匹配目标 UID
  article.querySelectorAll("a[href]").forEach(link => {
    const href = link.getAttribute("href") || "";
    // 匹配微博链接格式：/{uid}/{weiboId} 或 /u/{uid}
    const weiboMatch = href.match(/\\/(\\d+)\\/([A-Za-z0-9]+)/);
    const userMatch = href.match(/\\/u\\/(\\d+)/);
    
    if (weiboMatch && weiboMatch[1] === targetUid) {
      post.uid = weiboMatch[1];
      post.weiboId = weiboMatch[2];
      post.postHref = href;
      post.isOwnPost = true;
    }
  });
  
  // 只保留目标用户的帖子
  if (!post.isOwnPost) {
    return; // 跳过转发/其他用户的帖子
  }
  
  result.ownPostCount++;
  
  // 提取时间
  const fullText = article.textContent?.trim() || "";
  const timeMatch = fullText.match(/\\d{1,2}-\\d{1,2}\\s+\\d{2}:\\d{2}/);
  if (timeMatch) {
    post.timeRaw = timeMatch[0];
    const now = new Date();
    const year = now.getFullYear();
    const [datePart, timePart] = timeMatch[0].split(/\\s+/);
    const [month, day] = datePart.split("-");
    const [hour, min] = timePart.split(":");
    post.timeISO = year + "-" + month.padStart(2, "0") + "-" + day.padStart(2, "0") + "T" + hour + ":" + min + ":00+08:00";
  }
  
  // 提取内容（去掉用户名和时间前缀）
  const contentMatch = fullText.match(/来自\\s+[^\\s]+\\s*(.*)/);
  post.contentPreview = contentMatch ? contentMatch[1].trim().slice(0, 150) : fullText.slice(0, 150);
  
  result.posts.push(post);
});

result.latestWeiboId = result.posts[0]?.weiboId || null;
result.latestTimeISO = result.posts[0]?.timeISO || null;

return result;
`;

  const evalResult = await devtoolsEval(profileId, script);
  
  if (!evalResult) {
    return {
      success: false,
      uid,
      posts: [],
      latestWeiboId: null,
      error: 'eval_failed',
      message: '提取微博列表失败',
    };
  }
  
  return {
    success: true,
    uid,
    posts: evalResult.posts || [],
    latestWeiboId: evalResult.latestWeiboId || null,
    latestTimeISO: evalResult.latestTimeISO || null,
    articleCount: evalResult.articleCount || 0,
    ownPostCount: evalResult.ownPostCount || 0,
    pageHeight: evalResult.pageHeight || 0,
  };
}

/**
 * 检查是否有新帖
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {string} uid - 用户 UID
 * @param {string} lastKnownWeiboId - 上次记录的最新微博 ID
 * @returns {Promise<{hasNew: boolean, latestWeiboId: string|null, newPosts: Array, error?: string}>}
 */
export async function checkForNewPosts(profileId, uid, lastKnownWeiboId) {
  const fetchResult = await fetchUserLatestPosts(profileId, uid);
  
  if (!fetchResult.success) {
    return {
      hasNew: false,
      latestWeiboId: lastKnownWeiboId,
      newPosts: [],
      error: fetchResult.error,
      message: fetchResult.message,
    };
  }
  
  // 判断是否有新帖
  const hasNew = fetchResult.latestWeiboId !== lastKnownWeiboId && fetchResult.latestWeiboId !== null;
  
  // 如果有新帖，提取新帖列表
  let newPosts = [];
  if (hasNew && lastKnownWeiboId) {
    const lastKnownIndex = fetchResult.posts.findIndex(p => p.weiboId === lastKnownWeiboId);
    if (lastKnownIndex > 0) {
      newPosts = fetchResult.posts.slice(0, lastKnownIndex);
    } else if (lastKnownIndex === -1) {
      // 上次的帖子不在当前列表中，可能被删除或列表刷新
      // 取前 3 条作为新帖
      newPosts = fetchResult.posts.slice(0, 3);
    }
  } else if (hasNew && !lastKnownWeiboId) {
    // 第一次检查，取第一条作为新帖
    newPosts = fetchResult.posts.slice(0, 1);
  }
  
  return {
    hasNew,
    latestWeiboId: fetchResult.latestWeiboId,
    latestTimeISO: fetchResult.latestTimeISO,
    newPosts,
    totalOwnPosts: fetchResult.ownPostCount,
    articleCount: fetchResult.articleCount,
  };
}

/**
 * 批量检查多个用户的新帖
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {Array<{uid: string, lastWeiboId: string|null}>} users - 用户列表
 * @param {object} options - 选项
 * @param {number} options.delayMs - 每个用户之间的延迟（避免风控）
 * @returns {Promise<{results: Array, total: number, newCount: number}>}
 */
export async function batchCheckForNewPosts(profileId, users, options = {}) {
  const delayMs = options.delayMs || 5000; // 默认 5 秒间隔
  const results = [];
  let newCount = 0;
  
  for (const user of users) {
    const checkResult = await checkForNewPosts(profileId, user.uid, user.lastWeiboId);
    
    results.push({
      uid: user.uid,
      name: user.name || null,
      hasNew: checkResult.hasNew,
      latestWeiboId: checkResult.latestWeiboId,
      newPosts: checkResult.newPosts,
      error: checkResult.error,
      totalOwnPosts: checkResult.totalOwnPosts,
      articleCount: checkResult.articleCount,
    });
    
    if (checkResult.hasNew) {
      newCount++;
    }
    
    // 延迟（避免风控）
    if (users.indexOf(user) < users.length - 1) {
      await sleep(delayMs);
    }
  }
  
  return {
    results,
    total: users.length,
    newCount,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 风控检测（检查当前页面是否触发风控）
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @returns {Promise<{isRisk: boolean, riskType: string|null, message: string}>}
 */
export async function checkRiskControl(profileId) {
  const script = `
const result = {
  isRisk: false,
  riskType: null,
  url: location.href,
  title: document.title
};

// 检查是否为登录页
if (location.href.includes("newlogin") || location.href.includes("login")) {
  result.isRisk = true;
  result.riskType = "login_redirect";
}

// 检查是否有验证码提示
if (document.body.textContent?.includes("验证码") || document.body.textContent?.includes("频繁")) {
  result.isRisk = true;
  result.riskType = "captcha_detected";
}

// 检查是否有异常提示
const alertTexts = ["异常", "频繁操作", "暂时限制", "请稍后再试"];
alertTexts.forEach(text => {
  if (document.body.textContent?.includes(text)) {
    result.isRisk = true;
    result.riskType = "rate_limit";
  }
});

return result;
`;

  const evalResult = await devtoolsEval(profileId, script);
  
  return {
    isRisk: evalResult?.isRisk || false,
    riskType: evalResult?.riskType || null,
    url: evalResult?.url || '',
    message: evalResult?.isRisk ? `检测到风控: ${evalResult.riskType}` : '正常',
  };
}

// 导出所有函数
export default {
  fetchUserLatestPosts,
  checkForNewPosts,
  batchCheckForNewPosts,
  checkRiskControl,
};
