/**
 * Phase 2 Block: 执行搜索
 * 
 * 职责：通过容器系统执行搜索操作（全系统级操作）
 */

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

export async function execute(input: SearchInput): Promise<SearchOutput> {
  const {
    keyword,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;

  console.log(`[Phase2Search] 执行搜索(容器驱动): ${keyword}`);

  let currentUrl = await controllerAction('browser:execute', {
    profile,
    script: 'window.location.href',
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

  // 若当前在详情页（/explore/<noteId>），先 ESC 回退到可搜索的页面
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

  // 某些详情页是整页导航：ESC 可能无效，兜底回到 explore 主页
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
    throw new Error(`[Phase2Search] 未识别页面状态，无法定位搜索框。当前 URL: ${currentUrl}`);
  }

  console.log(`[Phase2Search] 当前页面: ${isSearchResult ? 'search_result' : 'home'}，使用容器: ${searchInputContainerId}`);

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

  // ✅ 系统级输入：禁止 container:operation type（底层为 session.fill，属于非系统行为）
  await controllerAction('container:operation', {
    containerId: searchInputContainerId,
    operationId: 'click',
    sessionId: profile,
  }, unifiedApiUrl);
  await delay(200);
  await controllerAction('keyboard:press', {
    profileId: profile,
    key: 'Meta+A',
  }, unifiedApiUrl).catch(() => {});
  await controllerAction('keyboard:press', {
    profileId: profile,
    key: 'Control+A',
  }, unifiedApiUrl).catch(() => {});
  await controllerAction('keyboard:press', {
    profileId: profile,
    key: 'Backspace',
  }, unifiedApiUrl).catch(() => {});
  await controllerAction('keyboard:type', {
    profileId: profile,
    text: keyword,
    delay: 90,
  }, unifiedApiUrl);
  await delay(450);

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

  // 4. 验证是否到达搜索结果页
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
