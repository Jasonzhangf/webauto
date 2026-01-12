import type { OperationContext, OperationDefinition } from '../registry.js';

export interface ClickConfig {
  selector?: string;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  waitFor?: number;
  retries?: number;
  useSystemMouse?: boolean;
  x?: number;
  y?: number;
}

async function runClick(ctx: OperationContext, config: ClickConfig) {
  const waitFor = config.waitFor || 0;

  if (waitFor > 0) {
    await new Promise((r) => setTimeout(r, waitFor));
  }  const retries = config.retries || 0;

  if (config.selector) {
    // 方案 A: 通过 selector 点击
    if (config.useSystemMouse) {
      // 使用 Playwright 标准鼠标点击（系统级）
      const rect = await ctx.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && r.y < window.innerHeight && r.y + r.height > 0;
        return {
          x1: r.left,
          y1: r.top,
          x2: r.right,
          y2: r.bottom,
          visible,
        };
      }, config.selector);

      if (!rect || !rect.visible) {
        return { success: false, error: 'element not visible' };
      }
      if (!ctx.systemInput?.mouseClick) {
        return { success: false, error: 'system mouse not available' };
      }
      const cx = Math.round((rect.x1 + rect.x2) / 2);
      const cy = Math.round((rect.y1 + rect.y2) / 2);
      await ctx.systemInput.mouseClick(cx, cy);
      return { success: true };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 500));
      }

      const result = await ctx.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) {
          return { success: false, error: 'element not found' };
        }
        el.click();
        return { success: true };
      }, config.selector);

      if (result.success) {
        return result;
      }
    }

    return { success: false, error: 'element not found after retries' };

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
