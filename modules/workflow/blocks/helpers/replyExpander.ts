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
    focusPoint,
    showMoreContainerId,
    showMoreSelector,
    logPrefix = '[WarmupComments]',
    round,
  } = options;

  const log = (msg: string) => console.log(`${logPrefix} ${msg}`);
  // 注意：展开回复必须基于“视口内可见”的按钮坐标做系统点击。
  // 这里不再额外做容器 click（容易引发 off-screen 误点/噪音日志）。

  const targets = await findExpandTargets(controllerUrl, profile, { maxTargets });
  log(
    `round=${typeof round === 'number' ? round : 'n/a'} expand buttons: clickTargets=${targets.targets.length}, visible=${targets.visible}, candidates=${targets.candidates}, all=${targets.all}`,
  );

  let clicked = 0;
  const { systemClickAt, systemHoverAt } = await import('./systemInput.js');
  for (const t of targets.targets) {
    if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.y)) continue;
    try {
      await systemClickAt(profile, Math.floor(t.x), Math.floor(t.y), browserServiceUrl);
      clicked += 1;
      await new Promise((r) => setTimeout(r, 280 + Math.random() * 320));
    } catch {
      // ignore
    }
  }

  if (focusPoint && clicked > 0) {
    await systemHoverAt(profile, Math.floor(focusPoint.x), Math.floor(focusPoint.y), browserServiceUrl);
    await new Promise((r) => setTimeout(r, 180));
  }

  return {
    clicked,
    visible: targets.visible,
    candidates: targets.candidates,
    all: targets.all,
    containerClick: undefined,
    error: targets.error,
  };
}

export async function findExpandTargets(
  controllerUrl: string,
  profile: string,
  opts: { maxTargets?: number } = {},
): Promise<ExpandTargets> {
  const maxTargets =
    typeof opts.maxTargets === 'number' && opts.maxTargets > 0 ? opts.maxTargets : 2;

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

            const expandElements = Array.from(root.querySelectorAll('.show-more'));
            const viewportH = window.innerHeight || 0;
            const viewportW = window.innerWidth || 0;

            const targets = [];
            let visibleCount = 0;
            let candidateCount = 0;

            for (const el of expandElements) {
              if (targets.length >= ${maxTargets}) break;
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
