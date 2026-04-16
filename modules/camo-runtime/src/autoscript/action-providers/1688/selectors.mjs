// 1688 平台 selector 定义

// 登录检测脚本 - 修复锚点
export const LOGIN_CHECK_SCRIPT = `(() => {
  var nick = null;
  var userArea = document.querySelector('[class*="nick"]');
  if (userArea) nick = userArea.innerText?.trim();
  var bodyText = document.body.innerText;
  var hasGreeting = bodyText.includes('您好') || bodyText.includes('晚上好') || bodyText.includes('早上好');
  return {
    isLoggedIn: !!nick || hasGreeting,
    nickText: nick,
  };
})()`;

// 联系方式页提取脚本
export const EXTRACT_CONTACT_INFO_SCRIPT = `(() => { 
  var text = document.body.innerText;
  var result = { companyName: null, phone: null, mobile: null, fax: null, address: null, contactPerson: null };
  
  var companyMatch = text.match(/^([^\n]+)\n/);
  if (companyMatch) result.companyName = companyMatch[1].trim();
  
  var phoneMatch = text.match(/电话[：:]\s*([^\n]+)/);
  if (phoneMatch) result.phone = phoneMatch[1].trim();
  
  var mobileMatch = text.match(/手机[：:]\s*([^\n]+)/);
  if (mobileMatch) result.mobile = mobileMatch[1].trim();
  
  var faxMatch = text.match(/传真[：:]\s*([^\n]+)/);
  if (faxMatch) result.fax = faxMatch[1].trim();
  
  var addressMatch = text.match(/地址[：:]\s*([^\n]+)/);
  if (addressMatch) result.address = addressMatch[1].trim();
  
  var contactMatch = text.match(/([\u4e00-\u9fa5]+先生|女士)/);
  if (contactMatch) result.contactPerson = contactMatch[1];
  
  return result;
})()`;

// 搜索结果提取脚本
export const EXTRACT_SEARCH_RESULTS_SCRIPT = `(() => {
  var container = document.querySelector('.feeds-wrapper');
  if (!container) return { ok: false, reason: 'container_not_found' };
  
  var links = container.querySelectorAll('a');
  var results = [];
  var seen = new Set();
  
  for (var i = 0; i < links.length; i++) {
    var href = links[i].href || '';
    if (href.includes('.1688.com/') && href.includes('shop') && !seen.has(href)) {
      seen.add(href);
      var text = links[i].innerText?.trim() || '';
      if (text && (text.includes('公司') || text.includes('厂') || text.includes('贸易') || text.includes('商行'))) {
        results.push({ companyName: text.slice(0, 40), shopUrl: href });
      }
    }
    if (results.length >= 20) break;
  }
  
  return { ok: true, count: results.length, results: results };
})()`;

// 搜索结果页就绪检测脚本
export const SEARCH_RESULT_READY_SCRIPT = `(() => {
  var container = document.querySelector('.feeds-wrapper');
  if (!container) return { ok: false, ready: false, reason: 'container_not_found' };
  
  var links = container.querySelectorAll('a');
  var count = 0;
  for (var i = 0; i < links.length; i++) {
    if (links[i].href && links[i].href.includes('1688.com')) count++;
  }
  
  return { ok: true, ready: count > 0, linkCount: count, url: window.location.href };
})()`;

// 采集商品链接脚本
export const COLLECT_OFFER_LINKS_SCRIPT = `(() => {
  var container = document.querySelector('.feeds-wrapper');
  if (!container) return { ok: false, reason: 'container_not_found' };
  
  var links = container.querySelectorAll('a[href*="offer"]');
  var results = [];
  for (var i = 0; i < links.length; i++) {
    var href = links[i].href;
    if (href && !href.includes('login') && !href.includes('redirect')) {
      results.push({ offerId: links[i].dataset?.offerId || null, url: href });
    }
    if (results.length >= 50) break;
  }
  
  return { ok: true, count: results.length, results: results };
})()`;

// 搜索结果页锚点定义
export const SEARCH_ANCHORS = {
  container: '.feeds-wrapper',
  shopLink: 'a[href*="shop"][href*="1688.com"]',
  companyPattern: /公司|厂|贸易|商行/,
};

// 构建搜索 URL
export function buildSearchUrl(keyword) {
  const encoded = encodeURIComponent(keyword);
  return 'https://s.1688.com/youyuan/index/?tab=search&searchKeyWord=' + encoded;
}

// 从 URL 提取 offerId
export function extractOfferIdFromHref(href) {
  if (!href) return null;
  var match = href.match(/offerId[=/]([^&]+)/);
  if (match) return match[1];
  match = href.match(/\/(\d+)\.htm/);
  if (match) return match[1];
  return null;
}

// 构建店铺联系页 URL
export function buildShopContactUrl(shopUrl) {
  if (!shopUrl) return null;
  var match = shopUrl.match(/shop(\w+)\.1688\.com/);
  if (match) {
    return 'https://shop' + match[1] + '.1688.com/page/contactinfo.htm';
  }
  return shopUrl.replace(/\.1688\.com\/?$/, '.1688.com/page/contactinfo.htm');
}

// SELECTORS 定义
export const SELECTORS = {
  search: {
    input: '#alisearch-input',
    feedsColumn: '.feeds-wrapper',
    offerItem: '.offer-item',
  },
  shop: {
    contactTab: 'li.contactinfo',
    companyInfo: '.company-info',
  },
};

// 搜索结果页相关 SELECTORS（兼容旧代码）
export const SEARCH_SELECTORS = {
  container: '.feeds-wrapper',
  shopLink: 'a[href*="shop"][href*="1688.com"]',
  offerLink: 'a[href*="offer"]',
};
