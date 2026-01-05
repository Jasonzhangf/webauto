import { logger } from './logger.mts';
import { findDomNodeByPath, findNearestExistingPath, mergeDomBranch as mergeDomBranchImpl } from './graph/dom-helpers.mts';
import { expandPathToNode as expandPathToNodeImpl, findNearestContainer as findNearestContainerImpl } from './graph/container-helpers.mts';
import { addVirtualChildContainerPure } from './graph/virtual-children.mts';
import { renderGraph as renderGraphView } from './graph/view.mts';

let canvas = null;
let containerData = null;
let domData = null;
const expandedNodes = new Set();
let isDraggingGraph = false;
let dragStart = { x: 0, y: 0 };
let graphOffset = { x: 0, y: 0 };
let graphScale = 1;
let selectedContainer = null;
let selectedDom = null;
const domNodePositions = new Map();

// 暴露给全局调试环境，避免 DevTools Live Expression
// 或第三方脚本直接访问 domNodePositions 时抛出 ReferenceError
try {
  if (typeof window !== 'undefined') {
    window.domNodePositions = domNodePositions;
    if (typeof globalThis !== 'undefined') {
      globalThis.domNodePositions = domNodePositions;
    }
  }
} catch {}

const containerNodePositions = new Map();
const selectorMap = new Map();
const pendingDomPathPreloads = new Map();
const loadingState = { pending: 0 };
const domPathLoadTasks = new Map();

// 按需拉取 DOM 分支所需的状态
const loadedPaths = new Set(['root']); // 初始只有 root 被加载
let currentProfile = null;
let currentUrl = null;
let isLoadingBranch = false;
let currentRootSelector = null;
let suggestedNode = null; // { parentId, domPath, selector, name }

let renderScheduled = false;

function updateRootTransform() {
  if (!canvas) return;
  const root = canvas.firstElementChild;
  if (!root || root.tagName !== 'g') return;
  root.setAttribute(
    'transform',
    `translate(${graphOffset.x + 10}, ${graphOffset.y + 10}) scale(${graphScale})`,
  );
}

