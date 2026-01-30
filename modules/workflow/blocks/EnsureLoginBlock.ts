/**
 * Workflow Block: EnsureLoginBlock
 *
 * 通过容器匹配确保浏览器处于登录状态
 * 基于登录锚点模型：*.login_anchor（已登录）或 xiaohongshu_login.login_guard（未登录）
 */

export interface EnsureLoginInput {
  sessionId: string;
  serviceUrl?: string;
  maxWaitMs?: number;
  checkIntervalMs?: number;
}

export interface EnsureLoginOutput {
  isLoggedIn: boolean;
  loginMethod: 'container_match' | 'manual_wait' | 'timeout';
  matchedContainer?: string;
  waitTimeMs?: number;
  error?: string;
}

/**
 * 确保登录状态（容器驱动版）
 *
 * @param input - 输入参数
 * @returns Promise<EnsureLoginOutput>
 */
export async function execute(input: EnsureLoginInput): Promise<EnsureLoginOutput> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701',
    maxWaitMs = 120000, // 2分钟
    checkIntervalMs = 3000
  } = input;

  const startTime = Date.now();
  const waitLimitMs = maxWaitMs <= 0 ? Number.POSITIVE_INFINITY : maxWaitMs;

  // 检查登录状态的辅助函数
  async function checkLoginStatus(): Promise<{ isLoggedIn: boolean; containerId?: string; error?: string }> {
    try {
      // 通过 Unified API 调用容器匹配
      const controllerUrl = `${serviceUrl}/v1/controller/action`;

      // 优先读取当前 URL 并传给 containers:match，避免为了匹配再额外跑 session-manager CLI（更稳定/更快）
      let currentUrl = '';
      try {
        const urlResp = await fetch(controllerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'browser:execute',
            payload: {
              profile: sessionId,
              script: 'location.href',
            },
          }),
          signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(8000) : undefined,
        });
        if (urlResp.ok) {
          const urlJson = await urlResp.json().catch(() => ({}));
          currentUrl = urlJson?.data?.result || urlJson?.result || '';
        }
      } catch {
        currentUrl = '';
      }

      const response = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'containers:match',
          payload: {
            profile: sessionId,
            ...(currentUrl ? { url: currentUrl } : {}),
            // 登录锚点通常在较浅层级即可命中；避免过深/过宽导致 containers:match 超时
            maxDepth: 2,
            maxChildren: 5
          }
        }),
        // 为 containers:match 增加超时，避免长时间挂起
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(25000) : undefined
      });

      if (!response.ok) {
        return { isLoggedIn: false, error: `HTTP ${response.status}: ${await response.text()}` };
      }

      const result = await response.json();
      const data = result.data || result;
      const tree = data.snapshot?.container_tree || data.container_tree;

      // 递归查找匹配的容器
      function findContainer(node: any, pattern: RegExp): any {
        if (!node) return null;
        if (pattern.test(node.id || node.defId || '')) return node;
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            const found = findContainer(child, pattern);
            if (found) return found;
          }
        }
        return null;
      }

      // 检查已登录容器
      const loginAnchor = findContainer(tree, /\.login_anchor$/);
      if (loginAnchor) {
        return {
          isLoggedIn: true,
          containerId: loginAnchor.id || loginAnchor.defId
        };
      }

      // 检查未登录容器
      const loginGuard = findContainer(tree, /xiaohongshu_login\.login_guard$/);
      if (loginGuard) {
        return {
          isLoggedIn: false,
          containerId: loginGuard.id || loginGuard.defId
        };
      }

      // 未匹配到任何登录相关容器
      return {
        isLoggedIn: false,
        error: '未匹配到登录锚点容器（*.login_anchor 或 xiaohongshu_login.login_guard）'
      };
    } catch (error: any) {
      return {
        isLoggedIn: false,
        error: `容器匹配失败: ${error.message}`
      };
    }
  }

  try {
    // 首次检查
    let status = await checkLoginStatus();
    if (status.isLoggedIn) {
      return {
        isLoggedIn: true,
        loginMethod: 'container_match',
        matchedContainer: status.containerId,
        waitTimeMs: Date.now() - startTime
      };
    }

    // 如果未登录，等待人工登录
    console.log(`[EnsureLogin] 未检测到登录状态，匹配到容器: ${status.containerId || 'none'}`);
    const waitHint =
      waitLimitMs === Number.POSITIVE_INFINITY
        ? '无超时'
        : `${waitLimitMs}ms`;
    console.log(`[EnsureLogin] 等待人工登录，最大等待时间: ${waitHint}`);

    while (Date.now() - startTime < waitLimitMs) {
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      
      status = await checkLoginStatus();
      if (status.isLoggedIn) {
        return {
          isLoggedIn: true,
          loginMethod: 'manual_wait',
          matchedContainer: status.containerId,
          waitTimeMs: Date.now() - startTime
        };
      }

      if (status.error && !status.error.includes('未匹配到登录锚点容器')) {
        console.warn(`[EnsureLogin] 检查时出现错误: ${status.error}`);
      }

      console.log(`[EnsureLogin] 登录状态检查中... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
    }

    // 超时
    return {
      isLoggedIn: false,
      loginMethod: 'timeout',
      matchedContainer: status.containerId,
      waitTimeMs: Date.now() - startTime,
      error: `登录等待超时 (${waitLimitMs}ms)`
    };

  } catch (error: any) {
    return {
      isLoggedIn: false,
      loginMethod: 'container_match',
      error: `EnsureLogin 执行错误: ${error.message}`
    };
  }
}
