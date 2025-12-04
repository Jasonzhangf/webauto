import { parseHTML } from 'linkedom';

export interface DomTreeNode {
  tag: string;
  id: string | null;
  classes: string[];
  textSnippet: string;
  children: DomTreeNode[];
  path: string;
}

export interface DomTreeOptions {
  html: string;
  selector?: string;
  maxDepth?: number;
  maxChildren?: number;
}

export function buildDomTree(options: DomTreeOptions): DomTreeNode | null {
  const { document } = parseHTML(options.html);
  const selector = options.selector || 'body';
  const maxDepth = options.maxDepth ?? 4;
  const maxChildren = options.maxChildren ?? 6;
  const root = selector === 'document' ? document.documentElement : document.querySelector(selector);
  if (!root) return null;
  const walk = (element: Element, depth: number, path: string): DomTreeNode => {
    const snippet = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const node: DomTreeNode = {
      tag: element.tagName || 'UNKNOWN',
      id: element.id || null,
      classes: Array.from(element.classList || []),
      textSnippet: snippet,
      children: [],
      path,
    };
    if (depth >= maxDepth) {
      return node;
    }
    const children = Array.from(element.children || []).slice(0, maxChildren);
    node.children = children.map((child, idx) => walk(child, depth + 1, `${path}/${idx}`));
    return node;
  };
  return walk(root as Element, 0, 'root');
}
