/**
 * Workflow Block: OpenDetailBlock
 *
 * 打开详情页（通过容器 click 触发模态框）
 */

export interface OpenDetailInput {
  sessionId: string;
  containerId: string; // search_result_item 容器 ID
  domIndex?: number; // DOM 序号（用于精确定位当前卡片）
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
  entryAnchor?: {
    containerId: string;
    clickedItemRect?: Rect;
    verified?: boolean;
  };
  exitAnchor?: {
    containerId: string;
    detailRect?: Rect;
    verified?: boolean;
  };
  steps?: Array<{
    id: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    error?: string;
    anchor?: {
      containerId?: string;
      clickedItemRect?: Rect;
      detailRect?: Rect;
      verified?: boolean;
    };
    meta?: Record<string, any>;
  }>;
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
    domIndex,
    serviceUrl = 'http://127.0.0.1:7701',
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;
  const steps: NonNullable<OpenDetailOutput['steps']> = [];
  let entryAnchor: OpenDetailOutput['entryAnchor'];
  let exitAnchor: OpenDetailOutput['exitAnchor'];
  let clickedItemRect: Rect | undefined;

  function pushStep(step: NonNullable<OpenDetailOutput['steps']>[number]) {
    steps.push(step);
    try {
      console.log(
        '[OpenDetail][step]',
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
      console.log('[OpenDetail][step]', step.id, step.status);
    }
  }

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
      }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined
    });
    const data = await response.json().catch(() => ({}));
    return data?.data?.result || data?.result || '';
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
      tree.children.forEach((c: any) => collectIds(c, result));
    }
    return result;
  }

  async function waitForDetail(
    maxRetries = 10,
  ): Promise<{ ready: boolean; safeUrl?: string; noteId?: string }> {
    let safeUrl: string | undefined;
    let noteId: string | undefined;

    for (let i = 0; i < maxRetries; i++) {
      const currentUrl = await getCurrentUrl();

      // 0. 404 / 当前笔记暂时无法浏览 → 立即判定为失败
      if (currentUrl.includes('/404') && currentUrl.includes('error_code=300031')) {
        console.warn('[OpenDetail] Detected 404 note page, aborting detail wait');
        return { ready: false };
      }

      // 1. 先用 URL 做一次快速检测：/explore/{noteId}?...xsec_token=... 视为详情已经就绪
      if (
        currentUrl &&
        /\/explore\/[0-9a-z]+/i.test(currentUrl) &&
        /[?&]xsec_token=/.test(currentUrl)
      ) {
        safeUrl = currentUrl;
        const m = currentUrl.match(/\/explore\/([0-9a-z]+)/i);
        noteId = m ? m[1] : undefined;
        console.log('[OpenDetail] Detail URL ready (explore + xsec_token)');
        return { ready: true, safeUrl, noteId };
      }

      // 2. 再用 DOM 结构做一次检查（模态或评论区命中任意一个即可）
      try {
        const domResult = await controllerAction('browser:execute', {
          profile,
          script: `(() => {
            const hasModal =
              document.querySelector('.note-detail-mask') ||
              document.querySelector('.note-detail-page') ||
              document.querySelector('.note-detail-dialog') ||
              document.querySelector('.note-detail') ||
              document.querySelector('.detail-container') ||
              document.querySelector('.media-container');
            const hasComments =
              document.querySelector('.comments-el') ||
              document.querySelector('.comment-list') ||
              document.querySelector('.comments-container');
            return { hasModal: !!hasModal, hasComments: !!hasComments };
          })()`,
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

        console.log(
          `[OpenDetail] Detail not ready yet (iter=${i}, url=${currentUrl || 'unknown'})`,
        );
      } catch (e: any) {
        console.warn(
          `[OpenDetail] DOM readiness check failed (retry ${i}): ${e.message}`,
        );
      }

      await new Promise((r) => setTimeout(r, 1000));
    }
    return { ready: false };
  }

  async function dumpViewportDiagnostics() {
    try {
      const result = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
          const innerHeight = window.innerHeight || 0;
          const items = Array.from(document.querySelectorAll('.note-item'));
          const summary = items.map((el, idx) => {
            const rect = el.getBoundingClientRect();
            const titleEl = el.querySelector('.note-title, .title, [data-role="note-title"]');
            const titleText = titleEl ? (titleEl.textContent || '').trim() : '';
            let href = '';
            const link = el.querySelector('a[href*="/explore/"], a[href*="/search_result/"]');
            if (link instanceof HTMLAnchorElement) {
              href = link.href || link.getAttribute('href') || '';
            }
            return {
              index: idx,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
              title: titleText,
              href,
              inViewport: rect.top >= 0 && rect.top < innerHeight,
            };
          });
          return {
            scrollY,
            innerHeight,
            totalItems: items.length,
            visibleItems: summary.filter(i => i.inViewport).length,
            items: summary.slice(0, 40),
          };
        })()`,
      });
      const diag = result.result || result.data?.result || result;
      console.log('[OpenDetail][diagnostic] viewport summary:', JSON.stringify(diag));
    } catch (e: any) {
      console.warn('[OpenDetail][diagnostic] dump viewport failed:', e.message || String(e));
    }
  }

  try {
    const { highlightContainer, getContainerRect } = await import('./helpers/anchorVerify.js');

    const startUrl = await getCurrentUrl();
    console.log(`[OpenDetail] Start URL: ${startUrl}`);

    // 0. 点击前：对选中的卡片容器（search_result_item / feed_item）做锚点高亮 + Rect 回环
    // 如果传入了 domIndex，使用专用高亮逻辑
    if (typeof domIndex === 'number') {
      try {
        await controllerAction('browser:execute', {
          profile,
          script: `(() => {
            const items = document.querySelectorAll('.note-item');
            const el = items[${domIndex}];
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.style.outline = '3px solid #ff9900';
              setTimeout(() => el.style.outline = '', 2000);
            }
          })()`
        });
        
        // 等待滚动和高亮
        await new Promise(r => setTimeout(r, 1000));
        
        // 获取 Rect
        const rectResult = await controllerAction('browser:execute', {
          profile,
          script: `(() => {
            const items = document.querySelectorAll('.note-item');
            const el = items[${domIndex}];
            return el ? el.getBoundingClientRect() : null;
          })()`
        });
        
        clickedItemRect = rectResult.result || rectResult.data?.result || undefined;
      } catch (e: any) {
        console.warn(`[OpenDetail] Pre-click highlight by domIndex failed: ${e.message}`);
      }
    } else {
      // 旧逻辑：基于容器 ID
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
    }

    // 0.1 入口锚点：只要能拿到合法 Rect，就认为进入阶段；否则直接失败
    if (clickedItemRect && clickedItemRect.width > 0 && clickedItemRect.height > 0) {
      entryAnchor = {
        containerId,
        clickedItemRect,
        verified: true,
      };
      console.log('[OpenDetail][entryAnchor]', JSON.stringify(entryAnchor, null, 2));
      pushStep({
        id: 'verify_result_item_anchor',
        status: 'success',
        anchor: {
          containerId,
          clickedItemRect,
          verified: true,
        },
      });
    } else {
      entryAnchor = {
        containerId,
        clickedItemRect,
        verified: false,
      };
      console.warn('[OpenDetail] clickedItemRect missing or invalid, aborting detail open');
      pushStep({
        id: 'verify_result_item_anchor',
        status: 'failed',
        anchor: {
          containerId,
          clickedItemRect,
          verified: false,
        },
        error: 'invalid_or_missing_clickedItemRect',
      });
      return {
        success: false,
        detailReady: false,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: {
          clickedItemContainerId: containerId,
          clickedItemRect,
          detailContainerId: undefined,
          detailRect: undefined,
          verified: false,
        },
        error: 'Result item anchor not ready',
      };
    }

    // 1. 打开详情
    //   仅使用容器运行时 + 系统点击（Playwright mouse）基于 bbox 点击结果卡片中心；
    //   不再使用任何 DOM click 兜底逻辑，失败时通过日志 + 诊断信息排查。
    try {
      // 1.1 尝试通过容器 operation + bbox 使用系统点击
      const bbox = {
        x1: clickedItemRect.x,
        y1: clickedItemRect.y,
        x2: clickedItemRect.x + clickedItemRect.width,
        y2: clickedItemRect.y + clickedItemRect.height,
      };

      const opResp = await controllerAction('container:operation', {
        containerId,
        operationId: 'click',
        config: {
          bbox,
        },
        sessionId: profile,
      });

      if (opResp?.success) {
        console.log('[OpenDetail] System click on result item executed via container:operation');
        pushStep({
          id: 'system_click_detail_item',
          status: 'success',
          anchor: {
            containerId,
            clickedItemRect,
            verified: true,
          },
          meta: { via: 'container:operation:bbox' },
        });
      } else {
        console.warn('[OpenDetail] container:operation click returned non-success');
        pushStep({
          id: 'system_click_detail_item',
          status: 'failed',
          anchor: {
            containerId,
            clickedItemRect,
            verified: true,
          },
          error: opResp?.error || 'container_operation_failed',
        });
        console.warn(
          '[OpenDetail] System click failed via container:operation (no DOM fallback):',
          opResp?.error || 'container_operation_failed',
        );
      }
    } catch (e: any) {
      console.warn(
        '[OpenDetail] container:operation system click threw error (no DOM fallback):',
        e.message || e,
      );
    }

	    // 点击后稍等一会儿让前端完成路由/模态切换
	    await new Promise((r) => setTimeout(r, 3000));
	
	    let midUrl = await getCurrentUrl();
	    console.log(`[OpenDetail] Post-click URL: ${midUrl}`);
	
	    // 2. 等待详情模态出现（或完整详情页），并尝试读取带 xsec_token 的安全 URL
    let detailState = await waitForDetail();
    let detailReady = detailState.ready;

    if (!detailReady) {
      console.warn(
        '[OpenDetail] detail not ready after system click, dumping viewport diagnostics for analysis',
      );
      await dumpViewportDiagnostics();
    }

    pushStep({
	      id: 'wait_detail_dom_ready',
	      status: detailReady ? 'success' : 'failed',
	      anchor: {
	        containerId,
	        clickedItemRect,
	        verified: detailReady,
	      },
	      meta: {
	        safeDetailUrl: detailState.safeUrl || null,
	        noteId: detailState.noteId || null,
	        url: midUrl,
	      },
	      error: detailReady ? undefined : 'detail_not_ready',
	    });

    // 3. 详情出现后，对 modal_shell 做锚点高亮 + Rect 回环
    let detailContainerId: string | undefined;
    let detailRect: Rect | undefined;
    let verified = false;

    if (detailReady) {
      try {
        const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');

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

    if (detailContainerId && detailRect) {
      exitAnchor = {
        containerId: detailContainerId,
        detailRect,
        verified,
      };
      console.log('[OpenDetail][exitAnchor]', JSON.stringify(exitAnchor, null, 2));
      pushStep({
        id: 'verify_detail_anchor',
        status: verified ? 'success' : 'success',
        anchor: {
          containerId: detailContainerId,
          detailRect,
          verified,
        },
        meta: {
          safeDetailUrl: detailState.safeUrl || null,
          noteId: detailState.noteId || null,
        },
      });
    } else {
      pushStep({
        id: 'verify_detail_anchor',
        status: 'failed',
        anchor: detailContainerId
          ? {
              containerId: detailContainerId,
              detailRect,
              verified: false,
            }
          : undefined,
        error: 'detail_anchor_not_found',
      });
    }

    return {
      success: true,
      detailReady,
      entryAnchor,
      exitAnchor,
      steps,
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
