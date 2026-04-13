/**
 * Weibo DOM Selectors - Special Follow Monitor
 * 
 * 选择器基于微博网页版 2026-04-07 勘验结果
 * 使用 class 通配符匹配以应对微博动态 class 前缀
 */

// ============================================
// 特别关注分组发现选择器
// ============================================

export const SELECTORS_SPECIAL_FOLLOW_DISCOVERY = {
  // 头像链接（获取当前用户 UID）
  // href: /u/{uid}
  avatarLink: "a[href*='/u/']",
  
  // 左侧分组导航容器
  // class 包含 _side_1ubn9 或 _wrap_1ubn9
  sideNavContainer: "[class*='_side'], [class*='_wrap']",
  
  // 分组导航链接（通用）
  // href 包含 followGroup?tabid= 或 mygroups?gid=
  groupNavLink: "a[href*='followGroup'], a[href*='mygroups']",
  
  // 特别关注分组文本匹配
  // 用于在分组列表中定位"特别关注"分组
  specialFollowText: "特别关注",
  
  // 好友圈分组文本匹配
  friendCircleText: "好友圈",
  
  // 全部关注分组文本匹配
  allFollowText: "全部关注",
};

// ============================================
// 用户列表提取选择器
// ============================================

export const SELECTORS_USER_LIST = {
  // 用户卡片（虚拟列表）
  // vue-recycle-scroller 虚拟滚动容器
  userCard: ".vue-recycle-scroller__item-view, .vue-recycle-scroller__item-wrapper",
  
  // 用户链接
  // href: /u/{uid}
  userLink: "a[href*='/u/']",
  
  // 用户名提取
  // 从卡片文本第一行提取
  userNameExtractor: (cardText) => {
    const lines = cardText?.trim().split("\n") || [];
    return lines[0]?.trim().slice(0, 50) || "";
  },
  
  // UID 提取正则
  // 从 href 提取数字 UID
  uidRegex: /\/u\/(\d+)/,
};

// ============================================
// 用户主页新帖检测选择器
// ============================================

export const SELECTORS_USER_POSTS = {
  // 微博卡片
  postCard: "[class*='card-wrap'], .wbpro-feed-item, [class*='feed-item']",
  
  // 微博内容
  postContent: ".wbpro-feed-content, [class*='detail_wbpro'], [class*='content']",
  
  // 发布时间
  postTime: ".wbpro-feed-time, [class*='from'], [class*='time']",
  
  // 微博 ID（用于唯一标识）
  // href 格式: weibo.com/{uid}/{weiboId}
  postIdLink: "a[href*='weibo.com']",
  
  // weiboId 提取正则
  weiboIdRegex: /weibo\.com\/\d+\/([A-Za-z0-9]+)/,
};

// ============================================
// 风控检测选择器
// ============================================

export const SELECTORS_RISK_CONTROL = {
  // 登录页 URL 关键词
  loginUrlKeywords: ["newlogin", "login", "signup"],
  
  // 登录页容器
  loginContainer: "[class*='login'], [class*='newlogin']",
  
  // 验证码容器
  captchaContainer: "[class*='captcha'], [class*='verify']",
};

// ============================================
// URL 模式
// ============================================

export const URL_PATTERNS = {
  // 关注列表首页
  // /u/page/follow/{uid}
  followListPage: /\/u\/page\/follow\/(\d+)/,
  
  // 特别关注分组
  // /u/page/follow/{uid}/followGroup?tabid={tabid}
  specialFollowGroup: /\/u\/page\/follow\/(\d+)\/followGroup\?tabid=(\d+)/,
  
  // 好友圈分组（旧模式）
  // /mygroups?gid={gid}
  myGroups: /\/mygroups\?gid=(\d+)/,
  
  // 用户主页
  // /u/{uid}
  userHomePage: /\/u\/(\d+)/,
  
  // 微博详情页
  // /{uid}/{weiboId}
  postDetail: /\/(\d+)\/([A-Za-z0-9]+)/,
};

// ============================================
// 辅助函数
// ============================================

/**
 * 从 URL 提取 UID
 * @param {string} url - 微博 URL
 * @param {RegExp} pattern - URL 匹配模式
 * @returns {string|null} - UID 或 null
 */
export function extractUidFromUrl(url, pattern = URL_PATTERNS.userHomePage) {
  const match = url?.match?.(pattern);
  return match ? match[1] : null;
}

/**
 * 从 href 提取分组 tabid
 * @param {string} href - 分组链接 href
 * @returns {string|null} - tabid 或 null
 */
export function extractTabidFromHref(href) {
  // 两种模式:
  // 1. followGroup?tabid=xxx
  // 2. mygroups?gid=xxx
  const tabidMatch = href?.match?.(/tabid=(\d+)/);
  const gidMatch = href?.match?.(/gid=(\d+)/);
  return tabidMatch?.[1] || gidMatch?.[1] || null;
}

/**
 * 检查 URL 是否为登录页
 * @param {string} url - 当前 URL
 * @returns {boolean} - 是否为登录页
 */
export function isLoginPage(url) {
  return SELECTORS_RISK_CONTROL.loginUrlKeywords.some(kw => url?.includes?.(kw));
}

/**
 * 从文本中提取用户名（第一行）
 * @param {string} cardText - 用户卡片完整文本
 * @returns {string} - 用户名
 */
export function extractUserName(cardText) {
  return SELECTORS_USER_LIST.userNameExtractor(cardText);
}
