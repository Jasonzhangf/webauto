export interface ViewportFilterOptions {
  selector: string;
  index?: number;
  visibleOnly?: boolean;
  fullyVisible?: boolean;
  anchor?: { x: number; y: number };
}

export interface ViewportFilterResult {
  element: Element | null;
  rect: DOMRect | null;
  fullyVisible: boolean;
  partiallyVisible: boolean;
  anchorMatch: boolean;
  clickPoint: { x: number; y: number } | null;
}

/**
 * Filter elements by viewport visibility with optional anchor verification.
 * Runs in browser context via page.evaluate().
 */
export function createViewportFilter() {
  return function viewportFilter(args: {
    selector: string;
    index: number;
    visibleOnly: boolean;
    fullyVisible: boolean;
    anchor: { x: number; y: number } | null;
  }): ViewportFilterResult {
    const { selector, index, visibleOnly, fullyVisible, anchor } = args;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Check if element is partially visible (intersects viewport)
    const isPartiallyVisible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < vh &&
        r.right > 0 &&
        r.left < vw
      );
    };

    // Check if element is fully visible within viewport
    const isFullyVisible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.top >= 0 &&
        r.left >= 0 &&
        r.bottom <= vh &&
        r.right <= vw
      );
    };

    const allNodes = Array.from(document.querySelectorAll(selector));
    const candidates = visibleOnly || fullyVisible
      ? allNodes.filter((n) => isPartiallyVisible(n as Element))
      : allNodes;

    const element = candidates[index] as Element | undefined;
    if (!element) {
      return {
        element: null,
        rect: null,
        fullyVisible: false,
        partiallyVisible: false,
        anchorMatch: false,
        clickPoint: null,
      };
    }

    const rect = element.getBoundingClientRect();
    const pVisible = isPartiallyVisible(element);
    const fVisible = isFullyVisible(element);

    // If fullyVisible is required but not met, return failure
    if (fullyVisible && !fVisible) {
      return {
        element,
        rect,
        fullyVisible: false,
        partiallyVisible: pVisible,
        anchorMatch: false,
        clickPoint: null,
      };
    }

    // Verify anchor if provided (must hit target element at anchor point)
    let anchorMatch = false;
    if (anchor && anchor.x >= 0 && anchor.y >= 0) {
      const hit = document.elementFromPoint(anchor.x, anchor.y);
      anchorMatch = hit !== null && (hit === element || element.contains(hit));
    }

    // Calculate safe click point within visible intersection
    const x1 = Math.max(0, rect.left);
    const y1 = Math.max(0, rect.top);
    const x2 = Math.min(vw, rect.right);
    const y2 = Math.min(vh, rect.bottom);

    let clickPoint: { x: number; y: number } | null = null;

    if (x1 < x2 && y1 < y2) {
      const pad = 10;
      const points = [
        { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) },
        { x: Math.round(x1 + pad), y: Math.round((y1 + y2) / 2) },
        { x: Math.round(x2 - pad), y: Math.round((y1 + y2) / 2) },
        { x: Math.round((x1 + x2) / 2), y: Math.round(y1 + pad) },
        { x: Math.round((x1 + x2) / 2), y: Math.round(y2 - pad) },
      ];

      for (const p of points) {
        if (p.x >= 0 && p.y >= 0 && p.x <= vw && p.y <= vh) {
          const hit = document.elementFromPoint(p.x, p.y);
          if (hit && (hit === element || element.contains(hit))) {
            clickPoint = p;
            break;
          }
        }
      }

      // Fallback to center even if elementFromPoint doesn't match
      if (!clickPoint) {
        clickPoint = { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
      }
    }

    return {
      element,
      rect,
      fullyVisible: fVisible,
      partiallyVisible: pVisible,
      anchorMatch,
      clickPoint,
    };
  };
}

export type ViewportFilterFn = ReturnType<typeof createViewportFilter>;
