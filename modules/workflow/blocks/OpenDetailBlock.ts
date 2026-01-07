/**
 * Workflow Block: OpenDetailBlock
 *
 * 打开详情页（通过容器 click 触发模态框）
 */

export interface OpenDetailInput {
  sessionId: string;
  containerId: string; // search_result_item 容器 ID
  // detailUrl?: string;  // 预留：带 xsec_token 的安全链接（当前版本不再直接使用，统一改为“点击后从 location.href 读取”）
  serviceUrl?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OpenDetailOutput {
  success: boolean;
  detailReady: boolean;
  anchor?: {
    clickedItemContainerId: string;
    clickedItemRect?: Rect;
    detailContainerId?: string;
    detailRect?: Rect;
    verified?: boolean;
  };
  safeDetailUrl?: string;
  noteId?: string;
  error?: string;
}

/**
 * 打开详情页
 *
 * @param input - 输入参数
 * @returns Promise<OpenDetailOutput>
 */
export async function execute(input: OpenDetailInput): Promise<OpenDetailOutput> {
  const {
    sessionId,
    containerId,
    serviceUrl = 'http://127.0.0.1:7701'
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  async function controllerAction(action: string, payload: any = {}) {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      // 防御性超时，避免 containers:match / container:operation 长时间挂起
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    return data.data || data;
  }

  async function getCurrentUrl(): Promise<string> {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile, script: 'location.href' }
      })
    });
    const data = await response.json();
    return data.data?.result || '';
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

  function collectIds(tree: any, result: string[] = []): string[] {
    if (!tree) return result;
    result.push(tree.id || tree.defId || 'unknown');
    if (Array.isArray(tree.children)) {
      tree.children.forEach(c => collectIds(c, result));
    }
    return result;
  }

  async function waitForDetail(maxRetries = 10): Promise<{ ready: boolean; safeUrl?: string; noteId?: string }> {
    let safeUrl: string | undefined;
    let noteId: string | undefined;

    for (let i = 0; i < maxRetries; i++) {
      const currentUrl = await getCurrentUrl();
      // 404 / 当前笔记暂时无法浏览 → 立即判定为失败
      if (currentUrl.includes('/404') && currentUrl.includes('error_code=300031')) {
        console.warn('[OpenDetail] Detected 404 note page, aborting detail wait');
        return { ready: false };
      }

      const matchResult = await controllerAction('containers:match', {
        profile,
        maxDepth: 4,
        maxChildren: 20
      });

      const tree = matchResult.snapshot?.container_tree || matchResult.container_tree;
      if (!tree) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const rootIds = collectIds(tree);
      console.log(`[OpenDetail] Container tree: ${rootIds.join(', ')}`);

      const modal = findContainer(tree, /xiaohongshu_detail\.modal_shell$/);
      const detailRoot = findContainer(tree, /^xiaohongshu_detail$/);
      
      if (modal || detailRoot) {
        console.log(`[OpenDetail] Detail container matched: ${modal ? 'modal' : 'root'}`);
        // 进入详情视图后，从 location.href 中解析 noteId + xsec_token
        const url = await getCurrentUrl();
        safeUrl = url && /[?&]xsec_token=/.test(url) ? url : undefined;
        const m = url?.match(/\/explore\/([0-9a-z]+)/i);
        noteId = m ? m[1] : undefined;
        return { ready: true, safeUrl, noteId };
      }

      await new Promise(r => setTimeout(r, 1000));
    }
    return { ready: false };
  }

  try {
    const { highlightContainer, getContainerRect } = await import('./helpers/anchorVerify.ts');

    const startUrl = await getCurrentUrl();
    console.log(`[OpenDetail] Start URL: ${startUrl}`);

    // 0. 点击前：对选中的 search_result_item 做锚点高亮（方便你肉眼确认卡片）
    let clickedItemRect: Rect | undefined;
    try {
      const highlighted = await highlightContainer(containerId, profile, serviceUrl, {
        style: '3px solid #ff9900',
        duration: 2000
      });
      if (!highlighted) {
        console.warn('[OpenDetail] Failed to highlight clicked item');
      }
    } catch (e: any) {
      console.warn(`[OpenDetail] Pre-click anchor verify error: ${e.message}`);
    }

    // 1. 打开详情
    //   安全策略：直接在当前卡片内部点击可见的图片/封面链接（你提供的 .cover.mask 节点），不做任何 URL 拼接：
    //   - 优先点击 .feeds-container 下第一条 note-item 内的 a.cover.mask
    //   - 如无 cover.mask，则退回点击 note-item 内第一个可见 img
    try {
      const clickResult = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const card = document.querySelector('.feeds-container .note-item');
          if (!card) return { ok: false, reason: 'no card' };
          let anchor = card.querySelector('a.cover.mask');
          if (!anchor) {
            anchor = card.querySelector('a[href*=\"/search_result/\"]');
          }
          let target = anchor;
          if (!target) {
            target = card.querySelector('img');
          }
          if (!target || !(target instanceof HTMLElement)) {
            return { ok: false, reason: 'no clickable element' };
          }
          target.click();
          return { ok: true };
        })()`
      });
      const clickRes = clickResult.result || clickResult.data?.result || clickResult;
      if (!clickRes?.ok) {
        console.warn('[OpenDetail] DOM click returned:', clickRes);
      } else {
        console.log('[OpenDetail] DOM click on visible cover/image executed');
      }
    } catch (e: any) {
      console.warn('[OpenDetail] DOM click script error:', e.message);
    }

    // 点击后稍等一会儿让前端完成路由/模态切换
    await new Promise((r) => setTimeout(r, 3000));

    const midUrl = await getCurrentUrl();
    console.log(`[OpenDetail] Post-click URL: ${midUrl}`);

    // 2. 等待详情模态出现（或完整详情页），并尝试读取带 xsec_token 的安全 URL
    const detailState = await waitForDetail();
    const detailReady = detailState.ready;

    // 3. 详情出现后，对 modal_shell 做锚点高亮 + Rect 回环
    let detailContainerId: string | undefined;
    let detailRect: Rect | undefined;
    let verified = false;

    if (detailReady) {
      try {
        const matchResult = await controllerAction('containers:match', {
          profile,
          maxDepth: 6,
          maxChildren: 30
        });

        const tree = matchResult.snapshot?.container_tree || matchResult.container_tree;

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

        const modal = findContainer(tree, /xiaohongshu_detail\.modal_shell$/);
        const detailRoot = findContainer(tree, /^xiaohongshu_detail$/);
        const target = modal || detailRoot;

        if (target?.id) {
          detailContainerId = target.id;
          const highlighted = await highlightContainer(target.id, profile, serviceUrl, {
            style: '3px solid #ff4444',
            duration: 2000
          });
          if (!highlighted) {
            console.warn('[OpenDetail] Failed to highlight detail container');
          }

          const rect = await getContainerRect(target.id, profile, serviceUrl);
          if (rect) {
            detailRect = rect;
            console.log(`[OpenDetail] Detail container rect: ${JSON.stringify(rect)}`);
            // 验证：详情模态应覆盖视口大部分区域
            verified =
              rect.width > 400 &&
              rect.height > 400 &&
              rect.y < 200;
          } else {
            console.warn('[OpenDetail] Failed to get rect for detail container');
          }
        }
      } catch (e: any) {
        console.warn(`[OpenDetail] Detail anchor verify error: ${e.message}`);
      }
    }

    return {
      success: true,
      detailReady,
      safeDetailUrl: detailState.safeUrl,
      noteId: detailState.noteId,
      anchor: {
        clickedItemContainerId: containerId,
        clickedItemRect,
        detailContainerId,
        detailRect,
        verified
      }
    };
  } catch (error: any) {
    return {
      success: false,
      detailReady: false,
      error: `OpenDetail failed: ${error.message}`
    };
  }
}
