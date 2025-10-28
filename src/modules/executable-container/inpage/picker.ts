import { OverlayController } from './overlay-controller';
import { generateStableSelector, isSelectorUnique } from './selector-builder';
import { buildExecutableContainer } from './container-builder';
import { pageRegistry } from './registry';
import { resolveParentForElement } from './parent-resolver';
import { InlineMenu } from './menu';
import { StartOptions, PickerPublicAPI } from './types';

const overlay = new OverlayController();
const menu = new InlineMenu();

class ExecutableContainerPicker implements PickerPublicAPI {
  private picking = false;
  private options: StartOptions = {};
  private hoverEl: Element | null = null;
  private longPressTimer: any = null;
  private pressStart = 0;

  start(options?: StartOptions) {
    if (this.picking) return;
    this.picking = true;
    this.options = { longPressMs: 600, minTargetSize: 10, ...(options || {}) };
    window.addEventListener('mousemove', this.onMove, true);
    window.addEventListener('mousedown', this.onDown, true);
    window.addEventListener('mouseup', this.onUp, true);
    window.addEventListener('keydown', this.onKey, true);
    this.dispatch('picker:started', { options: this.options });
  }

  stop() {
    if (!this.picking) return;
    this.picking = false;
    window.removeEventListener('mousemove', this.onMove, true);
    window.removeEventListener('mousedown', this.onDown, true);
    window.removeEventListener('mouseup', this.onUp, true);
    window.removeEventListener('keydown', this.onKey, true);
    overlay.clear();
    menu.dispose();
    this.dispatch('picker:stopped', {});
  }

  getState() {
    return { picking: this.picking, instances: pageRegistry.size() };
  }

  private onMove = (e: MouseEvent) => {
    if (!this.picking) return;
    const target = e.composedPath()[0] as Element | null;
    if (!target || !(target instanceof Element)) return;
    if (this.hoverEl === target) return;
    this.hoverEl = target;
    overlay.highlight(target, { color: this.options.highlight?.color || '#ff3b30', duration: 500, label: 'PICK' });
  };

  private onDown = (e: MouseEvent) => {
    if (!this.picking) return;
    if (e.button !== 0) return; // left only
    if (!this.hoverEl) return;
    this.pressStart = Date.now();
    const threshold = (this.options.longPressMs || 600) * (e.shiftKey ? 0.5 : 1);
    this.longPressTimer = setTimeout(() => this.commitPick(this.hoverEl!), threshold);
  };

  private onUp = (_e: MouseEvent) => {
    if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.stop();
  };

  private commitPick(el: Element) {
    try {
      const selector = generateStableSelector(el);
      const unique = isSelectorUnique(selector);
      const def = buildExecutableContainer(selector, 'interactive', this.options.site);

      const parent = resolveParentForElement(el);
      const inst = pageRegistry.add(def, el, parent.parentInstanceId);

      // menu actions → dispatch to node bridge
      menu.showAt(el, def, (opKey) => {
        this.dispatch('menu:action:selected', { key: opKey, containerId: inst.instanceId, selector, definition: def });
      });

      this.dispatch('container:created', {
        selector,
        unique,
        parentInstanceId: parent.parentInstanceId,
        createdPlaceholders: parent.createdPlaceholders,
        definition: def,
      });
    } catch (err) {
      this.dispatch('error', { message: (err as Error)?.message || String(err) });
    }
  }

  private dispatch(type: string, data: any) {
    try {
      if (typeof window.webauto_dispatch === 'function') {
        window.webauto_dispatch({ ts: Date.now(), type, data });
      }
      window.dispatchEvent(new CustomEvent(`webauto:${type}`, { detail: data }));
    } catch {}
  }
}

const api = new ExecutableContainerPicker();
if (typeof window !== 'undefined') {
  // expose api once
  if (!window.__webautoPicker) window.__webautoPicker = api;
}

export default api;
