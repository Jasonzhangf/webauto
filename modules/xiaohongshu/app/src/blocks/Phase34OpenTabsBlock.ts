/**
 * Phase 3-4 Block: 确保固定 Tab 池（5 个：0=搜索页, 1-4=帖子详情页）
 *
 * 职责：
 * 1. 检查当前 tab 数量，若不足 5 个则补齐到 5 个
 * 2. 返回固定 tab 池索引 [0, 1, 2, 3, 4]（0 保留给搜索页，1-4 用于帖子轮转）
 * 3. 确保后续轮转使用固定 tab，不再开新 tab
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

async function listPages(profile: string, apiUrl: string) {
  const res = await controllerAction('browser:page:list', { profileId: profile }, apiUrl);
  if (res?.error) {
    console.warn(`[Phase34OpenTabs] page:list error: ${res.error}`);
  }
  return res?.pages || res?.data?.pages || [];
}

async function getInputMode(apiUrl: string): Promise<'system' | 'protocol'> {
  const res = await controllerAction('system:input-mode:get', {}, apiUrl).catch((): null => null);
  const mode = String((res as any)?.data?.mode || (res as any)?.mode || 'system').trim().toLowerCase();
  return mode === 'protocol' ? 'protocol' : 'system';
}

async function openTab(profile: string, apiUrl: string, inputMode: 'system' | 'protocol') {
  const maxRetries = 4;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const before = await listPages(profile, apiUrl);
    const beforeCount = before.length;

    const tryCountIncrease = async (waitMs = 450): Promise<boolean> => {
      await new Promise((r) => setTimeout(r, waitMs));
      const after = await listPages(profile, apiUrl);
      return after.length > beforeCount;
    };

    if (inputMode === 'protocol') {
      await controllerAction('browser:page:new', { profileId: profile }, apiUrl).catch((): null => null);
      if (await tryCountIncrease(350)) return;

      await controllerAction(
        'browser:execute',
        { profile, script: 'window.open("about:blank", "_blank"); true;' },
        apiUrl,
      ).catch((): null => null);
      if (await tryCountIncrease(350)) return;

      await controllerAction('browser:page:switch', { profileId: profile, index: 0 }, apiUrl).catch((): null => null);
      await controllerAction('system:shortcut', { app: 'camoufox', shortcut: 'new-tab' }, apiUrl).catch((): null => null);
      if (await tryCountIncrease(500)) {
        console.log('[Phase34OpenTabs] protocol fallback -> system shortcut succeeded');
        return;
      }
    } else {
      await controllerAction('browser:page:switch', { profileId: profile, index: 0 }, apiUrl).catch((): null => null);
      await controllerAction('system:shortcut', { app: 'camoufox', shortcut: 'new-tab' }, apiUrl).catch((): null => null);
      if (await tryCountIncrease(500)) return;
    }

    console.warn(`[Phase34OpenTabs] ${inputMode} open-tab attempt ${attempt}/${maxRetries} failed (count=${beforeCount})`);
  }

  throw new Error('open_tab_failed_after_retries');
}

export async function execute(input: OpenTabsInput): Promise<OpenTabsOutput> {
  const {
    profile = 'xiaohongshu_fresh',
    tabCount = 4,
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;

  const requiredTotal = tabCount + 1; // tab0=搜索页 + tab1~4=帖子页
  console.log(`[Phase34OpenTabs] 确保固定 tab 池: ${requiredTotal} 个 (0=搜索页, 1-${tabCount}=帖子页)`);

  const inputMode = await getInputMode(unifiedApiUrl);
  console.log(`[Phase34OpenTabs] input mode: ${inputMode}`);

  let existing = await listPages(profile, unifiedApiUrl);
  if (!existing.length) {
    console.log('[Phase34OpenTabs] 未检测到 session，尝试创建会话');
    await controllerAction('session:create', { profile, url: 'https://www.xiaohongshu.com' }, unifiedApiUrl);
    await new Promise(r => setTimeout(r, 800));
    existing = await listPages(profile, unifiedApiUrl);
  }
  const currentCount = existing.length;
  console.log(`[Phase34OpenTabs] 当前已有 ${currentCount} 个 tab`);

  const needed = Math.max(0, requiredTotal - currentCount);
  
  if (needed > 0) {
    console.log(`[Phase34OpenTabs] 需要补齐 ${needed} 个 tab`);
    for (let i = 0; i < needed; i++) {
      await openTab(profile, unifiedApiUrl, inputMode);
      console.log(`[Phase34OpenTabs] 新 tab ${currentCount + i + 1} 已打开`);
    }
  } else {
    console.log(`[Phase34OpenTabs] tab 数量已满足，无需新开`);
  }

  // 验证最终 tab 池
  const finalPages = await listPages(profile, unifiedApiUrl);
  console.log(`[Phase34OpenTabs] 最终 tab 池: ${finalPages.length} 个`);
  finalPages.forEach((p: any, i: number) => {
    const role = i === 0 ? '(搜索页)' : `(帖子页-${i})`;
    console.log(`  [${i}] index=${p.index} ${role} url=${p.url?.substring(0, 60)}`);
  });

  // 返回固定 tab 索引池（跳过 tab0，返回 tab1~4）
  const tabs: TabInfo[] = finalPages.slice(1, requiredTotal).map((p: any) => ({
    index: p.index,
    pageId: undefined as number | undefined,
  }));

  console.log(`[Phase34OpenTabs] 固定帖子页 tab 索引: [${tabs.map(t => t.index).join(', ')}]`);

  return {
    tabs,
    currentTab: 0,
  };
}
