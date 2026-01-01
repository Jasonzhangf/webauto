// 回环测试：验证在不同父子关系下，虚拟子容器能够正确接管 DOM 匹配，
// 并通过 computeContainerDomConnections 得到正确的「容器 → DOM」连线。

import { addVirtualChildContainerPure } from '../src/renderer/graph/virtual-children.mts';
import { computeContainerDomConnections } from '../src/renderer/graph/matcher.mts';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function logScenario(name) {
  console.log('\n=== 场景:', name, '===');
}

function makeSimpleDomTree() {
  // root
  //  ├─ root/0
  //  └─ root/1
  return {
    path: 'root',
    children: [
      { path: 'root/0', children: [] },
      { path: 'root/1', children: [] },
    ],
  };
}

function findVirtualChild(containerRoot, parentId) {
  const parent = (function find(node) {
    if (!node) return null;
    if (node.id === parentId || node.name === parentId) return node;
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = find(child);
        if (found) return found;
      }
    }
    return null;
  })(containerRoot);

  if (!parent || !Array.isArray(parent.children)) return null;
  return parent.children.find(
    (c) => c && c.metadata && c.metadata.isVirtual && c.metadata.suggestedDomPath,
  );
}

function getConnectionsByContainer(connections, id) {
  return connections.filter((c) => c.containerId === id).map((c) => c.domPath);
}

// 场景 1：父容器没有子容器，只有一条 match，对应 domPath = root/1
async function scenarioParentOnlySingleMatch() {
  logScenario('父容器单一 match，无子容器');
  const domTree = makeSimpleDomTree();
  const containerTree = {
    id: 'parent',
    name: '父容器',
    match: {
      nodes: [{ dom_path: 'root/1' }],
    },
    children: [],
  };

  const before = computeContainerDomConnections(containerTree, domTree);
  console.log('[before] connections:', before);
  assert(
    getConnectionsByContainer(before, 'parent').includes('root/1'),
    '父容器在变更前应连到 root/1',
  );

  addVirtualChildContainerPure(containerTree, {
    parentId: 'parent',
    domPath: 'root/1',
    selector: null,
    name: '虚拟子容器',
  });

  const virtual = findVirtualChild(containerTree, 'parent');
  assert(virtual, '应当找到虚拟子容器');

  const after = computeContainerDomConnections(containerTree, domTree);
  console.log('[after] connections:', after);

  const parentPaths = getConnectionsByContainer(after, 'parent');
  const childPaths = getConnectionsByContainer(after, virtual.id);

  assert(
    !parentPaths.includes('root/1'),
    '父容器在变更后不应再连到 root/1（应由子容器接管）',
  );
  assert(
    childPaths.includes('root/1'),
    '虚拟子容器应当接管 root/1 的连线',
  );

  console.log('✅ 场景 1 通过');
}

// 场景 2：父容器有两个 match（root/0, root/1），新增子容器只接管 root/1
async function scenarioParentMultipleMatches() {
  logScenario('父容器多个 match，部分由子容器接管');
  const domTree = makeSimpleDomTree();
  const containerTree = {
    id: 'parent',
    name: '父容器',
    match: {
      nodes: [{ dom_path: 'root/0' }, { dom_path: 'root/1' }],
    },
    children: [],
  };

  const before = computeContainerDomConnections(containerTree, domTree);
  console.log('[before] connections:', before);
  assert(
    getConnectionsByContainer(before, 'parent').length === 2,
    '父容器在变更前应连到 root/0 与 root/1',
  );

  addVirtualChildContainerPure(containerTree, {
    parentId: 'parent',
    domPath: 'root/1',
    selector: null,
    name: '虚拟子容器',
  });

  const virtual = findVirtualChild(containerTree, 'parent');
  assert(virtual, '应当找到虚拟子容器');

  const after = computeContainerDomConnections(containerTree, domTree);
  console.log('[after] connections:', after);

  const parentPaths = getConnectionsByContainer(after, 'parent');
  const childPaths = getConnectionsByContainer(after, virtual.id);

  assert(
    parentPaths.includes('root/0') && !parentPaths.includes('root/1'),
    '父容器应保留 root/0 连线，root/1 的连线应由子容器接管',
  );
  assert(
    childPaths.includes('root/1'),
    '虚拟子容器应当接管 root/1 的连线',
  );

  console.log('✅ 场景 2 通过');
}

