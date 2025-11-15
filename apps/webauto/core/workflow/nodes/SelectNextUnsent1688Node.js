// 在1688搜索结果页选择“未发送过”的下一条候选，并标记 data-webauto-send=1
import BaseNode from './BaseNode.js';
import { has1688Loose } from '../ContactStore.mjs';

export default class SelectNextUnsent1688Node extends BaseNode {
  constructor() {
    super();
    this.name = 'SelectNextUnsent1688Node';
    this.description = '扫描搜索卡片，按公司名去重，选取第一条未发送的候选并标记';
  }

  async execute(context) {
    const { page, logger, variables, config } = context;
    if (!page) return { success: false, error: 'no page available' };
    const startIndex = Number((variables && variables.get('startIndex')) ?? config?.startIndex ?? 0) || 0;
    const maxScan = Number(config?.maxScan ?? 20);

    try {
      // 收集前 maxScan 个卡片的公司名
      const data = await page.evaluate(({ maxScan }) => {
        const out = [];
        const cards = Array.from(document.querySelectorAll('.sm-offer-item, .offer-item, .sm-offer, [class*="offer"]'));
        for (let i = 0; i < Math.min(cards.length, maxScan); i++) {
          const card = cards[i];
          let cname = '';
          for (const sel of ['.desc-text', '.company-name', '.companyName', '.shop-name', '[data-spm*="company"]', '.enterprise-name']) {
            const el = card.querySelector(sel);
            if (el) { cname = (el.innerText || el.textContent || '').trim(); if (cname) break; }
          }
          const a = card.querySelector('span.J_WangWang a.ww-link, a.ww-link[href*="air.1688.com"], a.ww-link[href*="im.1688.com"]');
          out.push({ index: i, companyName: cname, hasLink: !!a });
        }
        return out;
      }, { maxScan });

      logger.info(`📋 候选收集 ${data.length} 条，从 index=${startIndex} 起筛选未发送`);

      let chosen = null;
      for (let i = startIndex; i < data.length; i++) {
        const item = data[i];
        if (!item || !item.companyName || !item.hasLink) continue;
        const exists = has1688Loose({ key: item.companyName });
        if (!exists) { chosen = item; break; }
      }
      // 若从起始位未命中，允许从0开始再找一次
      if (!chosen) {
        for (let i = 0; i < data.length; i++) {
          const item = data[i];
          if (!item || !item.companyName || !item.hasLink) continue;
          const exists = has1688Loose({ key: item.companyName });
          if (!exists) { chosen = item; break; }
        }
      }

      if (!chosen) {
        return { success: false, error: 'no unsent candidate found' };
      }

      // 在页面上标记 data-webauto-send=1
      const markOk = await page.evaluate((idx) => {
        const cards = Array.from(document.querySelectorAll('.sm-offer-item, .offer-item, .sm-offer, [class*="offer"]'));
        const card = cards[idx];
        if (!card) return false;
        const a = card.querySelector('span.J_WangWang a.ww-link, a.ww-link[href*="air.1688.com"], a.ww-link[href*="im.1688.com"]');
        if (!a) return false;
        try { a.setAttribute('data-webauto-send', '1'); a.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch {}
        try { window.__wwClickIndex = idx; } catch {}
        return true;
      }, chosen.index);

      if (!markOk) return { success: false, error: 'failed to mark candidate' };

      logger.info(`🎯 选中未发送对象: [${chosen.index}] ${chosen.companyName}`);
      return { success: true, variables: { companyName: chosen.companyName, chosenIndex: chosen.index } };
    } catch (e) {
      logger.error('❌ SelectNextUnsent1688 失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }

  getConfigSchema(){
    return {
      type: 'object',
      properties: {
        startIndex: { type: 'number', default: 0 },
        maxScan: { type: 'number', default: 20 }
      }
    };
  }
}

