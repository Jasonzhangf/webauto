import type { OperationContext, OperationDefinition } from '../registry.js';

export interface NavigateConfig {
  url?: string;
  selector?: string;
  scope_selector?: string;
  scopeSelector?: string;
  anchor_selector?: string;
  anchorSelector?: string;
  attribute?: string;
  match_index?: number;
  matchIndex?: number;
  base_url?: string;
  baseUrl?: string;
  mode?: 'assign' | 'replace' | 'href';
  wait_after_ms?: number;
  waitAfterMs?: number;
}

interface NavigateResult {
  url: string;
  noteId?: string;
  xsecToken?: string;
}

function resolveWaitAfter(config: NavigateConfig): number {
  const wait = typeof config.waitAfterMs === 'number' ? config.waitAfterMs : config.wait_after_ms;
  return Number.isFinite(wait) ? Math.max(0, wait!) : 0;
}

function ensureAbsoluteUrl(raw: string, base?: string): string {
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (base) {
    try {
      return new URL(raw, base).toString();
    } catch {
      return raw;
    }
  }
  return raw;
}

function normalizedIndex(config: NavigateConfig, ctxIndex?: any): number {
  if (typeof config.match_index === 'number') return Math.max(0, Math.floor(config.match_index));
  if (typeof config.matchIndex === 'number') return Math.max(0, Math.floor(config.matchIndex));
  if (typeof ctxIndex === 'number') return Math.max(0, Math.floor(ctxIndex));
  return 0;
}

function parseNoteInfo(url: string) {
  const noteMatch = url?.match(/\/explore\/([0-9a-z]+)/i);
  const xsecMatch = url?.match(/[?&]xsec_token=([^&]+)/i);
  return {
    noteId: noteMatch ? noteMatch[1] : '',
    xsecToken: xsecMatch ? decodeURIComponent(xsecMatch[1]) : '',
  };
}

async function resolveTargetUrl(ctx: OperationContext, config: NavigateConfig): Promise<NavigateResult> {
  if (config.url) {
    const absolute = ensureAbsoluteUrl(config.url, config.baseUrl || config.base_url);
    return { url: absolute, ...parseNoteInfo(absolute) };
  }

  const scopeSelector = config.scopeSelector || config.scope_selector || config.selector || '';
  const anchorSelector = config.anchorSelector || config.anchor_selector || '';
  if (!scopeSelector && !anchorSelector && !config.selector) {
    throw new Error('navigate operation requires url or selector');
  }
  const attr = config.attribute || 'href';
  const matchIndex = normalizedIndex(config, (ctx.node as any)?.index);

  const evaluation = await ctx.page.evaluate(
    ({ scopeSelector, anchorSelector, attribute, matchIndex }) => {
      const resolveFromElement = (el: Element | null) => {
        if (!el) {
          return { url: '', noteId: '', xsecToken: '' };
        }
        const target = el;
        let raw = '';
        if (attribute === 'textContent') {
          raw = (target.textContent || '').trim();
        } else if (attribute) {
          raw = target.getAttribute(attribute) || '';
          if (!raw && attribute === 'href' && target instanceof HTMLAnchorElement) {
            raw = target.href;
          }
        }

        const href = target instanceof HTMLAnchorElement && attribute === 'href' ? target.href : raw;
        const url = href || raw || '';
        const noteMatch = url.match(/\/explore\/([0-9a-z]+)/i);
        const tokenMatch = url.match(/[?&]xsec_token=([^&]+)/i);
        return {
          url,
          noteId: noteMatch ? noteMatch[1] : '',
          xsecToken: tokenMatch ? decodeURIComponent(tokenMatch[1]) : '',
        };
      };

      const index = Number.isFinite(matchIndex) ? Math.max(0, Number(matchIndex)) : 0;
      const scopes = scopeSelector ? Array.from(document.querySelectorAll(scopeSelector)) : [];
      let scope: Element | null = scopes[index] || scopes[0] || null;
      if (!scope && anchorSelector) {
        scope = document.body;
      }
      if (!scope) {
        return { url: '', noteId: '', xsecToken: '' };
      }

      if (anchorSelector) {
        const anchor = scope.matches(anchorSelector)
          ? scope
          : scope.querySelector(anchorSelector);
        return resolveFromElement(anchor);
      }

      return resolveFromElement(scope);
    },
    { scopeSelector, anchorSelector, attribute: attr, matchIndex },
  );

  const absoluteUrl = ensureAbsoluteUrl(evaluation.url, config.baseUrl || config.base_url);
  if (!absoluteUrl) {
    throw new Error('navigate: selector did not resolve to a URL');
  }
  const info = parseNoteInfo(absoluteUrl);
  return { url: absoluteUrl, ...info };
}

function isXiaohongshuUrl(url: string): boolean {
  return /(^https?:\/\/)?(www\.)?xiaohongshu\.com/i.test(url || '');
}

function isAllowedXiaohongshuNavigate(url: string): boolean {
  // 小红书强规则：禁止通过代码构造/抽取链接进行导航（尤其是 /explore、/search_result）
  // 仅允许回到站点主页，其他页面必须通过页面内点击/搜索流转生成带 token 的 URL。
  try {
    const u = new URL(url);
    const p = u.pathname || '/';
    if (p === '/' || p === '' || p === '/explore') return true; // /explore 作为站点入口页允许
    return false;
  } catch {
    return false;
  }
}

export async function runNavigateOperation(ctx: OperationContext, config: NavigateConfig) {
  const target = await resolveTargetUrl(ctx, config);
  if (!target.url) {
    return { success: false, error: 'navigate: empty url' };
  }

  if (isXiaohongshuUrl(target.url) && !isAllowedXiaohongshuNavigate(target.url)) {
    return { success: false, error: `navigate: disabled for xiaohongshu url=${target.url}` };
  }

  try {
    await (ctx.page as any).goto(target.url, { waitUntil: 'domcontentloaded' });
  } catch (e: any) {
    return { success: false, error: `navigate: page.goto failed: ${e?.message || String(e)}` };
  }

  const waitAfter = resolveWaitAfter(config);
  if (waitAfter > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitAfter));
  }

  return {
    success: true,
    url: target.url,
    noteId: target.noteId,
    xsecToken: target.xsecToken,
    navigation: { success: true, href: target.url, via: 'page.goto' },
  };
}

export const navigateOperation: OperationDefinition<NavigateConfig> = {
  id: 'navigate',
  description: 'Navigate current page using selector-derived URL or explicit target',
  requiredCapabilities: ['navigate'],
  run: runNavigateOperation,
};
