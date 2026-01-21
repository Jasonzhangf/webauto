/**
 * Reply Expander Helper
 *
 * 共享展开逻辑：WarmupCommentsBlock / ExpandCommentsBlock
 * - 仅负责查找“视口内可见”的展开按钮，并返回系统点击坐标
 * - 不做 DOM click（仅做只读 query + 标记 + 坐标计算）
 */

export interface ExpandTargets {
  targets: Array<{ x: number; y: number }>;
  visible: number;
  candidates: number;
  all: number;
  error?: string;
}

export interface ExpandResult {
  clicked: number;
  visible: number;
  candidates: number;
  all: number;
  containerClick?: any;
  error?: string;
}

export async function expandRepliesInView(options: {
  controllerUrl: string;
  profile: string;
  browserServiceUrl?: string;
  maxTargets?: number;
  recomputeEachClick?: boolean;
  focusPoint?: { x: number; y: number } | null;
  showMoreContainerId?: string;
  showMoreSelector?: string | null;
  logPrefix?: string;
  round?: number;
}): Promise<ExpandResult> {
  const {
    controllerUrl,
    profile,
    browserServiceUrl = 'http://127.0.0.1:7704',
    maxTargets,
    recomputeEachClick = true,
    focusPoint,
    showMoreContainerId,
    showMoreSelector,
    logPrefix = '[WarmupComments]',
    round,
  } = options;

  const log = (msg: string) => console.log(`${logPrefix} ${msg}`);
  // 注意：展开回复必须基于“视口内可见”的按钮坐标做系统点击。
  // 这里不再额外做容器 click（容易引发 off-screen 误点/噪音日志）。

  const maxClickTargets =
    typeof maxTargets === 'number' && maxTargets > 0 ? Math.floor(maxTargets) : 2;

  let clicked = 0;
  let visible = 0;
  let candidates = 0;
  let all = 0;
  let error: string | undefined;

  const { systemClickAt, systemHoverAt } = await import('./systemInput.js');

  // 注意：展开后会导致布局变化，预先计算一堆坐标容易“点偏/点不到”。
  // 因此默认每次点击都重新计算一次（maxTargets 次），保证每次点的都是“当前仍可见”的按钮。
  for (let i = 0; i < maxClickTargets; i += 1) {
    const targets = await findExpandTargets(controllerUrl, profile, {
      maxTargets: recomputeEachClick ? 1 : maxClickTargets,
      selector: showMoreSelector || undefined,
    });
    visible = targets.visible;
    candidates = targets.candidates;
    all = targets.all;
    error = targets.error;

    if (i === 0) {
      log(
        `round=${typeof round === 'number' ? round : 'n/a'} expand buttons: clickTargets=${targets.targets.length}, visible=${targets.visible}, candidates=${targets.candidates}, all=${targets.all}`,
      );
    }

    const t = targets.targets[0];
    if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.y)) break;

    try {
      await systemClickAt(profile, Math.floor(t.x), Math.floor(t.y), browserServiceUrl, 'reply_expand');
      clicked += 1;
      // 等待 DOM/布局更新（展开回复通常伴随动画与异步加载）
      await new Promise((r) => setTimeout(r, 650 + Math.random() * 450));
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (msg.includes('captcha_modal_detected') || msg.includes('unsafe_click_image_in_detail')) {
        throw e;
      }
      // 其他点击失败（例如元素瞬移）跳过本次，继续尝试下一个
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    if (!recomputeEachClick) {
      // 非重算模式：一次拿到多个坐标并依次点击
      const rest = targets.targets.slice(1);
      for (const p of rest) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        try {
          await systemClickAt(profile, Math.floor(p.x), Math.floor(p.y), browserServiceUrl, 'reply_expand');
          clicked += 1;
          await new Promise((r) => setTimeout(r, 650 + Math.random() * 450));
        } catch (e: any) {
          const msg = String(e?.message || e || '');
          if (msg.includes('captcha_modal_detected') || msg.includes('unsafe_click_image_in_detail')) throw e;
        }
      }
      break;
    }
  }

  if (focusPoint && clicked > 0) {
    await systemHoverAt(profile, Math.floor(focusPoint.x), Math.floor(focusPoint.y), browserServiceUrl);
    await new Promise((r) => setTimeout(r, 180));
  }

  return {
    clicked,
    visible,
    candidates,
    all,
    containerClick: undefined,
    error,
  };
}

