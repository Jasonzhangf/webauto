import type { OperationContext, OperationDefinition } from '../registry.js';

export interface ScrollConfig {
  selector?: string;
  distance?: number;
  amount?: number;
  direction?: 'up' | 'down';
  anchor?: { x: number; y: number };
  fullyVisible?: boolean;
  useSystemMouse?: boolean;
}

async function runScroll(ctx: OperationContext, config: ScrollConfig) {
  const rawDistance = typeof config.distance === 'number'
    ? config.distance
    : typeof config.amount === 'number'
      ? config.amount
      : 500;
  const direction = config.direction || 'down';
  const fullyVisible = config.fullyVisible === true;
  const anchor = config.anchor ?? null;

  // Keep operation-level pacing bounded to a few page gestures.
  const distance = Math.min(800, Math.max(0, Math.floor(Math.abs(rawDistance))));
  const useSystemMouse = config.useSystemMouse !== false;
  const keyboard = ctx.page.keyboard;
  const protocolMouse = (ctx.page as any)?.mouse;

  if (!keyboard?.press) {
    return { success: false, error: 'keyboard press not available' };
  }

  const selector = typeof config.selector === 'string' ? config.selector.trim() : '';
  if (selector) {
    const info = await ctx.page.evaluate(({ sel, fVisible, anchorPoint }) => {
      const isVisible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      };

      const isFullyVisible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
      };

      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const visible = isVisible(el);
      const fVisibleCheck = isFullyVisible(el);
      if (!visible) return { visible: false, fullyVisible: false, anchorMatch: false, point: null };
      if (fVisible && !fVisibleCheck) return { visible, fullyVisible: false, anchorMatch: false, point: null };

      let anchorMatch = true;
      if (anchorPoint) {
        const hit = document.elementFromPoint(anchorPoint.x, anchorPoint.y);
        anchorMatch = hit !== null && (hit === el || el.contains(hit));
        if (!anchorMatch) return { visible, fullyVisible: fVisibleCheck, anchorMatch: false, point: null };
      }

      const x1 = Math.max(0, r.left);
      const y1 = Math.max(0, r.top);
      const x2 = Math.min(window.innerWidth, r.right);
      const y2 = Math.min(window.innerHeight, r.bottom);
      const point = {
        x: Math.round((x1 + x2) / 2),
        y: Math.round(y1 + Math.min((y2 - y1) / 2, 24)),
      };
      return { visible: true, fullyVisible: fVisibleCheck, anchorMatch, point };
    }, { sel: selector, fVisible: fullyVisible, anchorPoint: anchor });

    if (!info) {
      return { success: false, error: 'element not found' };
    }
    if (!info.visible) {
      return { success: false, error: 'element not visible' };
    }
    if (fullyVisible && !info.fullyVisible) {
      return { success: false, error: 'element not fully visible in viewport' };
    }
    if (anchor && !info.anchorMatch) {
      return { success: false, error: 'anchor point does not hit target element' };
    }
    if (info.point) {
      const x = Math.round(info.point.x);
      const y = Math.round(info.point.y);
      if (useSystemMouse) {
        if (!ctx.systemInput?.mouseClick) {
          return { success: false, error: 'system mouse not available' };
        }
        if (ctx.systemInput.mouseMove) {
          await ctx.systemInput.mouseMove(x, y, 2);
        }
        await ctx.systemInput.mouseClick(x, y);
      } else {
        if (!protocolMouse || typeof protocolMouse.click !== 'function') {
          return { success: false, error: 'protocol mouse not available' };
        }
        if (typeof protocolMouse.move === 'function') {
          await protocolMouse.move(x, y, { steps: 2 });
        }
        await protocolMouse.click(x, y);
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const key = direction === 'up' ? 'PageUp' : 'PageDown';
  const settleMs = 90;
  const steps = Math.max(1, Math.min(8, Math.round(distance / 420) || 1));
  for (let step = 0; step < steps; step += 1) {
    await keyboard.press(key);
    await new Promise((r) => setTimeout(r, settleMs));
  }
  return { success: true, key, steps, inputMode: 'keyboard' };
}

export const scrollOperation: OperationDefinition<ScrollConfig> = {
  id: 'scroll',
  description: 'Scroll page or target element',
  requiredCapabilities: ['scroll'],
  run: runScroll,
};
