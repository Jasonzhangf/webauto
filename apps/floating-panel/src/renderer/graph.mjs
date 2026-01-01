import { logger } from './logger.mts';
import { findDomNodeByPath, findNearestExistingPath, mergeDomBranch as mergeDomBranchImpl } from './graph/dom-helpers.mts';
import { expandPathToNode as expandPathToNodeImpl, findNearestContainer as findNearestContainerImpl, populateSelectorMap as populateSelectorMapImpl } from './graph/container-helpers.mts';

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

function updateLoadingState(delta, meta = {}) {
  loadingState.pending = Math.max(0, loadingState.pending + delta);
  const detail = {
    pending: loadingState.pending,
    ts: Date.now(),
    ...meta,
  };
  try {
    window.dispatchEvent(new CustomEvent('webauto:graph-loading', { detail }));
  } catch {}
  if (window.DEBUG === '1') {
    console.log('[graph-loading]', detail);
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
    if (node.match && Array.isArray(node.match.nodes)) {
      node.match.nodes.forEach((m) => {
        if (m && m.dom_path) {
          matchedDomPaths.add(m.dom_path);
        }
      });
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => collectMatchedPaths(child));
    }
  }
  if (containerData) {
    collectMatchedPaths(containerData);
  }

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

    suggestedNode = {
      parentId: nearestContainer.id,
      domPath,
      selector: selector,
      name: nearestContainer.name ? `${nearestContainer.name}-child` : '新增容器',
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

// 根据容器定义填充 selector 到 DOM path 的映射表
function populateSelectorMap(containerRoot) {
  populateSelectorMapImpl(containerRoot, selectorMap, domNodePositions);
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
    renderGraph();
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
      renderGraph();
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


export function renderGraph() {
  if (!canvas) return;
  if (window.api?.debugLog && window.DEBUG === '1') {
    window.api.debugLog('floating-panel-graph', 'renderGraph', {
      hasDom: Boolean(domData),
      hasContainer: Boolean(containerData),
      expandedNodesCount: expandedNodes.size,
    }).catch((err) => { logger.error("graph-render", "Failed to send debug log", err); });
  }
  while (canvas.firstChild) {
    canvas.removeChild(canvas.firstChild);
  }

 const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  mainGroup.setAttribute('transform', `translate(${graphOffset.x + 10}, ${graphOffset.y + 10}) scale(${graphScale})`);

  const domNodesMap = new Map();
  domNodePositions.clear();
  containerNodePositions.clear();

  if (containerData) {
    const containerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    containerGroup.setAttribute('transform', 'translate(0, 0)');
    renderContainerNode(containerGroup, containerData, 0, 0, 0, domNodesMap);
    mainGroup.appendChild(containerGroup);
  }

  if (domData) {
    const domGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    domGroup.setAttribute('transform', 'translate(400, 0)');
    renderDomNodeRecursive(domGroup, domData, 0, 0);
    mainGroup.appendChild(domGroup);

    drawAllConnections(mainGroup);

    if (suggestedNode) {
      const containerPos = containerNodePositions.get(suggestedNode.parentId);
      const domPos = domNodePositions.get(suggestedNode.domPath);
      if (containerPos && domPos) {
        drawConnectionToDom(
          mainGroup,
          containerPos.x,
          containerPos.y,
          domPos.indicatorX,
          domPos.indicatorY,
          '#fbbc05'
        );
      }
    }
  }

  canvas.appendChild(mainGroup);
}


function renderContainerNode(parent, node, x, y, depth, domNodesMap) {
  const nodeId = node.id || node.name || 'root';
  const isExpanded = expandedNodes.has(nodeId);
  const hasChildren = (node.children && node.children.length > 0) || (node.childCount > 0);
  const isSelected = selectedContainer === nodeId;

  containerNodePositions.set(nodeId, { x: x + depth * 20 + 180, y: y + 14 });

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${x + depth * 20}, ${y})`);

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '180');
  rect.setAttribute('height', '28');
  rect.setAttribute('fill', isSelected ? '#264f36' : '#2d2d30');
  rect.setAttribute('stroke', isSelected ? '#4CAF50' : '#555');
  rect.setAttribute('stroke-width', isSelected ? '2' : '1');
  rect.setAttribute('rx', '2');
  rect.style.cursor = 'pointer';

  rect.addEventListener('mouseenter', () => {
    if (selectedContainer !== nodeId) {
      rect.setAttribute('fill', '#3e3e42');
      rect.setAttribute('stroke', '#007acc');
    }
  });
  rect.addEventListener('mouseleave', () => {
    if (selectedContainer !== nodeId) {
      rect.setAttribute('fill', '#2d2d30');
      rect.setAttribute('stroke', '#555');
    }
  });

  // 点击容器主体：选择和高亮，不展开/折叠
  rect.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedContainer = nodeId;
    selectedDom = null;

    // Clear previous DOM highlights when clicking container
    if (typeof window.api?.clearHighlight === 'function') {
      window.api.clearHighlight('dom').catch((err) => { logger.error('clear-highlight', 'Failed to clear DOM highlight', err); });
    }

    // 优先使用 selector 以高亮所有匹配项，如果 selector 不可用则使用 dom_path
    if (node.match && node.match.nodes && node.match.nodes.length > 0) {
      const domPath = node.match.nodes[0].dom_path;
      const selector = node.match.nodes[0].selector;
      const target = selector || domPath;
      console.log('[Container] Highlighting with match target:', target);
      if (target && typeof window.api?.highlightElement === 'function') {
        window.api.highlightElement(
          target,
          'green',
          { channel: 'container', rootSelector: currentRootSelector, url: currentUrl },
          currentProfile
        ).catch(err => {
          logger.error("highlight", "Failed to highlight container", err);
        });
     }
   } else if (node.selectors && node.selectors.length > 0) {
     // 回退使用容器定义中的 selector
     console.log('[Container] Fallback highlighting with selector:', node.selectors[0]);
     if (typeof window.api?.highlightElement === 'function') {
        window.api.highlightElement(
          node.selectors[0],
          'green',
          { channel: 'container', rootSelector: currentRootSelector, url: currentUrl },
          currentProfile
        ).catch(err => {
          console.error('Failed to highlight:', err);
        });
      }
   }

    renderGraph();
  });

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', '24');
  text.setAttribute('y', '18');
  text.setAttribute('fill', '#cccccc');
  text.setAttribute('font-size', '12');
  text.setAttribute('font-family', 'Consolas, monospace');
  text.setAttribute('pointer-events', 'none');
  text.textContent = node.name || node.id || 'Unknown';

  const indicatorBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  indicatorBg.setAttribute('x', '4');
  indicatorBg.setAttribute('y', '8');
  indicatorBg.setAttribute('width', '12');
  indicatorBg.setAttribute('height', '12');
  indicatorBg.setAttribute('fill', '#3e3e42');
  indicatorBg.setAttribute('stroke', '#888');
  indicatorBg.setAttribute('stroke-width', '1');
  indicatorBg.setAttribute('rx', '1');

  const indicatorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  indicatorText.setAttribute('x', '10');
  indicatorText.setAttribute('y', '18');
  indicatorText.setAttribute('text-anchor', 'middle');
  indicatorText.setAttribute('fill', '#fff');
  indicatorText.setAttribute('font-size', '10');
  indicatorText.setAttribute('font-weight', 'bold');
  indicatorText.setAttribute('pointer-events', 'none');
  indicatorText.textContent = hasChildren ? (isExpanded ? '-' : '+') : '';

  g.appendChild(rect);
  g.appendChild(indicatorBg);
  g.appendChild(indicatorText);
  g.appendChild(text);
  parent.appendChild(g);

  // 点击 +/- 指示器：展开/折叠
  indicatorBg.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hasChildren) {
      const nodeId = node.id || node.name;
      if (expandedNodes.has(nodeId)) {
        expandedNodes.delete(nodeId);
      } else {
        expandedNodes.add(nodeId);
      }
      renderGraph();
    }
  });

  let totalHeight = 28;

  if (hasChildren && isExpanded) {
    let currentY = y + 32;

    // 渲染建议节点（如果有）
    if (suggestedNode && suggestedNode.parentId === nodeId) {
      const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vertLine.setAttribute('x1', '10');
      vertLine.setAttribute('y1', String(y + 28));
      vertLine.setAttribute('x2', '10');
      vertLine.setAttribute('y2', String(currentY + 14));
      vertLine.setAttribute('stroke', '#fbbc05'); // 橙色连接线
      vertLine.setAttribute('stroke-width', '1');
      vertLine.setAttribute('stroke-dasharray', '4 2'); // 虚线
      parent.appendChild(vertLine);

      const horizLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      horizLine.setAttribute('x1', '10');
      horizLine.setAttribute('y1', String(currentY + 14));
      horizLine.setAttribute('x2', String((depth + 1) * 20 + 10));
      horizLine.setAttribute('y2', String(currentY + 14));
      horizLine.setAttribute('stroke', '#fbbc05');
      horizLine.setAttribute('stroke-width', '1');
      horizLine.setAttribute('stroke-dasharray', '4 2');
      parent.appendChild(horizLine);

      // 绘制建议节点框
      const gSuggest = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      gSuggest.setAttribute('transform', `translate(${x + (depth + 1) * 20}, ${currentY})`);
      
      const rectSuggest = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rectSuggest.setAttribute('x', '0');
      rectSuggest.setAttribute('y', '0');
      rectSuggest.setAttribute('width', '180');
      rectSuggest.setAttribute('height', '28');
      rectSuggest.setAttribute('fill', '#2d2d30');
      rectSuggest.setAttribute('stroke', '#fbbc05');
      rectSuggest.setAttribute('stroke-width', '2');
      rectSuggest.setAttribute('stroke-dasharray', '4 2');
      rectSuggest.setAttribute('rx', '2');
      rectSuggest.style.cursor = 'pointer';
      
      const textSuggest = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textSuggest.setAttribute('x', '24');
      textSuggest.setAttribute('y', '18');
      textSuggest.setAttribute('fill', '#fbbc05');
      textSuggest.setAttribute('font-size', '12');
      textSuggest.setAttribute('font-family', 'Consolas, monospace');
      textSuggest.setAttribute('pointer-events', 'none');
      textSuggest.textContent = '+ 确认添加子容器';

      gSuggest.appendChild(rectSuggest);
      gSuggest.appendChild(textSuggest);
      parent.appendChild(gSuggest);

      const handleConfirmClick = async (e) => {
        e.stopPropagation();
        logger.info('picker', 'Confirm adding sub-container', suggestedNode);
        
        // 发送创建请求
        try {
          if (!suggestedNode.selector) {
            logger.error('picker', 'Missing selector for suggested node, abort');
            return;
          }

          const containerId = suggestedNode.containerId || `picker_${Date.now().toString(36)}`;
          const payload = {
            profile: currentProfile,
            parentId: suggestedNode.parentId,
            containerId,
            selectors: [
              { css: suggestedNode.selector, variant: 'primary', score: 1 },
            ],
            definition: {
              name: suggestedNode.name || `AutoContainer-${containerId.slice(-4)}`,
              metadata: { suggestedDomPath: suggestedNode.domPath },
            },
            url: currentUrl,
            rootSelector: currentRootSelector,
            domPath: suggestedNode.domPath,
          };

          const result = await window.api.invokeAction('containers:create-child', payload);
          
          if (result.success) {
            logger.info('picker', 'Container created', result.data);
            // 正确流程：后端在 create-child 后会进行匹配并通过 containers.matched 事件推送最新树，
            // 浮窗仅依赖总线事件刷新 UI，这里不直接改动本地容器树
            suggestedNode = null;
            renderGraph();
          } else {
            logger.error('picker', 'Failed to create container', result.error);
          }
        } catch (err) {
          logger.error('picker', 'Error creating container', err);
        }
      };

      // 点击整行任意位置都触发确认，避免点击不到 rect
      rectSuggest.addEventListener('click', handleConfirmClick);
      gSuggest.addEventListener('click', handleConfirmClick);

      currentY += 32;
      totalHeight = currentY - y;
    }

    node.children.forEach((child, index) => {
      const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vertLine.setAttribute('x1', '10');
      vertLine.setAttribute('y1', String(y + 28));
      vertLine.setAttribute('x2', '10');
      vertLine.setAttribute('y2', String(currentY + 14));
      vertLine.setAttribute('stroke', '#666');
      vertLine.setAttribute('stroke-width', '1');
      parent.appendChild(vertLine);

      const horizLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      horizLine.setAttribute('x1', '10');
      horizLine.setAttribute('y1', String(currentY + 14));
      horizLine.setAttribute('x2', String((depth + 1) * 20 + 10));
      horizLine.setAttribute('y2', String(currentY + 14));
      horizLine.setAttribute('stroke', '#666');
      horizLine.setAttribute('stroke-width', '1');
      parent.appendChild(horizLine);

      const childHeight = renderContainerNode(parent, child, x, currentY, depth + 1, domNodesMap);
      currentY += childHeight + 4;
      totalHeight = currentY - y;
    });
  } else {
    // If not expanded but has children, still return a height to show the + indicator
    return 24;
  }

  return totalHeight;
}

function renderDomNodeRecursive(parent, node, x, y) {
  if (!node || typeof node !== 'object') return 0;

  // Record actual rendered position for this DOM node
  if (node.path) {
    domNodePositions.set(node.path, { x: 400 + x, y: y + 12, indicatorX: 400 + x + 10, indicatorY: y + 12 });
    if (node.path.split('/').length > 5 && window.DEBUG === '1') {
       console.log(`[renderDomNodeRecursive] Registered deep node: ${node.path} at y=${y}`);
    }
  }

  const nodeId = node.path || node.id || `dom-${x}-${y}`;
  const isExpanded = expandedNodes.has(nodeId);
  const hasChildren = (node.children && node.children.length > 0) || (node.childCount > 0);
  const isSelected = selectedDom === nodeId;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${x}, ${y})`);

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '220');
  rect.setAttribute('height', '24');
  rect.setAttribute('fill', isSelected ? '#264f36' : '#252526');
  rect.setAttribute('stroke', isSelected ? '#007acc' : '#3e3e42');
  rect.setAttribute('stroke-width', isSelected ? '2' : '1');
  rect.setAttribute('rx', '2');
  rect.style.cursor = 'pointer';

  rect.addEventListener('mouseenter', () => {
    if (selectedDom !== nodeId) {
      rect.setAttribute('fill', '#2d2d30');
      rect.setAttribute('stroke', '#007acc');
    }
  });
  rect.addEventListener('mouseleave', () => {
    if (selectedDom !== nodeId) {
      rect.setAttribute('fill', '#252526');
      rect.setAttribute('stroke', '#3e3e42');
    }
  });

  // 点击 DOM 节点主体：选择和高亮，不展开/折叠
 rect.addEventListener('click', (e) => {
  e.stopPropagation();
  selectedDom = nodeId;
  selectedContainer = null;

   // Clear previous container highlights
   if (typeof window.api?.clearHighlight === 'function') {
     window.api.clearHighlight('container').catch((err) => { logger.error('clear-highlight', 'Failed to clear container highlight', err); });
   }

   const selector = node.path ? node.path : (node.id ? `#${node.id}` : '');
   if (selector && typeof window.api?.highlightElement === 'function') {
     console.log('[DOM Node] Highlighting:', selector);
     window.api.highlightElement(
       selector,
       'blue',
       { channel: 'dom', rootSelector: currentRootSelector },
       currentProfile
     ).catch(err => {
       console.error('Failed to highlight:', err);
     });
   }

   renderGraph();
 });

  const tagText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  tagText.setAttribute('x', '24');
  tagText.setAttribute('y', '16');
  tagText.setAttribute('fill', '#4ec9b0');
  tagText.setAttribute('font-size', '11');
  tagText.setAttribute('font-family', 'Consolas, monospace');
  tagText.setAttribute('font-weight', 'bold');
  tagText.setAttribute('pointer-events', 'none');
  tagText.textContent = node.tag || 'DIV';

  const infoText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  const label = node.id ? `#${node.id}` : (node.classes?.[0] ? `.${node.classes[0]}` : '');
  infoText.setAttribute('x', '70');
  infoText.setAttribute('y', '16');
  infoText.setAttribute('fill', '#9cdcfe');
  infoText.setAttribute('font-size', '10');
  infoText.setAttribute('font-family', 'Consolas, monospace');
  infoText.setAttribute('pointer-events', 'none');
  infoText.textContent = label.substring(0, 30);

  const indicatorBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  indicatorBg.setAttribute('x', '4');
  indicatorBg.setAttribute('y', '6');
  indicatorBg.setAttribute('width', '12');
  indicatorBg.setAttribute('height', '12');
  indicatorBg.setAttribute('fill', '#3e3e42');
  indicatorBg.setAttribute('stroke', '#888');
  indicatorBg.setAttribute('stroke-width', '1');
  indicatorBg.setAttribute('rx', '1');

  const indicatorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  indicatorText.setAttribute('x', '10');
  indicatorText.setAttribute('y', '16');
  indicatorText.setAttribute('text-anchor', 'middle');
  indicatorText.setAttribute('fill', '#fff');
  indicatorText.setAttribute('font-size', '10');
  indicatorText.setAttribute('font-weight', 'bold');
  indicatorText.setAttribute('pointer-events', 'none');
  indicatorText.textContent = hasChildren ? (isExpanded ? '-' : '+') : '';

  g.appendChild(rect);
  g.appendChild(indicatorBg);
  g.appendChild(indicatorText);
  g.appendChild(tagText);
  g.appendChild(infoText);
  parent.appendChild(g);

  // 点击 +/- 指示器：展开/折叠 DOM 节点，按需拉取子树
  indicatorBg.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!hasChildren && node.childCount <= 0) {
      // 没有子节点，不做任何操作
      return;
    }

    const path = node.path;
    if (!path) {
      console.warn('[DOM indicatorBg] Node has no path, cannot expand');
      return;
    }

    // 检查是否需要按需拉取
    const needsFetch = node.childCount > node.children.length && !loadedPaths.has(path);

    if (expandedNodes.has(nodeId)) {
      // 已展开 -> 折叠
      expandedNodes.delete(nodeId);
      renderGraph();
    } else {
      // 折叠 -> 展开
      if (needsFetch) {
        console.log('[DOM indicatorBg] Fetching branch for path:', path);
        console.log(`  childCount=${node.childCount}, loaded=${node.children.length}`);

        const branch = await fetchDomBranch(path, 5, 6);
        if (branch) {
          // 合并到 DOM 树
          if (mergeDomBranch(branch)) {
            loadedPaths.add(path);
            expandedNodes.add(nodeId);
            renderGraph();
            console.log('[DOM indicatorBg] Branch loaded and expanded');
          } else {
            console.warn('[DOM indicatorBg] Failed to merge branch');
          }
        } else {
          console.warn('[DOM indicatorBg] Failed to fetch branch');
        }
      } else {
        // 子节点已加载，直接展开
        expandedNodes.add(nodeId);
        renderGraph();
      }
    }
  });


  let totalHeight = 24;
  if (isExpanded && node.children && node.children.length > 0) {
    let currentY = y + 28;
    node.children.forEach((child) => {
      const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vertLine.setAttribute('x1', '10');
      vertLine.setAttribute('y1', String(y + 24));
      vertLine.setAttribute('x2', '10');
      vertLine.setAttribute('y2', String(currentY + 12));
      vertLine.setAttribute('stroke', '#555');
      vertLine.setAttribute('stroke-width', '1');
      parent.appendChild(vertLine);

      const childHeight = renderDomNodeRecursive(parent, child, x + 15, currentY);
      currentY += childHeight + 4;
    });
    totalHeight = currentY - y;
  }

  return totalHeight;
}

