export class OverlayController {
  private lastHighlightId: number | null = null;

  highlight(element: Element, opts: { color?: string; duration?: number; label?: string; style?: 'dashed' | 'solid' } = {}) {
    try {
      const color = opts.color || '#ff3b30';
      const duration = typeof opts.duration === 'number' ? opts.duration : 4000;
      const label = opts.label || 'PICK';
      const borderStyle = opts.style || 'dashed';
      if (window.__webautoHighlight && typeof window.__webautoHighlight.createHighlight === 'function') {
        this.lastHighlightId = window.__webautoHighlight.createHighlight(element, {
          color,
          duration,
          label,
          persist: false,
          scrollIntoView: false,
          alias: 'picker-hover',
          style: borderStyle
        });
      } else {
        // minimal fallback: outline only
        (element as HTMLElement).style.outline = `3px ${borderStyle} ${color}`;
        setTimeout(() => {
          try { (element as HTMLElement).style.outline = ''; } catch {}
        }, duration);
      }
    } catch {}
  }

  clear() {
    try {
      if (this.lastHighlightId && window.__webautoHighlight) {
        window.__webautoHighlight.removeHighlight(this.lastHighlightId);
        this.lastHighlightId = null;
      }
    } catch {}
  }
}
