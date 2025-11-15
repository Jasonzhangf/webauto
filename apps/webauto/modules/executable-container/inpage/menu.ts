import { ExecutableContainerDefinition } from './types';

export type MenuActionHandler = (opKey: string, def: ExecutableContainerDefinition) => void;

export class InlineMenu {
  private root: HTMLDivElement | null = null;

  showAt(element: Element, def: ExecutableContainerDefinition, onAction: MenuActionHandler) {
    this.dispose();
    const rect = (element as HTMLElement).getBoundingClientRect();
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.left = `${Math.max(6, rect.left)}px`;
    menu.style.top = `${Math.max(6, rect.bottom + 6)}px`;
    menu.style.background = 'rgba(30,30,30,0.95)';
    menu.style.color = '#fff';
    menu.style.padding = '6px 8px';
    menu.style.borderRadius = '6px';
    menu.style.fontSize = '12px';
    menu.style.zIndex = '2147483647';
    menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';

    const title = document.createElement('div');
    title.textContent = def.name || def.type || 'CONTAINER';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '4px';
    menu.appendChild(title);

    const ops = def.runtime?.operations || [];
    ops.forEach(op => {
      const btn = document.createElement('button');
      btn.textContent = op.label;
      btn.style.marginRight = '6px';
      btn.style.marginBottom = '4px';
      btn.style.cursor = 'pointer';
      btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onAction(op.key, def); };
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    this.root = menu;
  }

  dispose() {
    try { this.root?.remove(); } catch {}
    this.root = null;
  }
}

