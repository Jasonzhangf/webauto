// 解析页面 HTML/JS 中的 air.1688.com 动态链接与参数（无需实际点击）
import BaseNode from './BaseNode';

function parseTokens(url) {
  try {
    const u = new URL(url);
    const q = Object.fromEntries(u.searchParams.entries());
    // hash 查询
    let hash = u.hash || '';
    let hq = {};
    if (hash) {
      const idx = hash.indexOf('?');
      const queryStr = idx >= 0 ? hash.slice(idx + 1) : (hash.startsWith('#') ? hash.slice(1) : hash);
      try { hq = Object.fromEntries(new URLSearchParams(queryStr).entries()); } catch {}
    }
    const merged = { ...hq, ...q };
    return {
      host: u.host,
      pathname: u.pathname,
      query: merged,
      uid: merged.uid || merged.userId || merged.memberId || merged.touid || null,
      offerId: merged.offerId || merged.offerid || merged.offerID || merged.offerIds || null,
      site: merged.site || null,
      from: merged.from || merged.fromid || null,
      scene: merged.scene || null,
      token: merged.token || merged.t || merged._t || merged.auth || merged.AUTH || null,
      juggler: merged.JUGGLER || merged.juggler || null,
      raw: url
    };
  } catch { return { raw: url }; }
}

export default class ScriptTokenExtractorNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'ScriptTokenExtractorNode';
    this.description = '扫描页面内联/外链脚本与 HTML，提取 air.1688.com 相关的动态链接参数';
  }

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config, results, engine } = context;
    if (!page) return { success: false, error: 'no page available' };

    const hostFilter = config.hostFilter || 'air.1688.com';
    const includeInline = config.includeInline !== false; // 默认包含
    const includeExternal = config.includeExternal !== false; // 默认包含
    const maxExternal = Number(config.maxExternal || 15);
    const externalAllowHosts = Array.isArray(config.externalAllowHosts) && config.externalAllowHosts.length
      ? config.externalAllowHosts : ['alicdn.com', '1688.com', 'alibaba.com'];
    const timeoutMs = Number(config.timeoutMs || 15000);

    try {
      const collected = [];

      // 1) 从 PageSnapshot 直接读取（若前置已执行）
      const snapshot = results?.snapshot;
      if (snapshot && includeInline) {
        try {
          for (const s of snapshot.scripts?.inline || []) {
            collected.push({ type: 'inline', text: s.code || '' });
          }
        } catch {}
      }

      // 2) 在线读取脚本/HTML
      if (includeInline && (!snapshot || !snapshot.scripts)) {
        try {
          const inlineCodes = await page.evaluate(() => Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent || ''));
          inlineCodes.forEach(code => collected.push({ type: 'inline', text: code || '' }));
        } catch {}
      }

      let externalSrcs = [];
      try {
        externalSrcs = await page.evaluate(() => Array.from(document.querySelectorAll('script[src]')).map(s => s.src));
      } catch {}

      // 只保留允许域名的脚本
      if (includeExternal && externalSrcs.length) {
        const filtered = [];
        for (const src of externalSrcs) {
          try {
            const u = new URL(src, page.url());
            if (externalAllowHosts.some(h => u.host.includes(h))) filtered.push(u.toString());
          } catch {}
        }
        const unique = Array.from(new Set(filtered)).slice(0, maxExternal);
        // 通过页面上下文 fetch 获取文本，规避 Node/CORS 差异
        const chunks = await page.evaluate(async (params) => {
          const srcList = params.srcList || [];
          const tmo = params.tmo || 15000;
          const out = [];
          for (const src of srcList) {
            try {
              const ctl = new AbortController();
              const id = setTimeout(() => ctl.abort(), tmo);
              const res = await fetch(src, { signal: ctl.signal });
              clearTimeout(id);
              const text = await res.text();
              out.push({ src, text });
            } catch (e) {
              out.push({ src, text: '' });
            }
          }
          return out;
        }, { srcList: unique, tmo: timeoutMs });
        for (const c of chunks) collected.push({ type: 'external', src: c.src, text: c.text || '' });
      }

      // 3) 额外：从 DOM 里直接提取 ww 相关 data 属性
      let wwHints = [];
      try {
        wwHints = await page.evaluate(() => {
          const res = [];
          const spans = Array.from(document.querySelectorAll('span.J_WangWang'));
          for (const s of spans) {
            const dataNick = s.getAttribute('data-nick') || null;
            const dataFrom = s.getAttribute('data-from') || null;
            const extraRaw = s.getAttribute('data-extra');
            let extra = null; try { extra = extraRaw ? JSON.parse(extraRaw) : null; } catch { extra = { raw: extraRaw }; }
            res.push({ dataNick, dataFrom, extra });
          }
          return res;
        });
      } catch {}

      // 4) 解析代码中的 URL
      const hostEsc = hostFilter.replace(/\./g, '\\.');
      const urlRegex = new RegExp(`https?:\\/\\/${hostEsc}[^"'\\s)<>]+`, 'g');
      const found = [];
      for (const item of collected) {
        if (!item.text) continue;
        try {
          const matches = item.text.match(urlRegex);
          if (matches) {
            for (const u of matches) found.push({ scope: item.type, src: item.src || null, ...parseTokens(u) });
          }
        } catch {}
      }

      // 5) 合并 DOM hints（便于后续对齐联系人）
      const hints = wwHints || [];

      // 去重
      const seen = new Set();
      const tokens = found.filter(r => {
        if (!r.raw) return false;
        let key = r.raw; try { key = new URL(r.raw).toString(); } catch {}
        if (seen.has(key)) return false; seen.add(key); return true;
      });

      engine?.recordBehavior?.('script_token_extract', { count: tokens.length, inlineBlocks: collected.filter(c=>c.type==='inline').length, externalBlocks: collected.filter(c=>c.type==='external').length });

      return { success: true, results: { tokens, hints, scriptBlocks: collected.length }, variables: { tokenCaptureCount: tokens.length, tokenHost: hostFilter } };
    } catch (e) {
      logger.error('❌ 脚本解析失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        hostFilter: { type: 'string', description: '目标主机过滤', default: 'air.1688.com' },
        includeInline: { type: 'boolean', description: '扫描内联脚本', default: true },
        includeExternal: { type: 'boolean', description: '扫描外链脚本', default: true },
        maxExternal: { type: 'number', description: '最大外链脚本抓取数', default: 15 },
        externalAllowHosts: { type: 'array', items: { type: 'string' }, description: '允许抓取的脚本域名' },
        timeoutMs: { type: 'number', description: '外链抓取超时(ms)', default: 15000 }
      }
    };
  }
}
