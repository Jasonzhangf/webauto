import type { OperationContext, OperationDefinition } from '../registry.js';

export interface ExtractConfig {
  target?: 'links' | 'summary' | 'author' | 'timestamp' | 'text';
  selector: string;
  include_text?: boolean;
  max_items?: number;
  whitelist?: {
    prefix?: string[];
  };
  blacklist?: {
    contains?: string[];
    suffix?: string[];
  };
  fields?: Record<string, string>; // for structured extraction
}

async function runExtract(ctx: OperationContext, config: ExtractConfig) {
  if (!config.selector && !config.fields) {
    throw new Error('extract operation requires either selector or fields');
  }

  const maxItems = config.max_items ?? 32;
  const includeText = config.include_text ?? false;

  return ctx.page.evaluate(
    (data) => {
      const nodes = Array.from(document.querySelectorAll(data.selector));
      if (!nodes.length) {
        return { success: false, error: 'no elements found', count: 0, extracted: [] };
      }

      const extracted = [];
      for (let i = 0; i < Math.min(nodes.length, data.maxItems); i++) {
        const el = nodes[i];
        const item: any = {};

        // Extract href if it's an anchor element
        if (el.tagName === 'A' && el instanceof HTMLAnchorElement) {
          item.href = el.href;
        } else if (data.fields && data.fields.href) {
          const linkEl = el.querySelector(data.fields.href);
          if (linkEl instanceof HTMLAnchorElement) {
            item.href = linkEl.href;
          }
        }

        // Extract text content
        if (data.includeText) {
          item.text = (el.textContent || '').trim().substring(0, 200);
        }

        // Extract additional fields if specified
        if (data.fields) {
          for (const [field, selector] of Object.entries(data.fields)) {
            if (field !== 'href') {
              const fieldEl = el.querySelector(selector);
              if (fieldEl) {
                if (fieldEl instanceof HTMLImageElement) {
                  item[field] = fieldEl.src;
                } else if (fieldEl instanceof HTMLAnchorElement) {
                  item[field] = fieldEl.href;
                } else {
                  item[field] = (fieldEl.textContent || '').trim().substring(0, 200);
                }
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
        } else if (!data.fields?.href) {
          // If no href filtering, just add the item
          extracted.push(item);
        }
      }

      return { success: true, count: extracted.length, extracted };
    },
    { ...config, maxItems, includeText },
  );
}

export const extractOperation: OperationDefinition<ExtractConfig> = {
  id: 'extract',
  description: 'Extract structured data from elements',
  requiredCapabilities: ['extract'],
  run: runExtract,
};
