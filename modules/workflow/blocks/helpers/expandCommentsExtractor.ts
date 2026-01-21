/**
 * expandCommentsExtractor.ts
 *
 * ExpandComments 的 DOM 提取逻辑封装（只读 query，不做 click/scroll）
 */

export interface ExtractCommentsConfig {
  rootSelectors: string[];
  itemSelector: string;
  extractors: Record<string, { selectors: string[]; attr?: string }>;
}

export interface ExtractCommentsResult {
  found: boolean;
  comments: Array<Record<string, any>>;
}

export function buildExtractCommentsScript(cfg: ExtractCommentsConfig): string {
  const domConfig = {
    rootSelectors: cfg.rootSelectors,
    itemSelector: cfg.itemSelector,
    fields: cfg.extractors,
  };

  return `(() => {
    const cfg = ${JSON.stringify(domConfig)};
    const pickRoot = () => {
      const roots = cfg.rootSelectors || [];
      for (const sel of roots) {
        try {
          const el = document.querySelector(sel);
          if (el) return el;
        } catch (_) {}
      }
      return null;
    };

    const root = pickRoot();
    const scope = root || document;

    const items = Array.from(
      scope.querySelectorAll(cfg.itemSelector || '.comment-item, [class*="comment-item"]'),
    );

    const comments = items.map((el, idx) => {
      const item = {};
      const fields = cfg.fields || {};

      const getAttrValue = (node, attr) => {
        if (!node) return '';
        if (!attr || attr === 'textContent') {
          return (node.textContent || '').trim();
        }
        if (attr === 'href') {
          return (node.href || node.getAttribute('href') || '').trim();
        }
        const v = node.getAttribute(attr);
        return v ? v.trim() : '';
      };

      for (const fieldName of Object.keys(fields)) {
        const fieldCfg = fields[fieldName] || {};
        const sels = Array.isArray(fieldCfg.selectors) ? fieldCfg.selectors : [];
        let value = '';
        for (const sel of sels) {
          try {
            const node = el.querySelector(sel);
            if (!node) continue;
            value = getAttrValue(node, fieldCfg.attr);
            if (value) break;
          } catch (_) {}
        }
        item[fieldName] = value;
      }

      item._idx = idx;
      item.comment_id =
        el.getAttribute('data-id') ||
        el.getAttribute('data-comment-id') ||
        el.getAttribute('data-commentid') ||
        el.getAttribute('id') ||
        '';

      if (!item.text) {
        item.text = (el.textContent || '').trim();
      }
      item.is_reply = !!el.closest('.reply-container');
      return item;
    });

    return { found: true, comments };
  })()`;
}

export function mergeExtractedComments(params: {
  rawList: Array<Record<string, any>>;
  seenKeys: Set<string>;
  out: Array<Record<string, any>>;
}) {
  const { rawList, seenKeys, out } = params;
  for (const c of rawList) {
    if (!c || typeof c !== 'object') continue;
    const hasContent =
      Boolean((c as any).text && String((c as any).text).trim()) ||
      Boolean((c as any).user_name && String((c as any).user_name).trim());
    if (!hasContent) continue;
    const cid = (c as any).comment_id || (c as any).commentId || (c as any).id || '';
    const idx = typeof (c as any)._idx === 'number' ? String((c as any)._idx) : '';
    const key = cid
      ? `id:${cid}`
      : `idx:${idx}||${(c as any).user_id || ''}||${(c as any).user_name || ''}||${
          (c as any).text || ''
        }||${(c as any).timestamp || ''}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    // 供上层做跨 tab / 跨批次去重
    (c as any)._key = key;
    out.push(c);
  }
}
