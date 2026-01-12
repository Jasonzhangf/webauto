/**
 * Workflow Block: DetectPageStateBlock
 *
 * 基于 URL + 容器匹配检测当前页面阶段：
 * - xiaohongshu: login / detail / search / home / unknown
 * - weibo: login / detail / search / home / unknown
 *
 * 用于在进入各 Phase 前做“入口锚点”判定。
 */

export type PageStage = 'login' | 'detail' | 'search' | 'home' | 'unknown';

export interface DetectPageStateInput {
  sessionId: string;
  platform?: 'xiaohongshu' | 'weibo' | 'auto';
  serviceUrl?: string;
}

export interface DetectPageStateOutput {
  success: boolean;
  sessionId: string;
  platform: 'xiaohongshu' | 'weibo' | 'unknown';
  url: string;
  stage: PageStage;
  pageName?: string;
  rootId?: string | null;
  matchIds?: string[];
  error?: string;
}

interface PlatformContainerDef {
  id: string;
  name: string;
  urlPattern?: RegExp;
}

const PLATFORM_CONTAINERS: Record<string, PlatformContainerDef[]> = {
  xiaohongshu: [
    { id: 'xiaohongshu_login.login_guard', name: '登录页', urlPattern: /\/login/ },
    { id: 'xiaohongshu_detail.modal_shell', name: '详情页', urlPattern: /\/explore\// },
    {
      id: 'xiaohongshu_search.search_result_list',
      name: '搜索结果页',
      urlPattern: /\/search_result/,
    },
    { id: 'xiaohongshu_home', name: '主页/推荐流', urlPattern: /\/explore/ },
  ],
  weibo: [
    { id: 'weibo_login.login_guard', name: '登录页', urlPattern: /\/signin/ },
    { id: 'weibo_detail.modal_shell', name: '详情页', urlPattern: /\/\d+\// },
    { id: 'weibo_search.feed_list', name: '搜索结果页', urlPattern: /\/search/ },
    { id: 'weibo_home.feed_list', name: '主页', urlPattern: /^https:\/\/weibo\.com\/?$/ },
  ],
};

function detectPlatformFromUrl(url: string): 'xiaohongshu' | 'weibo' | 'unknown' {
  if (url.includes('xiaohongshu.com')) return 'xiaohongshu';
  if (url.includes('weibo.com')) return 'weibo';
  return 'unknown';
}

function detectPageByUrl(
  url: string,
  platformContainers: PlatformContainerDef[],
): PlatformContainerDef | null {
  for (const def of platformContainers) {
    if (def.urlPattern && def.urlPattern.test(url)) {
      return def;
    }
  }
  return null;
}

function detectPageByContainer(
  matchIds: string[],
  platformContainers: PlatformContainerDef[],
  currentUrl: string,
): PlatformContainerDef | null {
  const containerIds = new Set(matchIds);
  for (const def of platformContainers) {
    if (containerIds.has(def.id)) {
      // 对于小红书搜索结果页，额外检查 URL 是否包含 search_result，避免误把首页当成搜索页
      if (def.id === 'xiaohongshu_search.search_result_list' && !currentUrl.includes('search_result')) {
        continue;
      }
      return def;
    }
  }
  return null;
}

function mapContainerIdToStage(
  platform: 'xiaohongshu' | 'weibo',
  containerId: string | undefined | null,
): PageStage {
  if (!containerId) return 'unknown';

  if (platform === 'xiaohongshu') {
    if (containerId === 'xiaohongshu_login.login_guard') return 'login';
    if (containerId === 'xiaohongshu_detail.modal_shell') return 'detail';
    if (containerId === 'xiaohongshu_search.search_result_list') return 'search';
    if (containerId === 'xiaohongshu_home') return 'home';
    return 'unknown';
  }

  if (platform === 'weibo') {
    if (containerId === 'weibo_login.login_guard') return 'login';
    if (containerId === 'weibo_detail.modal_shell') return 'detail';
    if (containerId === 'weibo_search.feed_list') return 'search';
    if (containerId === 'weibo_home.feed_list') return 'home';
    return 'unknown';
  }

  return 'unknown';
}

export async function execute(
  input: DetectPageStateInput,
): Promise<DetectPageStateOutput> {
  const {
    sessionId,
    platform: platformHint = 'auto',
    serviceUrl = 'http://127.0.0.1:7701',
  } = input;

  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  async function controllerAction(action: string, payload: any = {}) {
    const res = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return data.data || data;
  }

  async function getCurrentUrl(): Promise<string> {
    const data = await controllerAction('browser:execute', {
      profile: sessionId,
      script: 'window.location.href',
    });
    return data?.result || data?.data?.result || '';
  }

  async function matchContainers(): Promise<{ rootId: string | null; matchIds: string[] }> {
    const data = await controllerAction('containers:match', {
      profile: sessionId,
    });
    const rootId: string | null =
      data?.container?.id || data?.data?.container?.id || null;
    const matches =
      data?.snapshot?.matches || data?.data?.snapshot?.matches || {};
    const matchIds = Object.entries(matches)
      .filter(([, info]) => {
        const mc = (info as any)?.match_count ?? (info as any)?.matchCount ?? 0;
        return mc > 0;
      })
      .map(([id]) => id);
    return { rootId, matchIds };
  }

  // 1) 始终优先尝试通过 URL 判定平台和大致页面
  const url = await getCurrentUrl().catch(() => '');

  let platform: 'xiaohongshu' | 'weibo' | 'unknown';
  if (platformHint === 'auto') {
    platform = url ? detectPlatformFromUrl(url) : 'unknown';
  } else {
    platform = platformHint;
  }

  if (platform === 'unknown') {
    return {
      success: false,
      sessionId,
      platform,
      url,
      stage: 'unknown',
      error: url ? 'Unknown platform from URL' : 'URL unavailable',
    };
  }

  const platformContainers = PLATFORM_CONTAINERS[platform] || [];
  const urlDetection = url ? detectPageByUrl(url, platformContainers) : null;

  // 2) 再尝试做一次容器匹配；如果失败则回退到 URL-only 的判定，而不是直接失败
  let rootId: string | null = null;
  let matchIds: string[] = [];
  let matchError: string | undefined;

  try {
    const matched = await matchContainers();
    rootId = matched.rootId;
    matchIds = matched.matchIds;
  } catch (error: any) {
    matchError = error?.message || String(error);
  }

  const containerDetection =
    matchIds.length > 0
      ? detectPageByContainer([rootId, ...matchIds].filter(Boolean) as string[], platformContainers, url)
      : null;

  // 以容器检测为主，URL 为辅；若容器匹配失败则退回 URL-only
  const effectiveDetection = containerDetection || urlDetection || null;
  const stage = mapContainerIdToStage(platform, effectiveDetection?.id);

  return {
    success: true,
    sessionId,
    platform,
    url,
    stage,
    pageName: effectiveDetection?.name,
    rootId,
    matchIds,
    error: matchError,
  };
}