function generateChildContainerId(parentId, name) {
  const safeParent = (parentId && String(parentId).trim()) || 'container';
  let slug = '';
  if (typeof name === 'string' && name.trim()) {
    slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
  if (!slug) {
    slug = 'child';
  }
  const suffix = Date.now().toString(36);
  return `${safeParent}.${slug}_${suffix}`;
}

async function persistVirtualChildContainer({ parentId, childId, domPath, selector, name }) {
  try {
    const api = window.api;
    if (!api || typeof api.invokeAction !== 'function') {
      logger.warn('create-child', 'window.api.invokeAction not available');
      return;
    }
    if (!currentProfile || !currentUrl) {
      logger.warn('create-child', 'Missing profile/url, skip persist', {
        profile: currentProfile,
        url: currentUrl,
      });
      return;
    }

    let domMeta = null;
    try {
      const node = findDomNodeByPath(domData, domPath);
      if (node) {
        domMeta = {
          tag: node.tag,
          id: node.id,
          classes: Array.isArray(node.classes) ? [...node.classes] : [],
          textSnippet: node.textSnippet || '',
        };
      }
    } catch {}

    let selectorToUse = null;
    if (typeof selector === 'string' && selector.trim()) {
      selectorToUse = selector.trim();
    } else if (domMeta?.id) {
      selectorToUse = `#${domMeta.id}`;
    } else if (domMeta?.classes && domMeta.classes.length) {
      selectorToUse = `.${domMeta.classes[0]}`;
    }

    if (!selectorToUse) {
      logger.warn('create-child', 'Cannot determine selector for new child', {
        parentId,
        domPath,
      });
      return;
    }

    const alias = typeof name === 'string' && name.trim() ? name.trim() : '';

    logger.info('create-child', 'Persisting new child container', {
      parentId,
      childId,
      domPath,
      selector: selectorToUse,
      alias,
    });

    await api.invokeAction('containers:create-child', {
      profile: currentProfile,
      url: currentUrl,
      parentId,
      containerId: childId,
      selector: selectorToUse,
      domPath,
      domMeta,
      alias,
      rootSelector: currentRootSelector || null,
    });
  } catch (err) {
    logger.error('create-child', 'Failed to persist child container', err);
  }
}

function addVirtualChildContainer({ parentId, domPath, selector, name }) {
  if (!containerData || !parentId || !domPath) return;

  const childId = generateChildContainerId(parentId, name);

  const { childId: createdId } = addVirtualChildContainerPure(containerData, {
    parentId,
    domPath,
    selector,
    name,
    childId,
  });

  const effectiveChildId = createdId || childId;

    // 展开父节点与虚拟子节点
  const parentNode = parentId;
  if (parentNode) {
    expandedNodes.add(parentNode);
  }
  if (effectiveChildId) {
    expandedNodes.add(effectiveChildId);
    // 自动选中新创建的子容器
    selectedContainer = effectiveChildId;
  }

  // 清理候选高亮，转入“虚拟子容器”状态
  suggestedNode = null;
  renderGraph();

  // 触发选中事件，通知 UI 面板更新
  if (effectiveChildId) {
    // 构造一个临时的容器对象用于立即显示
    const tempContainer = {
      id: effectiveChildId,
      name: name || 'container_child',
      type: 'section',
      children: [],
      operations: [], // 空操作列表
      match: {
        nodes: [{ dom_path: domPath, selector: selector }]
      }
    };
    
    try {
      window.dispatchEvent(
        new CustomEvent('webauto:container-selected', {
          detail: {
            containerId: effectiveChildId,
            container: tempContainer,
          },
        }),
      );
    } catch (err) {
      logger.error('create-child', 'Failed to dispatch container-selected', err);
    }
  }

  // 后台持久化到容器库（~/.webauto/container-lib），由服务层完成 containers:match 刷新。
  persistVirtualChildContainer({
    parentId,
    childId: effectiveChildId,
    domPath,
    selector,
    name,
  }).catch((err) => {
    logger.error('create-child', 'Persist child container rejected', err);
  });
}

// 监听来自 view 层的“确认添加子容器”事件，在本地构建虚拟容器树
try {
  if (typeof window !== 'undefined') {
    window.addEventListener('webauto:container-confirm-add', (evt) => {
      const detail = (evt && evt.detail) || {};
      addVirtualChildContainer(detail);
    });
  }
} catch {}

function requestGraphRender(reason = 'auto') {
  if (!canvas) return;
  if (renderScheduled) return;
  renderScheduled = true;

  setTimeout(() => {
    renderScheduled = false;
    try {
      if (window.DEBUG === '1') {
        console.log('[graph-render] scheduled renderGraph, reason:', reason);
      }
      renderGraph();
    } catch (err) {
      logger.error('graph-render', 'Scheduled renderGraph failed', err);
    }
  }, 0);
}

function emitGraphStatus(status = {}) {
  const detail = {
    ts: Date.now(),
    ...status,
  };

  try {
    window.dispatchEvent(new CustomEvent('webauto:graph-status', { detail }));
  } catch {}

  try {
    const api = window.api;
    if (api && typeof api.debugLog === 'function') {
      api.debugLog('floating-panel-graph', 'status', detail).catch(() => {});
    }
  } catch {}

  if (window.DEBUG === '1') {
    console.log('[graph-status]', detail);
  }
}

function updateLoadingState(delta, meta = {}) {
  loadingState.pending = Math.max(0, loadingState.pending + delta);
  const base = {
    pending: loadingState.pending,
    ts: Date.now(),
    ...meta,
  };
  try {
    window.dispatchEvent(new CustomEvent('webauto:graph-loading', { detail: base }));
  } catch {}

  const phase =
    meta.action === 'error'
      ? 'error'
      : loadingState.pending > 0
      ? 'loading'
      : 'idle';
  emitGraphStatus({ ...base, phase });

  if (window.DEBUG === '1') {
    console.log('[graph-loading]', base);
  }
}

export function updatePageContext(metadata = {}) {
  if (metadata.profile) {
    currentProfile = metadata.profile;
  }
  if (metadata.page_url || metadata.url) {
    currentUrl = metadata.page_url || metadata.url;
  }
  if (metadata.root_selector) {
    currentRootSelector = metadata.root_selector;
  }
}

// 统一处理 containers.matched 快照：
// 1) 覆盖容器树/DOM 树
// 2) 自动展开匹配到的容器/DOM 路径
// 3) 触发按需 DOM 预拉取
// 4) 最终统一重绘一次图
export async function applyMatchSnapshot(snapshot, context = {}) {
  if (!snapshot || !snapshot.container_tree) return;

  emitGraphStatus({
    phase: 'snapshot:start',
    reason: 'containers.matched',
    hasContainerTree: !!snapshot.container_tree,
    hasDomTree: !!snapshot.dom_tree,
  });

  const profile = context.profile || currentProfile || null;
  const url = context.url || currentUrl || null;
  const rootSelector =
    context.rootSelector ||
    snapshot?.metadata?.root_selector ||
    null;

  updatePageContext({
    profile,
    page_url: url,
    root_selector: rootSelector,
  });

  // 覆盖基础数据
  containerData = snapshot.container_tree || null;
  domData = snapshot.dom_tree || null;

  // 重置绘制相关状态
  domNodePositions.clear();
  containerNodePositions.clear();
  loadedPaths.clear();
  loadedPaths.add('root');

  // 重置交互状态，避免旧选中/建议节点干扰新树
  selectedContainer = null;
  selectedDom = null;
  suggestedNode = null;

  // 重新计算展开的容器节点（根 + 递归展开）
  expandedNodes.clear();
  if (containerData && (containerData.id || containerData.name)) {
    const rootId = containerData.id || containerData.name || 'root';
    expandedNodes.add(rootId);
    expandMatchedContainers(containerData);
  }

  // 收集所有匹配到 DOM 的路径
  const matchedDomPaths = new Set();
  function collectMatchedPaths(node) {
    if (!node || typeof node !== 'object') return;

    let hasExplicitMatch = false;
    if (node.match && Array.isArray(node.match.nodes) && node.match.nodes.length > 0) {
      node.match.nodes.forEach((m) => {
        if (m && m.dom_path) {
          matchedDomPaths.add(m.dom_path);
          hasExplicitMatch = true;
        }
      });
    }

    // 新增逻辑：如果没有显式 match.nodes，
    // 则尝试使用 metadata 中的 suggestedDomPath / source_dom_path 作为预拉取路径
    if (!hasExplicitMatch) {
      const metadata = (node && typeof node === 'object' && node.metadata) || {};
      const suggestedDomPath =
        (metadata && (metadata.suggestedDomPath || metadata.source_dom_path)) || null;
      if (typeof suggestedDomPath === 'string' && suggestedDomPath) {
        matchedDomPaths.add(suggestedDomPath);
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => collectMatchedPaths(child));
    }
  }
  if (containerData) {
    collectMatchedPaths(containerData);
  }

  emitGraphStatus({
    phase: 'snapshot:paths',
    matchedDomPathCount: matchedDomPaths.size,
  });

  // 先标记需要展开的 DOM 路径，并启动预拉取
  if (matchedDomPaths.size > 0) {
    matchedDomPaths.forEach((p) => expandDomPath(p));
    // 启动异步预拉取（不阻塞）
    preloadDomPaths(matchedDomPaths, 'containers.matched');
  }

  // 覆盖 DOM 树（延迟渲染，等待关键路径预拉取完成后再统一绘制）
  updateDomTree(
    snapshot.dom_tree,
    { profile, page_url: url, root_selector: rootSelector },
    { deferRender: true },
  );

  // 等待关键路径加载完成后，再统一重绘
  if (matchedDomPaths.size > 0) {
    await preloadDomPaths(matchedDomPaths, 'containers.matched', { wait: true });
  }

  renderGraph();

  emitGraphStatus({
    phase: 'snapshot:ready',
    pending: loadingState.pending,
    matchedDomPathCount: matchedDomPaths.size,
  });
}

export async function handlePickerResult(domPath, selector = null) {
  if (!domPath) return;
  console.log('[handlePickerResult] domPath:', domPath);
  logger.info('picker', 'Received DOM path', domPath);

  // 找到最近已有节点，跳过中间层加载
  const ancestor = findNearestExistingPath(domData, domPath);
  if (!findDomNodeByPath(domData, domPath)) {
    updateLoadingState(1, { reason: 'picker', path: domPath, ancestor });
    try {
      if (ancestor && ancestor !== domPath) {
        await fetchAndMergeDomBranch(ancestor, { depth: 4, maxChildren: 20, label: 'picker-ancestor' });
      }
      if (!findDomNodeByPath(domData, domPath)) {
        await fetchAndMergeDomBranch(domPath, { depth: 3, maxChildren: 8, label: 'picker-target' });
      }
    } finally {
      updateLoadingState(-1, { reason: 'picker', path: domPath });
    }
  }

  expandDomPath(domPath);
  selectedDom = domPath;
  renderGraph();

  const domPos = domNodePositions.get(domPath);
  if (domPos && canvas) {
    const svgRect = canvas.getBoundingClientRect();
    const targetY = domPos.y - svgRect.height / 2;
    graphOffset.y = Math.max(0, -targetY);
    renderGraph();
  }

  if (typeof window.api?.highlightElement === 'function') {
    window.api.highlightElement(
      domPath,
      '#fbbc05',
      { channel: 'dom', rootSelector: currentRootSelector, sticky: true, url: currentUrl },
      currentProfile
    ).catch(err => {
      logger.error('picker', 'Failed to highlight picked element', err);
    });
  }

  const nearestContainer = findNearestContainer(domPath);
  if (nearestContainer) {
    // 如果当前 DOM 路径已经被最近容器直接命中，则认为映射已存在：
    // 仅选中该容器并滚动/高亮，不再建议创建新的子容器（避免重复“新增容器”）。
    try {
      const nodes = (nearestContainer.match && Array.isArray(nearestContainer.match.nodes))
        ? nearestContainer.match.nodes
        : [];
      const alreadyMapped = nodes.some((m) => m && m.dom_path === domPath);
      if (alreadyMapped) {
        const containerId = nearestContainer.id || nearestContainer.name || null;
        if (containerId) {
          selectedContainer = containerId;
          expandPathToNode(containerData, containerId);

          try {
            window.dispatchEvent(
              new CustomEvent('webauto:container-selected', {
                detail: {
                  containerId,
                  container: nearestContainer,
                },
              }),
            );
          } catch {}

          renderGraph();
        }
        logger.info('picker', 'DOM path already mapped to container, skip suggestion', {
          domPath,
          containerId,
        });
        return;
      }
    } catch {}

    const siblingPaths = new Set();
    if (Array.isArray(nearestContainer.children)) {
      nearestContainer.children.forEach(child => {
        if (child?.match?.nodes) {
          child.match.nodes.forEach((n) => {
            if (n?.dom_path) siblingPaths.add(n.dom_path);
          });
        }
      });
    }
    if (siblingPaths.size) {
      preloadDomPaths(siblingPaths, 'container-children');
    }

        // 基于 DOM 节点信息生成一个更有意义的默认名称：
    // 优先使用 textSnippet（页面显示文本），其次 #id / .class / tag[index]。
    let defaultName = 'NewContainer';
    try {
      const domNode = findDomNodeByPath(domData, domPath);
      if (domNode) {
        const textSnippet =
          typeof domNode.textSnippet === 'string'
            ? domNode.textSnippet.replace(/\s+/g, ' ').trim()
            : '';
        if (textSnippet) {
          // 截取前 15 个字符，去除特殊符号
          defaultName = textSnippet.slice(0, 15).replace(/[^\w\u4e00-\u9fa5]/g, '_');
        } else if (domNode.id) {
          defaultName = `#${domNode.id}`;
        } else if (Array.isArray(domNode.classes) && domNode.classes.length > 0) {
          // 取第一个 class，并清理
          defaultName = `.${domNode.classes[0].replace(/[^\w-]/g, '_')}`;
        } else if (domNode.tag) {
          const parts = String(domPath).split('/');
          const last = parts.length > 1 ? parts[parts.length - 1] : '';
          defaultName = `${String(domNode.tag).toLowerCase()_${last}}`;
        }
      }
    } catch {
      // 保底
      defaultName = `child_${Date.now().toString(36).slice(-4)}`;
    }

    suggestedNode = {
      parentId: nearestContainer.id,
      domPath,
      selector: selector,
      name: defaultName,
    };
    expandPathToNode(containerData, nearestContainer.id);
    renderGraph();
    logger.info('picker', 'Suggested node ready', { suggestedNode });
  } else {
    logger.warn('picker', 'No suitable parent container found for', domPath);
  }
}

// 确保DOM路径完整加载
async function ensureDomPathLoaded(path) {
  if (!path || path === 'root' || !currentProfile || !currentUrl) return;
  if (findDomNodeByPath(domData, path)) return;
  if (domPathLoadTasks.has(path)) {
    return domPathLoadTasks.get(path);
  }

  const task = (async () => {
    console.log('[ensureDomPathLoaded] Loading path:', path);
    const ancestor = findNearestExistingPath(domData, path);
    if (ancestor && ancestor !== 'root' && ancestor !== path) {
      await fetchAndMergeDomBranch(ancestor, { depth: 6, maxChildren: 20, label: 'ancestor' });
    }
    if (!findDomNodeByPath(domData, path)) {
      await fetchAndMergeDomBranch(path, { depth: 4, maxChildren: 12, label: 'direct' });
    }
  })();

  domPathLoadTasks.set(path, task);
  try {
    await task;
  } finally {
    domPathLoadTasks.delete(path);
  }
}

// 展开路径到指定节点（委托给 container-helpers）
function expandPathToNode(node, targetId) {
  return expandPathToNodeImpl(node, targetId, expandedNodes);
}

// 在容器树中查找与 domPath 最接近的容器（委托给 container-helpers）
function findNearestContainer(domPath) {
  if (!containerData || !domPath) return null;
  return findNearestContainerImpl(containerData, domPath);
}

export function initGraph(canvasEl) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.overflow = 'hidden';
  svg.style.backgroundColor = '#1e1e1e';
  svg.style.cursor = 'grab';
  canvasEl.style.overflow = 'hidden';
  canvasEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY;
    const scaleChange = delta > 0 ? 0.9 : 1.1;
    graphScale = Math.max(0.5, Math.min(2, graphScale * scaleChange));
    updateRootTransform();
  });
  canvasEl.appendChild(svg);
  canvas = svg;

  svg.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'svg') {
      isDraggingGraph = true;
      dragStart.x = e.clientX - graphOffset.x;
      dragStart.y = e.clientY - graphOffset.y;
      svg.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingGraph) {
      graphOffset.x = e.clientX - dragStart.x;
      graphOffset.y = e.clientY - dragStart.y;
      updateRootTransform();
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingGraph) {
      isDraggingGraph = false;
      svg.style.cursor = 'grab';
    }
  });
}

