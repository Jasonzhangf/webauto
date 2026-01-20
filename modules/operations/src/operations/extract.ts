import type { OperationContext, OperationDefinition } from '../registry.js';

type ContainerExtractorDef = {
  selectors?: string[];
  attr?: string;
  multiple?: boolean;
};

export interface ExtractConfig {
  target?: 'links' | 'summary' | 'author' | 'timestamp' | 'text';
  selector?: string;
  index?: number;
  include_text?: boolean;
  max_items?: number;
  whitelist?: {
    prefix?: string[];
  };
  blacklist?: {
    contains?: string[];
    suffix?: string[];
  };
  /**
   * Two modes:
   * - container extractor mode: fields = string[] (extractor keys) + extractors = container.extractors
   * - structured selector mode: fields = Record<fieldName, selector>
   */
  fields?: string[] | Record<string, string>;
  extractors?: Record<string, ContainerExtractorDef>;
}

async function runExtract(ctx: OperationContext, config: ExtractConfig) {
  if (!config.selector) {
    throw new Error('extract operation requires selector');
  }

  const maxItems = config.max_items ?? 32;
  const includeText = config.include_text ?? false;
  const index = Number.isFinite(config.index) ? Math.max(0, Math.floor(config.index as number)) : null;

  return ctx.page.evaluate(
    (data) => {
      const nodes = Array.from(document.querySelectorAll(data.selector || ''));
      if (!nodes.length) {
        return { success: false, error: 'no elements found', count: 0, extracted: [] };
      }

      const roots =
        typeof data.index === 'number'
          ? (() => {
              const el = nodes[data.index];
              return el ? [el] : [];
            })()
          : nodes;

      if (!roots.length) {
        return { success: false, error: 'no elements found', count: 0, extracted: [] };
      }

      const extracted = [];
      const limit = Math.min(roots.length, data.maxItems);

      const getAttrValue = (node: any, attr: string) => {
        if (!node) return '';
        if (!attr || attr === 'textContent') return (node.textContent || '').trim();
        if (attr === 'href') {
          const href = node.href || (typeof node.getAttribute === 'function' ? node.getAttribute('href') : '') || '';
          return String(href || '').trim();
        }
        if (attr === 'src') {
          const src = node.currentSrc || node.src || (typeof node.getAttribute === 'function' ? node.getAttribute('src') : '') || '';
          return String(src || '').trim();
        }
        if (typeof node.getAttribute === 'function') {
          const v = node.getAttribute(attr);
          return v ? String(v).trim() : '';
        }
        return '';
      };

      const containerExtractorMode =
        Array.isArray(data.fields) && data.fields.length > 0 && data.extractors && typeof data.extractors === 'object';

      for (let i = 0; i < limit; i++) {
        const el = roots[i];
        const item: any = {};

        if (containerExtractorMode) {
          const extractorKeys = data.fields as string[];
          const extractors = data.extractors || {};

          for (const key of extractorKeys) {
            const def = extractors[key] || {};
            const selectors = Array.isArray(def.selectors) ? def.selectors : [];
            const attr = def.attr || 'textContent';
            const multiple = !!def.multiple;

            if (!selectors.length) {
              item[key] = multiple ? [] : '';
              continue;
            }

            if (multiple) {
              const values: string[] = [];
              for (const sel of selectors) {
                try {
                  const nodes = Array.from(el.querySelectorAll(sel));
                  for (const n of nodes) {
                    const v = getAttrValue(n, attr);
                    if (v) values.push(v);
                  }
                } catch {
                  // ignore selector errors
                }
                if (values.length) break;
              }
              item[key] = values;
            } else {
              let value = '';
              for (const sel of selectors) {
                try {
                  const n = el.querySelector(sel);
                  if (!n) continue;
                  value = getAttrValue(n, attr);
                  if (value) break;
                } catch {
                  // ignore selector errors
                }
              }
              item[key] = value;
            }
          }

          // Back-compat: common link field names
          if (!item.href) {
            const linkCandidate =
              item.link ||
              item.detail_url ||
              item.detailUrl ||
              item.author_link ||
              item.user_link ||
              '';
            if (typeof linkCandidate === 'string' && linkCandidate) {
              item.href = linkCandidate;
            }
          }
        } else {
          // Generic selector-based extraction (legacy)
          if (el.tagName === 'A' && el instanceof HTMLAnchorElement) {
            item.href = el.href;
          } else if (data.fields && typeof data.fields === 'object' && (data.fields as any).href) {
            const hrefSel = (data.fields as any).href;
            const linkEl = hrefSel ? el.querySelector(hrefSel) : null;
            if (linkEl instanceof HTMLAnchorElement) {
              item.href = linkEl.href;
            }
          }

          if (data.includeText) {
            item.text = (el.textContent || '').trim().substring(0, 200);
          }

          if (data.fields && typeof data.fields === 'object' && !Array.isArray(data.fields)) {
            for (const [field, selector] of Object.entries(data.fields)) {
              if (field === 'href') continue;
              try {
                const fieldEl = selector ? el.querySelector(selector) : null;
                if (!fieldEl) continue;
                if (fieldEl instanceof HTMLImageElement) {
                  item[field] = fieldEl.currentSrc || fieldEl.src;
                } else if (fieldEl instanceof HTMLAnchorElement) {
                  item[field] = fieldEl.href;
                } else {
                  item[field] = (fieldEl.textContent || '').trim().substring(0, 200);
                }
              } catch {
                // ignore selector errors
              }
            }
          }
        }

        // Apply whitelist/blacklist filters
        if (item.href) {
          let skip = false;
          
          // Check blacklist
          if (data.blacklist?.contains) {
            for (const term of data.blacklist.contains) {
              if (item.href.includes(term)) {
                skip = true;
                break;
              }
            }
          }
          if (data.blacklist?.suffix) {
            for (const suffix of data.blacklist.suffix) {
              if (item.href.endsWith(suffix)) {
                skip = true;
                break;
              }
            }
          }

          // Check whitelist
          if (!skip && data.whitelist?.prefix) {
            skip = !data.whitelist.prefix.some((prefix: string) => item.href.startsWith(prefix));
          }

          if (!skip) {
            extracted.push(item);
          }
        } else {
          // If no href filtering, just add the item
          extracted.push(item);
        }
      }

      return { success: true, count: extracted.length, extracted };
    },
    { ...config, maxItems, includeText, index },
  );
}

export const extractOperation: OperationDefinition<ExtractConfig> = {
  id: 'extract',
  description: 'Extract structured data from elements',
  requiredCapabilities: ['extract'],
  run: runExtract,
};
