/**
 * Workflow Block: GoToSearchBlock
 *
 * 导航到搜索页并执行搜索（模拟人工操作）
 * 警告：不要构造 search_result URL 直达，避免风控验证码
 */

export interface GoToSearchInput {
  sessionId: string;
  keyword: string;
  serviceUrl?: string;
}

export interface GoToSearchOutput {
  success: boolean;
  searchPageReady: boolean;
  searchExecuted: boolean;
  url: string;
  entryAnchor?: {
    containerId: string;
    selector?: string;
    rect?: { x: number; y: number; width: number; height: number };
    verified?: boolean;
  };
  exitAnchor?: {
    containerId: string;
    selector?: string;
    rect?: { x: number; y: number; width: number; height: number };
    verified?: boolean;
  };
  steps?: Array<{
    id: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    error?: string;
    anchor?: {
      containerId?: string;
      selector?: string;
      rect?: { x: number; y: number; width: number; height: number };
      verified?: boolean;
    };
    meta?: Record<string, any>;
  }>;
  anchor?: {
    containerId: string;
    selector?: string;
    rect?: { x: number; y: number; width: number; height: number };
    verified?: boolean;
  };
  error?: string;
}

/**
 * 导航到搜索页并执行搜索
 *
 * @param input - 输入参数
 * @returns Promise<GoToSearchOutput>
 */
