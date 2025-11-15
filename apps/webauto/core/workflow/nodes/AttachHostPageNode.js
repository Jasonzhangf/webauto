// 附着匹配URL的页签为当前page
import BaseNode from './BaseNode.js';

export default class AttachHostPageNode extends BaseNode {
  constructor() {
    super();
    this.name = 'AttachHostPageNode';
    this.description = '在现有浏览器上下文中，选择URL匹配的页面作为当前page';
  }

  getConfigSchema() {
    return {
      type: 'object',
      required: ['urlPattern'],
      properties: {
        urlPattern: { type: 'string', description: '用于匹配的URL正则表达式' },
        bringToFront: { type: 'boolean', default: true },
        waitUntil: { type: 'string', enum: ['load','domcontentloaded','networkidle'], default: 'domcontentloaded' },
        timeout: { type: 'number', default: 15000 }
      }
    };
  }

  async execute(context) {
    const { context: browserContext, logger, config } = context;
    if (!browserContext) return { success: false, error: 'no browser context' };

    try {
      const re = new RegExp(config.urlPattern);
      const pages = browserContext.pages?.() || [];
      let target = null;
      for (const p of pages) {
        try { if (re.test(p.url())) { target = p; } } catch {}
      }
      if (!target) return { success: false, error: 'no page matches urlPattern' };

      if (config.bringToFront !== false) { try { await target.bringToFront(); } catch {} }
      try { await target.waitForLoadState(config.waitUntil || 'domcontentloaded', { timeout: config.timeout || 15000 }); } catch {}

      logger.info(`🔀 已附着页面: ${target.url()}`);
      return { success: true, page: target };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  }
}

