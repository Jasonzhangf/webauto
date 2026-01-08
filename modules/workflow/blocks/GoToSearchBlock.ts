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
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');
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
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');
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

    // 如果不在小红书，先回首页
    if (!url.includes('xiaohongshu.com')) {
      console.log('[GoToSearch] Navigating to homepage...');
      await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:execute',
          payload: {
            profile,
            script: `window.location.href = 'https://www.xiaohongshu.com'`
          }
        })
      });
      await wait(5000);
    }

    return true;
  }

  async function executeSearch(): Promise<boolean> {
    try {
      console.log(`[GoToSearch] Typing keyword "${keyword}"...`);
      
      // 1. 尝试找到搜索框并输入
      // 优先使用容器操作（如果有定义 search_bar）
      // 这里为了稳健，结合脚本操作 DOM，模拟点击 -> 输入 -> 回车
      
      const script = `(async () => {
        const input = document.querySelector('#search-input, input[type="search"], .search-input');
        if (!input) return { found: false };
        
        // 模拟点击聚焦
        input.click();
        input.focus();
        
        // 模拟清空
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));
        
        // 模拟输入
        input.value = '${keyword.replace(/'/g, "\\'")}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 800));
        
        // 模拟回车
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        
        // 有些时候需要点击搜索按钮
        const btn = document.querySelector('.search-icon, .search-button');
        if (btn) btn.click();
        
        return { found: true };
      })()`;

      const response = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:execute',
          payload: {
            profile,
            script
          }
        })
      });
      
      const data = await response.json();
      const result = data.data?.result || {};
      
      if (!result.found) {
        console.warn('[GoToSearch] Search input not found via script');
        // 尝试容器方式作为备选
        const contResp = await fetch(controllerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'container:operation',
            payload: {
              containerId: 'xiaohongshu_search.search_bar',
              operationId: 'input',
              config: { value: keyword, enter: true },
              sessionId: profile
            }
          })
        });
        const contData = await contResp.json();
        if (!contData.success) {
          throw new Error('Search bar not accessible');
        }
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

    // 1. 确保在站内（最好是首页或搜索页）
    await ensureHomePage();

    // 1.5 验证搜索框锚点（通过 containers:match）
    const anchorResult = await verifySearchBarAnchor();
    if (!anchorResult.found) {
      return {
        success: false,
        searchPageReady: false,
        searchExecuted: false,
        url: '',
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
        config: { style: '3px solid #ff4444', duration: 2000 },
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

    // 2. 执行搜索（模拟输入）
    const searchExecuted = await executeSearch();
    const finalUrl = await getCurrentUrl();

    // 如果搜索输入阶段本身失败，直接返回错误
    if (!searchExecuted) {
      return {
        success: false,
        searchPageReady: false,
        searchExecuted,
        url: finalUrl,
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
        anchor: {
          containerId: 'xiaohongshu_search.search_result_list',
          selector: listAnchor.selector,
          rect: listAnchor.rect,
          verified: false
        },
        error: `Search result list anchor not found: ${listAnchor.error || 'unknown error'}`,
      };
    }
    
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
      error: `GoToSearch failed: ${error.message}`
    };
  }
}
