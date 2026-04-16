// 1688 店铺联系方式采集 Container - 使用 WebAuto 架构
// 自动化流程：goto shop -> click contact tab -> extract info -> save

import { evaluateReadonly, sleep, gotoUrl, waitForAnchor, clickBySelector } from './dom-ops.mjs';
import { EXTRACT_CONTACT_INFO_SCRIPT, SELECTORS, buildShopContactUrl } from './selectors.mjs';

export const container = {
  meta: {
    name: '1688-shop-contact',
    description: '采集1688店铺联系方式',
    params: [
      { name: 'shopUrl', type: 'string', required: true, description: '店铺URL' },
      { name: 'outputPath', type: 'string', required: false, description: '输出文件路径' },
    ],
    returns: {
      companyName: '公司名称',
      phone: '电话',
      mobile: '手机',
      fax: '传真',
      address: '地址',
      contactPerson: '联系人',
    },
  },

  // Container 入口 - 被 callContainer 调用
  async run(context, params) {
    const { profileId, shopUrl, outputPath } = params;
    
    if (!shopUrl) {
      return { ok: false, reason: 'shop_url_required' };
    }

    const contactUrl = buildShopContactUrl(shopUrl);
    const timeoutMs = 20000;

    // 1. goto 店铺首页
    const gotoResult = await gotoUrl(profileId, contactUrl, { timeoutMs });
    if (!gotoResult?.ok) {
      return { ok: false, reason: 'goto_failed', shopUrl, error: gotoResult };
    }
    
    await sleep(3000);

    // 2. 等待店铺页面就绪
    await waitForAnchor(profileId, '[class*="company"]', { timeoutMs: 10000 });

    // 3. 点击"联系方式" tab
    const clickResult = await clickBySelector(profileId, SELECTORS.shopContact.contactTab, { timeoutMs: 5000 });
    if (!clickResult?.ok) {
      return { ok: false, reason: 'contact_tab_click_failed', clickResult };
    }

    await sleep(2000);

    // 4. 提取联系方式
    const contactData = await evaluateReadonly(profileId, EXTRACT_CONTACT_INFO_SCRIPT, { timeoutMs: 10000 });

    const result = {
      ok: contactData?.companyName ? true : false,
      shopUrl: shopUrl,
      contactUrl: contactUrl,
      data: contactData || {},
    };

    // 5. 如果有 outputPath，保存到文件
    if (outputPath && result.ok) {
      const fs = await import('fs');
      const contactRecord = {
        shopUrl: shopUrl,
        companyName: contactData.companyName,
        phone: contactData.phone || null,
        mobile: contactData.mobile || null,
        fax: contactData.fax || null,
        address: contactData.address || null,
        contactPerson: contactData.contactPerson || null,
        collectedAt: new Date().toISOString(),
      };
      fs.appendFileSync(outputPath, JSON.stringify(contactRecord) + '\n');
    }

    return result;
  },
};

export default container;