// 场景 3：父容器已有一个真实子容器，新虚拟子容器加入后仍应正确接管 domPath
async function scenarioParentWithExistingChild() {
  logScenario('父容器已有真实子容器，再添加虚拟子容器');
  const domTree = makeSimpleDomTree();
  const containerTree = {
    id: 'parent',
    name: '父容器',
    match: {
      nodes: [{ dom_path: 'root/1' }],
    },
    children: [
      {
        id: 'existing-child',
        name: '已有子容器',
        match: { nodes: [] },
        children: [],
      },
    ],
  };

  const before = computeContainerDomConnections(containerTree, domTree);
  console.log('[before] connections:', before);
  assert(
    getConnectionsByContainer(before, 'parent').includes('root/1'),
    '父容器在变更前应连到 root/1',
  );

  addVirtualChildContainerPure(containerTree, {
    parentId: 'parent',
    domPath: 'root/1',
    selector: null,
    name: '虚拟子容器',
  });

  const virtual = findVirtualChild(containerTree, 'parent');
  assert(virtual, '应当找到虚拟子容器');

  const after = computeContainerDomConnections(containerTree, domTree);
  console.log('[after] connections:', after);

  const parentPaths = getConnectionsByContainer(after, 'parent');
  const virtualPaths = getConnectionsByContainer(after, virtual.id);
  const existingChildPaths = getConnectionsByContainer(after, 'existing-child');

  assert(
    !parentPaths.includes('root/1'),
    '父容器在变更后不应再连到 root/1（应由子容器接管）',
  );
  assert(
    virtualPaths.includes('root/1'),
    '虚拟子容器应当接管 root/1 的连线',
  );
  assert(
    existingChildPaths.length === 0,
    '已有子容器不应意外获得任何连线',
  );

  console.log('✅ 场景 3 通过');
}

// 场景 4：父容器 match 在祖先节点，新 domPath 为更深的后代
async function scenarioAncestorMatch() {
  logScenario('父容器 match 在祖先节点，新 domPath 为后代');
  const domTree = {
    path: 'root',
    children: [
      {
        path: 'root/1',
        children: [{ path: 'root/1/0', children: [] }],
      },
    ],
  };
  const containerTree = {
    id: 'parent',
    name: '父容器',
    match: {
      nodes: [{ dom_path: 'root/1' }],
    },
    children: [],
  };

  const before = computeContainerDomConnections(containerTree, domTree);
  console.log('[before] connections:', before);
  assert(
    getConnectionsByContainer(before, 'parent').includes('root/1'),
    '父容器在变更前应连到 root/1',
  );

  addVirtualChildContainerPure(containerTree, {
    parentId: 'parent',
    domPath: 'root/1/0',
    selector: null,
    name: '虚拟子容器',
  });

  const virtual = findVirtualChild(containerTree, 'parent');
  assert(virtual, '应当找到虚拟子容器');

  const after = computeContainerDomConnections(containerTree, domTree);
  console.log('[after] connections:', after);

  const parentPaths = getConnectionsByContainer(after, 'parent');
  const virtualPaths = getConnectionsByContainer(after, virtual.id);

  assert(
    parentPaths.includes('root/1'),
    '父容器应继续连到祖先节点 root/1',
  );
  assert(
    virtualPaths.includes('root/1/0'),
    '虚拟子容器应当连到更深的后代节点 root/1/0',
  );

  console.log('✅ 场景 4 通过');
}

// 场景 5：父容器 match 在更深后代，新 domPath 在祖先节点
async function scenarioDescendantMatch() {
  logScenario('父容器 match 在更深后代，新 domPath 为祖先');
  const domTree = {
    path: 'root',
    children: [
      {
        path: 'root/1',
        children: [{ path: 'root/1/0', children: [] }],
      },
    ],
  };
  const containerTree = {
    id: 'parent',
    name: '父容器',
    match: {
      nodes: [{ dom_path: 'root/1/0' }],
    },
    children: [],
  };

  const before = computeContainerDomConnections(containerTree, domTree);
  console.log('[before] connections:', before);
  assert(
    getConnectionsByContainer(before, 'parent').includes('root/1/0'),
    '父容器在变更前应连到 root/1/0',
  );

  addVirtualChildContainerPure(containerTree, {
    parentId: 'parent',
    domPath: 'root/1',
    selector: null,
    name: '虚拟子容器',
  });

  const virtual = findVirtualChild(containerTree, 'parent');
  assert(virtual, '应当找到虚拟子容器');

  const after = computeContainerDomConnections(containerTree, domTree);
  console.log('[after] connections:', after);

  const parentPaths = getConnectionsByContainer(after, 'parent');
  const virtualPaths = getConnectionsByContainer(after, virtual.id);

  assert(
    parentPaths.includes('root/1/0'),
    '父容器应继续连到原有的后代节点 root/1/0',
  );
  assert(
    virtualPaths.includes('root/1'),
    '虚拟子容器应当连到新的祖先节点 root/1',
  );

  console.log('✅ 场景 5 通过');
}

