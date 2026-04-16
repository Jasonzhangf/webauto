// 1688 店铺联系方式采集模块 - 使用 camo 协议级操作
// 禁止使用页面 JS 触发任何交互行为

import { evaluateReadonly, sleep, gotoUrl, waitForAnchor, clickBySelector, scrollPage } from './dom-ops.mjs';
import { EXTRACT_CONTACT_INFO_SCRIPT, SELECTORS, buildShopContactUrl } from './selectors.mjs';

// 跳转到店铺页面并采集联系方式
export async function collectShopContact(profileId, shopUrl, options = {}) {
  if (!shopUrl) {
    return { ok: false, reason: 'shop_url_required' };
  }
  
  const contactUrl = buildShopContactUrl(shopUrl);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
  
  // 1. goto 店铺首页（协议级）
  const gotoResult = await gotoUrl(profileId, contactUrl, { timeoutMs });
  if (!gotoResult?.ok) {
    return { ok: false, reason: 'goto_failed', shopUrl, contactUrl };
  }
  
  // 2. 等待页面加载
  await sleep(3000);
  
  // 3. 等待店铺页面就绪 - 检测公司名
  const anchorResult = await waitForAnchor(profileId, '[class*="company"]', { timeoutMs: 10000 });
  if (!anchorResult.ok) {
    // 尝试备选锚点
    const altAnchor = await waitForAnchor(profileId, 'body', { timeoutMs: 5000 });
    if (!altAnchor.ok) {
      return { ok: false, reason: 'shop_page_not_loaded', shopUrl, contactUrl };
    }
  }
  
  // 4. 点击"联系方式" tab
  const clickResult = await clickBySelector(profileId, SELECTORS.shopContact.contactTab, { timeoutMs: 5000 });
  if (!clickResult?.ok) {
    return { ok: false, reason: 'contact_tab_click_failed', shopUrl, contactUrl, clickResult };
  }
  
  // 5. 等待联系方式内容加载
  await sleep(2000);
  
  // 6. 提取联系方式信息（单次 evaluateReadonly）
  const contactResult = await evaluateReadonly(profileId, EXTRACT_CONTACT_INFO_SCRIPT, { timeoutMs: 10000 });
  
  return {
    ok: contactResult?.companyName ? true : false,
    shopUrl: shopUrl,
    contactUrl: contactUrl,
    data: contactResult || {},
  };
}

// 批量获取店铺联系方式信息
export async function collectShopContactsBatch(profileId, shopUrls, options = {}) {
  const results = [];
  const collected = [];
  
  for (const shopUrl of shopUrls) {
    const result = await collectShopContact(profileId, shopUrl, options);
    results.push(result);
    
    if (result.ok && result.data?.companyName) {
      collected.push({
        shopUrl: shopUrl,
        companyName: result.data.companyName,
        phone: result.data.phone,
        mobile: result.data.mobile,
        fax: result.data.fax,
        address: result.data.address,
        contactPerson: result.data.contactPerson,
      });
    }
    
    // 等待间隔（避免高频）
    await sleep(2000);
  }
  
  return {
    ok: true,
    totalShops: shopUrls.length,
    collectedCount: collected.length,
    results: results,
    collected: collected,
  };
}
