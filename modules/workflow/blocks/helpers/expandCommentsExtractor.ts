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

    const DEFAULT_ITEM_SELECTOR = [
      '.comment-item',
      "[class*='comment-item']",
      // 一些页面的“回复/子评论”可能不叫 comment-item，但仍属于评论计数
      // 注意：这里必须避免把“展开更多/显示更多”按钮误当成评论项
      "[class*='reply-item']",
      "[class*='replyItem']",
      "[class*='sub-comment']",
      "[class*='subComment']",
    ].join(', ');

    const rawItems = Array.from(scope.querySelectorAll(cfg.itemSelector || DEFAULT_ITEM_SELECTOR));
    const items = rawItems.filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      // 排除明显的“展开更多/显示更多”按钮（这些会被 replyExpander 处理）
      if (el.matches('.show-more, .reply-expand, [class*=\"show-more\"], [class*=\"reply-expand\"], [class*=\"expand\"][class*=\"more\"]')) {
        return false;
      }
      const tag = String(el.tagName || '').toUpperCase();
      if (tag === 'BUTTON') return false;
      const t = (el.textContent || '').trim();
      if (!t) return false;
      // 常见展开按钮文案很短；避免把它当成评论
      if (t.length <= 16 && t.includes('展开')) return false;
      return true;
    });

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
  maxOut?: number | null;
}) {
  const { rawList, seenKeys, out, maxOut } = params;
  const limit = typeof maxOut === 'number' && Number.isFinite(maxOut) && maxOut > 0 ? Math.floor(maxOut) : null;
  for (const c of rawList) {
    if (limit && out.length >= limit) break;
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