// 场景 6：domPath 不存在于 DOM 树中，虚拟子容器接管 match 但不会产生连线
async function scenarioMissingDomPath() {
  logScenario('domPath 不存在于 DOM 树中');
  const domTree = makeSimpleDomTree(); // 只有 root/0, root/1
  const containerTree = {
    id: 'parent',
    name: '父容器',
    match: {
      nodes: [{ dom_path: 'root/2' }], // 不存在的路径
    },
    children: [],
  };

  const before = computeContainerDomConnections(containerTree, domTree);
  console.log('[before] connections:', before);
  assert(
    getConnectionsByContainer(before, 'parent').length === 0,
    '由于 DOM 中不存在 root/2，父容器在变更前不应有连线',
  );

  addVirtualChildContainerPure(containerTree, {
    parentId: 'parent',
    domPath: 'root/2',
    selector: null,
    name: '虚拟子容器',
  });

  const virtual = findVirtualChild(containerTree, 'parent');
  assert(virtual, '应当找到虚拟子容器');

  const after = computeContainerDomConnections(containerTree, domTree);
  console.log('[after] connections:', after);

  const parentPaths = getConnectionsByContainer(after, 'parent');
  const virtualPaths = getConnectionsByContainer(after, virtual.id);

  assert(
    parentPaths.length === 0 && virtualPaths.length === 0,
    '由于 DOM 中不存在 root/2，父容器与虚拟子容器都不应有连线',
  );

  console.log('✅ 场景 6 通过');
}

// 场景 7：多次添加虚拟子容器，只有最新一次接管当前 domPath
async function scenarioMultipleVirtualChildren() {
  logScenario('多次添加虚拟子容器，仅保留最新一次');
  const domTree = makeSimpleDomTree();
  const containerTree = {
    id: 'parent',
    name: '父容器',
    match: {
      nodes: [{ dom_path: 'root/1' }],
    },
    children: [],
  };

  // 第一次添加
  addVirtualChildContainerPure(containerTree, {
    parentId: 'parent',
    domPath: 'root/1',
    selector: null,
    name: '虚拟子容器 A',
  });
  const virtualA = findVirtualChild(containerTree, 'parent');
  assert(virtualA, '应当找到第一次的虚拟子容器');

  // 第二次添加（应替换第一次）
  addVirtualChildContainerPure(containerTree, {
    parentId: 'parent',
    domPath: 'root/1',
    selector: null,
    name: '虚拟子容器 B',
  });
  const virtualB = findVirtualChild(containerTree, 'parent');
  assert(virtualB, '应当找到第二次的虚拟子容器');
  assert(
    virtualB.name === '虚拟子容器 B',
    '父容器下应只保留最新的虚拟子容器',
  );

  const after = computeContainerDomConnections(containerTree, domTree);
  console.log('[after] connections:', after);

  const parentPaths = getConnectionsByContainer(after, 'parent');
  const virtualPaths = getConnectionsByContainer(after, virtualB.id);

  assert(
    !parentPaths.includes('root/1'),
    '父容器不应再连到 root/1（应由最新的虚拟子容器接管）',
  );
  assert(
    virtualPaths.includes('root/1'),
    '最新的虚拟子容器应当接管 root/1 的连线',
  );

  console.log('✅ 场景 7 通过');
}

async function main() {
  console.log('=== 容器-DOM 匹配回环测试开始 ===');
  await scenarioParentOnlySingleMatch();
  await scenarioParentMultipleMatches();
  await scenarioParentWithExistingChild();
  await scenarioAncestorMatch();
  await scenarioDescendantMatch();
   await scenarioMissingDomPath();
   await scenarioMultipleVirtualChildren();
  console.log('\n✅ 所有场景通过');
}

main().catch((err) => {
  console.error('❌ 回环测试失败:', err);
  process.exitCode = 1;
});
