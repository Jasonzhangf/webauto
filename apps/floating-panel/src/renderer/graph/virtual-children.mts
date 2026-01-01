import { findDomNodeByPath } from './dom-helpers.mts';

interface VirtualChildParams {
  parentId: string;
  domPath: string;
  selector?: string | null;
  name?: string | null;
}

function findContainerById(node: any, targetId: string | null): any | null {
  if (!node || !targetId) return null;
  if (node.id === targetId || node.name === targetId) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findContainerById(child, targetId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 纯逻辑版本：在给定的容器树中，为指定父容器挂载一个“虚拟子容器”，
 * 并将与 domPath 强相关的 match 节点从父容器迁移到子容器上。
 *
 * 该函数会直接在传入的 containerRoot 上做原地修改，返回新建子容器的 id。
 */
export function addVirtualChildContainerPure(
  containerRoot: any,
  params: VirtualChildParams,
): { childId: string | null } {
  const { parentId, domPath, selector, name } = params;
  if (!containerRoot || !parentId || !domPath) {
    return { childId: null };
  }

  const parent = findContainerById(containerRoot, parentId);
  if (!parent) {
    return { childId: null };
  }

  if (!Array.isArray(parent.children)) {
    parent.children = [];
  }

  // 清理已有的虚拟子容器（同一个父节点只保留一个“待定”子容器）
  parent.children = parent.children.filter(
    (child: any) => !(child && child.metadata && child.metadata.isVirtual),
  );

  const childId = `${parentId}.virtual_${Date.now().toString(36)}`;

  // 新语义：父容器保留自己的 match，不再“转移”原有连线；
  // 虚拟子容器直接绑定到本次拾取得到的 domPath，
  // 这样新连线只会从子容器出发，父容器的既有连线保持不变。
  const virtualNode: any = {
    id: childId,
    name: name || '自动子容器（待定）',
    type: 'virtual',
    capabilities: [],
    metadata: {
      isVirtual: true,
      parentId,
      suggestedDomPath: domPath,
      selector: selector || null,
    },
    selectors: selector ? [{ css: selector, variant: 'primary', score: 1 }] : [],
    match: {
      nodes: [
        {
          dom_path: domPath,
          selector: selector || null,
        },
      ],
    },
    children: [],
  };

  // 如果 DOM 树中无法找到该路径，则保留节点但后续不会画出连线
  //（computeContainerDomConnections 会做二次校验）。
  if (!findDomNodeByPath as any) {
    // 占位以确保打包时 tree-shaking 不移除依赖
  }

  parent.children.push(virtualNode);

  return { childId };
}
