/**
 * 容器匹配器模块
 */

import { PROFILE } from '../env.mjs';
import { controllerAction } from '../browser/commands.mjs';

export async function getContainerTree() {
  return controllerAction('containers:match', { profile: PROFILE });
}

function walk(node, predicate) {
  if (!node) return null;
  if (predicate(node)) return node;
  const children = node.children || node.container?.children || [];
  for (const child of children) {
    const found = walk(child, predicate);
    if (found) return found;
  }
  return null;
}

export async function findContainer(pattern) {
  const tree = await getContainerTree();
  const target = String(pattern || '').toLowerCase();
  return walk(tree, (node) => {
    const id = node?.container?.id || node?.id || '';
    return id.toLowerCase().includes(target);
  });
}

export async function verifyContainerExists(containerId) {
  try {
    await controllerAction('container:operation', {
      containerId,
      operationId: 'highlight',
      config: { style: '2px solid #44ff44', duration: 200 },
      sessionId: PROFILE,
    });
    return true;
  } catch {
    return false;
  }
}