function drawAllConnections(parent) {
  console.log('[drawAllConnections] Called');
  console.log('[drawAllConnections] containerData:', !!containerData, 'domData:', !!domData);

  if (window.api?.debugLog && window.DEBUG === '1') {
    window.api.debugLog('floating-panel-graph', 'drawAllConnections', {
      hasContainer: Boolean(containerData),
    }).catch((err) => { logger.error("graph-render", "Failed to log connection drawing", err); });
  }

  if (!containerData || !domData) {
    console.log('[drawAllConnections] Missing data - containerData:', containerData, 'domData:', domData);
    return;
  }

  console.log('[drawAllConnections] Starting connection drawing');
  console.log('[drawAllConnections] containerData.keys:', containerData ? Object.keys(containerData) : 'N/A');
  console.log('[drawAllConnections] domData has children:', domData ? (domData.children?.length || 0) : 'N/A');

  // Populate selector map from container data
  populateSelectorMap(containerData);
  console.log('[drawAllConnections] selectorMap populated with', selectorMap.size, 'entries');

  function drawConnectionsForNode(node) {
    if (!node || typeof node !== 'object') {
      console.log('[drawConnectionsForNode] Invalid node or not object');
      return;
    }

    console.log('[drawConnectionsForNode] Checking node:', node.id || node.name, 'has match:', !!node.match, 'match exists:', !!node.match?.nodes, 'nodes length:', node.match?.nodes?.length || 0);

    // Use pre-built node mappings from container.match.nodes first
    if (node.match && node.match.nodes && node.match.nodes.length > 0) {
      console.log('[drawConnectionsForNode] Using match nodes for:', node.id || node.name);
      const containerPos = containerNodePositions.get(node.id || node.name);

      for (const matchNode of node.match.nodes) {
        // Try to use dom_path first, fallback to finding by selector if needed (though matchNode should have path)
        let domPath = matchNode.dom_path;
        
        // If domPath is missing but we have a selector, try to look it up in our map (fallback)
        if (!domPath && matchNode.selector) {
           domPath = selectorMap.get(matchNode.selector);
        }

        const domPos = domNodePositions.get(domPath);
        const selector = matchNode.selector;

        console.log('[drawConnectionsForNode] Drawing connection:', {
          containerId: node.id || node.name,
          domPath,
          selector,
          domPos
        });

        if (containerPos && domPos) {
          const startX = containerPos.x;
          const startY = containerPos.y;
          const endX = domPos.indicatorX;
          const endY = domPos.indicatorY;

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const midX = (startX + endX) / 2;
          path.setAttribute('d', `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`);
          path.setAttribute('stroke', '#4CAF50');
          path.setAttribute('stroke-width', '1.5');
          path.setAttribute('fill', 'none');
          // path.setAttribute('stroke-dasharray', '4,2'); // 使用实线
          path.setAttribute('opacity', '0.8');
          parent.appendChild(path);
          console.log('[drawConnectionsForNode] Drew connection from', node.id || node.name, 'to', domPath);
          if (window.api?.debugLog && window.DEBUG === '1') {
            window.api.debugLog('floating-panel-graph', 'drawConnectionsForNode', { 
              containerId: node.id || node.name, 
              domPath, 
              status: 'drawn' 
            }).catch((err) => { logger.error("graph-render", "Failed to log connection success", err); });
          }
        } else {
          console.log('[drawConnectionsForNode] Cannot draw to', domPath, ': missing positions or invalid Y');
          queueDomPathPreload(domPath, 'connection-miss');
          if (window.api?.debugLog && window.DEBUG === '1') {
            window.api.debugLog('floating-panel-graph', 'drawConnectionsForNode', { 
              containerId: node.id || node.name, 
              domPath, 
              status: 'failed',
              reason: 'missing positions or invalid Y',
              positionInMap: domNodePositions.has(domPath),
              mapKeysSample: Array.from(domNodePositions.keys()).slice(0, 5)
            }).catch((err) => { logger.error("graph-render", "Failed to log connection failure", err); });
          }
        }
      }
    } else if (node.match && node.match.selectors && node.match.selectors.length > 0) {
      console.log('[drawConnectionsForNode] Using selectors for:', node.id || node.name);
      const containerPos = containerNodePositions.get(node.id || node.name);

      for (const selector of node.match.selectors) {
        const domPath = selectorMap.get(selector);
        const domPos = domNodePositions.get(domPath);

        if (containerPos && domPos) {
          const startX = containerPos.x;
          const startY = containerPos.y;
          const endX = domPos.indicatorX;
          const endY = domPos.indicatorY;

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const midX = (startX + endX) / 2;
          path.setAttribute('d', `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`);
          path.setAttribute('stroke', '#4CAF50');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke-dasharray', '4,2');
          path.setAttribute('opacity', '0.7');
          parent.appendChild(path);
        }
      }
    } else {
      console.log('[drawConnectionsForNode] No match data for:', node.id || node.name);
    }

    console.log('[drawConnectionsForNode] Checking children for:', node.id || node.name, 'children count:', node.children?.length || 0);
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child, index) => {
        console.log('[drawConnectionsForNode] Processing child', index, 'of', node.id || node.name);
        drawConnectionsForNode(child);
      });
    }
  }

  drawConnectionsForNode(containerData);
  console.log('[drawAllConnections] Complete, connections drawn');
}

function drawConnectionToDom(parent, startX, startY, endX, endY, color = '#4CAF50') {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const midX = (startX + endX) / 2;
  path.setAttribute('d', `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '2');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-dasharray', '4,2');
  path.setAttribute('opacity', '0.7');
  parent.appendChild(path);
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
  const task = ensureDomPathLoaded(path)
    .then(() => {
      updateLoadingState(-1, { reason, path, action: 'done' });
      logger.debug('dom-path-preload', 'Path ready', { path, reason });
      if (canvas) {
        renderGraph();
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
