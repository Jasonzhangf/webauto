// Alibaba.com 采集操作模块

import { evaluateReadonly, scrollPage, gotoUrl, waitForAnchor, sleep } from './dom-ops.mjs';
import { EXTRACT_SEARCH_RESULTS_SCRIPT, EXTRACT_CONTACT_INFO_SCRIPT, buildContactUrl } from './selectors.mjs';

// 滚动并采集搜索结果中的公司链接
export async function scrollCollectCompanyLinks(profileId, options = {}) {
  const maxScrolls = Math.max(1, Number(options.maxScrolls) || 5);
  const minResults = Math.max(1, Number(options.minResults) || 10);
  const allResults = [];
  const seen = new Set();
  
  for (let i = 0; i < maxScrolls; i++) {
    // 提取当前可见的公司链接
    const result = await evaluateReadonly(profileId, EXTRACT_SEARCH_RESULTS_SCRIPT);
    
    if (result && result.results) {
      for (const item of result.results) {
        if (!seen.has(item.profileUrl)) {
          seen.add(item.profileUrl);
          allResults.push({
            companyCode: item.companyCode,
            companyName: item.companyName,
            profileUrl: item.profileUrl,
            contactUrl: item.profileUrl?.replace('/company_profile.html', '/contactinfo.html'),
          });
        }
      }
    }
    
    // 如果已收集足够数量，停止滚动
    if (allResults.length >= minResults) {
      break;
    }
    
    // 滚动到下一页
    await scrollPage(profileId, { distance: 800 });
    await sleep(1500);
  }
  
  return {
    ok: true,
    count: allResults.length,
    results: allResults,
  };
}

// 采集单个公司的联系信息
export async function collectCompanyContact(profileId, companyUrl, options = {}) {
  // 提取 companyCode - using string methods
  const hostPart = companyUrl.replace('https://', '').replace('http://', '').split('/')[0];
  const dotIdx = hostPart.indexOf('.en.alibaba.com');
  const companyCode = dotIdx > 0 ? hostPart.substring(0, dotIdx) : null;
  
  if (!companyCode) {
    return { ok: false, reason: 'invalid_company_url' };
  }
  
  // 访问联系页
  const contactUrl = buildContactUrl(companyCode);
  console.log(JSON.stringify({
    event: 'alibaba.collect.goto_contact',
    companyCode,
    url: contactUrl,
  }));
  await gotoUrl(profileId, contactUrl, { timeoutMs: 15000 });
  await sleep(2000);
  
  // 等待页面加载（锚点检测）
  await waitForAnchor(profileId, ['body', '.module-contactPersonNew'], {
    timeoutMs: 10000,
  });
  
  // 提取联系信息
  const result = await evaluateReadonly(profileId, EXTRACT_CONTACT_INFO_SCRIPT, { timeoutMs: 8000 });
  
  return {
    ok: true,
    companyCode: companyCode,
    companyName: result?.companyName || null,
    contactPerson: result?.contactPerson || null,
    contactTitle: result?.contactTitle || null,
    email: result?.email || null,
    phone: result?.phone || null,
    fax: result?.fax || null,
    mobile: result?.mobile || null,
    website: result?.website || null,
    phoneHidden: result?.phoneHidden || false,
    faxHidden: result?.faxHidden || false,
    mobileHidden: result?.mobileHidden || false,
    requiresLogin: result?.requiresLogin || false,
    contactUrl: contactUrl,
  };
}
