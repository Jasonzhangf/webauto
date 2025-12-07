export type NodeType = 'container' | 'dom';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  parentId: string | null;
  depth: number;
  selector?: string;
  metadata?: Record<string, any>;
  expanded?: boolean;
  childCount?: number;
  hasLazyChildren?: boolean;
  loading?: boolean;
}

export interface GraphLink {
  from: string;
  to: string;
}

export interface GraphStore {
  nodes: Map<string, GraphNode>;
  children: Map<string, Set<string>>;
  links: GraphLink[];
}

export function createGraphStore(): GraphStore {
  return {
    nodes: new Map(),
    children: new Map(),
    links: [],
  };
}

export function addNodes(store: GraphStore, nodes: GraphNode[]) {
  nodes.forEach((node) => {
    store.nodes.set(node.id, { ...node });
    if (node.parentId) {
      if (!store.children.has(node.parentId)) {
        store.children.set(node.parentId, new Set());
      }
      store.children.get(node.parentId)?.add(node.id);
    }
  });
}

export function setLinks(store: GraphStore, links: GraphLink[]) {
  store.links = links.slice();
}

export function updateNode(store: GraphStore, nodeId: string, patch: Partial<GraphNode>) {
  const target = store.nodes.get(nodeId);
  if (!target) return;
  store.nodes.set(nodeId, { ...target, ...patch });
}

export function getChildren(store: GraphStore, nodeId: string): GraphNode[] {
  const ids = store.children.get(nodeId);
  if (!ids) return [];
  return Array.from(ids)
    .map((id) => store.nodes.get(id))
    .filter(Boolean) as GraphNode[];
}

export function markExpanded(store: GraphStore, nodeId: string, expanded: boolean) {
  updateNode(store, nodeId, { expanded });
}

export function markLoading(store: GraphStore, nodeId: string, loading: boolean) {
  updateNode(store, nodeId, { loading });
}
