import type { OperationContext, OperationDefinition } from '../registry.js';

export interface ScrollConfig {
  selector?: string;
  distance?: number;
  amount?: number;
  direction?: 'up' | 'down';
}

async function runScroll(ctx: OperationContext, config: ScrollConfig) {
  const rawDistance = typeof config.distance === 'number'
    ? config.distance
    : typeof config.amount === 'number'
      ? config.amount
      : 500;
  const direction = config.direction || 'down';

  // 单次滚动约束：不超过 800px，符合“用户手势范围”
  const distance = Math.min(800, Math.max(0, Math.floor(Math.abs(rawDistance))));
  const deltaY = direction === 'up' ? -distance : distance;

  // 优先系统级滚轮
  if (ctx.systemInput?.mouseWheel) {
    const selector = typeof config.selector === 'string' ? config.selector.trim() : '';
    if (selector && ctx.systemInput?.mouseMove) {
      const info = await ctx.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && r.y < window.innerHeight && r.y + r.height > 0;
        if (!visible) return { visible: false, points: [] as Array<{ x: number; y: number }> };

        const x1 = Math.max(0, r.left);
        const y1 = Math.max(0, r.top);
        const x2 = Math.min(window.innerWidth, r.right);
        const y2 = Math.min(window.innerHeight, r.bottom);

        const mx = Math.round((x1 + x2) / 2);
        const pad = 24;
        const points = [
          { x: mx, y: Math.round(y1 + pad) }, // top-middle (avoid center overlays)
          { x: mx, y: Math.round((y1 + y2) / 2) }, // middle
          { x: mx, y: Math.round(y2 - pad) }, // bottom-middle
          { x: Math.round(x1 + pad), y: Math.round(y1 + pad) }, // top-left
          { x: Math.round(x2 - pad), y: Math.round(y1 + pad) }, // top-right
        ];

        const ok: Array<{ x: number; y: number }> = [];
        for (const p of points) {
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
          if (p.x < 0 || p.y < 0 || p.x > window.innerWidth || p.y > window.innerHeight) continue;
          const hit = document.elementFromPoint(p.x, p.y);
          if (hit && (hit === el || el.contains(hit))) {
            ok.push(p);
          }
        }

        if (!ok.length) ok.push({ x: mx, y: Math.round((y1 + y2) / 2) });
        return { visible: true, points: ok };
      }, selector);

      if (info && info.visible && Array.isArray((info as any).points) && (info as any).points.length > 0) {
        const p = (info as any).points[0];
        await ctx.systemInput.mouseMove(Math.round(p.x), Math.round(p.y), 2);
        await new Promise((r) => setTimeout(r, 80));
      }
    }

    await ctx.systemInput.mouseWheel(0, deltaY);
    return { success: true, deltaY };
  }

  // fallback：系统键盘滚动（PageDown / PageUp）
  const keyboard = ctx.page.keyboard;
  if (keyboard?.press) {
    const key = direction === 'up' ? 'PageUp' : 'PageDown';
    await keyboard.press(key);
    return { success: true, key };
  }

  return { success: false, error: 'no system scroll available' };
}

export const scrollOperation: OperationDefinition<ScrollConfig> = {
  id: 'scroll',
  description: 'Scroll page or target element',
  requiredCapabilities: ['scroll'],
  run: runScroll,
};