export function updateContainerTree(data, options = {}) {
  if (!canvas) return;
  containerData = data;
  containerNodePositions.clear();

  if (data && (data.id || data.name)) {
    const rootId = data.id || data.name || 'root';
    expandedNodes.add(rootId); // 展开根容器

    // 展开第一层子容器
    if (data.children && Array.isArray(data.children)) {
      data.children.forEach(child => {
        const childId = child.id || child.name;
        if (childId) {
          expandedNodes.add(childId);
          // 递归检查并展开所有匹配到 DOM 的子容器
          expandMatchedContainers(child);
        }
      });
    }
  }

  if (options.render !== false) {
    renderGraph();
  }
}

function expandMatchedContainers(node) {
  if (!node) return;

  const nodeId = node.id || node.name;
  if (nodeId) {
    expandedNodes.add(nodeId);
  }

  // 激进策略：递归展开所有子容器，以展示完整树结构
  if (Array.isArray(node.children)) {
    node.children.forEach(child => {
      expandMatchedContainers(child);
    });
  }
}

async function fetchAndMergeDomBranch(targetPath, { depth, maxChildren, label }) {
  if (!targetPath || !currentProfile || !currentUrl) return;
  console.log('[fetchAndMergeDomBranch] loading', targetPath, label);
  const branch = await fetchDomBranch(targetPath, depth, maxChildren);
  if (branch && mergeDomBranch(branch)) {
    loadedPaths.add(branch.path || targetPath);
    console.log('[fetchAndMergeDomBranch] merged', branch.path || targetPath, label);
  } else {
    logger.warn('fetchAndMergeDomBranch', 'Failed to merge branch', { targetPath, label });
  }
}

