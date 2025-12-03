import { ExecutableContainerDefinition } from './types';

export type MenuActionHandler = (opKey: string, def: ExecutableContainerDefinition) => void;

export class InlineMenu {
  private root: HTMLDivElement | null = null;
  private menuMinWidth = 150;
  private menuMaxWidth = 400;
  private menuMaxHeight = 500;

  showAt(element: Element, def: ExecutableContainerDefinition, onAction: MenuActionHandler) {
    this.dispose();
    const rect = (element as HTMLElement).getBoundingClientRect();
    const menu = this.createMenuElement(rect);
    
    // 添加菜单标题
    const title = this.createTitleElement(def);
    menu.appendChild(title);

    // 添加菜单操作选项
    const ops = def.runtime?.operations || [];
    
    // 如果没有操作，显示提示
    if (ops.length === 0) {
      const noOps = this.createNoOperationsElement();
      menu.appendChild(noOps);
    } else {
      // 创建操作按钮容器
      const opsContainer = this.createOperationsContainer(ops, def, onAction);
      menu.appendChild(opsContainer);
    }
    
    // 添加点击外部关闭菜单的事件
    this.setupCloseListener(menu);

    document.body.appendChild(menu);
    
    // 动态调整菜单大小和位置
    this.adjustMenuSizeAndPosition(menu, rect);
    
    this.root = menu;
  }

  private createMenuElement(rect: DOMRect): HTMLDivElement {
    const menu = document.createElement('div');
    
    // 计算菜单位置，确保完整显示
    let left = rect.left;
    let top = rect.bottom + 6;
    
    // 确保菜单不超出视口右侧（暂时使用最小宽度进行计算）
    if (left + this.menuMinWidth > window.innerWidth) {
      left = window.innerWidth - this.menuMinWidth - 10;
    }
    // 确保菜单不超出视口底部（后续会动态调整高度）
    
    // 确保菜单不超出视口左侧和顶部
    left = Math.max(6, left);
    top = Math.max(6, top);
    
    // 设置菜单样式
    menu.style.position = 'fixed';
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.background = 'rgba(30,30,30,0.95)';
    menu.style.color = '#fff';
    menu.style.padding = '8px 10px';
    menu.style.borderRadius = '6px';
    menu.style.fontSize = '12px';
    menu.style.zIndex = '2147483647';
    menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';
    menu.style.minWidth = `${this.menuMinWidth}px`;
    menu.style.maxWidth = `${this.menuMaxWidth}px`;
    menu.style.maxHeight = `${this.menuMaxHeight}px`;
    menu.style.overflow = 'visible'; // 初始设置为visible，后面会根据需要调整
    menu.style.whiteSpace = 'nowrap';
    menu.style.textOverflow = 'ellipsis';
    
    return menu;
  }

  private createTitleElement(def: ExecutableContainerDefinition): HTMLDivElement {
    const title = document.createElement('div');
    title.textContent = def.name || def.type || 'CONTAINER';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    title.style.paddingBottom = '6px';
    title.style.borderBottom = '1px solid rgba(255,255,255,0.2)';
    title.style.overflow = 'hidden';
    title.style.textOverflow = 'ellipsis';
    return title;
  }

  private createNoOperationsElement(): HTMLDivElement {
    const noOps = document.createElement('div');
    noOps.textContent = 'No operations available';
    noOps.style.color = 'rgba(255,255,255,0.6)';
    noOps.style.padding = '4px 0';
    return noOps;
  }

  private createOperationsContainer(ops: any[], def: ExecutableContainerDefinition, onAction: MenuActionHandler): HTMLDivElement {
    const opsContainer = document.createElement('div');
    opsContainer.style.display = 'flex';
    opsContainer.style.flexDirection = 'column';
    opsContainer.style.gap = '4px';
    
    ops.forEach(op => {
      const btn = this.createOperationButton(op, def, onAction);
      opsContainer.appendChild(btn);
    });
    
    return opsContainer;
  }

  private createOperationButton(op: any, def: ExecutableContainerDefinition, onAction: MenuActionHandler): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = op.label;
    btn.style.padding = '6px 10px';
    btn.style.border = 'none';
    btn.style.borderRadius = '4px';
    btn.style.background = 'rgba(255,255,255,0.1)';
    btn.style.color = '#fff';
    btn.style.fontSize = '12px';
    btn.style.cursor = 'pointer';
    btn.style.textAlign = 'left';
    btn.style.transition = 'background-color 0.2s';
    btn.style.overflow = 'hidden';
    btn.style.textOverflow = 'ellipsis';
    
    // 添加悬停效果
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255,255,255,0.2)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255,255,255,0.1)';
    });
    
    // 点击事件处理，纯粹的UI壳子，只负责传递事件
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 只负责将事件传递给外部处理，不执行任何操作逻辑
      onAction(op.key, def);
      this.dispose(); // 点击后关闭菜单
    };
    
    return btn;
  }

  private setupCloseListener(menu: HTMLDivElement): void {
    const closeMenu = (e: MouseEvent) => {
      if (menu.contains(e.target as Node) === false) {
        this.dispose();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }

  private adjustMenuSizeAndPosition(menu: HTMLDivElement, rect: DOMRect): void {
    // 让菜单先自然显示，获取其实际大小
    menu.style.width = 'auto';
    
    // 获取菜单的实际尺寸
    const menuRect = menu.getBoundingClientRect();
    
    // 计算新的位置和大小
    let left = parseFloat(menu.style.left);
    let top = parseFloat(menu.style.top);
    let width = menuRect.width;
    
    // 调整宽度，确保不超过最大宽度
    width = Math.min(width, this.menuMaxWidth);
    
    // 重新计算左侧位置，确保菜单不超出视口右侧
    if (left + width > window.innerWidth) {
      left = window.innerWidth - width - 10;
    }
    
    // 检查菜单位置是否需要翻转到元素上方
    if (top + menuRect.height > window.innerHeight) {
      top = rect.top - menuRect.height - 6;
      // 确保菜单不超出视口顶部
      if (top < 0) {
        top = 6;
        // 如果顶部不够空间，启用垂直滚动
        menu.style.overflowY = 'auto';
        menu.style.maxHeight = `${window.innerHeight - 12}px`;
      }
    }
    
    // 应用计算后的样式
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.width = `${width}px`;
  }

  dispose() {
    try {
      if (this.root) {
        this.root.remove();
      }
    } catch (error) {
      console.error('Failed to dispose menu:', error);
    } finally {
      this.root = null;
    }
  }
}

