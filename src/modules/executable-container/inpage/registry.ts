import { ContainerInstance, ExecutableContainerDefinition } from './types';

export class PageContainerRegistry {
  private instances = new Map<string, ContainerInstance>();

  add(def: ExecutableContainerDefinition, element: Element | null, parentId?: string | null) {
    const id = `inst_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const inst: ContainerInstance = {
      instanceId: id,
      definition: def,
      element,
      selector: def.selector,
      type: def.type,
      parentId: parentId || null,
      childrenIds: [],
      createdAt: Date.now(),
    };
    this.instances.set(id, inst);
    if (parentId && this.instances.has(parentId)) {
      const p = this.instances.get(parentId)!;
      p.childrenIds = p.childrenIds || [];
      p.childrenIds.push(id);
    }
    return inst;
  }

  findByElement(el: Element): ContainerInstance | null {
    for (const inst of this.instances.values()) {
      if (inst.element === el) return inst;
    }
    return null;
  }

  findNearestParentByElement(el: Element): ContainerInstance | null {
    let cur: Element | null = el.parentElement;
    while (cur) {
      const found = this.findByElement(cur);
      if (found) return found;
      cur = cur.parentElement;
    }
    return null;
  }

  get(id: string) { return this.instances.get(id) || null; }
  list() { return Array.from(this.instances.values()); }
  size() { return this.instances.size; }
  
  // 移除容器实例
  remove(id: string): boolean {
    if (!this.instances.has(id)) return false;
    
    // 获取要移除的实例
    const instance = this.instances.get(id)!;
    
    // 从父容器的childrenIds中移除
    if (instance.parentId && this.instances.has(instance.parentId)) {
      const parent = this.instances.get(instance.parentId)!;
      if (parent.childrenIds) {
        parent.childrenIds = parent.childrenIds.filter(childId => childId !== id);
      }
    }
    
    // 移除实例本身
    return this.instances.delete(id);
  }
}

export const pageRegistry = new PageContainerRegistry();

