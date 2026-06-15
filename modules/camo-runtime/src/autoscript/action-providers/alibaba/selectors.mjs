// Alibaba.com 平台 selector 定义

// 登录检测脚本
export const LOGIN_CHECK_SCRIPT = `(() => {
  var userArea = document.querySelector('.welcome-user');
  var nick = userArea ? userArea.innerText?.trim() : null;
  var bodyText = document.body.innerText;
  var hasGreeting = bodyText.includes('欢迎使用 Alibaba.com') || bodyText.includes('Welcome');
  return {
    isLoggedIn: !!nick || hasGreeting,
    nickText: nick,
  };
})()`;

// 搜索结果提取脚本
export const EXTRACT_SEARCH_RESULTS_SCRIPT = `(() => {
  var links = document.querySelectorAll('a[href*="company"][href*="en.alibaba.com"]');
  var results = [];
  var seen = new Set();
  
  for (var i = 0; i < links.length; i++) {
    var href = links[i].href;
    if (href && href.includes('.en.alibaba.com') && !seen.has(href)) {
      seen.add(href);
      var text = links[i].innerText?.trim() || '';
      // Extract company subdomain
      // Extract company subdomain - using string methods to avoid regex
      var hostPart = href.replace('https://', '').replace('http://', '').split('/')[0];
      var dotIdx = hostPart.indexOf('.en.alibaba.com');
      var companyCode = dotIdx > 0 ? hostPart.substring(0, dotIdx) : null;
      
      if (companyCode && text.length > 0) {
        results.push({ companyCode: companyCode, companyName: text.slice(0, 50), profileUrl: href });
      }
    }
    if (results.length >= 30) break;
  }
  
  return { ok: true, count: results.length, results: results };
})()`;

// 搜索结果页就绪检测脚本
export const SEARCH_RESULT_READY_SCRIPT = `(() => {
  var links = document.querySelectorAll('a[href*="company"]');
  return { 
    ok: true, 
    ready: links.length > 0, 
    linkCount: links.length, 
    url: window.location.href 
  };
})()`;

// 联系方式页提取脚本
export const EXTRACT_CONTACT_INFO_SCRIPT = `(() => { 
  var result = {
    companyName: null,
    contactPerson: null,
    contactTitle: null,
    email: null,
    phone: null,
    fax: null,
    mobile: null,
    website: null,
    phoneHidden: false,
    faxHidden: false,
    mobileHidden: false,
    requiresLogin: false
  };
  
  // Check if login modal appeared (but don't return early - still extract visible info)
  var loginModal = document.querySelector('.tnh-login, [class*="login-modal"]');
  if (loginModal && loginModal.style.display !== 'none') {
    result.requiresLogin = true;
  }
  
  // Company name from title
  var titleText = document.title;
  var forIdx = titleText.indexOf(' for ');
  if (forIdx >= 0) {
    result.companyName = titleText.substring(forIdx + 5).trim();
  }
  
  // Contact person info
  var nameContainer = document.querySelector('.name-container');
  if (nameContainer) {
    var nameText = nameContainer.querySelector('.name');
    var descText = nameContainer.querySelector('.desc');
    result.contactPerson = nameText ? nameText.innerText.trim() : null;
    result.contactTitle = descText ? descText.innerText.trim() : null;
  }
  
  // Website links
  var msgContainer = document.querySelector('.message-container');
  if (msgContainer) {
    var msgItems = msgContainer.querySelectorAll('.msg-item');
    for (var i = 0; i < msgItems.length; i++) {
      var item = msgItems[i];
      var titleEl = item.querySelector('.msg-title');
      var title = titleEl ? titleEl.innerText.trim() : '';
      
      if (title.indexOf('公司网站') >= 0) {
        var links = item.querySelectorAll('a');
        if (links.length > 0) {
          result.website = Array.from(links).map(function(a) { return a.href; }).join(', ');
        }
      } else if (title.indexOf('公司电话') >= 0) {
        var valueEl = item.querySelector('.msg-value');
        var hasHiddenValue = item.innerText.indexOf('查看详情') >= 0;
        result.phone = hasHiddenValue ? 'REQUIRES_LOGIN' : (valueEl ? valueEl.innerText.trim() : null);
        result.phoneHidden = hasHiddenValue;
      } else if (title.indexOf('公司传真') >= 0) {
        var valueEl = item.querySelector('.msg-value');
        var hasHiddenValue = item.innerText.indexOf('查看详情') >= 0;
        result.fax = hasHiddenValue ? 'REQUIRES_LOGIN' : (valueEl ? valueEl.innerText.trim() : null);
        result.faxHidden = hasHiddenValue;
      } else if (title.indexOf('公司移动电话') >= 0) {
        var valueEl = item.querySelector('.msg-value');
        var hasHiddenValue = item.innerText.indexOf('查看详情') >= 0;
        result.mobile = hasHiddenValue ? 'REQUIRES_LOGIN' : (valueEl ? valueEl.innerText.trim() : null);
        result.mobileHidden = hasHiddenValue;
      }
    }
  }
  
  // Email - search in body text
  var bodyText = document.body.innerText;
  var atIndex = bodyText.indexOf('@');
  if (atIndex > 0) {
    var start = atIndex;
    var end = atIndex;
    for (var i = atIndex - 1; i >= 0; i--) {
      var c = bodyText.charAt(i);
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '.' || c === '_' || c === '%') {
        start = i;
      } else {
        break;
      }
    }
    for (var i = atIndex + 1; i < bodyText.length; i++) {
      var c = bodyText.charAt(i);
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '.') {
        end = i;
      } else {
        break;
      }
    }
    result.email = bodyText.substring(start, end + 1);
  }
  
  return result;
})()`;

// 构建搜索 URL
export function buildSearchUrl(keyword) {
  const encoded = encodeURIComponent(keyword);
  return 'https://www.alibaba.com/products/' + encoded + '.html';
}

// 构建公司主页 URL
export function buildCompanyProfileUrl(companyCode) {
  return 'https://' + companyCode + '.en.alibaba.com/company_profile.html';
}

// 构建公司联系页 URL
export function buildContactUrl(companyCode) {
  return 'https://' + companyCode + '.en.alibaba.com/contactinfo.html';
}

// SELECTORS 定义
export const SELECTORS = {
  search: {
    container: '.search-result-list, .products-list',
    companyLink: 'a[href*="company"]',
  },
  company: {
    profile: '.company-profile',
    contactInfo: '.contact-info',
  },
};

export const SEARCH_ANCHORS = {
  container: '.search-result, .products-list',
  companyLink: 'a[href*="en.alibaba.com/company"]',
};
