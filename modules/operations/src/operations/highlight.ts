import type { OperationContext, OperationDefinition } from '../registry.js';

export interface HighlightConfig {
  selector: string;
  style?: string;
  duration?: number;
  index?: number;
  target?: string;
}

async function runHighlight(ctx: OperationContext, config: HighlightConfig) {
  if (!config.selector) {
    throw new Error('highlight operation requires selector');
  }
  const style = config.style || '2px solid #fbbc05';
  const duration = config.duration ?? 1500;
  const index = Number.isFinite(config.index) ? Math.max(0, Math.floor(config.index as number)) : null;
  const target = typeof config.target === 'string' ? config.target.trim() : '';

  return ctx.page.evaluate(
    (data) => {
      const nodes = Array.from(document.querySelectorAll(data.selector));
      if (!nodes.length) {
        return { success: false, error: 'element not found', count: 0 };
      }
      const selected =
        typeof data.index === 'number'
          ? (() => {
              const root = nodes[data.index] as Element | undefined;
              if (!root) return [];
              let el: Element = root;
              if (data.target) {
                if (data.target === 'self') {
                  el = root;
                } else if (data.target === 'img') {
                  el = (root.querySelector('img') as Element | null) || root;
                } else {
                  el = (root.querySelector(data.target) as Element | null) || root;
                }
              }
              return [el];
            })()
          : nodes;

      if (!selected.length) {
        return { success: false, error: 'element not found', count: 0 };
      }

      const cleanups = selected.map((el) => {
        const originalOutline = (el as HTMLElement).style?.outline;
        try {
          (el as HTMLElement).style.outline = data.style;
        } catch {
          // ignore
        }
        return () => {
          try {
            (el as HTMLElement).style.outline = originalOutline;
          } catch {
            // ignore cleanup errors
          }
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
      const first = selected[0] as Element;
      const r = first.getBoundingClientRect();
      return {
        success: true,
        count: selected.length,
        rect: { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom },
      };
    },
    { selector: config.selector, style, duration, index, target },
  );
}

export const highlightOperation: OperationDefinition<HighlightConfig> = {
  id: 'highlight',
  description: 'Highlight element using outline',
  requiredCapabilities: ['highlight'],
  run: runHighlight,
};
