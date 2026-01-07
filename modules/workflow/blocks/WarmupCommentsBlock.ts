/**
 * Workflow Block: WarmupCommentsBlock
 *
 * 第一阶段：只负责把评论区滚到底并自动展开「展开 N 条回复」，不做内容提取。
 * 目标是让 DOM 中尽可能多地渲染出 .comment-item，再交给后续 ExpandCommentsBlock 做纯提取。
 */

export interface WarmupCommentsInput {
  sessionId: string;
  maxRounds?: number;
  serviceUrl?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WarmupCommentsOutput {
  success: boolean;
  reachedEnd: boolean;
  totalFromHeader: number | null;
  finalCount: number;
  anchor?: {
    commentSectionContainerId: string;
    commentSectionRect?: Rect;
  };
  error?: string;
}

export async function execute(input: WarmupCommentsInput): Promise<WarmupCommentsOutput> {
  const {
    sessionId,
    maxRounds = 8,
    serviceUrl = 'http://127.0.0.1:7701',
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;
  let focusPoint: { x: number; y: number } | null = null;

  async function controllerAction(action: string, payload: any = {}) {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    return data.data || data;
  }

  async function nativeClick(x: number, y: number) {
    try {
      await controllerAction('user_action', {
        profile,
        operation_type: 'move',
        target: { coordinates: { x, y } },
      });
      await new Promise((r) => setTimeout(r, 100));
      await controllerAction('user_action', {
        profile,
        operation_type: 'down',
        target: { coordinates: { x, y } },
      });
      await new Promise((r) => setTimeout(r, 50));
      await controllerAction('user_action', {
        profile,
        operation_type: 'up',
        target: { coordinates: { x, y } },
      });
    } catch {
      // 原生点击失败不阻塞整体流程
    }
  }

  async function pressKey(key: string) {
    try {
      await controllerAction('user_action', {
        profile,
        operation_type: 'key',
        target: { key },
      });
    } catch {
      // 键盘事件失败可以忽略，作为滚动的增强手段
    }
  }

  async function focusCommentsArea() {
    try {
      const focusResult = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          // 1. 找到评论区根元素（不做任何 JS 滚动）
          const root =
            document.querySelector('.comments-el') ||
            document.querySelector('.comment-list') ||
            document.querySelector('.comments-container') ||
            document.querySelector('[class*="comment-section"]');
          if (!root) return null;

          // 清理旧高亮
          document.querySelectorAll('[data-webauto-highlight]').forEach(el => {
            (el as HTMLElement).style.outline = '';
            el.removeAttribute('data-webauto-highlight');
          });

          // 2. 直接以评论区根容器作为焦点元素，确保滚轮作用在模态内滚动容器
          const rect = (root as HTMLElement).getBoundingClientRect();

          // 取根容器与视口交集区域的中点，保证坐标在可见区域内
          const vx1 = 0;
          const vy1 = 0;
          const vx2 = window.innerWidth;
          const vy2 = window.innerHeight;

          const xCenter = rect.left + rect.width / 2;
          const x = Math.min(Math.max(xCenter, vx1 + 10), vx2 - 10);

          const topVisible = Math.max(rect.top, vy1 + 10);
          const bottomVisible = Math.min(rect.bottom, vy2 - 10);
          if (bottomVisible <= topVisible) return null;
          const y = (topVisible + bottomVisible) / 2;

          (root as HTMLElement).style.outline = '4px solid magenta';
          (root as HTMLElement).setAttribute('data-webauto-highlight', 'true');

          return {
            x,
            y
          };
        })()`,
      });

      const posPayload =
        (focusResult as any).result || (focusResult as any).data?.result || focusResult;
      if (!posPayload || typeof posPayload.x !== 'number' || typeof posPayload.y !== 'number') {
        return;
      }

      const coordinates = { x: posPayload.x, y: posPayload.y };

      focusPoint = coordinates;
      await nativeClick(coordinates.x, coordinates.y);
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // 聚焦失败不致命，后续 PageDown 仍然可以作为兜底
    }
  }

  async function getCommentStats() {
    const result = await controllerAction('browser:execute', {
      profile,
      script: `(() => {
        const root =
          document.querySelector('.comments-el') ||
          document.querySelector('.comment-list') ||
          document.querySelector('.comments-container') ||
          document.querySelector('[class*=\"comment-section\"]');
        if (!root) return { hasRoot: false, count: 0, hasMore: false, total: null };

        const items = Array.from(root.querySelectorAll('.comment-item'));
        const totalTextNode = Array.from(document.querySelectorAll('.total, .comments-container, .note-detail-mask'))
          .map(el => (el.textContent || '').trim())
          .find(t => /共\\s*\\d+\\s*条评论/.test(t));
        let total = null;
        if (totalTextNode) {
          const m = totalTextNode.match(/共\\s*(\\d+)\\s*条评论/);
          if (m) total = Number(m[1]) || null;
        }

        const hasMoreBtn = !!root.querySelector('.show-more, .reply-expand, [class*=\"expand\"]');

        return {
          hasRoot: true,
          count: items.length,
          hasMore: hasMoreBtn,
          total
        };
      })()`,
    });

    const payload = result.result || result.data?.result || result;
    return {
      count: Number(payload?.count || 0),
      hasMore: Boolean(payload?.hasMore),
      total: typeof payload?.total === 'number' ? (payload.total as number) : null,
    };
  }

  try {
    const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');

    const commentSectionId = 'xiaohongshu_detail.comment_section';
    let commentSectionRect: Rect | undefined;

    // 1. 锚定评论区根容器（只做一次高亮 + Rect 回环）
    try {
      const anchor = await verifyAnchorByContainerId(
        commentSectionId,
        profile,
        serviceUrl,
        '2px solid #ffaa00',
        2000,
      );
      if (anchor.found && anchor.rect) {
        commentSectionRect = anchor.rect;
        console.log(`[WarmupComments] comment_section rect: ${JSON.stringify(anchor.rect)}`);
      } else {
        console.warn(
          `[WarmupComments] comment_section anchor verify failed: ${anchor.error || 'not found'}`,
        );
      }
    } catch (e: any) {
      console.warn(`[WarmupComments] comment_section anchor verify error: ${e.message}`);
    }

    // 1.2 使用原生点击的方式聚焦模态框/评论区，确保 PageDown 作用在正确区域
    await focusCommentsArea();

    // 1.3 触发一次 containers:match，确保 RuntimeController + AutoClickHandler 就绪
    try {
      await controllerAction('containers:match', {
        profile,
      });
    } catch (e: any) {
      console.warn(`[WarmupComments] containers:match failed (auto_click may be degraded): ${e.message}`);
    }

    // 2. 滚动 + 自动展开（不做提取），直到「没有更多可展开」或达到总数
    let lastCount = 0;
    let targetTotal: number | null = null;

    const initialStats = await getCommentStats();
    lastCount = initialStats.count;
    targetTotal = initialStats.total;

    for (let i = 0; i < maxRounds; i++) {
      // 2.1 每轮开始时,找到真正的滚动容器(.note-scroller)并使用其坐标作为滚动焦点
      // 这是关键:滚动容器是 .note-scroller,而不是 .comments-el
      const refreshFocusResult = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          // 先找评论区根元素
          const root =
            document.querySelector('.comments-el') ||
            document.querySelector('.comment-list') ||
            document.querySelector('.comments-container') ||
            document.querySelector('[class*="comment-section"]');
          if (!root) return null;

          // 找到真正的滚动容器
          let scrollContainer = null;
          let current = root.parentElement;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            if (style.overflowY === 'scroll' || style.overflowY === 'auto') {
              scrollContainer = current;
              break;
            }
            current = current.parentElement;
          }

          if (!scrollContainer) return null;

          // 使用滚动容器的中心点作为目标
          const rect = scrollContainer.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            scrollTop: scrollContainer.scrollTop,
            scrollHeight: scrollContainer.scrollHeight,
            clientHeight: scrollContainer.clientHeight
          };
        })()`,
      }).catch(() => null);

