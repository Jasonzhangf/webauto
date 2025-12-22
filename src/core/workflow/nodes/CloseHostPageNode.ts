// 关闭符合 host/urlPattern 的页面(Tab)
import BaseNode from './BaseNode';

export default class CloseHostPageNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'CloseHostPageNode';
    this.description = '关闭匹配 host/urlPattern 的浏览器页面(Tab)';
  }
    name: any;

  async execute(context: any, params: any): Promise<any> {
    const { context: browserContext, logger, config } = context;
    if (!browserContext) return { success: false, error: 'no browser context' };

    const hostIncludes = config?.hostIncludes || null;
    const urlPattern = config?.urlPattern || null;
    const closeAll = !!config?.closeAll; // 默认只关最新一个

    try {
      const pages = browserContext.pages?.() || [];
      const matched = [];
      for (const p of pages) {
        try {
          const u = p.url() || '';
          let ok = false;
          if (hostIncludes && u.includes(hostIncludes)) ok = true;
          if (!ok && urlPattern) {
            try { const re = new RegExp(urlPattern); ok = re.test(u); } catch {}
          }
          if (ok) matched.push(p);
        } catch {}
      }

      if (!matched.length) {
        logger.warn('⚠️ 未找到匹配的页面可关闭');
        return { success: true, variables: { closedCount: 0 } };
      }

      let count = 0;
      if (closeAll) {
        for (const p of matched) { try { await p.close(); count++; } catch {} }
      } else {
        const last = matched[matched.length - 1];
        try { await last.close(); count = 1; } catch {}
      }

      logger.info(`🗙 已关闭匹配页面: ${count} 个`);
      return { success: true, variables: { closedCount: count } };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        hostIncludes: { type: 'string', description: 'URL 中包含的主机子串，如 air.1688.com' },
        urlPattern: { type: 'string', description: 'URL 的正则表达式匹配' },
        closeAll: { type: 'boolean', description: '是否关闭所有匹配页面', default: false }
      },
      required: []
    };
  }
}

