// 页面快照节点：抓取当前页面的 HTML、内联脚本、外链脚本等元信息
import BaseNode from './BaseNode.js';

export default class PageSnapshotNode extends BaseNode {
  constructor() {
    super();
    this.name = 'PageSnapshotNode';
    this.description = '获取页面 HTML 与脚本清单，用于离线分析';
  }

  async execute(context) {
    const { page, logger, config, engine } = context;
    if (!page) return { success: false, error: 'no page available' };

    const maxHtmlLength = Number(config?.maxHtmlLength ?? 500000);
    const includeInlineScripts = config?.includeInlineScripts !== false; // default true
    const includeExternalScripts = config?.includeExternalScripts !== false; // default true
    const maxInlineScripts = Number(config?.maxInlineScripts ?? 50);
    const maxInlineScriptLength = Number(config?.maxInlineScriptLength ?? 20000);

    try {
      const url = page.url();
      const title = await page.title().catch(() => '');

      // 获取完整 HTML（可能很大）
      let html = await page.content();
      const htmlLength = html.length;
      if (html.length > maxHtmlLength) {
        html = html.slice(0, maxHtmlLength);
      }

      // 通过 evaluate 抓取脚本信息
      const scriptInfo = await page.evaluate((opts) => {
        const res = { inline: [], external: [] };
        try {
          const scripts = Array.from(document.querySelectorAll('script'));
          for (const [i, s] of scripts.entries()) {
            if (s.src) {
              res.external.push({ index: i, src: new URL(s.src, location.href).href });
            } else if (!s.src && opts.includeInlineScripts) {
              const code = s.textContent || '';
              res.inline.push({ index: i, length: code.length, code: code.slice(0, opts.maxInlineScriptLength) });
            }
          }
        } catch {}
        return res;
      }, { includeInlineScripts, maxInlineScriptLength });

      // 限制内联脚本数量
      if (Array.isArray(scriptInfo.inline) && scriptInfo.inline.length > maxInlineScripts) {
        scriptInfo.inline = scriptInfo.inline.slice(0, maxInlineScripts);
      }
      if (!includeInlineScripts) scriptInfo.inline = [];
      if (!includeExternalScripts) scriptInfo.external = [];

      const snapshot = {
        url,
        title,
        html,
        htmlLength,
        truncated: htmlLength > html.length,
        scripts: scriptInfo,
        takenAt: new Date().toISOString()
      };

      engine?.recordBehavior?.('page_snapshot', { url, title, htmlLength, inlineCount: snapshot.scripts.inline.length, externalCount: snapshot.scripts.external.length });

      logger.info(`🧾 页面快照完成: ${url} (HTML ${html.length}/${htmlLength}, inline ${snapshot.scripts.inline.length}, external ${snapshot.scripts.external.length})`);
      return { success: true, results: { snapshot }, variables: { lastSnapshotUrl: url } };
    } catch (e) {
      logger.error('❌ 页面快照失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        maxHtmlLength: { type: 'number', description: 'HTML 截断长度', default: 500000 },
        includeInlineScripts: { type: 'boolean', description: '是否包含内联脚本', default: true },
        includeExternalScripts: { type: 'boolean', description: '是否包含外链脚本', default: true },
        maxInlineScripts: { type: 'number', description: '最多包含的内联脚本数量', default: 50 },
        maxInlineScriptLength: { type: 'number', description: '每个内联脚本截断长度', default: 20000 }
      }
    };
  }
}

