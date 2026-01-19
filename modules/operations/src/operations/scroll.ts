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
      const rect = await ctx.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && r.y < window.innerHeight && r.y + r.height > 0;
        return { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom, visible };
      }, selector);
      if (rect && rect.visible) {
        const cx = Math.round((rect.x1 + rect.x2) / 2);
        const cy = Math.round((rect.y1 + rect.y2) / 2);
        await ctx.systemInput.mouseMove(cx, cy, 2);
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
