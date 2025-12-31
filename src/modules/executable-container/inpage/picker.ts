import { OverlayController } from './overlay-controller';
import { generateStableSelector, isSelectorUnique } from './selector-builder';
import { buildExecutableContainer } from './container-builder';
import { pageRegistry } from './registry';
import { resolveParentForElement } from './parent-resolver';
import { InlineMenu } from './menu';
import { containerTree } from './container-tree';
import { StartOptions, PickerPublicAPI } from './types';
import { PickerShield, ShieldEventPayload } from './picker-shield';

const overlay = new OverlayController();
const menu = new InlineMenu();
const pickerShield = new PickerShield();

class ExecutableContainerPicker implements PickerPublicAPI {
  private picking = false;
  private options: StartOptions = {};
  private hoverEl: Element | null = null;
  private longPressTimer: any = null;
  private pressStart = 0;
  private shieldController = pickerShield;

  get shield() {
    return this.shieldController;
  }

  start(options?: StartOptions) {
    if (this.picking) return;
    this.picking = true;
    this.options = { longPressMs: 600, minTargetSize: 10, ...(options || {}) };
    if (typeof window !== 'undefined') {
      this.shieldController.attach({
        onHover: this.onShieldHover,
        onPointerDown: this.onShieldPointerDown,
        onPointerUp: this.onShieldPointerUp,
        onClick: this.onShieldClick,
        onFrameBlocked: this.onShieldFrameBlocked,
      });
      window.addEventListener('keydown', this.onKey, true);
    }
    
    // 显示容器树
    if (this.options.showContainerTree !== false) {
      containerTree.show();
    }
    
    this.dispatch('picker:started', { options: this.options });
  }

  stop() {
    if (!this.picking) return;
    this.picking = false;
    this.clearLongPressTimer();
    if (typeof window !== 'undefined') {
      this.shieldController.detach();
      window.removeEventListener('keydown', this.onKey, true);
    }
    overlay.clear();
    menu.dispose();
    
    // 隐藏容器树
    containerTree.hide();
    
    this.dispatch('picker:stopped', {});
  }

  getState() {
    return { picking: this.picking, instances: pageRegistry.size() };
  }

  private onShieldHover = ({ target, event, frameElement }: ShieldEventPayload<PointerEvent>) => {
    if (!this.picking) return;
    const candidate = this.resolvePickTarget(target);
    if (candidate === this.hoverEl) return;
    this.hoverEl = candidate;
    if (!candidate) return;
    overlay.highlight(candidate, { color: this.options.highlight?.color || '#ff3b30', duration: 500, label: 'PICK', style: 'dashed' });
    this.emitShieldEvent('hover', {
      element: this.describeElement(candidate),
      pointer: { x: event.clientX, y: event.clientY },
      frame: this.getFrameMetadata(frameElement),
    });
  };

  private onShieldPointerDown = ({ target, event, frameElement }: ShieldEventPayload<PointerEvent>) => {
    if (!this.picking) return;
    if (event.button !== 0) return; // left only
    const candidate = this.resolvePickTarget(target);
    if (!candidate) return;
    this.hoverEl = candidate;
    this.pressStart = Date.now();
    this.clearLongPressTimer();
    const threshold = (this.options.longPressMs || 600) * (event.shiftKey ? 0.5 : 1);
    const commitTarget = candidate;
    this.longPressTimer = window.setTimeout(() => this.commitPick(commitTarget), threshold);
    this.emitShieldEvent('pointerdown', {
      element: this.describeElement(candidate),
      pointer: { x: event.clientX, y: event.clientY },
      modifiers: { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey },
      frame: this.getFrameMetadata(frameElement),
    });
  };

  private onShieldPointerUp = ({ event, frameElement }: ShieldEventPayload<PointerEvent>) => {
    if (!this.picking) return;
    this.clearLongPressTimer();
    this.emitShieldEvent('pointerup', {
      pointer: { x: event.clientX, y: event.clientY },
      frame: this.getFrameMetadata(frameElement),
    });
  };

  private onShieldClick = ({ target, event, frameElement }: ShieldEventPayload<MouseEvent>) => {
    // Click is already consumed by the shield; nothing else required.
    if (!this.picking) return;
    const candidate = this.resolvePickTarget(target);
    
    // Emit event first
    this.emitShieldEvent('blocked-click', {
      element: candidate ? this.describeElement(candidate) : null,
      pointer: { x: event.clientX, y: event.clientY },
      frame: this.getFrameMetadata(frameElement),
    });
    
    // If we have a candidate, treat click as a pick confirmation
    if (candidate) {
      // Change highlight to solid to indicate selection
      overlay.highlight(candidate, { 
        color: '#00C853', // Green for confirmed selection
        duration: 2000, 
        label: 'SELECTED',
        style: 'solid'
      });
      
      this.commitPick(candidate);
    }
  };

  private onShieldFrameBlocked = (frame: HTMLIFrameElement) => {
    this.emitShieldEvent('frame-blocked', {
      frame: {
        id: frame.id || null,
        name: frame.name || null,
        src: frame.getAttribute('src') || frame.src || null,
      },
    });
  };

  private clearLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private resolvePickTarget(target: Element | null): Element | null {
    if (!target) return null;
    const element = target as Element;
    const tagName = (element as any)?.tagName;
    if (!tagName) return null;
    const classList: DOMTokenList | undefined = (element as any)?.classList;
    if (classList?.contains?.('__webauto_picker_shield__')) {
      return null;
    }
    return element;
  }

  private describeElement(target: Element | null) {
    if (!target || !(target instanceof Element)) return null;
    const tag = target.tagName?.toLowerCase?.() || null;
    const summary: any = { tag };
    if (target instanceof HTMLElement) {
      summary.id = target.id || null;
      summary.classes = Array.from(target.classList || []);
      const text = target.innerText || target.textContent || '';
      summary.text = text.trim().slice(0, 200);
    }
    summary.selector = this.buildQuickSelector(target);
    return summary;
  }

  private buildQuickSelector(target: Element) {
    if (target instanceof HTMLElement && target.id) return `#${target.id}`;
    const tag = target.tagName?.toLowerCase?.();
    if (target instanceof HTMLElement) {
      const classes = Array.from(target.classList || []).filter(Boolean).slice(0, 3);
      if (classes.length) return `${tag || 'element'}.${classes.join('.')}`;
    }
    return tag || null;
  }

  private getFrameMetadata(frameElement: HTMLIFrameElement | null) {
    if (!frameElement) {
      return { type: 'top' };
    }
    return {
      type: 'iframe',
      id: frameElement.id || null,
      name: frameElement.name || null,
      src: frameElement.getAttribute('src') || frameElement.src || null,
    };
  }

  private emitShieldEvent(action: string, payload: Record<string, any> = {}) {
    this.dispatch('picker:shield', {
      action,
      ts: Date.now(),
      ...payload,
    });
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.stop();
    // 添加快捷键来切换容器树显示 (Ctrl+Shift+T)
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      containerTree.toggle();
    }
  };

  private commitPick(el: Element) {
    try {
      const selector = generateStableSelector(el);
      const unique = isSelectorUnique(selector);
      const def = buildExecutableContainer(selector, 'interactive', this.options.site);

      const parent = resolveParentForElement(el);
      const inst = pageRegistry.add(def, el, parent.parentInstanceId);

      // 更新容器树
      containerTree.update();

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
  window.__webautoPickerShield = pickerShield;
  
  // 暴露容器树API
  if (!window.__webautoContainerTree) {
    window.__webautoContainerTree = containerTree;
  }
}

export default api;
