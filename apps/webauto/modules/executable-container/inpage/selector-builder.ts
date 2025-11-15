function isLikelyHashClass(cls: string): boolean {
  return cls.length > 20 || /[A-Z0-9]{6,}/.test(cls);
}

function escapeCssIdent(part: string): string {
  return part.replace(/([:#.\[\],>+~ ])/g, '\\$1');
}

export function generateStableSelector(el: Element): string {
  if (!(el instanceof Element)) return '';
  const node = el as HTMLElement;

  if (node.getAttribute('data-testid')) return `[data-testid='${escapeCssIdent(node.getAttribute('data-testid')!)}']`;
  if (node.getAttribute('data-role')) return `[data-role='${escapeCssIdent(node.getAttribute('data-role')!)}']`;
  if (node.id && document.querySelectorAll(`#${escapeCssIdent(node.id)}`).length === 1) return `#${escapeCssIdent(node.id)}`;

  const classes = (node.className || '').toString().split(/\s+/).filter(Boolean).filter(c => !isLikelyHashClass(c));
  if (classes.length) {
    const sel = `${node.tagName.toLowerCase()}.${classes.map(escapeCssIdent).join('.')}`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }

  // fallback: build hierarchical selector with nth-of-type
  const parts: string[] = [];
  let current: Element | null = node;
  while (current && parts.length < 5) {
    const tag = current.tagName ? current.tagName.toLowerCase() : 'div';
    let part = tag;
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => (c as HTMLElement).tagName.toLowerCase() === tag);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    if (parent && parent.tagName && parent.tagName.toLowerCase() === 'body') break;
    current = parent;
  }

  const built = parts.join(' > ');
  return built || 'body';
}

export function isSelectorUnique(selector: string): boolean {
  if (!selector) return false;
  try { return document.querySelectorAll(selector).length === 1; } catch { return false; }
}