      const refreshedFocus =
        (refreshFocusResult as any)?.result || (refreshFocusResult as any)?.data?.result || refreshFocusResult;
      if (refreshedFocus && typeof refreshedFocus.x === 'number' && typeof refreshedFocus.y === 'number') {
        focusPoint = { x: refreshedFocus.x, y: refreshedFocus.y };
        console.log(`[WarmupComments] round=${i} refreshed focus: (${focusPoint.x}, ${focusPoint.y}), scrollTop=${refreshedFocus.scrollTop}/${refreshedFocus.scrollHeight}`);
      }

      // 2.2 查找并点击展开按钮
      // 注: container:operation的auto_click机制当前未工作,因此使用手动点击逻辑

      // 使用CSS类名选择器 .show-more 直接定位展开按钮
      const clickResult = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const root =
            document.querySelector('.comments-el') ||
            document.querySelector('.comment-list') ||
            document.querySelector('.comments-container') ||
            document.querySelector('[class*="comment-section"]');
          if (!root) return { clicked: [], total: 0 };

          // 找到滚动容器
          let scrollContainer: HTMLElement | null = null;
          let current: HTMLElement | null = root.parentElement as HTMLElement | null;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            if (style.overflowY === 'scroll' || style.overflowY === 'auto') {
              scrollContainer = current;
              break;
            }
            current = current.parentElement as HTMLElement | null;
          }

          // 使用CSS选择器直接查找展开按钮: .show-more
          const expandElements = Array.from(root.querySelectorAll('.show-more'));
          const expandButtons: any[] = [];
          
          for (const el of expandElements) {
            if (!(el instanceof HTMLElement)) continue;
            if (el.offsetParent === null) continue; // 必须可见
            if (el.dataset && el.dataset.webautoExpandClicked === '1') continue;

            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;

            const text = (el.textContent || '').trim();
            const baseRect = scrollContainer ? scrollContainer.getBoundingClientRect() : { y: 0 };

            expandButtons.push({
              element: el,
              text: text.substring(0, 30),
              rect,
              relativeY: rect.y - (baseRect as any).y,
            });
          }

          // 按相对位置排序,从上到下处理
          expandButtons.sort((a, b) => a.relativeY - b.relativeY);

          // 最多处理3个按钮
          const maxButtons = 3;
          const toClick = expandButtons.slice(0, maxButtons);

          const clickedLogs: any[] = [];

          for (const btn of toClick) {
            const el = btn.element as HTMLElement;

            // 先保证按钮在 viewport 内
            if (scrollContainer) {
              const targetTop = Math.max(0, scrollContainer.scrollTop + btn.rect.y - scrollContainer.getBoundingClientRect().y - 200);
              scrollContainer.scrollTo({ top: targetTop, behavior: 'auto' });
            } else if (el.scrollIntoView) {
              el.scrollIntoView({ behavior: 'auto', block: 'center' });
            }

            // 更新一次 rect，确保坐标在 viewport 里
            const rect = el.getBoundingClientRect();

            el.dataset.webautoExpandClicked = '1';
            el.style.outline = '3px solid orange';

            const events = ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'];
            for (const type of events) {
              const ev = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
              });
              el.dispatchEvent(ev);
            }

            clickedLogs.push({
              text: btn.text,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
            });
          }

          return {
            clicked: clickedLogs,
            total: expandButtons.length,
          };
        })()`,
      }).catch(() => ({ result: { clicked: [], total: 0 } }));

      const clickPayload = (clickResult as any).result || (clickResult as any).data?.result || clickResult;
      const clickedButtons = Array.isArray(clickPayload?.clicked) ? clickPayload.clicked : [];

      console.log(
        `[WarmupComments] round=${i} expand buttons: clicked=${clickedButtons.length}, total=${clickPayload?.total ?? 0}`,
      );

      // 2.3 使用JS直接操作scrollTop进行滚动,模拟真实用户滚动行为
      await new Promise((r) => setTimeout(r, 400));

      // 关键改进:不使用mouse.wheel,而是直接操作scrollContainer.scrollTop
      // 这样更可靠,能确保滚动生效并触发懒加载
      const scrollResult = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const root =
            document.querySelector('.comments-el') ||
            document.querySelector('.comment-list') ||
            document.querySelector('.comments-container') ||
            document.querySelector('[class*="comment-section"]');
          if (!root) return { scrolled: false, error: 'no root' };

          let scrollContainer = null;
          let current = root.parentElement;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            if (style.overflowY === 'scroll' || style.overflowY === 'auto') {
              scrollContainer = current;
              break;
            }
            current = current.parentElement;
          }

          if (!scrollContainer) return { scrolled: false, error: 'no scroll container' };

          const before = scrollContainer.scrollTop;
          const target = before + 600;
          
          // 使用平滑滚动模拟真实用户行为
          scrollContainer.scrollTo({
            top: target,
            behavior: 'smooth'
          });

          // 等待一小会儿让smooth scroll开始
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                scrolled: true,
                before,
                after: scrollContainer.scrollTop,
                target,
                scrollHeight: scrollContainer.scrollHeight
              });
            }, 300);
          });
        })()`,
      }).catch(() => ({ result: { scrolled: false } }));

      const scrollData = (scrollResult as any)?.result || (scrollResult as any)?.data?.result || scrollResult;
      console.log(`[WarmupComments] round=${i} scrolled: ${JSON.stringify(scrollData)}`);

      await new Promise((r) => setTimeout(r, 1200)); // 增加等待时间,确保平滑滚动完成+懒加载触发

      const stats = await getCommentStats();
      const currentCount = stats.count;

      const reachedTarget = targetTotal !== null && currentCount >= targetTotal;
      const noMore = !stats.hasMore && currentCount <= lastCount;

      console.log(
        `[WarmupComments] round=${i} count=${currentCount}, total=${targetTotal}, hasMore=${stats.hasMore}`,
      );

      if (reachedTarget || noMore) {
        console.log('[WarmupComments] stop conditions met');
        lastCount = currentCount;
        break;
      }

      lastCount = currentCount;
    }

    const finalStats = await getCommentStats();

    return {
      success: true,
      reachedEnd: finalStats.total !== null && finalStats.count >= finalStats.total,
      totalFromHeader: finalStats.total,
      finalCount: finalStats.count,
      anchor: {
        commentSectionContainerId: commentSectionId,
        commentSectionRect,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      reachedEnd: false,
      totalFromHeader: null,
      finalCount: 0,
      error: `WarmupComments failed: ${error.message}`,
    };
  }
}
