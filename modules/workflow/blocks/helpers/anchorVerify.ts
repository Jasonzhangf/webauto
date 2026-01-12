/**
 * 锚点验证辅助函数
 * 用于 Block 中验证容器锚点 + 高亮 + Rect 回环
 */

export interface AnchorVerifyResult {
  found: boolean;
  highlighted: boolean;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  error?: string;
}

export interface HighlightOptions {
  style?: string;
  duration?: number;
}

/**
 * 验证锚点容器：找到 + 高亮 + 获取 Rect
 */
export async function verifyAnchor(
  containerId: string,
  sessionId: string,
  serviceUrl: string = 'http://127.0.0.1:7701'
): Promise<AnchorVerifyResult> {
  try {
    // 1. 高亮容器
    const highlighted = await highlightContainer(containerId, sessionId, serviceUrl);
    if (!highlighted) {
      return {
        found: false,
        highlighted: false,
        error: `Failed to highlight container: ${containerId}`
      };
    }

    // 2. 获取 Rect
    const rect = await getContainerRect(containerId, sessionId, serviceUrl);
    if (!rect || rect.width === 0 || rect.height === 0) {
      return {
        found: true,
        highlighted: true,
        rect,
        error: `Container ${containerId} has invalid rect: ${JSON.stringify(rect)}`
      };
    }

    return {
      found: true,
      highlighted: true,
      rect
    };
  } catch (error: any) {
    return {
      found: false,
      highlighted: false,
      error: `verifyAnchor failed: ${error.message}`
    };
  }
}

/**
 * 高亮容器
 */
export async function highlightContainer(
  containerId: string,
  sessionId: string,
  serviceUrl: string = 'http://127.0.0.1:7701',
  options: HighlightOptions = {}
): Promise<boolean> {
  try {
    const { style = '3px solid #ff4444', duration = 2000 } = options;

    const response = await fetch(`${serviceUrl}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'container:operation',
        payload: {
          containerId,
          operationId: 'highlight',
          config: { style, duration },
          sessionId
        }
      })
    });

    if (!response.ok) {
      console.error(`[highlightContainer] HTTP ${response.status}: ${await response.text()}`);
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch (error: any) {
    console.error(`[highlightContainer] Error:`, error.message);
    return false;
  }
}

/**
 * 获取容器的 Rect（通过 browser:execute + getBoundingClientRect）
 */
export async function getContainerRect(
  containerId: string,
  sessionId: string,
  serviceUrl: string = 'http://127.0.0.1:7701'
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  try {
    // 先获取当前页面 URL，避免 containers:match 依赖 session-manager CLI 查询会话
    let currentUrl: string | null = null;
    try {
      const urlResp = await fetch(`${serviceUrl}/v1/controller/action`, {
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
        const urlData = await urlResp.json();
        currentUrl = urlData.data?.result || urlData.result || null;
      }
    } catch (e: any) {
      console.warn('[getContainerRect] failed to read current url:', e?.message || e);
    }

    // 先通过 containers:match 获取容器的 selector
    const matchResponse = await fetch(`${serviceUrl}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'containers:match',
        payload: {
          profile: sessionId,
          ...(currentUrl ? { url: currentUrl } : {}),
          maxDepth: 5,
          maxChildren: 20
        }
      }),
      // 避免长时间挂起：为 containers:match 增加超时
      // Node >=16 支持 AbortSignal.timeout
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
    });

    if (!matchResponse.ok) {
      console.error(`[getContainerRect] containers:match failed: ${matchResponse.status}`);
      return null;
    }

    const matchData = await matchResponse.json();
    const tree = matchData.data?.snapshot?.container_tree || matchData.snapshot?.container_tree;

    // 递归查找容器
    function findContainer(node: any, targetId: string): any {
      if (!node) return null;
      if (node.id === targetId || node.defId === targetId) return node;
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const found = findContainer(child, targetId);
          if (found) return found;
        }
      }
      return null;
    }

    const container = findContainer(tree, containerId);
    if (!container) {
      console.error(`[getContainerRect] Container ${containerId} not found in container_tree`);
      return null;
    }

    const selector: string | undefined =
      typeof container.selector === 'string'
        ? container.selector
        : Array.isArray(container.selectors) && container.selectors.length
          ? container.selectors[0].css
          : undefined;

    if (!selector) {
      console.error(
        `[getContainerRect] Container ${containerId} has no selector; selectors field:`,
        JSON.stringify(container.selectors || container.selector || null),
      );
      return null;
    }

    // 通过 browser:execute 获取 Rect
    const script = `
      (() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        };
      })()
    `;

    const execResponse = await fetch(`${serviceUrl}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile: sessionId,
          script
        }
      }),
      // browser:execute 也加一个防御性超时
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
    });

    if (!execResponse.ok) {
      console.error(`[getContainerRect] browser:execute failed: ${execResponse.status}`);
      return null;
    }

    const execData = await execResponse.json();
    const result = execData.data?.result || execData.result || null;

    // 兼容 promise 结果为 { ok, rect } 的脚本返回格式
    if (result && typeof result === 'object' && 'rect' in result && !('x' in result)) {
      return (result as any).rect || null;
    }

    return result;
  } catch (error: any) {
    console.error(`[getContainerRect] Error:`, error.message);
    return null;
  }
}
