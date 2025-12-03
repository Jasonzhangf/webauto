import { pageRegistry } from './registry';
import { ContainerInstance } from './types';

export class ContainerTree {
  private container: HTMLElement | null = null;
  private visible: boolean = false;

  constructor() {
    this.createContainer();
  }

  private createContainer(): void {
    // 创建容器树的主容器
    this.container = document.createElement('div');
    this.container.className = 'webauto-container-tree';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 350px;
      height: 600px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 16px;
      overflow-y: auto;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: none;
    `;

    // 创建标题栏
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e0e0e0;
    `;

    const title = document.createElement('h3');
    title.textContent = '容器树';
    title.style.margin = '0';
    title.style.fontSize = '16px';

    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.cssText = `
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    `;
    closeButton.onmouseover = () => closeButton.style.background = '#f0f0f0';
    closeButton.onmouseout = () => closeButton.style.background = 'none';
    closeButton.onclick = () => this.hide();

    header.appendChild(title);
    header.appendChild(closeButton);

    // 创建树容器
    const treeContainer = document.createElement('div');
    treeContainer.className = 'webauto-container-tree-items';
    treeContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    this.container.appendChild(header);
    this.container.appendChild(treeContainer);
    document.body.appendChild(this.container);
  }

  private buildTreeStructure(): Array<{ instance: ContainerInstance; depth: number }> {
    const instances = pageRegistry.list();
    const tree: Array<{ instance: ContainerInstance; depth: number }> = [];
    const instanceMap = new Map<string, ContainerInstance>();
    
    // 构建实例映射
    instances.forEach(inst => instanceMap.set(inst.instanceId, inst));
    
    // 递归构建树结构
    const buildBranch = (instance: ContainerInstance, depth: number): void => {
      tree.push({ instance, depth });
      
      // 处理子元素
      const children = instance.childrenIds?.map(childId => instanceMap.get(childId))
        .filter((child): child is ContainerInstance => child !== undefined);
      
      if (children && children.length > 0) {
        children.forEach(child => buildBranch(child, depth + 1));
      }
    };
    
    // 从根容器开始构建
    instances.forEach(inst => {
      if (!inst.parentId) { // 根容器没有父容器ID
        buildBranch(inst, 0);
      }
    });
    
    return tree;
  }

  private createTreeItem(instance: ContainerInstance, depth: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'webauto-container-tree-item';
    item.style.cssText = `
      display: flex;
      align-items: center;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.2s;
      margin-left: ${depth * 20}px;
    `;
    
    item.onmouseover = () => item.style.background = '#f5f5f5';
    item.onmouseout = () => item.style.background = 'none';
    
    // 容器图标
    const icon = document.createElement('span');
    icon.className = 'webauto-container-icon';
    icon.textContent = instance.definition?.type === 'container' ? '📦' : '🎯';
    icon.style.marginRight = '8px';
    
    // 容器名称/ID
    const name = document.createElement('span');
    name.className = 'webauto-container-name';
    name.textContent = instance.definition?.name || 
                      (instance.definition?.type || 'unknown') + ' - ' + 
                      instance.instanceId.substring(0, 8);
    name.style.flex = '1';
    name.style.fontSize = '12px';
    
    // 删除按钮
    const deleteButton = document.createElement('button');
    deleteButton.className = 'webauto-container-delete';
    deleteButton.textContent = '🗑️';
    deleteButton.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px;
      border-radius: 3px;
      display: none;
    `;
    
    deleteButton.onmouseover = (e) => {
      e.stopPropagation();
      deleteButton.style.background = '#ffebee';
    };
    
    deleteButton.onmouseout = (e) => {
      e.stopPropagation();
      deleteButton.style.background = 'none';
    };
    
    deleteButton.onclick = (e) => {
      e.stopPropagation();
      if (confirm('确定要删除此容器吗？')) {
        this.deleteContainer(instance);
        this.render();
      }
    };
    
    // 鼠标悬停时显示删除按钮
    item.onmouseenter = () => deleteButton.style.display = 'inline-block';
    item.onmouseleave = () => deleteButton.style.display = 'none';
    
    // 点击时高亮对应的元素
    item.onclick = () => {
      if (instance.element) {
        try {
          const rect = instance.element.getBoundingClientRect();
          // 添加临时高亮
          (instance.element as HTMLElement).style.outline = '3px solid #4CAF50';
          setTimeout(() => {
            try { (instance.element as HTMLElement).style.outline = ''; } catch {}
          }, 2000);
          // 滚动到视图中
          window.scrollTo({
            top: rect.top - 100,
            behavior: 'smooth'
          });
        } catch (e) {
          console.warn('无法高亮容器元素:', e);
        }
      }
    };
    
    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(deleteButton);
    
    return item;
  }

  private deleteContainer(instance: ContainerInstance): void {
    try {
      // 递归删除所有子容器
      const recursiveDelete = (instanceId: string): void => {
        const instance = pageRegistry.get(instanceId);
        if (!instance) return;
        
        // 先删除所有子容器
        if (instance.childrenIds && instance.childrenIds.length > 0) {
          // 创建子ID的副本，因为删除过程中childrenIds会改变
          const childIds = [...instance.childrenIds];
          childIds.forEach(childId => recursiveDelete(childId));
        }
        
        // 使用registry的remove方法删除实例
        pageRegistry.remove(instanceId);
        
        // 通知监听器子容器已删除
        this.dispatchContainerDeleted(instance);
      };
      
      recursiveDelete(instance.instanceId);
      
    } catch (e) {
      console.error('删除容器时出错:', e);
    }
  }

  private dispatchContainerDeleted(instance: ContainerInstance): void {
    try {
      if (typeof window.webauto_dispatch === 'function') {
        window.webauto_dispatch({
          ts: Date.now(),
          type: 'container:deleted',
          data: { containerId: instance.instanceId }
        });
      }
      window.dispatchEvent(new CustomEvent('webauto:container:deleted', {
        detail: { containerId: instance.instanceId }
      }));
    } catch (e) {
      console.error('分发容器删除事件时出错:', e);
    }
  }

  render(): void {
    if (!this.container) return;
    
    const treeContainer = this.container.querySelector('.webauto-container-tree-items');
    if (!treeContainer) return;
    
    // 清空现有内容
    treeContainer.innerHTML = '';
    
    // 构建并渲染树结构
    const treeStructure = this.buildTreeStructure();
    
    if (treeStructure.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = '暂无容器';
      emptyMessage.style.cssText = `
        text-align: center;
        color: #999;
        padding: 20px;
        font-size: 14px;
      `;
      treeContainer.appendChild(emptyMessage);
    } else {
      treeStructure.forEach(({ instance, depth }) => {
        const item = this.createTreeItem(instance, depth);
        treeContainer.appendChild(item);
      });
    }
  }

  show(): void {
    if (!this.container) return;
    this.container.style.display = 'block';
    this.visible = true;
    this.render();
  }

  hide(): void {
    if (!this.container) return;
    this.container.style.display = 'none';
    this.visible = false;
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  update(): void {
    this.render();
  }

  dispose(): void {
    if (this.container) {
      document.body.removeChild(this.container);
      this.container = null;
    }
  }
}

// 创建全局实例
export const containerTree = new ContainerTree();
