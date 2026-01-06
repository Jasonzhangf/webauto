/**
 * Workflow Block: GoToSearchBlock
 *
 * 导航到搜索页并执行搜索
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

  async function ensureSearchPage(): Promise<boolean> {
    const url = await getCurrentUrl();
    
    // 如果已在搜索页，刷新
    if (url.includes('/search_result')) {
      await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:execute',
          payload: {
            profile,
            script: 'location.reload()'
          }
        })
      });
      await new Promise(r => setTimeout(r, 2000));
      return true;
    }
    
    // 如果在小红书内，导航到搜索页
    if (url.includes('xiaohongshu.com')) {
      await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:execute',
          payload: {
            profile,
            script: `window.location.href = 'https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes'`
          }
        })
      });
      await new Promise(r => setTimeout(r, 3000));
      return true;
    }
    
    return false;
  }

  async function executeSearch(): Promise<boolean> {
    try {
      // 通过容器执行搜索
      const response = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'container:operation',
          payload: {
            containerId: 'xiaohongshu_search.search_bar',
            operationId: 'input',
            config: {
              value: keyword,
              enter: true
            },
            sessionId: profile
          }
        })
      });

      const data = await response.json();
      
      if (!data.success) {
        // 回退到浏览器脚本方式
        await fetch(controllerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'browser:execute',
            payload: {
              profile,
              script: `(() => {
                const input = document.querySelector('#search-input, input[type="search"]');
                if (input) {
                  input.value = '${keyword.replace(/'/g, "\\'")}';
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                  return true;
                }
                return false;
              })()`
            }
          })
        });
      }
      
      await new Promise(r => setTimeout(r, 3500));
      return true;
    } catch (error) {
      console.warn(`[GoToSearch] 容器搜索失败，尝试备用方式: ${error.message}`);
      
      // 备用：直接 URL 跳转
      await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:execute',
          payload: {
            profile,
            script: `window.location.href = 'https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes'`
          }
        })
      });
      await new Promise(r => setTimeout(r, 3500));
      return true;
    }
  }

  try {
    // 确保在搜索页
    const searchPageReady = await ensureSearchPage();
    const finalUrl = await getCurrentUrl();
    
    // 执行搜索
    const searchExecuted = await executeSearch();
    
    return {
      success: true,
      searchPageReady,
      searchExecuted,
      url: finalUrl
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
