/**
 * Phase 2 Block: 执行搜索
 * 
 * 职责：通过容器系统执行搜索操作（全系统级操作）
 */

import os from 'node:os';

export interface SearchInput {
  keyword: string;
  profile?: string;
  unifiedApiUrl?: string;
}

export interface SearchOutput {
  success: boolean;
  finalUrl: string;
  keyword: string;
}

function isDebugArtifactsEnabled() {
  return (
    process.env.WEBAUTO_DEBUG === '1' ||
    process.env.WEBAUTO_DEBUG_ARTIFACTS === '1' ||
    process.env.WEBAUTO_DEBUG_SCREENSHOT === '1'
  );
}

async function controllerAction(action: string, payload: any, apiUrl: string) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function readSearchInputValue(profile: string, unifiedApiUrl: string) {
  const value = await controllerAction('browser:execute', {
    profile,
    script: `(() => {
      const el =
        document.querySelector('#search-input') ||
        document.querySelector("input[type='search']") ||
        document.querySelector("input[placeholder*='搜索'], input[placeholder*='关键�?]");
      if (!el) return null;
      try { return 'value' in el ? el.value : null; } catch { return null; }
    })()`,
  }, unifiedApiUrl).then((res) => res?.result || res?.data?.result || null);
  return typeof value === 'string' ? value : null;
}

export async function execute(input: SearchInput): Promise<SearchOutput> {
  const {
    keyword,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;
  const debugArtifactsEnabled = isDebugArtifactsEnabled();

  console.log(`[Phase2Search] 执行搜索(容器驱动): ${keyword}`);

  let currentUrl = await controllerAction('browser:execute', {
    profile,
    script: 'window.location.href',
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

  // 若当前在详情页（/explore/<noteId>），�?ESC 回退到可搜索的页�?
  for (let i = 0; i < 2; i++) {
    const isDetail = /\/explore\/[0-9a-z]/i.test(currentUrl);
    if (!isDetail) break;
    console.log(`[Phase2Search] 当前在详情页，先 ESC 返回: ${currentUrl}`);
    await controllerAction('keyboard:press', {
      profileId: profile,
      key: 'Escape',
    }, unifiedApiUrl);
    await delay(1200);
    currentUrl = await controllerAction('browser:execute', {
      profile,
      script: 'window.location.href',
    }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');
  }

  // 某些详情页是整页导航：ESC 可能无效，兜底回�?explore 主页
  if (/\/explore\/[0-9a-z]/i.test(currentUrl)) {
    console.log(`[Phase2Search] ESC 未返回列表页，fallback 回到主页: ${currentUrl}`);
    await controllerAction('browser:goto', {
      profile,
      url: 'https://www.xiaohongshu.com/explore',
    }, unifiedApiUrl);
    await delay(2500);
    currentUrl = await controllerAction('browser:execute', {
      profile,
      script: 'window.location.href',
    }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');
  }

  const isSearchResult = currentUrl.includes('/search_result');
  const isHome = currentUrl.includes('/explore') && !/\/explore\/[0-9a-z]/i.test(currentUrl);

  const searchInputContainerId = isSearchResult
    ? 'xiaohongshu_search.search_bar'
    : isHome
      ? 'xiaohongshu_home.search_input'
      : '';

  if (!searchInputContainerId) {
    throw new Error(`[Phase2Search] 未识别页面状态，无法定位搜索框。当�?URL: ${currentUrl}`);
  }

  console.log(`[Phase2Search] 当前页面: ${isSearchResult ? 'search_result' : 'home'}，使用容�? ${searchInputContainerId}`);

  // 验证搜索框可用性（先高亮确认）
  const highlightResult = await controllerAction('container:operation', {
    containerId: searchInputContainerId,
    operationId: 'highlight',
    sessionId: profile,
  }, unifiedApiUrl);
  if (!highlightResult?.success) {
    throw new Error(`[Phase2Search] 搜索框不可用: ${searchInputContainerId}`);
  }
  await delay(500);

  // �?系统级输入：禁止 container:operation type（底层为 session.fill，属于非系统行为�?
  await controllerAction('container:operation', {
    containerId: searchInputContainerId,
    operationId: 'click',
    sessionId: profile,
  }, unifiedApiUrl);
  await delay(200);

  // 清空输入框：mac 使用 Meta+A；非 mac 使用 Control+A
  // 注意：在 mac �?Control+A 可能导致光标跳到行首，反而造成“关键字拼接”�?
  const platform = os.platform();
  const selectAllKey = platform === 'darwin' ? 'Meta+A' : 'Control+A';
  await controllerAction('keyboard:press', { profileId: profile, key: selectAllKey }, unifiedApiUrl).catch(() => {});
  await delay(80);
  await controllerAction('keyboard:press', { profileId: profile, key: 'Backspace' }, unifiedApiUrl).catch(() => {});
  await delay(60);
  await controllerAction('keyboard:press', { profileId: profile, key: 'Delete' }, unifiedApiUrl).catch(() => {});
  await delay(80);

  const clearedValue = await readSearchInputValue(profile, unifiedApiUrl);
  if (clearedValue && clearedValue.trim()) {
    let shotLen = 0;
    if (debugArtifactsEnabled) {
      const shot = await controllerAction('browser:screenshot', { profileId: profile, fullPage: false }, unifiedApiUrl)
        .then(res => res?.data || res?.result || res?.data?.data || '');
      shotLen = typeof shot === 'string' ? shot.length : 0;
    }
    throw new Error(`[Phase2Search] 清空输入框失败（可能未聚焦到 input）。value="${clearedValue}" screenshot_len=${shotLen}`);
  }

  await controllerAction('keyboard:type', {
    profileId: profile,
    text: keyword,
    delay: 90,
  }, unifiedApiUrl);
  await delay(450);

  const typedValue = await readSearchInputValue(profile, unifiedApiUrl);
  if (typedValue !== keyword) {
    let shotLen = 0;
    if (debugArtifactsEnabled) {
      const shot = await controllerAction('browser:screenshot', { profileId: profile, fullPage: false }, unifiedApiUrl)
        .then(res => res?.data || res?.result || res?.data?.data || '');
      shotLen = typeof shot === 'string' ? shot.length : 0;
    }
    throw new Error(`[Phase2Search] 输入框值不等于目标关键字：expected="${keyword}" actual="${typedValue}" screenshot_len=${shotLen}`);
  }

  if (isHome) {
    // explore 主页：使用搜索图标按钮触发搜索（更贴近用户真实行为）
    await controllerAction('container:operation', {
      containerId: 'xiaohongshu_home.search_button',
      operationId: 'click',
      sessionId: profile,
    }, unifiedApiUrl);
  } else {
    // search_result：系统级 Enter 提交
    await controllerAction('keyboard:press', {
      profileId: profile,
      key: 'Enter',
    }, unifiedApiUrl);
  }
  await delay(2500);

  // 4. 验证是否到达搜索结果�?
  const finalUrl = await controllerAction('browser:execute', {
    profile,
    script: 'window.location.href'
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

  const success = finalUrl.includes('/search_result') || finalUrl.includes('keyword=');

  console.log(`[Phase2Search] 完成: success=${success} url=${finalUrl}`);

  return {
    success,
    finalUrl,
    keyword,
  };
}



