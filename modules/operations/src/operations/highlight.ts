import type { OperationContext, OperationDefinition } from '../registry.js';

export interface HighlightConfig {
  selector: string;
  style?: string;
  duration?: number;
}

async function runHighlight(ctx: OperationContext, config: HighlightConfig) {
  if (!config.selector) {
    throw new Error('highlight operation requires selector');
  }
  const style = config.style || '2px solid #fbbc05';
  const duration = config.duration ?? 1500;
  return ctx.page.evaluate(
    (data) => {
      const el = document.querySelector(data.selector);
      if (!el) {
        return { success: false, error: 'element not found' };
      }
      const originalOutline = el.style.outline;
      el.style.outline = data.style;
      const cleanup = () => {
        el.style.outline = originalOutline;
      };
      if (data.duration > 0) {
        setTimeout(cleanup, data.duration);
      }
      return { success: true };
    },
    { selector: config.selector, style, duration },
  );
}

export const highlightOperation: OperationDefinition<HighlightConfig> = {
  id: 'highlight',
  description: 'Highlight element using outline',
  requiredCapabilities: ['highlight'],
  run: runHighlight,
};