export function updateDomTree(data, metadata = {}, options = {}) {
  if (!canvas) return;
  domData = data;
  domNodePositions.clear();

  // 提取会话信息用于按需拉取
  updatePageContext(metadata);

  // 重置已加载路径（新的 DOM 树）
  loadedPaths.clear();
  loadedPaths.add('root');

  // Don't expand all DOM nodes - expand based on visibility only
  if (!options?.deferRender) {
    renderGraph();
  }
}

function expandAllContainers(node) {
  if (!node || typeof node !== 'object') return;
  const nodeId = node.id || node.name;
  if (nodeId) {
    expandedNodes.add(nodeId);
  }
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => expandAllContainers(child));
  }
}

function expandAllDomNodes(node) {
  if (!node || typeof node !== 'object') return;
  const nodeId = node.path || node.id || `dom-${Math.random()}`;
  expandedNodes.add(nodeId);
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => expandAllDomNodes(child));
  }
}

// 按需拉取 DOM 分支
async function fetchDomBranch(path, maxDepth = 5, maxChildren = 6) {
  if (!currentProfile || !currentUrl) {
    console.warn('[fetchDomBranch] Missing profile or URL, cannot fetch branch');
    return null;
  }

  if (isLoadingBranch) {
    console.log('[fetchDomBranch] Already loading a branch, skipping');
    return null;
  }

  console.log('[fetchDomBranch] Fetching branch for path:', path);
  isLoadingBranch = true;

  try {
    const result = await window.api.invokeAction('dom:branch:2', {
      profile: currentProfile,
      url: currentUrl,
      path: path,
      maxDepth: maxDepth,
      maxChildren: maxChildren,
      rootSelector: currentRootSelector,
    });

    if (result?.success && result?.data?.node) {
      console.log('[fetchDomBranch] Successfully fetched branch:', result.data.node.path);
      return result.data.node;
    } else {
      console.warn('[fetchDomBranch] Failed to fetch branch:', result);
      return null;
    }
  } catch (err) {
    logger.error('fetchDomBranch', 'Error fetching branch', err);
    return null;
  } finally {
    isLoadingBranch = false;
  }
}

