/**
 * openDetailWaiter.ts
 *
 * 详情页就绪检测与"误点/回退"策略
 */

export interface WaitDetailResult {
  ready: boolean;
  safeUrl?: string;
  noteId?: string;
}

export interface OpenDetailWaiterDeps {
  getCurrentUrl: () => Promise<string>;
  controllerAction: (action: string, payload?: any) => Promise<any>;
  profile: string;
  serviceUrl: string;
}

/**
 * 等待详情页就绪
 */
export async function waitForDetail(
  deps: OpenDetailWaiterDeps,
  maxRetries = 10,
): Promise<WaitDetailResult> {
  const { getCurrentUrl, controllerAction, profile } = deps;
  let safeUrl: string | undefined;
  let noteId: string | undefined;

  for (let i = 0; i < maxRetries; i++) {
    const currentUrl = await getCurrentUrl();

    // 个人主页/用户页：判定为误点（常见原因：点到作者头像/昵称）
    if (currentUrl.includes('/user/profile')) {
      return { ready: false };
    }

    // 0. 404 / 当前笔记暂时无法浏览 → 立即判定为失败
    if (currentUrl.includes('/404') && currentUrl.includes('error_code=300031')) {
      console.warn('[OpenDetail] Detected 404 note page, aborting detail wait');
      return { ready: false };
    }

    // 1. 先用 URL 做一次快速检测：
    //    - /explore/{noteId}?...xsec_token=...
    //    - /search_result/{noteId}?...xsec_token=...
    //    两者均视为详情已经就绪
    if (
      currentUrl &&
      (/\/explore\/[0-9a-z]+/i.test(currentUrl) || /\/search_result\/[0-9a-z]+/i.test(currentUrl)) &&
      /[?&]xsec_token=/.test(currentUrl)
    ) {
      safeUrl = currentUrl;
      const m = currentUrl.match(/\/(?:explore|search_result)\/([0-9a-z]+)/i);
      noteId = m ? m[1] : undefined;
      console.log('[OpenDetail] Detail URL ready (route + xsec_token)');
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
        const m = url?.match(/\/(?:explore|search_result)\/([0-9a-z]+)/i);
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

/**
 * 误点后返回搜索列表
 */
export async function backToSearchList(
  deps: OpenDetailWaiterDeps,
  maxWaitMs = 8000,
): Promise<boolean> {
  const { controllerAction, profile, serviceUrl } = deps;
  const { verifyAnchorByContainerId } = await import('./containerAnchors.js');
  const listId = 'xiaohongshu_search.search_result_list';
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    // 尝试系统级返回：优先 ESC，其次浏览器后退
    for (const key of ['Escape', 'Meta+[', 'Alt+ArrowLeft']) {
      try {
        await controllerAction('keyboard:press', { profileId: profile, key });
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 900));
      try {
        const anchor = await verifyAnchorByContainerId(listId, profile, serviceUrl, '2px solid #00bbff', 800);
        if (anchor.found) return true;
      } catch {
        // ignore
      }
    }
  }
  return false;
}
