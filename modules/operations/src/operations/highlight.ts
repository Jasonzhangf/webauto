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
      const nodes = Array.from(document.querySelectorAll(data.selector));
      if (!nodes.length) {
        return { success: false, error: 'element not found', count: 0 };
      }
      const cleanups = nodes.map((el) => {
        const originalOutline = el.style.outline;
        el.style.outline = data.style;
        return () => {
          el.style.outline = originalOutline;
        };
      });
      const cleanup = () => {
        cleanups.forEach((fn) => {
          try {
            fn();
          } catch {
            // ignore cleanup errors
          }
        });
      };
      if (data.duration > 0) {
        setTimeout(cleanup, data.duration);
      }
      return { success: true, count: nodes.length };
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