// 合并拉取的分支到现有 DOM 树（委托给 dom-helpers 模块）
export function mergeDomBranch(branchNode) {
  if (!branchNode || !domData) return false;
  console.log('[mergeDomBranch] Looking for path:', branchNode.path);
  const merged = mergeDomBranchImpl(domData, branchNode);
  if (merged) {
    console.log(
      '[mergeDomBranch] Merged branch into path:',
      branchNode.path,
      'with',
      (findDomNodeByPath(domData, branchNode.path)?.children || []).length,
      'children'
    );
  }
  return merged;
}



export function setFocusedContainer(containerId) {
  if (selectedContainer !== containerId) {
    selectedContainer = containerId;
    renderGraph();
    
    // If container node exists, maybe scroll to it?
    // For now just re-render to show selection highlight
  }
}

export function renderGraph() {
  if (!canvas) return;

  renderGraphView(
    {
      canvas,
      containerData,
      domData,
      expandedNodes,
      graphOffset,
      graphScale,
      selectedContainer,
      selectedDom,
      domNodePositions,
      containerNodePositions,
      selectorMap,
      suggestedNode,
      loadedPaths,
      currentProfile,
      currentRootSelector,
      currentUrl,
    },
    {
      fetchDomBranch,
      mergeDomBranch,
      queueDomPathPreload,
    },
  );
}

