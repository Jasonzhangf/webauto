import type { OperationContext, OperationDefinition } from '../registry.js';

export interface ClickConfig {
  selector?: string;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  waitFor?: number;
  retries?: number;
}

async function runClick(ctx: OperationContext, config: ClickConfig) {
  const waitFor = config.waitFor || 0;

  if (waitFor > 0) {
    await new Promise((r) => setTimeout(r, waitFor));
  }  const retries = config.retries || 0;

  if (config.selector) {
    // 方案 A: 通过 selector 点击
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
