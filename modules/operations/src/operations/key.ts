import type { OperationContext, OperationDefinition } from '../registry.js';

export interface KeyConfig {
  selector?: string;
  key: string;
  wait_after?: number;
  waitAfter?: number;
  useSystemMouse?: boolean;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runKey(ctx: OperationContext, config: KeyConfig) {
  const key = String(config.key || '').trim();
  if (!key) {
    throw new Error('key operation requires key');
  }

  const selector = typeof config.selector === 'string' ? config.selector.trim() : '';
  const waitAfter =
    typeof config.wait_after === 'number'
      ? config.wait_after
      : typeof config.waitAfter === 'number'
        ? config.waitAfter
        : 0;

  const useSystemMouse = config.useSystemMouse !== false;
  const protocolMouse = (ctx.page as any)?.mouse;

  if (selector) {
    const rect = await ctx.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0 && r.y < window.innerHeight && r.y + r.height > 0;
      return { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom, visible };
    }, selector);

    if (!rect || !rect.visible) {
      return { success: false, error: 'element not visible' };
    }
    const cx = Math.round((rect.x1 + rect.x2) / 2);
    const cy = Math.round((rect.y1 + rect.y2) / 2);
    if (useSystemMouse) {
      if (!ctx.systemInput?.mouseClick) {
        return { success: false, error: 'system mouse not available' };
      }
      await ctx.systemInput.mouseClick(cx, cy);
    } else {
      if (!protocolMouse || typeof protocolMouse.click !== 'function') {
        return { success: false, error: 'protocol mouse not available' };
      }
      await protocolMouse.click(cx, cy);
    }
    await delay(150);
  }

  const keyboard = ctx.page.keyboard;
  if (!keyboard || typeof keyboard.press !== 'function') {
    return { success: false, error: 'keyboard press not available' };
  }
  await keyboard.press(key);

  if (waitAfter > 0) {
    await delay(waitAfter);
  }

  return { success: true, inputMode: useSystemMouse ? 'system' : 'protocol' };
}

export const keyOperation: OperationDefinition<KeyConfig> = {
  id: 'key',
  description: 'Press a key using system-level keyboard',
  requiredCapabilities: [],
  run: runKey,
};

