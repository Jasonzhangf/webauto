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

      // 通过 DOM 直接判断详情是否就绪，避免在等待阶段频繁调用 containers:match
      try {
        const domResult = await controllerAction('browser:execute', {
          profile,
          script: `(() => {
            const hasModal =
              document.querySelector('.note-detail-mask') ||
              document.querySelector('.note-detail-page') ||
              document.querySelector('.note-detail-dialog');
            const hasComments =
              document.querySelector('.comments-el') ||
              document.querySelector('.comment-list') ||
              document.querySelector('.comments-container');
            return { hasModal: !!hasModal, hasComments: !!hasComments };
          })()`
        });
        const payload = domResult.result || domResult.data?.result || domResult;
        if (payload?.hasModal || payload?.hasComments) {
          const url = currentUrl || (await getCurrentUrl());
          safeUrl = url && /[?&]xsec_token=/.test(url) ? url : undefined;
          const m = url?.match(/\/explore\/([0-9a-z]+)/i);
          noteId = m ? m[1] : undefined;
          console.log('[OpenDetail] Detail DOM ready (hasModal/hasComments)');
          return { ready: true, safeUrl, noteId };
        }
      } catch (e: any) {
        console.warn(`[OpenDetail] DOM readiness check failed (retry ${i}): ${e.message}`);
      }

      await new Promise(r => setTimeout(r, 1000));
    }
    return { ready: false };
  }

  try {
    const { highlightContainer, getContainerRect } = await import('./helpers/anchorVerify.ts');

    const startUrl = await getCurrentUrl();
    console.log(`[OpenDetail] Start URL: ${startUrl}`);

    // 0. 点击前：对选中的卡片容器（search_result_item / feed_item）做锚点高亮 + Rect 回环
    let clickedItemRect: Rect | undefined;
    try {
      const highlighted = await highlightContainer(containerId, profile, serviceUrl, {
        style: '3px solid #ff9900',
        duration: 2000
      });
      if (!highlighted) {
        console.warn('[OpenDetail] Failed to highlight clicked item');
      } else {
        const rect = await getContainerRect(containerId, profile, serviceUrl);
        if (rect) {
          clickedItemRect = rect;
          console.log(`[OpenDetail] clicked item rect: ${JSON.stringify(rect)}`);
        }
      }
    } catch (e: any) {
      console.warn(`[OpenDetail] Pre-click anchor verify error: ${e.message}`);
    }

    // 1. 打开详情
    //   安全策略：仅在当前卡片 Rect 内查找可见的封面/图片元素并点击，不做任何 URL 拼接：
    //   - 以 containerId 对应卡片的中心点为锚点，通过 elementFromPoint 找到所属 note-item；
    //   - 在该 note-item 内优先寻找 a.cover.mask / a[href*="/explore/"] / a[href*="/search_result/"]，退化为第一个可见 img。
    try {
      if (!clickedItemRect) {
        console.warn('[OpenDetail] clickedItemRect missing, fallback to first note-item click (less precise)');
      }

      const cx = clickedItemRect ? clickedItemRect.x + clickedItemRect.width / 2 : 0;
      const cy = clickedItemRect ? clickedItemRect.y + clickedItemRect.height / 2 : 0;

      const clickResult = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const hasRect = ${clickedItemRect ? 'true' : 'false'};
          let card = null;

          if (hasRect) {
            const centerX = ${clickedItemRect ? cx.toFixed(2) : '0'};
            const centerY = ${clickedItemRect ? cy.toFixed(2) : '0'};
            const el = document.elementFromPoint(centerX, centerY);
            if (el && typeof el.closest === 'function') {
              card = el.closest('.note-item');
            }
          }

          if (!card) {
            // 兜底：退回到首个 note-item（精度降低，但仍在视口内）
            card = document.querySelector('.feeds-container .note-item');
          }

          if (!card) return { ok: false, reason: 'no card' };

          let anchor = card.querySelector('a.cover.mask');
          if (!anchor) {
            anchor = card.querySelector('a[href*="/explore/"], a[href*="/search_result/"]');
          }
          let target = anchor;
          if (!target) {
            target = card.querySelector('img');
          }
          if (!target || typeof target.click !== 'function') {
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
        const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');

        // 优先尝试 modal_shell，其次回退到根容器 xiaohongshu_detail
        const candidateIds = ['xiaohongshu_detail.modal_shell', 'xiaohongshu_detail'];

        for (const cid of candidateIds) {
          const anchor = await verifyAnchorByContainerId(
            cid,
            profile,
            serviceUrl,
            '3px solid #ff4444',
            2000,
          );
          if (!anchor.found || !anchor.rect) {
            continue;
          }

          detailContainerId = cid;
          detailRect = anchor.rect as Rect;
          console.log(`[OpenDetail] Detail container rect: ${JSON.stringify(detailRect)}`);

          // 验证：详情模态应覆盖视口大部分区域
          verified =
            detailRect.width > 400 &&
            detailRect.height > 400 &&
            detailRect.y < 200;
          break;
        }

        if (!detailContainerId) {
          console.warn('[OpenDetail] Detail anchor verify failed: no modal_shell/detail container visible');
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