export async function execute(input: GoToSearchInput): Promise<GoToSearchOutput> {
  const {
    sessionId,
    keyword,
    serviceUrl = 'http://127.0.0.1:7701'
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;
  const steps: GoToSearchOutput['steps'] = [];
  let entryAnchor: GoToSearchOutput['entryAnchor'];
  let exitAnchor: GoToSearchOutput['exitAnchor'];

  function pushStep(step: NonNullable<GoToSearchOutput['steps']>[number]) {
    steps.push(step);
    try {
      console.log(
        '[GoToSearch][step]',
        JSON.stringify(
          {
            id: step.id,
            status: step.status,
            error: step.error,
            anchor: step.anchor,
            meta: step.meta,
          },
          null,
          2,
        ),
      );
    } catch {
      console.log('[GoToSearch][step]', step.id, step.status);
    }
  }

  async function controllerAction(action: string, payload: any = {}) {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    return data.data || data;
  }

  async function verifySearchBarAnchor() {
    try {
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');
      const anchor = await verifyAnchorByContainerId('xiaohongshu_search.search_bar', profile, serviceUrl);
      if (!anchor.found) {
        return { found: false, error: anchor.error || 'anchor_not_found', selector: anchor.selector };
      }
      return {
        found: true,
        selector: anchor.selector || '#search-input',
        rect: anchor.rect
      };
    } catch (error: any) {
      return { found: false, error: error.message };
    }
  }

  async function verifySearchResultListAnchor() {
    try {
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');
      const anchor = await verifyAnchorByContainerId('xiaohongshu_search.search_result_list', profile, serviceUrl);
      if (!anchor.found) {
        return {
          found: false,
          error: anchor.error || 'anchor_not_found',
          selector: anchor.selector,
          rect: anchor.rect
        };
      }
      return {
        found: true,
        selector: anchor.selector,
        rect: anchor.rect
      };
    } catch (error: any) {
      return { found: false, error: error.message };
    }
  }

  async function getCurrentUrl(): Promise<string> {
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

  async function isSearchInputFocused(selector: string | undefined): Promise<boolean> {
    if (!selector) return false;
    const script = `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      return document.activeElement === el;
    })()`;

    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script,
        },
      }),
    });
    const data = await response.json();
    return Boolean(data.data?.result ?? data.result);
  }

  async function readSearchInputValue(selector: string | undefined): Promise<string> {
    const sel =
      selector ||
      '#search-input, input[type=\"search\"], .search-input';

    const script = `(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return '';
      // @ts-ignore
      return (el as HTMLInputElement).value || '';
    })()`;

    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script,
        },
      }),
    });
    const data = await response.json();
    const value = data.data?.result ?? data.result ?? '';
    return typeof value === 'string' ? value : '';
  }

  async function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitSearchPermit(): Promise<void> {
    const gateUrl = process.env.WEBAUTO_SEARCH_GATE_URL || 'http://127.0.0.1:7790/permit';

    async function requestOnce() {
      const response = await fetch(gateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile,
          windowMs: 60_000,
          maxCount: 2
        }),
        // 避免 SearchGate 挂死导致阻塞整个 Workflow
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined
      });
      if (!response.ok) {
        throw new Error(`SearchGate HTTP ${response.status}`);
      }
      const data = await response.json();
      return {
        allowed: Boolean(data.allowed),
        waitMs: Number(data.waitMs || 0)
      };
    }

    try {
      // 最多等待几轮，避免无限阻塞（按 SearchGate 策略，每轮最多等 60s）
      for (let i = 0; i < 5; i += 1) {
        const { allowed, waitMs } = await requestOnce();
        if (allowed) {
          console.log('[GoToSearch] SearchGate permit granted');
          return;
        }
        const safeWait = Math.min(Math.max(waitMs, 5_000), 65_000);
        console.log(`[GoToSearch] SearchGate throttling, wait ${safeWait}ms`);
        await wait(safeWait);
      }
      throw new Error('SearchGate throttling: too many retries');
    } catch (err: any) {
      console.error('[GoToSearch] SearchGate not available:', err.message);
      throw new Error('SearchGate not available, 请先在另一终端运行 node scripts/search-gate-server.mjs');
    }
  }

  async function ensureHomePage(): Promise<boolean> {
    const url = await getCurrentUrl();
    
    // 如果已经在搜索结果页，且关键词不同，我们优先回到首页重新搜索（模拟真实用户）
    // 或者直接清空搜索框输入
    if (url.includes('/search_result')) {
      console.log('[GoToSearch] Currently on search page, going to clear input...');
      // 这里不强制回首页，直接在当前页搜也是合理的
      return true;
    }
    
    // 如果在验证码页面，抛出错误请求人工介入
    if (url.includes('captcha') || url.includes('verify')) {
      throw new Error('Detected CAPTCHA page, please solve it manually.');
    }

    // 如果不在小红书，要求人工切回站内（禁止代码构造/跳转 URL）
    if (!url.includes('xiaohongshu.com')) {
      throw new Error('Not on xiaohongshu.com, please navigate manually before searching.');
    }

    return true;
  }

  async function executeSearch(anchorSelector?: string): Promise<boolean> {
    try {
      console.log(`[GoToSearch] Typing keyword "${keyword}"...`);

      // 使用容器操作：type + enter（纯容器驱动，禁止脚本直接 click）
      const selector =
        anchorSelector ||
        '#search-input, input[type="search"], .search-input';

      const contResp = await controllerAction('container:operation', {
        containerId: 'xiaohongshu_search.search_bar',
        operationId: 'type',
        config: {
          selector,
          text: keyword,
          clear_first: true,
          submit: true
        },
        sessionId: profile
      });
      
      if (!contResp.success) {
        throw new Error(`Search bar container operation failed: ${contResp.error || 'unknown'}`);
      }

      console.log('[GoToSearch] Search triggered, waiting for results...');
      await wait(5000);
      return true;
    } catch (error) {
      console.error(`[GoToSearch] Search failed: ${error.message}`);
      throw error;
    }
  }

  try {
    // 0. 所有搜索必须先经过 SearchGate 节流
    await waitSearchPermit();

    // 1. 确保在站内（最好是首页或搜索页）——如果连站点都不对，直接失败
    await ensureHomePage();

    // 1.5 验证搜索框锚点（通过 containers:match）——入口锚点
    const anchorResult = await verifySearchBarAnchor();
    if (!anchorResult.found) {
      entryAnchor = {
        containerId: 'xiaohongshu_search.search_bar',
        selector: anchorResult.selector,
        rect: anchorResult.rect,
        verified: false,
      };
      console.log(
        '[GoToSearch][entryAnchor]',
        JSON.stringify(entryAnchor, null, 2),
      );
      pushStep({
        id: 'verify_search_bar_anchor',
        status: 'failed',
        error: anchorResult.error || 'anchor_not_found',
        anchor: entryAnchor,
      });
      return {
        success: false,
        searchPageReady: false,
        searchExecuted: false,
        url: '',
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: {
          containerId: 'xiaohongshu_search.search_bar',
          selector: anchorResult.selector,
          verified: false
        },
        error: `Search bar anchor not found: ${anchorResult.error || 'unknown error'}`
      };
    }

    // 1.6 执行 container:operation highlight（容器层高亮）
    try {
      await controllerAction('container:operation', {
        containerId: 'xiaohongshu_search.search_bar',
        operationId: 'highlight',
        config: {
          selector: anchorResult.selector,
          style: '3px solid #ff4444',
          duration: 2000,
        },
        sessionId: profile
      });
      console.log('[GoToSearch] Search bar highlighted successfully');
    } catch (error) {
      console.warn('[GoToSearch] Highlight error:', error.message);
    }

    // 1.7 获取 Rect 并验证
    // 优先使用 verifyAnchor 返回的 rect（已经通过 DOM 回环计算过）
    const rect = anchorResult.rect;

    const rectVerified = rect && rect.y < 200 && rect.width > 0 && rect.height > 0;
    if (!rectVerified) {
      console.warn(`[GoToSearch] Rect validation failed: ${JSON.stringify(rect)}`);
    } else {
      console.log(`[GoToSearch] Rect verified: y=${rect.y}, width=${rect.width}, height=${rect.height}`);
    }

    entryAnchor = {
      containerId: 'xiaohongshu_search.search_bar',
      selector: anchorResult.selector,
      rect,
      verified: Boolean(rectVerified),
    };
    console.log(
      '[GoToSearch][entryAnchor]',
      JSON.stringify(entryAnchor, null, 2),
    );
    pushStep({
      id: 'verify_search_bar_anchor',
      status: rectVerified ? 'success' : 'success',
      // 即便 rect 验证略警告，只要找到了就认为进入了阶段，具体质量通过 verified 表达
      anchor: entryAnchor,
    });

    // 1.8 使用容器运行时 + 系统点击聚焦搜索框（基于容器锚点的安全点击）
    if (anchorResult.selector) {
      try {
        const clickResp = await controllerAction('container:operation', {
          containerId: 'xiaohongshu_search.search_bar',
          operationId: 'click',
          config: { selector: anchorResult.selector, useSystemMouse: true },
          sessionId: profile
        });
        console.log('[GoToSearch] System click on search bar executed', clickResp);

        // 点击后做一次焦点确认
        const focused = await isSearchInputFocused(anchorResult.selector);
        pushStep({
          id: 'system_click_focus_input',
          status: focused ? 'success' : 'failed',
          anchor: entryAnchor,
          meta: { focused },
        });
        if (!focused) {
          return {
            success: false,
            searchPageReady: false,
            searchExecuted: false,
            url: await getCurrentUrl(),
            entryAnchor,
            exitAnchor: undefined,
            steps,
            anchor: entryAnchor,
            error: 'Search input not focused after system click',
          };
        }
      } catch (error: any) {
        console.warn('[GoToSearch] System click on search bar failed:', error.message);
        pushStep({
          id: 'system_click_focus_input',
          status: 'failed',
          anchor: entryAnchor,
          error: error.message,
        });
        return {
          success: false,
          searchPageReady: false,
          searchExecuted: false,
          url: await getCurrentUrl(),
          entryAnchor,
          exitAnchor: undefined,
          steps,
          anchor: entryAnchor,
          error: `System click failed: ${error.message}`,
        };
      }
    } else {
      console.warn('[GoToSearch] Skip system click: no selector from anchorResult');
      pushStep({
        id: 'system_click_focus_input',
        status: 'skipped',
        anchor: entryAnchor,
        meta: { reason: 'no_selector' },
      });
    }

    // 2. 执行搜索（模拟输入，仍通过容器 operation 驱动）
    const searchExecuted = await executeSearch(anchorResult.selector);
    const finalUrl = await getCurrentUrl();

    // 2.1 检查输入框中的值是否为当前关键字
    const currentValue = await readSearchInputValue(anchorResult.selector);
    const valueMatches = currentValue.trim() === keyword.trim();
    pushStep({
      id: 'system_type_keyword',
      status: valueMatches && searchExecuted ? 'success' : 'failed',
      anchor: entryAnchor,
      meta: { value: currentValue, expected: keyword, searchExecuted },
      error: !valueMatches ? 'keyword_mismatch' : undefined,
    });

    // 如果搜索输入阶段本身失败，直接返回错误
    if (!searchExecuted) {
      return {
        success: false,
        searchPageReady: false,
        searchExecuted,
        url: finalUrl,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        error: `Search input/trigger failed, current url=${finalUrl || 'unknown'}`,
      };
    }

    // 2.5 通过容器锚点验证搜索结果列表是否出现
    const listAnchor = await verifySearchResultListAnchor();
    if (!listAnchor.found) {
      console.warn(
        '[GoToSearch] Search result list anchor not found after search:',
        listAnchor.error || 'unknown error'
      );
      return {
        success: false,
        searchPageReady: false,
        searchExecuted,
        url: finalUrl,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: {
          containerId: 'xiaohongshu_search.search_result_list',
          selector: listAnchor.selector,
          rect: listAnchor.rect,
          verified: false
        },
        error: `Search result list anchor not found: ${listAnchor.error || 'unknown error'}`,
      };
    }

    exitAnchor = {
      containerId: 'xiaohongshu_search.search_result_list',
      selector: listAnchor.selector,
      rect: listAnchor.rect,
      verified: Boolean(listAnchor.rect && listAnchor.rect.height > 0 && listAnchor.rect.y < (listAnchor.rect.height + (listAnchor.rect.y || 0))),
    };
    console.log(
      '[GoToSearch][exitAnchor]',
      JSON.stringify(exitAnchor, null, 2),
    );
    pushStep({
      id: 'wait_search_result_list',
      status: 'success',
      anchor: exitAnchor,
      meta: { url: finalUrl },
    });
    
    // 3. 检查是否出现验证码（依然用 URL 作为风控信号，但不作为阶段判断条件）
    if (finalUrl.includes('captcha') || finalUrl.includes('verify')) {
      return {
        success: false,
        searchPageReady: false,
        searchExecuted: true,
        url: finalUrl,
        error: 'Triggered CAPTCHA after search'
      };
    }

    return {
      success: true,
      searchPageReady: true,
      searchExecuted,
      url: finalUrl,
      entryAnchor,
      exitAnchor,
      steps,
      anchor: {
        containerId: 'xiaohongshu_search.search_bar',
        selector: anchorResult.selector,
        rect,
        verified: rectVerified
      }
    };
  } catch (error: any) {
    return {
      success: false,
      searchPageReady: false,
      searchExecuted: false,
      url: '',
      entryAnchor,
      exitAnchor,
      steps,
      error: `GoToSearch failed: ${error.message}`
    };
  }
}
