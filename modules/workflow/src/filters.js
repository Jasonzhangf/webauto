/**
 * 数据过滤器
 */

/**
 * 过滤微博帖子链接
 * @param {string} url - 原始URL
 * @returns {boolean} - 是否为帖子链接
 */
export function isPostUrl(url) {
  if (!url) return false;

  // 匹配微博帖子URL模式
  const postUrlPatterns = [
    /^https?:\/\/(?:www\.)?weibo\.com\/\d+\/[a-zA-Z0-9]+/,
    /^https?:\/\/(?:m\.)?weibo\.com\/detail\/[a-zA-Z0-9]+/,
    /^https?:\/\/(?:www\.)?weibo\.com\/\d+\/\w+/
  ];

  return postUrlPatterns.some(pattern => pattern.test(url));
}

/**
 * 过滤用户主页链接
 * @param {string} url - 原始URL
 * @returns {boolean} - 是否为用户主页
 */
export function isProfileUrl(url) {
  if (!url) return false;

  // 匹配用户主页URL模式
  const profileUrlPatterns = [
    /^https?:\/\/(?:www\.)?weibo\.com\/u\/\d+/,
    /^https?:\/\/(?:www\.)?weibo\.com\/\w+(?:\/(?!detail).*)?$/
  ];

  return profileUrlPatterns.some(pattern => pattern.test(url));
}

/**
 * 过滤链接
 * @param {Array} links - 原始链接数组
 * @returns {Array} - 过滤后的链接数组
 */
export function filterLinks(links) {
  if (!Array.isArray(links)) return [];

  return links.filter(link => {
    const url = link.url || link.href || link;
    return isPostUrl(url) && !isProfileUrl(url);
  });
}
