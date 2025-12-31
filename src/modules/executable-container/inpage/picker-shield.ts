export interface ShieldEventPayload<T extends Event> {
  target: Element | null;
  event: T;
  frameWindow: Window;
  frameElement: HTMLIFrameElement | null;
}

type ShieldCallback<T extends Event> = (payload: ShieldEventPayload<T>) => void;

export interface PickerShieldCallbacks {
  onHover?: ShieldCallback<PointerEvent>;
  onPointerDown?: ShieldCallback<PointerEvent>;
  onPointerUp?: ShieldCallback<PointerEvent>;
  onClick?: ShieldCallback<MouseEvent>;
  onFrameBlocked?: (frame: HTMLIFrameElement) => void;
}

interface ShieldInstanceBindings {
  pointerMove: (e: PointerEvent) => void;
  pointerDown: (e: PointerEvent) => void;
  pointerUp: (e: PointerEvent) => void;
  click: (e: MouseEvent) => void;
  contextMenu: (e: MouseEvent) => void;
}

class ShieldInstance {
  private layer: HTMLDivElement | null = null;
  private bindings: ShieldInstanceBindings | null = null;

  constructor(
    private frameWindow: Window,
    private callbacks: PickerShieldCallbacks,
    private frameElement: HTMLIFrameElement | null,
  ) {}

  mount() {
    const doc = this.getDocument();
    if (!doc) return;
    if (this.layer) {
      if (doc.contains(this.layer)) return;
      this.unbindEvents();
      this.layer = null;
    }

    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', () => this.createLayer(doc), { once: true });
    } else {
      this.createLayer(doc);
    }
  }

  destroy() {
    this.unbindEvents();
    if (this.layer && this.layer.parentNode) {
      this.layer.parentNode.removeChild(this.layer);
    }
    this.layer = null;
  }

  private getDocument(): Document | null {
    try {
      return this.frameWindow.document;
    } catch {
      return null;
    }
  }

  private createLayer(doc: Document) {
    const host = doc.body || doc.documentElement;
    if (!host) return;

    this.layer = doc.createElement('div');
    this.layer.className = '__webauto_picker_shield__';
    const style = this.layer.style;
    style.setProperty('position', 'fixed', 'important');
    style.setProperty('inset', '0', 'important');
    style.setProperty('width', '100vw', 'important');
    style.setProperty('height', '100vh', 'important');
    style.setProperty('z-index', '2147483646', 'important');
    style.setProperty('pointer-events', 'auto', 'important');
    style.setProperty('background', 'transparent', 'important');
    style.setProperty('cursor', 'crosshair', 'important');
    style.setProperty('touch-action', 'none', 'important');
    style.setProperty('user-select', 'none', 'important');
    style.setProperty('contain', 'strict', 'important');
    host.appendChild(this.layer);
    this.bindEvents();
  }

  private bindEvents() {
    const win = this.frameWindow;
    const pointerMove = (e: PointerEvent) => {
      this.consumeEvent(e);
      const target = this.resolveTarget(e);
      this.callbacks.onHover?.({ target, event: e, frameWindow: this.frameWindow, frameElement: this.frameElement });
    };

    const pointerDown = (e: PointerEvent) => {
      this.consumeEvent(e);
      const target = this.resolveTarget(e);
      this.callbacks.onPointerDown?.({ target, event: e, frameWindow: this.frameWindow, frameElement: this.frameElement });
    };

    const pointerUp = (e: PointerEvent) => {
      this.consumeEvent(e);
      const target = this.resolveTarget(e);
      this.callbacks.onPointerUp?.({ target, event: e, frameWindow: this.frameWindow, frameElement: this.frameElement });
    };

    const click = (e: MouseEvent) => {
      this.consumeEvent(e);
      const target = this.resolveTarget(e as unknown as PointerEvent);
      this.callbacks.onClick?.({ target, event: e, frameWindow: this.frameWindow, frameElement: this.frameElement });
    };

    const contextMenu = (e: MouseEvent) => {
      this.consumeEvent(e);
    };

    win.addEventListener('pointermove', pointerMove, true);
    win.addEventListener('pointerdown', pointerDown, true);
    win.addEventListener('pointerup', pointerUp, true);
    win.addEventListener('pointercancel', pointerUp, true);
    win.addEventListener('click', click, true);
    win.addEventListener('contextmenu', contextMenu, true);

    this.bindings = { pointerMove, pointerDown, pointerUp, click, contextMenu };
  }

  private unbindEvents() {
    if (!this.bindings) {
      this.bindings = null;
      return;
    }
    const { pointerMove, pointerDown, pointerUp, click, contextMenu } = this.bindings;
    const win = this.frameWindow;
    win.removeEventListener('pointermove', pointerMove, true);
    win.removeEventListener('pointerdown', pointerDown, true);
    win.removeEventListener('pointerup', pointerUp, true);
    win.removeEventListener('pointercancel', pointerUp, true);
    win.removeEventListener('click', click, true);
    win.removeEventListener('contextmenu', contextMenu, true);
    this.bindings = null;
  }

  private consumeEvent(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof (e as any).stopImmediatePropagation === 'function') {
      (e as any).stopImmediatePropagation();
    }
  }

  private resolveTarget(e: Event): Element | null {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const elementCtor = this.getElementCtor();
    for (const node of path) {
      const isElement = elementCtor && node instanceof elementCtor;
      if (isElement && !this.isShieldElement(node as Element)) return node as Element;
    }
    const target = this.isDOMElement(e.target) ? (e.target as Element) : null;
    if (target && !this.isShieldElement(target)) return target;
    const alt = this.elementFromPointSafely(e as PointerEvent);
    if (alt && !this.isShieldElement(alt)) return alt;
    return null;
  }

  private isShieldElement(el: Element): boolean {
    return el instanceof this.getHTMLElementCtor() && el.classList.contains('__webauto_picker_shield__');
  }

  private isDOMElement(node: any): node is Element {
    const ctor = this.getElementCtor();
    return typeof ctor === 'function' && node instanceof ctor;
  }

  private getElementCtor(): typeof Element | null {
    try {
      return this.frameWindow.Element;
    } catch {
      return typeof Element !== 'undefined' ? Element : null;
    }
  }

  private getHTMLElementCtor(): typeof HTMLElement {
    try {
      return this.frameWindow.HTMLElement;
    } catch {
      return HTMLElement;
    }
  }

  private elementFromPointSafely(e: PointerEvent): Element | null {
    const doc = this.getDocument();
    if (!doc) return null;
    const originalDisplay = this.layer?.style.display;
    if (this.layer) {
      this.layer.style.display = 'none';
    }
    let result: Element | null = null;
    try {
      const candidate = doc.elementFromPoint(e.clientX, e.clientY);
      if (this.isDOMElement(candidate)) {
        result = candidate as Element;
      }
    } catch {
      result = null;
    } finally {
      if (this.layer) {
        this.layer.style.display = originalDisplay || '';
      }
    }
    return result;
  }
}

