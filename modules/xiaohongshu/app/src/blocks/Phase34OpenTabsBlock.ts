/**
 * Phase 3-4 Block: 打开多个 Tab
 *
 * 职责：
 * 1. 通过 Unified API 打开指定数量的 Tab
 * 2. 记录每个 Tab 的索引和状态
 * 3. 返回 Tab 管理器
 */

export interface OpenTabsInput {
  profile?: string;
  tabCount?: number;
  unifiedApiUrl?: string;
}

export interface TabInfo {
  index: number;
  pageId?: number;
}

export interface OpenTabsOutput {
  tabs: TabInfo[];
  currentTab: number;
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

export async function execute(input: OpenTabsInput): Promise<OpenTabsOutput> {
  const {
    profile = 'xiaohongshu_fresh',
    tabCount = 4,
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;

  console.log(`[Phase34OpenTabs] 打开 ${tabCount} 个 Tab`);

  const tabs: TabInfo[] = [];

  // 打开新 Tab
  for (let i = 0; i < tabCount; i++) {
    try {
      const result = await controllerAction('browser:new_page', {
        profile,
        url: 'about:blank',
      }, unifiedApiUrl);

      const pageId = result?.pageId;
      tabs.push({ index: i, pageId });
      console.log(`[Phase34OpenTabs] Tab ${i} opened, pageId=${pageId}`);
    } catch (err) {
      console.error(`[Phase34OpenTabs] Failed to open tab ${i}:`, err?.message || String(err));
    }
  }

  if (tabs.length === 0) {
    throw new Error('[Phase34OpenTabs] 未能打开任何 Tab');
  }

  // 切换回第一个 Tab（原搜索结果页）
  await controllerAction('browser:switch_to_page', {
    profile,
    pageId: tabs[0].pageId,
  }, unifiedApiUrl);

  console.log(`[Phase34OpenTabs] 完成，共打开 ${tabs.length} 个 Tab`);

  return {
    tabs,
    currentTab: 0,
  };
}
