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
  allowClickCommentButton?: boolean;
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
    maxRounds,
    serviceUrl = 'http://127.0.0.1:7701',
    allowClickCommentButton,
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;
  let focusPoint: { x: number; y: number } | null = null;
  const canClickCommentButton = allowClickCommentButton !== false;
  const browserServiceUrl =
    process.env.WEBAUTO_BROWSER_SERVICE_URL || 'http://127.0.0.1:7704';
  const browserWsUrl = process.env.WEBAUTO_BROWSER_WS_URL || 'ws://127.0.0.1:8765';

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

  async function browserServiceCommand(action: string, args: any = {}, timeoutMs = 15000) {
    const response = await fetch(`${browserServiceUrl}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(timeoutMs) : undefined,
    });
    if (!response.ok) {
      throw new Error(`browser-service HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json().catch(() => ({} as any));
    if (data?.ok === false || data?.success === false) {
      throw new Error(data?.error || 'browser-service command failed');
    }
    return data?.body || data?.data || data;
  }

  async function browserServiceWsScroll(deltaY: number, coordinates?: { x: number; y: number } | null) {
    const { default: WebSocket } = await import('ws');
    const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        reject(new Error('browser-service ws timeout'));
      }, 15000);

      const ws = new WebSocket(browserWsUrl);

      const cleanup = () => {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {}
      };

      ws.on('open', () => {
        try {
          ws.send(
            JSON.stringify({
              type: 'command',
              request_id: requestId,
              session_id: profile,
              data: {
                command_type: 'user_action',
                action: 'operation',
                parameters: {
                  operation_type: 'scroll',
                  ...(coordinates ? { target: { coordinates } } : {}),
                  deltaY,
                },
              },
            }),
          );
        } catch (err) {
          cleanup();
          reject(err);
        }
      });

      ws.on('message', (buf: any) => {
        try {
          const msg = JSON.parse(String(buf || ''));
          if (msg?.type !== 'response') return;
          if (String(msg?.request_id || '') !== requestId) return;
          const payload = msg?.data || {};
          if (payload?.success === false) {
            cleanup();
            reject(new Error(payload?.error || 'browser-service ws scroll failed'));
            return;
          }
          cleanup();
          resolve();
        } catch (err) {
          cleanup();
          reject(err);
        }
      });

      ws.on('error', (err: any) => {
        cleanup();
        reject(err);
      });
    });
  }

  async function systemMouseWheel(deltaY: number) {
    const coords = focusPoint ? { x: focusPoint.x, y: focusPoint.y } : null;
    try {
      if (coords) {
        await browserServiceCommand('mouse:move', { profileId: profile, x: coords.x, y: coords.y, steps: 3 }, 8000);
      }
      await browserServiceCommand('mouse:wheel', { profileId: profile, deltaX: 0, deltaY }, 8000);
      return;
    } catch (err: any) {
      console.warn('[WarmupComments] browser-service mouse:wheel failed, fallback to ws:', err?.message || err);
    }

    await browserServiceWsScroll(deltaY, coords);
  }

  async function systemHoverAt(x: number, y: number) {
    try {
      await browserServiceCommand('mouse:move', { profileId: profile, x, y, steps: 3 }, 8000);
    } catch {
      // ignore
    }
  }

  async function systemClickAt(x: number, y: number) {
    await browserServiceCommand('mouse:move', { profileId: profile, x, y, steps: 3 }, 8000);
    await new Promise((r) => setTimeout(r, 80));
    await browserServiceCommand(
      'mouse:click',
      { profileId: profile, x, y, clicks: 1, delay: 40 + Math.floor(Math.random() * 60) },
      8000,
    );
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

  async function focusCommentsArea(): Promise<boolean> {
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
          document.querySelectorAll('[data-webauto-highlight]').forEach((el) => {
            if (el instanceof HTMLElement) {
              el.style.outline = '';
            }
            el.removeAttribute('data-webauto-highlight');
          });

          // 2. 直接以评论区根容器作为焦点元素，确保滚轮作用在模态内滚动容器
          const rect = root.getBoundingClientRect();

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

          if (root instanceof HTMLElement) {
            root.style.outline = '4px solid magenta';
            root.setAttribute('data-webauto-highlight', 'true');
          }

          return { x, y };
        })()`,
      });

      const posPayload =
        (focusResult as any).result || (focusResult as any).data?.result || focusResult;
      if (!posPayload || typeof posPayload.x !== 'number' || typeof posPayload.y !== 'number') {
        return false;
      }

      const coordinates = { x: posPayload.x, y: posPayload.y };

      focusPoint = coordinates;
      // 重要：评论按钮点击后焦点会落在输入框；这里强制把鼠标 hover/click 到评论列表中
      // 以确保后续滚轮事件作用在评论区，而不是输入框。
      await systemClickAt(Math.floor(coordinates.x), Math.floor(coordinates.y));
      await new Promise((r) => setTimeout(r, 500));
      return true;
    } catch {
      // 聚焦失败不致命，后续 PageDown 仍然可以作为兜底
      return false;
    }
  }

  function clamp(n: number, min: number, max: number) {
    return Math.min(Math.max(n, min), max);
  }

  async function getViewport() {
    try {
      const result = await controllerAction('browser:execute', {
        profile,
        script: `(() => ({ w: window.innerWidth || 0, h: window.innerHeight || 0 }))()`,
      });
      const payload = (result as any).result || (result as any).data?.result || result;
      const w = Number(payload?.w || 0) || 0;
      const h = Number(payload?.h || 0) || 0;
      return { w, h };
    } catch {
      return { w: 0, h: 0 };
    }
  }

  function computeVisibleFocusPoint(rect: Rect, viewport: { w: number; h: number }) {
    const w = Number(viewport?.w || 0) || 0;
    const h = Number(viewport?.h || 0) || 0;
    const xCenter = rect.x + rect.width / 2;
    const x = w ? clamp(xCenter, 20, w - 20) : xCenter;

    const rectTop = rect.y;
    const rectBottom = rect.y + rect.height;
    const safeTop = 160;
    const safeBottom = 120;
    const topVisible = Math.max(rectTop, safeTop);
    const bottomVisible = h ? Math.min(rectBottom, h - safeBottom) : rectBottom;
    if (bottomVisible <= topVisible) return null;
    const y = (topVisible + bottomVisible) / 2;
    return { x, y };
  }

  async function isInputFocused() {
    try {
      const result = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const el = document.activeElement;
          const tag = el && el.tagName ? el.tagName.toLowerCase() : '';
          const type = (el && (el as any).type) ? String((el as any).type) : '';
          const isInput = tag === 'input' || tag === 'textarea' || (el && (el as any).isContentEditable);
          return { tag, type, isInput };
        })()`,
      });
      const payload = (result as any).result || (result as any).data?.result || result;
      return Boolean(payload?.isInput);
    } catch {
      return false;
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
        if (!root) {
          const chatCountEl =
            document.querySelector('.chat-wrapper .count') ||
            document.querySelector('[class*=\"chat-wrapper\"] .count') ||
            document.querySelector('.chat-wrapper [class*=\"count\"]');
          const parseCount = (raw) => {
            const t = (raw || '').toString().trim();
            if (!t) return null;
            const mWan = t.match(/^([0-9]+(?:\\.[0-9]+)?)\\s*万/);
            if (mWan) {
              const v = Number.parseFloat(mWan[1]);
              if (!Number.isFinite(v)) return null;
              return Math.round(v * 10000);
            }
            const digits = t.replace(/[^0-9]/g, '');
            if (!digits.length) return null;
            return Number(digits);
          };
          const parsed = parseCount(chatCountEl?.textContent || '');
          return { hasRoot: false, count: 0, hasMore: false, total: parsed };
        }

        const items = Array.from(root.querySelectorAll('.comment-item, [class*="comment-item"]'));

        // 1) 优先在评论区附近找“共 N 条评论 / 全部 N 条评论”文本
        const candidates = [];
        const pushText = (el) => {
          if (!el) return;
          const t = (el.textContent || '').trim();
          if (!t) return;
          candidates.push(t);
        };

        const headerContainers = Array.from(document.querySelectorAll('.comments-el, .note-detail-mask, .note-detail'));
        for (const container of headerContainers) {
          if (!container) continue;
          const els = container.querySelectorAll('*');
          els.forEach(pushText);
        }

        // 2) 兜底：全局扫描包含“评论”和数字的短文本
        if (!candidates.length) {
          document.querySelectorAll('body *').forEach(el => {
            const t = (el.textContent || '').trim();
            if (!t) return;
            if (t.length > 80) return; // 避免整段长文
            if (/评论/.test(t) && /\\d+/.test(t)) {
              candidates.push(t);
            }
          });
        }

        let total = null;
        const pattern = /(?:共|全部)\\s*(\\d+)\\s*条评论/;
        for (const text of candidates) {
          const m = text.match(pattern);
          if (m) {
            total = Number(m[1]) || null;
            break;
          }
        }

        // 3) 兜底：评论按钮（chat-wrapper）上的计数，例如「5」「1.2万」
        if (total === null) {
          const chatCountEl =
            document.querySelector('.chat-wrapper .count') ||
            document.querySelector('[class*=\"chat-wrapper\"] .count') ||
            document.querySelector('.chat-wrapper [class*=\"count\"]');
          const parseCount = (raw) => {
            const t = (raw || '').toString().trim();
            if (!t) return null;
            const mWan = t.match(/^([0-9]+(?:\\.[0-9]+)?)\\s*万/);
            if (mWan) {
              const v = Number.parseFloat(mWan[1]);
              if (!Number.isFinite(v)) return null;
              return Math.round(v * 10000);
            }
            const digits = t.replace(/[^0-9]/g, '');
            if (!digits.length) return null;
            return Number(digits);
          };
          const parsed = parseCount(chatCountEl?.textContent || '');
          if (typeof parsed === 'number' && Number.isFinite(parsed)) {
            total = parsed;
          }
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

  /**
   * 获取当前视口内第一条可见评论，用于校验滚动是否真正改变了评论区内容。
   * 返回 key/top/bottom 等信息，仅用于日志与调试，不参与业务判断。
   */
  async function getViewportFirstComment() {
    try {
      const result = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const root =
            document.querySelector('.comments-el') ||
            document.querySelector('.comment-list') ||
            document.querySelector('.comments-container') ||
            document.querySelector('[class*="comment-section"]');
          if (!root) return null;

          const viewTop = 0;
          const viewBottom = window.innerHeight || document.documentElement.clientHeight || 0;
          const items = Array.from(root.querySelectorAll('.comment-item, [class*="comment-item"]'));

          let picked = null;
          let pickedRect = null;

          for (const el of items) {
            if (!(el instanceof HTMLElement)) continue;
            const rect = el.getBoundingClientRect();
            const top = rect.top;
            const bottom = rect.bottom;
            const visibleTop = Math.max(top, viewTop);
            const visibleBottom = Math.min(bottom, viewBottom);
            if (visibleBottom <= visibleTop) continue;
            picked = el;
            pickedRect = rect;
            break;
          }

          if (!picked || !pickedRect) return null;

          const userEl =
            picked.querySelector('[class*="name"],[class*="username"],.user-name') ||
            picked.querySelector('[class*="author"]');
          const contentEl =
            picked.querySelector('[class*="content"],[class*=\"text\"],.comment-content') ||
            picked;

          const id =
            picked.getAttribute('data-id') ||
            picked.getAttribute('data-comment-id') ||
            picked.getAttribute('id') ||
            '';
          const userText = (userEl?.textContent || '').trim();
          const contentText = (contentEl?.textContent || '').trim();

          const keyBase =
            id ||
            (userText ? userText.slice(0, 16) : '') + '|' + contentText.slice(0, 32);
          const key = keyBase || contentText.slice(0, 24) || 'unknown';

          return {
            key,
            top: pickedRect.top,
            bottom: pickedRect.bottom,
            user: userText.slice(0, 24),
            textSample: contentText.slice(0, 50)
          };
        })()`,
      });

      const payload =
        (result as any).result || (result as any).data?.result || result;
      if (!payload || typeof payload !== 'object') return null;
      if (typeof (payload as any).key !== 'string') return null;
      return {
        key: String((payload as any).key),
        top: Number((payload as any).top ?? 0),
        bottom: Number((payload as any).bottom ?? 0),
        user:
          typeof (payload as any).user === 'string'
            ? ((payload as any).user as string)
            : '',
        textSample:
          typeof (payload as any).textSample === 'string'
            ? ((payload as any).textSample as string)
            : '',
      };
    } catch {
      return null;
    }
  }

  try {
    const { verifyAnchorByContainerId, getPrimarySelectorByContainerId } = await import('./helpers/containerAnchors.js');

    const commentSectionId = 'xiaohongshu_detail.comment_section';
    const commentButtonId = 'xiaohongshu_detail.comment_button';
    const showMoreContainerId = 'xiaohongshu_detail.comment_section.show_more_button';
    let commentSectionRect: Rect | undefined;
    let showMoreSelector: string | null = null;
    const viewport = await getViewport();
    let clickedCommentButton = false;

    async function tryClickCommentButton(reason: string) {
      if (!canClickCommentButton) {
        console.log(`[WarmupComments] skip comment_button click (disabled) reason=${reason}`);
        return;
      }
      if (clickedCommentButton) return;
      try {
        const btnAnchor = await verifyAnchorByContainerId(
          commentButtonId,
          profile,
          serviceUrl,
          '2px solid #ff00ff',
          1200,
        );
        if (btnAnchor.found && btnAnchor.rect && viewport.w && viewport.h) {
          const bx = clamp(btnAnchor.rect.x + btnAnchor.rect.width / 2, 30, viewport.w - 30);
          const by = clamp(btnAnchor.rect.y + btnAnchor.rect.height / 2, 120, viewport.h - 120);
          console.log(`[WarmupComments] click comment_button (${reason}) @(${Math.floor(bx)},${Math.floor(by)})`);
          await systemClickAt(Math.floor(bx), Math.floor(by));
          clickedCommentButton = true;
          await new Promise((r) => setTimeout(r, 800));
        }
      } catch {
        // ignore
      }
    }

    // 0. 预先读取展开按钮容器的 primary selector（用于容器运行时 click 操作）
    try {
      showMoreSelector = await getPrimarySelectorByContainerId(showMoreContainerId);
      if (!showMoreSelector) {
        console.warn('[WarmupComments] primary selector not found for show_more_button');
      } else {
        console.log(`[WarmupComments] show_more_button selector: ${showMoreSelector}`);
      }
    } catch (e: any) {
      console.warn(`[WarmupComments] getPrimarySelectorByContainerId error: ${e?.message || e}`);
    }

    // 1. 锚定评论区根容器（只做一次高亮 + Rect 回环）
    try {
      let anchor = await verifyAnchorByContainerId(
        commentSectionId,
        profile,
        serviceUrl,
        '2px solid #ffaa00',
        2000,
      );
      // 有的帖子点击评论按钮后才渲染/挂载评论区 DOM：允许在 anchor 缺失时再尝试一次
      if (!anchor?.found) {
        await tryClickCommentButton('comment_section_not_found');
        anchor = await verifyAnchorByContainerId(
          commentSectionId,
          profile,
          serviceUrl,
          '2px solid #ffaa00',
          2000,
        );
      }
      if (anchor.found && anchor.rect) {
        commentSectionRect = anchor.rect;
        console.log(`[WarmupComments] comment_section rect: ${JSON.stringify(anchor.rect)}`);

        // 重要：正文很长时，评论区可能不在视口内/未激活，需要先点“评论按钮”再重算焦点
        const maybeFocus = computeVisibleFocusPoint(commentSectionRect, viewport);
        const likelyNotVisible =
          !maybeFocus ||
          (viewport.h > 0 &&
            (commentSectionRect.y > viewport.h - 80 || commentSectionRect.y + commentSectionRect.height < 80));

        if (likelyNotVisible) {
          console.log(
            '[WarmupComments] comment_section 可能不在可视区域，先尝试聚焦评论列表（不点评论按钮）...',
          );
          const focused = await focusCommentsArea();
          if (!focused) {
            console.log('[WarmupComments] 聚焦评论列表失败，才尝试点击评论按钮激活评论区...');
            // 仅在“评论区不在视口/不可见”且“允许点击评论按钮”时，才点击评论按钮做激活
            await tryClickCommentButton('comment_section_not_visible');
            const anchor2 = await verifyAnchorByContainerId(
              commentSectionId,
              profile,
              serviceUrl,
              '2px solid #ffaa00',
              2000,
            );
            if (anchor2.found && anchor2.rect) {
              commentSectionRect = anchor2.rect;
              console.log(`[WarmupComments] comment_section rect(after click): ${JSON.stringify(anchor2.rect)}`);
            }
          } else {
            const anchor2 = await verifyAnchorByContainerId(
              commentSectionId,
              profile,
              serviceUrl,
              '2px solid #ffaa00',
              2000,
            );
            if (anchor2.found && anchor2.rect) {
              commentSectionRect = anchor2.rect;
              console.log(`[WarmupComments] comment_section rect(after focus): ${JSON.stringify(anchor2.rect)}`);
            }
          }
        }

        const focus = commentSectionRect ? computeVisibleFocusPoint(commentSectionRect, viewport) : null;
        if (focus) {
          focusPoint = { x: focus.x, y: focus.y };
        }

        // 评论按钮点击后通常会把焦点放到输入框：仅 hover 到评论区即可让滚轮生效，避免误触输入框
        if (focusPoint) {
          await systemHoverAt(Math.floor(focusPoint.x), Math.floor(focusPoint.y));
          await new Promise((r) => setTimeout(r, 200));
        }

        // 若评论按钮点击后焦点在输入框，强制点击评论列表区域以确保滚轮作用
        if (focusPoint) {
          const inputFocused = await isInputFocused();
          if (inputFocused) {
            console.log('[WarmupComments] 检测到输入框焦点，点击评论区以切换焦点...');
            await systemClickAt(Math.floor(focusPoint.x), Math.floor(focusPoint.y));
            await new Promise((r) => setTimeout(r, 350));
          }
        }

        // 最后再执行一次“聚焦评论区域”的定位（包含高亮），确保滚轮坐标落在评论区内
        await focusCommentsArea();
      } else {
        console.warn(
          `[WarmupComments] comment_section anchor verify failed: ${anchor.error || 'not found'}`,
        );
        return {
          success: false,
          reachedEnd: false,
          totalFromHeader: null,
          finalCount: 0,
          anchor: {
            commentSectionContainerId: commentSectionId,
            commentSectionRect: undefined,
          },
          error: anchor.error || 'comment_section anchor not found',
        };
      }
    } catch (e: any) {
      console.warn(`[WarmupComments] comment_section anchor verify error: ${e.message}`);
      return {
        success: false,
        reachedEnd: false,
        totalFromHeader: null,
        finalCount: 0,
        anchor: {
          commentSectionContainerId: commentSectionId,
          commentSectionRect: undefined,
        },
        error: `comment_section anchor verify error: ${e.message}`,
      };
    }

    // 1.2 使用原生点击的方式聚焦模态框/评论区，确保 PageDown 作用在正确区域
    await focusCommentsArea();

    // 2. 滚动 + 自动展开（不做提取），直到「没有更多可展开」或达到总数
    let lastCount = 0;
    let targetTotal: number | null = null;

    const initialStats = await getCommentStats();
    lastCount = initialStats.count;
    targetTotal = initialStats.total;

    // 关键修复：部分长正文/特殊布局的详情页，评论区容器可见但评论列表不会自动加载，
    // 需要先点击“评论按钮（chat-wrapper）”触发加载，否则会出现：
    // - headerTotal > 0，但 count 始终为 0，滚动也不会生效
    if (
      initialStats.count === 0 &&
      typeof initialStats.total === 'number' &&
      Number.isFinite(initialStats.total) &&
      initialStats.total > 0
    ) {
      console.log(
        `[WarmupComments] count=0 but headerTotal=${initialStats.total}, try click comment_button to activate comments`,
      );
      await tryClickCommentButton('count_zero_but_total_positive');
      // 点击评论按钮后焦点可能落在输入框，重新聚焦到评论列表并刷新一次统计
      await focusCommentsArea();
      await new Promise((r) => setTimeout(r, 600));
      const afterClickStats = await getCommentStats();
      console.log(
        `[WarmupComments] after comment_button click: count=${afterClickStats.count} total=${afterClickStats.total} hasMore=${afterClickStats.hasMore}`,
      );
      lastCount = afterClickStats.count;
      targetTotal = afterClickStats.total;
    }

    // 若一开始就检测到“无评论 + 无展开控件”（count=0 && total=null && !hasMore），
    // 则直接视为无需预热，避免在没有任何锚点信号的情况下盲目滚动。
    if (
      initialStats.count === 0 &&
      (initialStats.total === null || initialStats.total === 0) &&
      !initialStats.hasMore
    ) {
      console.log(
        '[WarmupComments] initial stats indicate no comments and no expand controls, skip warmup scrolling',
      );
      return {
        success: true,
        reachedEnd: true,
        totalFromHeader: null,
        finalCount: 0,
        anchor: {
          commentSectionContainerId: commentSectionId,
          commentSectionRect,
        },
      };
    }

    // 动态轮次上限：优先根据 header 总数估算，避免用固定硬编码常数
    // - header 存在时：按“大约每轮 20 条”估算，放大系数为 3，且不超过 512 轮
    // - header 不存在时：使用温和的默认上限 64，只作为防御性保护
    const dynamicMaxRounds =
      typeof maxRounds === 'number' && maxRounds > 0
        ? maxRounds
        : targetTotal && targetTotal > 0
        ? Math.min(Math.max(Math.ceil(targetTotal / 20) * 3, 16), 512)
        : 64;

    let noEffectStreak = 0;

    for (let i = 0; i < dynamicMaxRounds; i++) {
      const viewportBefore = await getViewportFirstComment();
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
          // 注意：部分页面的滚动容器就是 root 自身（例如 comments-el 本身 overflow-y: auto），不能从 parentElement 开始找。
          let current = root;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const overflowY = style.overflowY || '';
            const canScroll =
              (overflowY === 'scroll' || overflowY === 'auto' || overflowY === 'overlay') &&
              current.scrollHeight - current.clientHeight > 12;
            if (canScroll) {
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
      }).catch((): null => null);

      const refreshedFocus =
        (refreshFocusResult as any)?.result || (refreshFocusResult as any)?.data?.result || refreshFocusResult;
      if (refreshedFocus && typeof refreshedFocus.x === 'number' && typeof refreshedFocus.y === 'number') {
        // 每轮都以滚动容器中心点刷新焦点，避免“正文很长/输入框抢焦点”导致滚轮作用到错误区域
        const w = Number(viewport?.w || 0) || 0;
        const h = Number(viewport?.h || 0) || 0;
        const fx = w ? clamp(refreshedFocus.x, 20, w - 20) : refreshedFocus.x;
        const fy = h ? clamp(refreshedFocus.y, 120, h - 120) : refreshedFocus.y;
        focusPoint = { x: fx, y: fy };
        console.log(
          `[WarmupComments] round=${i} refreshed focus: (${refreshedFocus.x}, ${refreshedFocus.y}), scrollTop=${refreshedFocus.scrollTop}/${refreshedFocus.scrollHeight}`,
        );
        await systemHoverAt(Math.floor(focusPoint.x), Math.floor(focusPoint.y));
      }

      const scrollTopBefore =
        refreshedFocus && typeof refreshedFocus.scrollTop === 'number' ? refreshedFocus.scrollTop : null;
      const scrollHeightBefore =
        refreshedFocus && typeof refreshedFocus.scrollHeight === 'number'
          ? refreshedFocus.scrollHeight
          : null;
      const clientHeightBefore =
        refreshedFocus && typeof refreshedFocus.clientHeight === 'number'
          ? refreshedFocus.clientHeight
          : null;

      // 2.2 使用容器运行时触发一次 show_more_button 的 click（基于容器的 JS click）
      if (showMoreSelector) {
        try {
          const opResult = await controllerAction('container:operation', {
            containerId: showMoreContainerId,
            operationId: 'click',
            config: { selector: showMoreSelector, useSystemMouse: true },
            sessionId: profile,
          });
          const opPayload = (opResult as any).data || opResult;
          console.log(
            `[WarmupComments] round=${i} container click result: ${JSON.stringify(
              opPayload,
            )}`,
          );
        } catch (err: any) {
          console.warn(
            `[WarmupComments] round=${i} container click via runtime failed: ${err?.message || err}`,
          );
        }
      }

      // 2.3 展开回复：用系统点击可见的「展开更多」按钮（避免 JS click）
      let clickPayload: any;
      try {
        const clickResult = await controllerAction('browser:execute', {
          profile,
          script: `(() => {
            const root =
              document.querySelector('.comments-el') ||
              document.querySelector('.comment-list') ||
              document.querySelector('.comments-container') ||
              document.querySelector('[class*="comment-section"]');
            if (!root) {
              return { targets: [], total: 0, all: 0, error: 'no root' };
            }

            // 使用CSS选择器直接查找展开按钮: .show-more
            const expandElements = Array.from(root.querySelectorAll('.show-more'));
            const viewportH = window.innerHeight || 0;
            const viewportW = window.innerWidth || 0;

            const maxTargets = 2;
            const targets = [];
            let visibleCount = 0;
            let candidateCount = 0;

            for (const el of expandElements) {
              if (targets.length >= maxTargets) break;
              if (!(el instanceof HTMLElement)) continue;
              if (el.getAttribute('data-webauto-expand-clicked') === '1') continue;

              const rect = el.getBoundingClientRect();
              if (!rect || rect.width < 6 || rect.height < 6) continue;
              if (!(rect.bottom > 0 && rect.top < viewportH)) continue;
              if (!(rect.right > 0 && rect.left < viewportW)) continue;
              visibleCount += 1;

              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
                continue;
              }

              // 只点击视口内安全区域，避免顶部标题栏/底部输入框
              const x = Math.min(Math.max(rect.left + rect.width / 2, 30), viewportW - 30);
              const y = Math.min(Math.max(rect.top + rect.height / 2, 140), viewportH - 140);
              candidateCount += 1;
              el.setAttribute('data-webauto-expand-clicked', '1');
              targets.push({ x, y });
            }

            return {
              targets,
              total: visibleCount,
              all: expandElements.length,
              candidates: candidateCount,
            };
          })()`,
        });

        clickPayload =
          (clickResult as any).result ||
          (clickResult as any).data?.result ||
          clickResult;
      } catch (err: any) {
        console.warn(
          `[WarmupComments] round=${i} expand script error: ${err?.message || err}`,
        );
        clickPayload = { targets: [], total: 0, all: 0, error: err?.message || String(err) };
      }

      const targets = Array.isArray(clickPayload?.targets) ? clickPayload.targets : [];
      const totalButtons =
        typeof clickPayload?.total === 'number' ? clickPayload.total : -1;
      const allButtons =
        typeof clickPayload?.all === 'number' ? clickPayload.all : undefined;
      const candidates =
        typeof clickPayload?.candidates === 'number' ? clickPayload.candidates : undefined;

      console.log(
        `[WarmupComments] round=${i} expand buttons: clickTargets=${targets.length}, visible=${totalButtons}, candidates=${candidates}, all=${allButtons}`,
      );

      // 系统点击展开（最多 2 个），避免长评论帖里“回复未展开”导致评论总数对不齐
      if (Array.isArray(targets) && targets.length > 0) {
        for (const t of targets) {
          if (!t || typeof t !== 'object') continue;
          const x = Number((t as any).x);
          const y = Number((t as any).y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          try {
            await systemClickAt(Math.floor(x), Math.floor(y));
            await new Promise((r) => setTimeout(r, 280 + Math.random() * 320));
          } catch {
            // ignore
          }
        }

        // 展开后重新 hover 到滚动容器焦点，避免焦点落到输入框导致滚轮无效
        if (focusPoint) {
          await systemHoverAt(Math.floor(focusPoint.x), Math.floor(focusPoint.y));
          await new Promise((r) => setTimeout(r, 180));
        }
      }

      // 注意：不再因为“本轮没有任何可点击的展开按钮”而提前终止 warmup。
      // 许多帖子评论本身就是纯列表滚动，没有「展开 N 条回复」控件；
      // 这种情况下仍然需要继续向下滚动，直到 header 总数或滚动容器真正到达底部。

      // 2.4 系统滚动：用真实鼠标滚轮事件滚动（禁止 JS scrollBy 兜底）
      const deltaY = 320 + Math.floor(Math.random() * 280); // 320–599 之间的随机滚动距离
      try {
        await systemMouseWheel(deltaY);
        console.log(`[WarmupComments] round=${i} system wheel deltaY=${deltaY}`);
      } catch (err: any) {
        console.warn(
          `[WarmupComments] round=${i} system wheel failed: ${err?.message || err}`,
        );
      }

      // 随机等待 0.8–1.6 秒，让滚动+懒加载完成
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 800));

      const stats = await getCommentStats();
      const currentCount = stats.count;

      const viewportAfter = await getViewportFirstComment();
      if (viewportBefore || viewportAfter) {
        console.log(
          `[WarmupComments] round=${i} viewportFirst before=${JSON.stringify(
            viewportBefore,
          )} after=${JSON.stringify(viewportAfter)}`,
        );
      }

      // 校验滚动是否真正生效：scrollTop 或 视口内第一条评论 key/位置发生变化
      let scrolled = null as null | boolean;
      try {
        const afterFocusResult = await controllerAction('browser:execute', {
          profile,
          script: `(() => {
            const root =
              document.querySelector('.comments-el') ||
              document.querySelector('.comment-list') ||
              document.querySelector('.comments-container') ||
              document.querySelector('[class*="comment-section"]');
            if (!root) return null;
            let scrollContainer = null;
            // 同上：滚动容器可能就是 root 自己
            let current = root;
            while (current && current !== document.body) {
              const style = window.getComputedStyle(current);
              const overflowY = style.overflowY || '';
              const canScroll =
                (overflowY === 'scroll' || overflowY === 'auto' || overflowY === 'overlay') &&
                current.scrollHeight - current.clientHeight > 12;
              if (canScroll) {
                scrollContainer = current;
                break;
              }
              current = current.parentElement;
            }
            if (!scrollContainer) return null;
            return {
              scrollTop: scrollContainer.scrollTop,
              scrollHeight: scrollContainer.scrollHeight,
              clientHeight: scrollContainer.clientHeight
            };
          })()`,
        }).catch((): null => null);

        const afterPayload =
          (afterFocusResult as any)?.result || (afterFocusResult as any)?.data?.result || afterFocusResult;

        const scrollTopAfter =
          afterPayload && typeof afterPayload.scrollTop === 'number' ? afterPayload.scrollTop : null;
        const scrollHeightAfter =
          afterPayload && typeof afterPayload.scrollHeight === 'number' ? afterPayload.scrollHeight : null;
        const clientHeightAfter =
          afterPayload && typeof afterPayload.clientHeight === 'number' ? afterPayload.clientHeight : null;

        const canScroll =
          (scrollHeightAfter ?? scrollHeightBefore ?? 0) - (clientHeightAfter ?? clientHeightBefore ?? 0) > 12;

        if (canScroll && scrollTopBefore !== null && scrollTopAfter !== null) {
          scrolled = Math.abs(scrollTopAfter - scrollTopBefore) > 2;
        }
      } catch {
        // ignore
      }

      const keyBefore = viewportBefore?.key || '';
      const keyAfter = viewportAfter?.key || '';
      const firstChanged = Boolean(keyBefore && keyAfter && keyBefore !== keyAfter);

      if (scrolled === false && !firstChanged && currentCount <= lastCount) {
        noEffectStreak += 1;
        console.warn(
          `[WarmupComments] round=${i} ⚠️ scroll seems ineffective (streak=${noEffectStreak})`,
        );
        // 轻量恢复：hover + click 到评论区，再试一次小滚动
        if (noEffectStreak >= 2 && focusPoint) {
          await systemHoverAt(Math.floor(focusPoint.x), Math.floor(focusPoint.y));
          await new Promise((r) => setTimeout(r, 150));
          await systemClickAt(Math.floor(focusPoint.x), Math.floor(focusPoint.y));
          await new Promise((r) => setTimeout(r, 220));
          await systemMouseWheel(260 + Math.floor(Math.random() * 180));
          await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
          noEffectStreak = 0;
        }
      } else {
        noEffectStreak = 0;
      }

      const headerKnown = targetTotal !== null && targetTotal > 0;
      const reachedTarget = headerKnown && currentCount >= (targetTotal as number);
      let noMore = !stats.hasMore && currentCount <= lastCount;

      // 如果明确知道 header 总数且当前抓取量明显小于 header，总是继续尝试滚动
      // 避免像 461 条这种大评论页还没滚满就因为 hasMore=false 提前退出
      if (headerKnown && currentCount < (targetTotal as number)) {
        noMore = false;
      }

      console.log(
        `[WarmupComments] round=${i} count=${currentCount}, total=${targetTotal}, hasMore=${stats.hasMore}, reachedTarget=${reachedTarget}, noMore=${noMore}`,
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
