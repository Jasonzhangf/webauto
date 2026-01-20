/**
 * SearchPageState helper
 *
 * 处理搜索页面状态验证和 URL 关键词校验
 */

export interface PageStateConfig {
  profile: string;
  controllerUrl: string;
}

export interface EnsureHomePageResult {
  success: boolean;
  url: string;
  onSearchPage: boolean;
  hasDetailOverlay?: boolean;
  onCaptchaPage?: boolean;
}

export interface ProbeSearchPageStateResult {
  hasItems: boolean;
  hasNoResultText: boolean;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function urlKeywordEquals(url: string, keyword: string): boolean {
  const raw = url || '';
  if (!raw.includes('/search_result')) return false;
  
  try {
    const u = new URL(raw);
    const kw = u.searchParams.get('keyword');
    if (!kw) return false;
    const decoded = safeDecodeURIComponent(safeDecodeURIComponent(kw)).trim();
    return decoded === String(keyword || '').trim();
  } catch {
    const decodedUrl = safeDecodeURIComponent(safeDecodeURIComponent(raw));
    if (!decodedUrl.includes('/search_result')) return false;
    try {
      const u2 = new URL(decodedUrl);
      const kw2 = u2.searchParams.get('keyword');
      if (!kw2) return false;
      const decoded2 = safeDecodeURIComponent(safeDecodeURIComponent(kw2)).trim();
      return decoded2 === String(keyword || '').trim();
    } catch {
      return false;
    }
  }
}

export async function getCurrentUrl(config: PageStateConfig): Promise<string> {
  const { profile, controllerUrl } = config;
  const response = await fetch(controllerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'browser:execute',
      payload: {
        profile,
        script: 'location.href'
      }
    })
  });
  const data = await response.json();
  return data.data?.result || '';
}

export async function ensureHomePage(config: PageStateConfig): Promise<EnsureHomePageResult> {
  const { profile, controllerUrl } = config;
  const url = await getCurrentUrl({ profile, controllerUrl });

  if (!url.includes('xiaohongshu.com')) {
    throw new Error(
      `Not on xiaohongshu.com (current url=${url || 'unknown'}), please navigate manually before searching.`
    );
  }

  try {
    const detailState = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script: `(() => {
            const selectors = [
              '.note-detail-mask',
              '.note-detail-page',
              '.note-detail-dialog',
              '.note-detail',
              '.detail-container',
              '.media-container'
            ];
            const isVisible = (el) => {
              if (!el) return false;
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height) return false;
              if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
              return true;
            };
            let visibleOverlay = null;
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && isVisible(el)) {
                visibleOverlay = el;
                break;
              }
            }
            return { hasDetailOverlayVisible: !!visibleOverlay };
          })()`
        },
      }),
    }).then((r) => r.json());
    
    const payload = detailState.data?.result ?? detailState.result ?? {};
    if (payload.hasDetailOverlayVisible) {
      throw new Error('Currently in visible detail overlay, please exit detail before searching.');
    }
  } catch (err: any) {
    if (err?.message?.includes('Currently in detail overlay')) {
      throw err;
    }
    console.warn('[SearchPageState] Detail-overlay check failed:', err?.message || err);
  }

  const onSearchPage = url.includes('/search_result');
  const onCaptchaPage = url.includes('captcha') || url.includes('verify');

  if (onCaptchaPage) {
    throw new Error('Detected CAPTCHA page, please solve it manually.');
  }

  return {
    success: true,
    url,
    onSearchPage,
    onCaptchaPage
  };
}

export async function probeSearchPageState(config: PageStateConfig): Promise<ProbeSearchPageStateResult> {
  const { profile, controllerUrl } = config;
  
  try {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script: `(() => {
            const cards = document.querySelectorAll('.note-item').length;
            const emptyEl =
              document.querySelector('[class*="no-result"], [class*="noResult"], [class*="empty"], .search-empty, .empty') ||
              null;
            const emptyText = (emptyEl ? (emptyEl.textContent || '') : '').trim();
            const bodyText = (document.body && document.body.innerText ? document.body.innerText.slice(0, 1200) : '');
            const hasNoResultText =
              emptyText.includes('没找到相关内容') ||
              emptyText.includes('换个词试试') ||
              bodyText.includes('没找到相关内容') ||
              bodyText.includes('换个词试试');
            return { cards, hasNoResultText };
          })()`
        },
      }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined,
    });
    
    const data = await response.json().catch(() => ({}));
    const payload = data.data?.result ?? data.result ?? {};
    const cards = Number(payload.cards || 0);
    return { hasItems: cards > 0, hasNoResultText: Boolean(payload.hasNoResultText) };
  } catch {
    return { hasItems: false, hasNoResultText: false };
  }
}