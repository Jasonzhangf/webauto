import type { OperationContext, OperationDefinition } from '../registry.js';

export interface ScrollConfig {
  selector?: string;
  distance?: number;
  direction?: 'up' | 'down';
}

async function runScroll(ctx: OperationContext, config: ScrollConfig) {
  const distance = config.distance ?? 500;
  const direction = config.direction || 'down';
  return ctx.page.evaluate(
    (data) => {
      const target = data.selector ? document.querySelector(data.selector) : null;
      const container = target || document.scrollingElement || document.documentElement;
      const delta = data.direction === 'up' ? -Math.abs(data.distance) : Math.abs(data.distance);
      container.scrollBy({ top: delta, behavior: 'smooth' });
      return { success: true };
    },
    { selector: config.selector, distance, direction },
  );
}

export const scrollOperation: OperationDefinition<ScrollConfig> = {
  id: 'scroll',
  description: 'Scroll page or target element',
  requiredCapabilities: ['scroll'],
  run: runScroll,
};
