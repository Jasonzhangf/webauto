/**
 * Container 管理器 - 管理捕获的容器数据
 */
export interface ContainerMetadata {
  tagName: string;
  rect: { left: number; top: number; width: number; height: number };
  textContent: string;
  className: string;
  id: string;
}

export interface ContainerOperation {
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface ContainerMessageMapping {
  message: string;
  operations: string[];
}

export interface Container {
  id: string;
  name: string;
  selector: string;
  parentId?: string;
  children: string[];
  operations: ContainerOperation[];
  messages: ContainerMessageMapping[];
  metadata: ContainerMetadata;
}

export class ContainerManager {
  private containers: Map<string, Container> = new Map();

  /**
   * 添加容器
   */
  addContainer(container: Container): void {
    this.containers.set(container.id, container);
  }

  /**
   * 更新容器
   */
  updateContainer(id: string, updates: Partial<Container>): void {
    const existing = this.containers.get(id);
    if (!existing) return;

    this.containers.set(id, { ...existing, ...updates });
  }

  /**
   * 删除容器
   */
  deleteContainer(id: string): void {
    this.containers.delete(id);

    // 删除父子关系
    for (const container of this.containers.values()) {
      container.children = container.children.filter(childId => childId !== id);
      if (container.parentId === id) {
        container.parentId = undefined;
      }
    }
  }

  /**
   * 获取容器
   */
  getContainer(id: string): Container | undefined {
    return this.containers.get(id);
  }

  /**
   * 获取所有容器
   */
  getAllContainers(): Container[] {
    return Array.from(this.containers.values());
  }

  /**
   * 构建容器层级关系
   */
  buildHierarchy(): Container[] {
    const roots: Container[] = [];

    // Clear existing parent/children
    for (const container of this.containers.values()) {
      container.children = [];
    }

    // Build hierarchy based on selector nesting
    const containers = Array.from(this.containers.values());
    for (const container of containers) {
      let parent: Container | undefined;

      // Find closest parent by selector inclusion
      for (const candidate of containers) {
        if (container === candidate) continue;
        if (container.selector.startsWith(candidate.selector)) {
          if (!parent || candidate.selector.length > parent.selector.length) {
            parent = candidate;
          }
        }
      }

      if (parent) {
        container.parentId = parent.id;
        parent.children.push(container.id);
      } else {
        roots.push(container);
      }
    }

    return roots;
  }

  /**
   * 导出为 JSON
   */
  exportToJSON(): string {
    return JSON.stringify(this.getAllContainers(), null, 2);
  }

  /**
   * 从 JSON 导入
   */
  importFromJSON(json: string): void {
    const containers = JSON.parse(json) as Container[];
    this.containers.clear();
    containers.forEach(container => this.addContainer(container));
  }
}
