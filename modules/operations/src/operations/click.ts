import type { OperationContext, OperationDefinition } from '../registry.js';

export interface ClickConfig {
  selector?: string;
  index?: number;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  target?: string;
  waitFor?: number;
  retries?: number;
  useSystemMouse?: boolean;
  x?: number;
  y?: number;
  visibleOnly?: boolean;
}

async function runClick(ctx: OperationContext, config: ClickConfig) {
  const waitFor = config.waitFor || 0;

  if (waitFor > 0) {
    await new Promise((r) => setTimeout(r, waitFor));
  }

  if (config.selector) {
    // 方案 A: 通过 selector + index 点击（强制系统级点击，避免 DOM click）
    const index = Number.isFinite(config.index) ? Math.max(0, Math.floor(config.index as number)) : 0;
    const useSystemMouse = config.useSystemMouse !== false;
    const visibleOnly = config.visibleOnly === true;

    if (!useSystemMouse) {
      return { success: false, error: 'DOM click disabled; set useSystemMouse=true' };
    }

    type ClickPoint = { x: number; y: number };
    const target = typeof config.target === 'string' ? config.target.trim() : '';

    const info = await ctx.page.evaluate(({ sel, idx, tgt, visibleOnly: vOnly }) => {
      const isVisible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.bottom > 0 &&
          r.top < window.innerHeight &&
          r.right > 0 &&
          r.left < window.innerWidth
        );
      };

      const allNodes = Array.from(document.querySelectorAll(sel));
      const nodes = vOnly ? allNodes.filter((n) => isVisible(n as Element)) : allNodes;
      const root = nodes[idx] as Element | undefined;
      if (!root) return null;

      let el: Element = root;
      if (tgt) {
        if (tgt === 'self') {
          el = root;
        } else if (tgt === 'img') {
          el = (root.querySelector('img') as Element | null) || root;
        } else {
          el = (root.querySelector(tgt) as Element | null) || root;
        }
      }

      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0 && r.y < window.innerHeight && r.y + r.height > 0;
      if (!visible) return { visible: false, clickPoints: [] as Array<{ x: number; y: number }> };

      const x1 = Math.max(0, r.left);
      const y1 = Math.max(0, r.top);
      const x2 = Math.min(window.innerWidth, r.right);
      const y2 = Math.min(window.innerHeight, r.bottom);

      const mx = Math.round((x1 + x2) / 2);
      const my = Math.round((y1 + y2) / 2);
      const pad = 10;
      const points = [
        { x: mx, y: my },
        { x: Math.round(x1 + pad), y: my },
        { x: Math.round(x2 - pad), y: my },
        { x: mx, y: Math.round(y1 + pad) },
        { x: mx, y: Math.round(y2 - pad) },
      ];

      const clickPoints: Array<{ x: number; y: number }> = [];
      for (const p of points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x < 0 || p.y < 0 || p.x > window.innerWidth || p.y > window.innerHeight) continue;
        const hit = document.elementFromPoint(p.x, p.y);
        if (hit && (hit === el || el.contains(hit))) {
          clickPoints.push(p);
        }
      }

      if (!clickPoints.length) {
        // 兜底：至少点一次可见交集的中心
        clickPoints.push({ x: mx, y: my });
      }

      return { visible: true, clickPoints };
    }, { sel: config.selector, idx: index, tgt: target, visibleOnly });

    if (!info || !info.visible || !Array.isArray((info as any).clickPoints) || (info as any).clickPoints.length === 0) {
      return { success: false, error: 'element not visible' };
    }
    if (!ctx.systemInput?.mouseClick) {
      return { success: false, error: 'system mouse not available' };
    }
    const clickPoints = (info as { clickPoints: ClickPoint[] }).clickPoints;
    // 优先点击视口内且命中目标元素的点，避免“元素部分可见但中心离屏”导致点错
    for (const p of clickPoints) {
      await ctx.systemInput.mouseClick(Math.round(p.x), Math.round(p.y));
      break;
    }
    return { success: true };

  } else if (config.bbox) {
    // 方案 B: 通过 bbox 点击（使用系统鼠标）
    const cx = Math.round((config.bbox.x1 + config.bbox.x2) / 2);
    const cy = Math.round((config.bbox.y1 + config.bbox.y2) / 2);

    if (!ctx.systemInput?.mouseClick) {
      return { success: false, error: 'system mouse not available' };
    }

    await ctx.systemInput.mouseClick(cx, cy);
    return { success: true };

  } else if (typeof config.x === 'number' && typeof config.y === 'number') {
    // 方案 C: 直接通过坐标点击
    if (!ctx.systemInput?.mouseClick) {
      return { success: false, error: 'system mouse not available' };
    }
    await ctx.systemInput.mouseClick(config.x, config.y);
    return { success: true };

  } else {
    return { success: false, error: 'selector or bbox required' };
  }
}

export const clickOperation: OperationDefinition<ClickConfig> = {
  id: 'click',
  description: 'Click element by selector or bbox',
  requiredCapabilities: ['click'],
  run: runClick,
};
