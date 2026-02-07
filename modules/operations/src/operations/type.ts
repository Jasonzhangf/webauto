import type { OperationContext, OperationDefinition } from '../registry.js';

export interface TypeConfig {
  selector?: string;
  text: string;
  submit?: boolean;
  clear_first?: boolean;
  human_typing?: boolean;
  pause_after?: number;
  index?: number;
  anchor?: { x: number; y: number };
  fullyVisible?: boolean;
}

async function runType(ctx: OperationContext, config: TypeConfig) {
  const selector = typeof config.selector === 'string' ? config.selector.trim() : '';
  if (!selector) {
    return { success: false, error: 'selector required for type operation' };
  }

  const index = Number.isFinite(config.index) ? Math.max(0, Math.floor(config.index as number)) : 0;
  const keyboard = ctx.page.keyboard;
  const fullyVisible = config.fullyVisible !== false;
  const anchor = config.anchor ?? null;

  if (!ctx.systemInput?.mouseClick) {
    return { success: false, error: 'system mouse not available' };
  }
  if (!keyboard || typeof keyboard.type !== 'function') {
    return { success: false, error: 'keyboard type not available' };
  }

  type ClickableRect = { x1: number; y1: number; x2: number; y2: number; visible: boolean; fullyVisible: boolean; anchorMatch: boolean };
  type ClickPoint = { x: number; y: number };
  type TargetInfo = ClickableRect & { clickPoints: ClickPoint[] };

  const getClickableRect = async (): Promise<TargetInfo | null> =>
    ctx.page.evaluate(({ sel, idx, fVisible, anchorPoint }) => {
      const isVisible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      };

      const isFullyVisible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
      };

      const nodes = Array.from(document.querySelectorAll(sel));
      const candidates = nodes.filter((n) => isVisible(n as Element));
      const root = candidates[idx] as Element | undefined;
      if (!root) return null;

      const focusEl =
        root instanceof HTMLInputElement ||
        root instanceof HTMLTextAreaElement ||
        (root instanceof HTMLElement && root.isContentEditable)
          ? root
          : (root.querySelector('input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"]') as Element | null) ||
            root;
      const r = focusEl.getBoundingClientRect();
      const visible = isVisible(focusEl);
      const fVisibleCheck = isFullyVisible(focusEl);

      if (!visible) return { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom, visible: false, fullyVisible: false, anchorMatch: false, clickPoints: [] };
      if (fVisible && !fVisible) return { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom, visible, fullyVisible: false, anchorMatch: false, clickPoints: [] };

      let anchorMatch = true;
      if (anchorPoint) {
        const hit = document.elementFromPoint(anchorPoint.x, anchorPoint.y);
        anchorMatch = hit !== null && (hit === focusEl || focusEl.contains(hit));
        if (!anchorMatch) return { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom, visible, fullyVisible: fVisibleCheck, anchorMatch: false, clickPoints: [] };
      }

      const midY = Math.round((r.top + r.bottom) / 2);
      const points = [
        { x: Math.round((r.left + r.right) / 2), y: midY },
        { x: Math.round(r.left + 8), y: midY },
        { x: Math.round(r.right - 8), y: midY },
      ];
      const clickPoints: Array<{ x: number; y: number }> = [];
      for (const p of points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        const hit = document.elementFromPoint(p.x, p.y);
        if (hit && (hit === focusEl || focusEl.contains(hit))) {
          clickPoints.push(p);
        }
      }
      if (!clickPoints.length) clickPoints.push(points[0]!);
      return { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom, visible, fullyVisible: fVisibleCheck, anchorMatch, clickPoints };
    }, { sel: selector, idx: index, fVisible: fullyVisible, anchorPoint: anchor });

  const getTextLen = async (): Promise<number | null> =>
    ctx.page.evaluate(({ sel, idx }) => {
      const nodes = Array.from(document.querySelectorAll(sel));
      const root = nodes[idx] as Element | undefined;
      if (!root) return null;
      const focusEl =
        root instanceof HTMLInputElement ||
        root instanceof HTMLTextAreaElement ||
        (root instanceof HTMLElement && root.isContentEditable)
          ? root
          : (root.querySelector('input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"]') as Element | null) ||
            root;
      if (focusEl instanceof HTMLInputElement || focusEl instanceof HTMLTextAreaElement) return focusEl.value.length;
      if (focusEl instanceof HTMLElement && focusEl.isContentEditable) return (focusEl.textContent || '').trim().length;
      return (focusEl.textContent || '').trim().length;
    }, { sel: selector, idx: index });

  const isFocused = async (): Promise<boolean> =>
    ctx.page.evaluate(({ sel, idx }) => {
      const nodes = Array.from(document.querySelectorAll(sel));
      const root = nodes[idx] as Element | undefined;
      if (!root) return false;
      const active = document.activeElement;
      if (!active) return false;
      if (!(active instanceof Element)) return false;
      return root === active || root.contains(active);
    }, { sel: selector, idx: index });

  // 1) 定位目标元素（只读）并系统点击聚焦
  const rect = await getClickableRect();

  if (!rect || !rect.visible) {
    return { success: false, error: 'element not visible' };
  }
  if (fullyVisible && !rect.fullyVisible) {
    return { success: false, error: 'element not fully visible in viewport' };
  }
  if (anchor && !rect.anchorMatch) {
    return { success: false, error: 'anchor point does not hit target element' };
  }

  let focused = false;
  for (const p of rect.clickPoints) {
    await ctx.systemInput.mouseClick(p.x, p.y);
    await new Promise((r) => setTimeout(r, 160));
    try {
      focused = await isFocused();
    } catch {
      focused = false;
    }
    if (focused) break;
  }
  if (!focused) {
    return { success: false, error: 'unable to focus element' };
  }

  // 2) 清空（系统级：全选 + 删除）
  if (config.clear_first && typeof keyboard.press === 'function') {
    // 先尽量把光标落到末尾，避免某些站点的输入框未自动聚焦导致清空失败
    await keyboard.press('End').catch(() => {});
    await new Promise((r) => setTimeout(r, 80));
    // macOS 用 Meta+A；其他平台用 Control+A（macOS 的 Control+A 会把光标移到行首，反而破坏全选）
    const isMac = process.platform === 'darwin';
    if (isMac) {
      await keyboard.press('Meta+A').catch(() => {});
    } else {
      await keyboard.press('Control+A').catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 80));
    await keyboard.press('Backspace').catch(() => {});
    await keyboard.press('Delete').catch(() => {});
    await new Promise((r) => setTimeout(r, 120));

    // 兜底：如果仍未清空，使用有限次 Backspace 清空（系统级）
    let len: number | null = null;
    try {
      len = await getTextLen();
    } catch {
      len = null;
    }
    if (typeof len === 'number' && len > 0) {
      await keyboard.press('End').catch(() => {});
      const maxBackspace = Math.min(80, len + 10);
      for (let i = 0; i < maxBackspace; i += 1) {
        await keyboard.press('Backspace').catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  // 3) 系统级输入
  const delay = config.human_typing ? 80 : 0;
  await keyboard.type(String(config.text ?? ''), { delay });

  // 4) 提交（可选）
  if (config.submit && typeof keyboard.press === 'function') {
    await new Promise((r) => setTimeout(r, 200));
    await keyboard.press('Enter');
  }

  if (config.pause_after) {
    await new Promise((r) => setTimeout(r, config.pause_after));
  }

  return { success: true };
}

export const typeOperation: OperationDefinition<TypeConfig> = {
  id: 'type',
  description: 'Type text into input element',
  requiredCapabilities: ['input'],
  run: runType,
};
