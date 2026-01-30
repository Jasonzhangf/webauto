export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & Record<string, any> = {},
  children: Array<HTMLElement | string> = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    // @ts-ignore
    el[k] = v;
  }
  for (const c of children) {
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

export function labeledInput(label: string, input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const wrap = createEl('div', { style: 'display:flex; flex-direction:column; gap:6px; min-width:220px;' });
  wrap.appendChild(createEl('label', {}, [label]));
  wrap.appendChild(input);
  return wrap;
}

export function section(title: string, children: HTMLElement[]) {
  const card = createEl('div', { className: 'card' });
  card.appendChild(createEl('div', { style: 'font-weight:700; margin-bottom:10px;' }, [title]));
  children.forEach((c) => card.appendChild(c));
  return card;
}