export async function findExpandTargets(
  controllerUrl: string,
  profile: string,
  opts: { maxTargets?: number; selector?: string } = {},
): Promise<ExpandTargets> {
  const maxTargets =
    typeof opts.maxTargets === 'number' && opts.maxTargets > 0 ? opts.maxTargets : 2;
  const selector = typeof opts.selector === 'string' && opts.selector.trim() ? opts.selector.trim() : '';

  try {
    const res = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script: `(() => {
            const root =
              document.querySelector('.comments-el') ||
              document.querySelector('.comment-list') ||
              document.querySelector('.comments-container') ||
              document.querySelector('[class*="comment-section"]');
            if (!root) {
              return { targets: [], total: 0, all: 0, candidates: 0, error: 'no root' };
            }

            const selector = ${JSON.stringify(selector)} || '.show-more, [class*="show-more"], [class*="expand"], [class*="more"]';
            let expandElements = [];
            try {
              expandElements = Array.from(root.querySelectorAll(selector));
            } catch (_) {
              expandElements = Array.from(root.querySelectorAll('.show-more, [class*="show-more"], [class*="expand"], [class*="more"]'));
            }
            const viewportH = window.innerHeight || 0;
            const viewportW = window.innerWidth || 0;

            const targets = [];
            let visibleCount = 0;
            let candidateCount = 0;

            for (const el of expandElements) {
              if (targets.length >= ${maxTargets}) break;
              if (!(el instanceof HTMLElement)) continue;

              const rect = el.getBoundingClientRect();
              if (!rect || rect.width < 6 || rect.height < 6) continue;
              if (!(rect.bottom > 0 && rect.top < viewportH)) continue;
              if (!(rect.right > 0 && rect.left < viewportW)) continue;
              visibleCount += 1;

              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
                continue;
              }

              // 过滤掉明显的“收起/折叠”，避免反复点导致状态抖动
              const text = (el.textContent || '').trim();
              if (text.includes('收起') || text.includes('折叠')) continue;

              const x = Math.min(Math.max(rect.left + rect.width / 2, 30), viewportW - 30);
              const y = Math.min(Math.max(rect.top + rect.height / 2, 140), viewportH - 140);
              candidateCount += 1;
              targets.push({ x, y });
            }

            return {
              targets,
              total: visibleCount,
              all: expandElements.length,
              candidates: candidateCount,
            };
          })()`,
        },
      }),
      signal: (AbortSignal as any).timeout
        ? (AbortSignal as any).timeout(10000)
        : undefined,
    });

    if (!res.ok) {
      return {
        targets: [],
        visible: 0,
        candidates: 0,
        all: 0,
        error: `HTTP ${res.status}: ${await res.text()}`,
      };
    }

    const data = await res.json();
    const payload = data?.data?.result || data?.result || data;

    const targets = Array.isArray(payload?.targets) ? payload.targets : [];
    const totalButtons = typeof payload?.total === 'number' ? payload.total : 0;
    const allButtons = typeof payload?.all === 'number' ? payload.all : 0;
    const candidates = typeof payload?.candidates === 'number' ? payload.candidates : 0;

    return {
      targets: targets
        .map((t: any) => ({ x: Number(t?.x), y: Number(t?.y) }))
        .filter((t: any) => Number.isFinite(t.x) && Number.isFinite(t.y)),
      visible: totalButtons,
      candidates,
      all: allButtons,
      error: typeof payload?.error === 'string' ? payload.error : undefined,
    };
  } catch (err: any) {
    return {
      targets: [],
      visible: 0,
      candidates: 0,
      all: 0,
      error: err?.message || String(err),
    };
  }
}
