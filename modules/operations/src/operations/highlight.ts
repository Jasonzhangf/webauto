import type { OperationContext, OperationDefinition } from '../registry.js';

export interface HighlightConfig {
  selector: string;
  style?: string;
  duration?: number;
  index?: number;
  target?: string;
  channel?: string;
  sticky?: boolean;
  visibleOnly?: boolean;
}

async function runHighlight(ctx: OperationContext, config: HighlightConfig) {
  if (!config.selector) {
    throw new Error('highlight operation requires selector');
  }
  const style = config.style || '2px solid #fbbc05';
  const duration = config.duration ?? 1500;
  const index = Number.isFinite(config.index) ? Math.max(0, Math.floor(config.index as number)) : null;
  const target = typeof config.target === 'string' ? config.target.trim() : '';
  const channel = typeof config.channel === 'string' && config.channel.trim() ? config.channel.trim() : 'container-op';
  const sticky = config.sticky === true;
  const visibleOnly = config.visibleOnly === true;

  return ctx.page.evaluate(
    (data) => {
      const isVisible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.bottom > 0 &&
          r.top < window.innerHeight &&
          r.right > 0 &&
          r.left < window.innerWidth
        );
      };

      const allNodes = Array.from(document.querySelectorAll(data.selector));
      if (!allNodes.length) {
        return { success: false, error: 'element not found', count: 0 };
      }
      const nodes = data.visibleOnly ? allNodes.filter((n) => isVisible(n as Element)) : allNodes;
      if (!nodes.length) {
        return { success: false, error: data.visibleOnly ? 'no visible elements found' : 'element not found', count: 0 };
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

      const first = selected[0] as Element;
      const r = first.getBoundingClientRect();
      const viewport = { w: window.innerWidth, h: window.innerHeight };
      const inViewport =
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < viewport.h &&
        r.right > 0 &&
        r.left < viewport.w;

      // 优先使用 runtime overlay（截图可见，且不污染元素 style）
      try {
        // @ts-ignore
        const rt = (window as any).__webautoRuntime;
        const api = rt?.highlight;
        if (api && typeof api.highlightElements === 'function') {
          api.highlightElements(selected, {
            channel: data.channel,
            style: data.style,
            duration: data.duration,
            sticky: Boolean(data.sticky),
          });
          return {
            success: true,
            count: selected.length,
            rect: { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom },
            viewport,
            inViewport,
            mode: 'overlay',
            channel: data.channel,
          };
        }
      } catch {
        // fallback below
      }

      // fallback: element outline (not guaranteed in screenshots on some pages)
      const cleanups = selected.map((el) => {
        const originalOutline = (el as HTMLElement).style?.outline;
        const originalOutlineOffset = (el as HTMLElement).style?.outlineOffset;
        try {
          (el as HTMLElement).style.outline = data.style;
          (el as HTMLElement).style.outlineOffset = '2px';
        } catch {
          // ignore
        }
        return () => {
          try {
            (el as HTMLElement).style.outline = originalOutline;
            (el as HTMLElement).style.outlineOffset = originalOutlineOffset;
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
      if (data.duration > 0 && !data.sticky) {
        setTimeout(cleanup, data.duration);
      }
      return {
        success: true,
        count: selected.length,
        rect: { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom },
        viewport,
        inViewport,
        mode: 'outline',
      };
    },
    { selector: config.selector, style, duration, index, target, channel, sticky, visibleOnly },
  );
}

export const highlightOperation: OperationDefinition<HighlightConfig> = {
  id: 'highlight',
  description: 'Highlight element using outline',
  requiredCapabilities: ['highlight'],
  run: runHighlight,
};
