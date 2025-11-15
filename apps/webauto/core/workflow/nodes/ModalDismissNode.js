// 模态关闭节点：扫描选择器并点击关闭按钮
import BaseNode from './BaseNode.js';

class ModalDismissNode extends BaseNode {
  constructor() {
    super();
    this.name = 'ModalDismissNode';
    this.description = '查找并关闭页面中的模态/弹窗（多选择器，重试次数可配）';
  }

  async execute(context) {
    const { page, logger, config } = context;
    const selectors = Array.isArray(config?.selectors) && config.selectors.length
      ? config.selectors
      : [
          'img._turboCom-dialog-close_sm0it_23',
          'img[src*="O1CN01A6UFsG1PK4AGW30nV"]',
          '[class*="dialog"] [class*="close"]',
          '[class*="popup"] [class*="close"]',
          'button[class*="close"], .dialog-close, .sm-dialog-close, .close',
          '[aria-label="关闭"], [aria-label="Close"], [aria-label="close"]'
        ];
    const maxAttempts = Number(config?.maxAttempts ?? 5);
    const retryDelay = Number(config?.retryDelay ?? 500);
    let totalClicks = 0;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let clickedThisRound = 0;
        for (const sel of selectors) {
          try {
            const els = await page.$$(sel);
            for (const el of els) {
              try {
                if (await el.isVisible()) {
                  await el.click({ timeout: 300 }).catch(() => el.evaluate(n => n.click()));
                  context.engine?.recordBehavior?.('modal_click', { selector: sel });
                  clickedThisRound++;
                }
              } catch {}
            }
          } catch {}
        }
        totalClicks += clickedThisRound;
        if (clickedThisRound === 0) {
          // 没有可点击的弹窗，认为完成
          break;
        }
        await this.sleep(retryDelay);
      }

      logger.info(`🧹 模态关闭完成，共点击 ${totalClicks} 次`);
      return { success: true, variables: { modalsDismissed: totalClicks } };

    } catch (e) {
      logger.warn('⚠️ 模态关闭异常: ' + (e?.message || e));
      return { success: true, variables: { modalsDismissed: totalClicks } };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        selectors: { type: 'array', items: { type: 'string' } },
        maxAttempts: { type: 'number', default: 5 },
        retryDelay: { type: 'number', default: 500 }
      }
    };
  }
}

export default ModalDismissNode;
