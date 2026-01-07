/**
 * Workflow Block: CloseDetailBlock
 *
 * 关闭详情页（通用策略：history.back / ESC / 点击遮罩）
 */

export interface CloseDetailInput {
  sessionId: string;
  serviceUrl?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CloseDetailOutput {
  success: boolean;
  method: 'history_back' | 'esc_key' | 'mask_click' | 'unknown';
  anchor?: {
    detailContainerId?: string;
    detailRect?: Rect;
    searchListContainerId?: string;
    searchListRect?: Rect;
    verified?: boolean;
  };
  error?: string;
}

/**
 * 关闭详情页
 *
 * @param input - 输入参数
 * @returns Promise<CloseDetailOutput>
 */
export async function execute(input: CloseDetailInput): Promise<CloseDetailOutput> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701'
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  async function controllerAction(action: string, payload: any = {}) {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      // 防御性超时，避免 containers:match / browser:execute 长时间挂起
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    return data.data || data;
  }

  function findContainer(tree: any, pattern: RegExp): any {
    if (!tree) return null;
    if (pattern.test(tree.id || tree.defId || '')) return tree;
    if (Array.isArray(tree.children)) {
      for (const child of tree.children) {
        const found = findContainer(child, pattern);
        if (found) return found;
      }
    }
    return null;
  }

  try {
    const { highlightContainer, getContainerRect } = await import('./helpers/anchorVerify.ts');

    // 0. 关闭前：尝试找到详情容器并高亮 + Rect
    let detailContainerId: string | undefined;
    let detailRect: Rect | undefined;

    try {
      const matchResult = await controllerAction('containers:match', {
        profile,
        maxDepth: 6,
        maxChildren: 30
      });
      const tree = matchResult.snapshot?.container_tree || matchResult.container_tree;
      const modal = findContainer(tree, /xiaohongshu_detail\.modal_shell$/);
      const detailRoot = findContainer(tree, /^xiaohongshu_detail$/);
      const target = modal || detailRoot;

      if (target?.id) {
        detailContainerId = target.id;
        await highlightContainer(target.id, profile, serviceUrl, {
          style: '2px solid #ff4444',
          duration: 1500
        });
        const rect = await getContainerRect(target.id, profile, serviceUrl);
        if (rect) {
          detailRect = rect;
          console.log(`[CloseDetail] detail rect: ${JSON.stringify(rect)}`);
        }
      }
    } catch (e: any) {
      console.warn(`[CloseDetail] pre-close anchor verify error: ${e.message}`);
    }

    // 1. 尝试点击遮罩层关闭
    let method: 'history_back' | 'esc_key' | 'mask_click' | 'unknown' = 'unknown';
    let closeError: string | undefined;

    try {
      await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const mask = document.querySelector('.note-detail-mask');
          if (mask) {
            mask.click();
            return 'mask_click';
          }
          return null;
        })()`
      });
      await new Promise(r => setTimeout(r, 1200));
      method = 'mask_click';
    } catch (error: any) {
      // 2. 兜底：history.back
      try {
        await controllerAction('browser:execute', {
          profile,
          script: 'window.history.back()'
        });
        await new Promise(r => setTimeout(r, 1200));
        method = 'history_back';
      } catch (err: any) {
        closeError = err.message || String(err);
      }
    }

    // 3. 关闭后：尝试确认已经回到搜索列表页，并对列表容器做锚点回环
    let searchListContainerId: string | undefined;
    let searchListRect: Rect | undefined;
    let verified = false;

    try {
      const matchResultAfter = await controllerAction('containers:match', {
        profile,
        maxDepth: 6,
        maxChildren: 30
      });
      const treeAfter = matchResultAfter.snapshot?.container_tree || matchResultAfter.container_tree;
      const searchList = findContainer(treeAfter, /xiaohongshu_search\.search_result_list$/);

      if (searchList?.id) {
        searchListContainerId = searchList.id;
        await highlightContainer(searchList.id, profile, serviceUrl, {
          style: '2px solid #00bbff',
          duration: 1500
        });
        const rect = await getContainerRect(searchList.id, profile, serviceUrl);
        if (rect) {
          searchListRect = rect;
          console.log(`[CloseDetail] search_result_list rect: ${JSON.stringify(rect)}`);

          // 验证：详情 Rect 不再覆盖视口中心，列表出现在中部区域
          const listOk = searchListRect.y > 100 && searchListRect.height > 0;
          const detailGoneOrTop =
            !detailRect || detailRect.height < searchListRect.height || detailRect.y < 50;
          verified = listOk && detailGoneOrTop;
          console.log(`[CloseDetail] Rect validation: listOk=${listOk}, detailGoneOrTop=${detailGoneOrTop}`);
        }
      }
    } catch (e: any) {
      console.warn(`[CloseDetail] post-close anchor verify error: ${e.message}`);
    }

    if (closeError) {
      return {
        success: false,
        method: 'unknown',
        anchor: {
          detailContainerId,
          detailRect,
          searchListContainerId,
          searchListRect,
          verified
        },
        error: `CloseDetail failed: ${closeError}`
      };
    }

    return {
      success: true,
      method,
      anchor: {
        detailContainerId,
        detailRect,
        searchListContainerId,
        searchListRect,
        verified
      }
    };
  } catch (err: any) {
    return {
      success: false,
      method: 'unknown',
      error: `CloseDetail failed: ${err.message}`
    };
  }
}
