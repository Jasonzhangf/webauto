function asBoolLiteral(value) {
  return value ? 'true' : 'false';
}

export function buildSelectorScrollIntoViewScript({ selector, highlight }) {
  const selectorLiteral = JSON.stringify(selector);
  const highlightLiteral = asBoolLiteral(highlight);
  return `(async () => {
    const el = document.querySelector(${selectorLiteral});
    if (!el) throw new Error('Element not found: ' + ${selectorLiteral});
    const restoreOutline = el instanceof HTMLElement ? el.style.outline : '';
    if (${highlightLiteral} && el instanceof HTMLElement) {
      el.style.outline = '2px solid #ff4d4f';
    }
    el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    await new Promise((r) => setTimeout(r, 120));
    if (${highlightLiteral} && el instanceof HTMLElement) {
      el.style.outline = restoreOutline;
    }
    return { ok: true, selector: ${selectorLiteral} };
  })()`;
}

export function buildSelectorClickScript({ selector, highlight }) {
  const selectorLiteral = JSON.stringify(selector);
  const highlightLiteral = asBoolLiteral(highlight);
  return `(async () => {
    const el = document.querySelector(${selectorLiteral});
    if (!el) throw new Error('Element not found: ' + ${selectorLiteral});
    const restoreOutline = el instanceof HTMLElement ? el.style.outline : '';
    if (${highlightLiteral} && el instanceof HTMLElement) {
      el.style.outline = '2px solid #ff4d4f';
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise((r) => setTimeout(r, 150));
    if (el instanceof HTMLElement) {
      try { el.focus({ preventScroll: true }); } catch {}
      const common = { bubbles: true, cancelable: true, view: window };
      try {
        if (typeof PointerEvent === 'function') {
          el.dispatchEvent(new PointerEvent('pointerdown', { ...common, pointerType: 'mouse', button: 0 }));
          el.dispatchEvent(new PointerEvent('pointerup', { ...common, pointerType: 'mouse', button: 0 }));
        }
      } catch {}
      try { el.dispatchEvent(new MouseEvent('mousedown', { ...common, button: 0 })); } catch {}
      try { el.dispatchEvent(new MouseEvent('mouseup', { ...common, button: 0 })); } catch {}
    }
    if (typeof el.click === 'function') el.click();
    else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 }));
    if (${highlightLiteral} && el instanceof HTMLElement) {
      setTimeout(() => { el.style.outline = restoreOutline; }, 260);
    }
    return { ok: true, selector: ${selectorLiteral}, action: 'click', highlight: ${highlightLiteral} };
  })()`;
}

export function buildSelectorTypeScript({ selector, highlight, text }) {
  const selectorLiteral = JSON.stringify(selector);
  const highlightLiteral = asBoolLiteral(highlight);
  const textLiteral = JSON.stringify(String(text || ''));
  const textLength = String(text || '').length;

  return `(async () => {
    const el = document.querySelector(${selectorLiteral});
    if (!el) throw new Error('Element not found: ' + ${selectorLiteral});
    const restoreOutline = el instanceof HTMLElement ? el.style.outline : '';
    if (${highlightLiteral} && el instanceof HTMLElement) {
      el.style.outline = '2px solid #ff4d4f';
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise((r) => setTimeout(r, 150));
    if (el instanceof HTMLElement) {
      try { el.focus({ preventScroll: true }); } catch {}
      if (typeof el.click === 'function') el.click();
    }
    const value = ${textLiteral};
    const fireInputEvent = (target, name, init) => {
      try {
        if (typeof InputEvent === 'function') {
          target.dispatchEvent(new InputEvent(name, init));
          return;
        }
      } catch {}
      target.dispatchEvent(new Event(name, { bubbles: true, cancelable: init?.cancelable === true }));
    };
    const assignControlValue = (target, next) => {
      if (target instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(target, next);
        else target.value = next;
        if (typeof target.setSelectionRange === 'function') {
          const cursor = String(next).length;
          try { target.setSelectionRange(cursor, cursor); } catch {}
        }
        return true;
      }
      if (target instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) setter.call(target, next);
        else target.value = next;
        if (typeof target.setSelectionRange === 'function') {
          const cursor = String(next).length;
          try { target.setSelectionRange(cursor, cursor); } catch {}
        }
        return true;
      }
      return false;
    };
    const editableAssigned = assignControlValue(el, value);
    if (!editableAssigned) {
      if (el instanceof HTMLElement && el.isContentEditable) {
        el.textContent = value;
      } else {
        throw new Error('Element not editable: ' + ${selectorLiteral});
      }
    }
    fireInputEvent(el, 'beforeinput', {
      bubbles: true,
      cancelable: true,
      data: value,
      inputType: 'insertText',
    });
    fireInputEvent(el, 'input', {
      bubbles: true,
      cancelable: false,
      data: value,
      inputType: 'insertText',
    });
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (${highlightLiteral} && el instanceof HTMLElement) {
      setTimeout(() => { el.style.outline = restoreOutline; }, 260);
    }
    return { ok: true, selector: ${selectorLiteral}, action: 'type', length: ${textLength}, highlight: ${highlightLiteral} };
  })()`;
}
