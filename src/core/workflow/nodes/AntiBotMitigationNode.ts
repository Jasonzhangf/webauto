// 反风控减敏节点：注入少量人类行为与常见隐匿脚本，尝试关闭模态
import BaseNode from './BaseNode';

class AntiBotMitigationNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'AntiBotMitigationNode';
    this.description = '轻量反风控：小幅鼠标移动/滚动、关闭模态、注入webdriver隐藏';
  }
    name: any;
    description: any;

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config } = context;
    try {
      // 隐藏 webdriver
      await page.addInitScript(() => {
        try {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
        } catch {}
        try {
          Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });
        } catch {}
      });

      // 轻量鼠标移动
      const moves = Number(config?.mouseMoves ?? 3);
      const jitter = () => Math.floor(Math.random() * 200) + 50;
      for (let i = 0; i < moves; i++) {
        const x = jitter(), y = jitter();
        await page.mouse.move(x, y, { steps: 3 });
        context.engine?.recordBehavior?.('mouse_move', { x, y });
        await this.sleep(100 + Math.floor(Math.random() * 200));
      }

      // 轻量滚动
      if (config?.scroll !== false) {
        const deltaY = 300 + Math.floor(Math.random() * 300);
        await page.mouse.wheel(0, deltaY);
        context.engine?.recordBehavior?.('scroll', { deltaY });
        await this.sleep(200 + Math.floor(Math.random() * 300));
      }

      // 关闭常见模态
      const selectors = config?.dismissSelectors || [
        'img._turboCom-dialog-close_sm0it_23',
        'img[src*="O1CN01A6UFsG1PK4AGW30nV"]'
      ];
      for (const sel of selectors) {
        const els = await page.$$(sel);
        for (const el of els) {
          try { if (await el.isVisible()) { await el.click({ timeout: 300 }).catch(() => el.evaluate(n=>n.click())); context.engine?.recordBehavior?.('dismiss_try', { selector: sel }); } } catch {}
        }
      }

      // 抖动等待
      const minMs = Number(config?.jitterMinMs ?? 800);
      const maxMs = Number(config?.jitterMaxMs ?? 1800);
      const wait: minMs;
      logger.info(`🛡️ 反风控抖动等待 ${wait} ms` = maxMs > minMs ? (Math.floor(Math.random()*(maxMs-minMs+1))+minMs) );
      await this.sleep(wait);
      return { success: true, variables: { antiBotWaitMs: wait } };
    } catch (e) {
      logger.warn('⚠️ 反风控处理异常: ' + (e?.message || e));
      return { success: true };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        mouseMoves: { type: 'number', default: 3 },
        scroll: { type: 'boolean', default: true },
        jitterMinMs: { type: 'number', default: 800 },
        jitterMaxMs: { type: 'number', default: 1800 },
        dismissSelectors: { type: 'array', items: { type: 'string' } }
      }
    };
  }
}

export default AntiBotMitigationNode;