export function expandDomPath(path) {
  if (!path) return;
  // Split path (e.g., "root/1/2") and expand all segments
  const parts = path.split('/');
  let currentPath = '';
  
  parts.forEach((part, index) => {
    currentPath = index === 0 ? part : `${currentPath}/${part}`;
    expandedNodes.add(currentPath);
  });
}

export function markPathLoaded(path) {
  if (!path) return;
  loadedPaths.add(path);
}

function queueDomPathPreload(path, reason = 'manual') {
  if (!path || path === 'root') return null;
  if (!currentProfile || !currentUrl) return null;
  if (pendingDomPathPreloads.has(path)) {
    return pendingDomPathPreloads.get(path);
  }
  updateLoadingState(1, { reason, path, action: 'start' });
  logger.debug('dom-path-preload', 'Queue path', { path, reason });
  const shouldScheduleRender =
    reason && reason !== 'containers.matched';
  const task = ensureDomPathLoaded(path)
    .then(() => {
      updateLoadingState(-1, { reason, path, action: 'done' });
      logger.debug('dom-path-preload', 'Path ready', { path, reason });
      if (shouldScheduleRender) {
        requestGraphRender(reason);
      }
    })
    .catch((err) => {
      updateLoadingState(-1, { reason, path, action: 'error' });
      logger.warn('dom-path-preload', 'Failed to preload DOM path', { path, error: err?.message || err, reason });
    })
    .finally(() => {
      pendingDomPathPreloads.delete(path);
    });
  pendingDomPathPreloads.set(path, task);
  return task;
}

export function preloadDomPaths(paths, reason = 'bulk', options = {}) {
  if (!paths) {
    return Promise.resolve();
  }
  const tasks = [];
  for (const path of paths) {
    const task = queueDomPathPreload(path, reason);
    if (task) tasks.push(task);
  }
  if (options?.wait && tasks.length) {
    return Promise.allSettled(tasks).then(() => undefined);
  }
  return Promise.resolve();
}