export class PickerShield {
  private callbacks: PickerShieldCallbacks | null = null;
  private instances = new Map<Window, ShieldInstance>();
  private observers = new Map<Window, MutationObserver>();
  private frameLoadListeners = new Map<HTMLIFrameElement, () => void>();

  attach(callbacks: PickerShieldCallbacks) {
    this.detach();
    this.callbacks = callbacks;
    this.attachToWindow(window, null);
  }

  detach() {
    this.instances.forEach((instance) => instance.destroy());
    this.instances.clear();
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
    this.frameLoadListeners.forEach((fn, frame) => frame.removeEventListener('load', fn));
    this.frameLoadListeners.clear();
    this.callbacks = null;
  }

  private attachToWindow(targetWindow: Window, frameElement: HTMLIFrameElement | null) {
    if (this.instances.has(targetWindow)) return;
    if (!this.callbacks) return;
    const instance = new ShieldInstance(targetWindow, this.callbacks, frameElement || null);
    this.instances.set(targetWindow, instance);
    instance.mount();
    this.observeFrames(targetWindow);
  }

  private observeFrames(targetWindow: Window) {
    const doc = this.getDocumentSafe(targetWindow);
    if (!doc) return;
    const observer = new MutationObserver(() => this.scanFrames(targetWindow));
    observer.observe(doc.documentElement || doc, { childList: true, subtree: true });
    this.observers.set(targetWindow, observer);
    this.scanFrames(targetWindow);
  }

  private scanFrames(targetWindow: Window) {
    const doc = this.getDocumentSafe(targetWindow);
    if (!doc) return;
    const frames = Array.from(doc.querySelectorAll('iframe')) as HTMLIFrameElement[];
    for (const frame of frames) {
      this.tryAttachFrame(frame);
    }
  }

  private tryAttachFrame(frame: HTMLIFrameElement) {
    if (!frame || !frame.contentWindow) return;
    const childWindow = frame.contentWindow;
    if (this.instances.has(childWindow)) {
      this.instances.get(childWindow)?.mount();
      return;
    }
    try {
      void childWindow.document;
    } catch {
      this.markFrameUnavailable(frame);
      return;
    }
    this.attachToWindow(childWindow, frame);
    frame.dataset.__webautoPickerAttached = 'true';
    const reloadHandler = () => this.tryAttachFrame(frame);
    frame.addEventListener('load', reloadHandler);
    this.frameLoadListeners.set(frame, reloadHandler);
  }

  private markFrameUnavailable(frame: HTMLIFrameElement) {
    frame.dataset.__webautoPickerBlocked = 'true';
    if (this.callbacks?.onFrameBlocked) {
      try {
        this.callbacks.onFrameBlocked(frame);
      } catch {}
    }
  }

  private getDocumentSafe(targetWindow: Window): Document | null {
    try {
      return targetWindow.document;
    } catch {
      return null;
    }
  }
}

declare global {
  interface Window {
    __webautoPickerShield?: PickerShield;
  }
}
