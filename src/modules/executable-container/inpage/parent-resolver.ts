import { pageRegistry } from './registry';

export interface ParentResolveResult {
  parentInstanceId: string | null;
  createdPlaceholders: string[]; // instanceIds
}

function elementAncestors(el: Element): Element[] {
  const arr: Element[] = [];
  let cur: Element | null = el.parentElement;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    arr.push(cur);
    cur = cur.parentElement;
  }
  // add body as potential root
  if (document.body) arr.push(document.body);
  return arr.reverse(); // root -> ... -> near
}

export function resolveParentForElement(el: Element): ParentResolveResult {
  // 1) if registry already has a parent in DOM chain, use it directly
  const existingParent = pageRegistry.findNearestParentByElement(el);
  if (existingParent) {
    return { parentInstanceId: existingParent.instanceId, createdPlaceholders: [] };
  }

  // 2) try to build placeholder chain using window.__containerIndex
  const created: string[] = [];
  try {
    const idx = (window as any).__containerIndex;
    const defs = Array.isArray(idx?.containers) ? idx.containers : [];
    if (defs.length === 0) return { parentInstanceId: null, createdPlaceholders: [] };

    const ancestors = elementAncestors(el); // root..near
    let lastParentId: string | null = null;

    for (const anc of ancestors) {
      // find matching definitions whose selector matches this ancestor exactly
      const matches = defs.filter((d: any) => typeof d?.selector === 'string' && (() => { try { return anc.matches(d.selector); } catch { return false; } })());
      if (!matches.length) continue;

      // pick the first match (heuristic: index order approximates priority)
      const picked = matches[0];

      // create a placeholder instance if not already in registry for this element
      const already = pageRegistry.findByElement(anc);
      if (already) {
        lastParentId = already.instanceId;
        continue;
      }

      const placeholderDef = {
        selector: picked.selector,
        type: 'container',
        website: idx?.website,
        name: picked.id || 'parent',
        priority: 998,
        validation: { selectorValid: true, lastValidation: new Date().toISOString() },
        discovery: { strategy: 'picker-index', waitForElements: false },
        metadata: { discoveredAt: Date.now(), discoveryStrategy: 'picker-index' },
        runtime: { events: [], operations: [], flags: { placeholder: true } },
      } as any;

      const inst = pageRegistry.add(placeholderDef, anc, lastParentId);
      created.push(inst.instanceId);
      lastParentId = inst.instanceId;
    }

    return { parentInstanceId: created.length ? created[created.length - 1] : null, createdPlaceholders: created };
  } catch {
    // 3) fallback: no index or error
    return { parentInstanceId: null, createdPlaceholders: [] };
  }
}
