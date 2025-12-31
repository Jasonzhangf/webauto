import { logger } from '../logger.mts';

export interface GraphRenderState {
  canvas: SVGSVGElement | null;
  containerData: any;
  domData: any;
  expandedNodes: Set<string>;
  graphOffset: { x: number; y: number };
  graphScale: number;
  selectedContainer: string | null;
  selectedDom: string | null;
  domNodePositions: Map<string, { x: number; y: number; indicatorX: number; indicatorY: number }>;
  containerNodePositions: Map<string, { x: number; y: number }>;
  selectorMap: Map<string, string>;
  suggestedNode: any;
  loadedPaths: Set<string>;
  currentProfile: string | null;
  currentRootSelector: string | null;
  currentUrl: string | null;
}

export interface GraphRenderDeps {
  fetchDomBranch: (path: string, maxDepth?: number, maxChildren?: number) => Promise<any | null>;
  mergeDomBranch: (branch: any) => boolean;
  queueDomPathPreload: (path: string, reason?: string) => Promise<unknown> | null;
}

export function renderGraph(state: GraphRenderState, deps: GraphRenderDeps): void {
  const {
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
  } = state;

  if (!canvas) return;

  if ((window as any).api?.debugLog && (window as any).DEBUG === '1') {
    (window as any).api
      .debugLog('floating-panel-graph', 'renderGraph', {
        hasDom: Boolean(domData),
        hasContainer: Boolean(containerData),
        expandedNodesCount: expandedNodes.size,
      })
      .catch((err: unknown) => {
        logger.error('graph-render', 'Failed to send debug log', err);
      });
  }

  while (canvas.firstChild) {
    canvas.removeChild(canvas.firstChild);
  }

  const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  mainGroup.setAttribute(
    'transform',
    `translate(${graphOffset.x + 10}, ${graphOffset.y + 10}) scale(${graphScale})`,
  );

  domNodePositions.clear();
  containerNodePositions.clear();

  if (containerData) {
    const containerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    containerGroup.setAttribute('transform', 'translate(0, 0)');
    renderContainerNode(
      {
        parent: containerGroup,
        node: containerData,
        x: 0,
        y: 0,
        depth: 0,
        domNodePositions,
        containerNodePositions,
        expandedNodes,
        selectedContainer,
        suggestedNode,
        currentProfile,
        currentUrl,
      },
    );
    mainGroup.appendChild(containerGroup);
  }

  if (domData) {
    const domGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    domGroup.setAttribute('transform', 'translate(400, 0)');
    renderDomNodeRecursive(
      {
        parent: domGroup,
        node: domData,
        x: 0,
        y: 0,
        expandedNodes,
        selectedDom,
        domNodePositions,
        loadedPaths,
        currentProfile,
        currentRootSelector,
      },
      deps,
    );
    mainGroup.appendChild(domGroup);

    drawAllConnections(
      {
        parent: mainGroup,
        containerData,
        domData,
        containerNodePositions,
        domNodePositions,
        selectorMap,
      },
      deps,
    );

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
          '#fbbc05',
        );
      }
    }
  }

  canvas.appendChild(mainGroup);
}

interface RenderContainerNodeParams {
  parent: SVGGElement;
  node: any;
  x: number;
  y: number;
  depth: number;
  domNodePositions: GraphRenderState['domNodePositions'];
  containerNodePositions: GraphRenderState['containerNodePositions'];
  expandedNodes: Set<string>;
  selectedContainer: string | null;
  suggestedNode: any;
  currentProfile: string | null;
  currentUrl: string | null;
}

function renderContainerNode(params: RenderContainerNodeParams): number {
  const {
    parent,
    node,
    x,
    y,
    depth,
    containerNodePositions,
    expandedNodes,
    selectedContainer,
    suggestedNode,
    currentProfile,
    currentUrl,
  } = params;

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
    if (!isSelected) {
      rect.setAttribute('fill', '#3e3e42');
      rect.setAttribute('stroke', '#007acc');
    }
  });
  rect.addEventListener('mouseleave', () => {
    if (!isSelected) {
      rect.setAttribute('fill', '#2d2d30');
      rect.setAttribute('stroke', '#555');
    }
  });

  rect.addEventListener('click', (e) => {
    e.stopPropagation();
    // 容器点击的行为仍然由调用方管理（当前模块只负责渲染）
    // 这里保留事件绑定，实际状态更新在外层完成
    if ((window as any).api?.highlightContainer && node.id) {
      (window as any).api
        .highlightContainer(
          node.id,
          currentProfile,
          { url: currentUrl },
        )
        .catch((err: unknown) => {
          logger.error('container-highlight', 'Failed to highlight container', err);
        });
    }
  });

  const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  nameText.setAttribute('x', '24');
  nameText.setAttribute('y', '18');
  nameText.setAttribute('fill', '#ffffff');
  nameText.setAttribute('font-size', '12');
  nameText.setAttribute('font-family', 'Consolas, monospace');
  nameText.setAttribute('pointer-events', 'none');
  nameText.textContent = node.name || node.id || 'Unnamed';

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
  g.appendChild(nameText);
  parent.appendChild(g);

  let totalHeight = 28;

  if (hasChildren && isExpanded) {
    let currentY = y + 32;

    if (suggestedNode && suggestedNode.parentId === nodeId) {
      const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vertLine.setAttribute('x1', '10');
      vertLine.setAttribute('y1', String(y + 28));
      vertLine.setAttribute('x2', '10');
      vertLine.setAttribute('y2', String(currentY + 14));
      vertLine.setAttribute('stroke', '#fbbc05');
      vertLine.setAttribute('stroke-width', '1');
      vertLine.setAttribute('stroke-dasharray', '4 2');
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

      currentY += 32;
      totalHeight = currentY - y;
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => {
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

        const childHeight = renderContainerNode({
          parent,
          node: child,
          x,
          y: currentY,
          depth: depth + 1,
          domNodePositions,
          containerNodePositions,
          expandedNodes,
          selectedContainer,
          suggestedNode,
          currentProfile,
          currentUrl,
        });

        currentY += childHeight + 4;
        totalHeight = currentY - y;
      });
    }
  } else {
    return 24;
  }

  return totalHeight;
}

interface RenderDomNodeParams {
  parent: SVGGElement;
  node: any;
  x: number;
  y: number;
  expandedNodes: Set<string>;
  selectedDom: string | null;
  domNodePositions: GraphRenderState['domNodePositions'];
  loadedPaths: Set<string>;
  currentProfile: string | null;
  currentRootSelector: string | null;
}

function renderDomNodeRecursive(params: RenderDomNodeParams, deps: GraphRenderDeps): number {
  const {
    parent,
    node,
    x,
    y,
    expandedNodes,
    selectedDom,
    domNodePositions,
    loadedPaths,
    currentProfile,
    currentRootSelector,
  } = params;

  if (!node || typeof node !== 'object') return 0;

  if (node.path) {
    domNodePositions.set(node.path, {
      x: 400 + x,
      y: y + 12,
      indicatorX: 400 + x + 10,
      indicatorY: y + 12,
    });
    if (node.path.split('/').length > 5 && (window as any).DEBUG === '1') {
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
    if (!isSelected) {
      rect.setAttribute('fill', '#2d2d30');
      rect.setAttribute('stroke', '#007acc');
    }
  });
  rect.addEventListener('mouseleave', () => {
    if (!isSelected) {
      rect.setAttribute('fill', '#252526');
      rect.setAttribute('stroke', '#3e3e42');
    }
  });

  rect.addEventListener('click', (e) => {
    e.stopPropagation();
    // 实际选中状态更新由外层管理，这里只处理高亮
    const selector = node.path ? node.path : node.id ? `#${node.id}` : '';
    if (selector && (window as any).api?.highlightElement) {
      console.log('[DOM Node] Highlighting:', selector);
      (window as any).api
        .highlightElement(
          selector,
          'blue',
          { channel: 'dom', rootSelector: currentRootSelector || undefined },
          currentProfile || undefined,
        )
        .catch((err: unknown) => {
          console.error('Failed to highlight:', err);
        });
    }
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
  const label = node.id ? `#${node.id}` : node.classes?.[0] ? `.${node.classes[0]}` : '';
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

  indicatorBg.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!hasChildren && node.childCount <= 0) {
      return;
    }

    const path = node.path;
    if (!path) {
      console.warn('[DOM indicatorBg] Node has no path, cannot expand');
      return;
    }

    const needsFetch = node.childCount > (node.children?.length || 0) && !loadedPaths.has(path);

    if (expandedNodes.has(nodeId)) {
      expandedNodes.delete(nodeId);
      // 重新渲染由外层控制
    } else if (needsFetch) {
      console.log('[DOM indicatorBg] Fetching branch for path:', path);
      console.log(`  childCount=${node.childCount}, loaded=${node.children?.length || 0}`);

      const branch = await deps.fetchDomBranch(path, 5, 6);
      if (branch && deps.mergeDomBranch(branch)) {
        loadedPaths.add(path);
        expandedNodes.add(nodeId);
      } else {
        console.warn('[DOM indicatorBg] Failed to fetch/merge branch');
      }
    } else {
      expandedNodes.add(nodeId);
    }
  });

  let totalHeight = 24;
  if (isExpanded && node.children && node.children.length > 0) {
    let currentY = y + 28;
    node.children.forEach((child: any) => {
      const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vertLine.setAttribute('x1', '10');
      vertLine.setAttribute('y1', String(y + 24));
      vertLine.setAttribute('x2', '10');
      vertLine.setAttribute('y2', String(currentY + 12));
      vertLine.setAttribute('stroke', '#555');
      vertLine.setAttribute('stroke-width', '1');
      parent.appendChild(vertLine);

      const childHeight = renderDomNodeRecursive(
        {
          parent,
          node: child,
          x: x + 15,
          y: currentY,
          expandedNodes,
          selectedDom,
          domNodePositions,
          loadedPaths,
          currentProfile,
          currentRootSelector,
        },
        deps,
      );
      currentY += childHeight + 4;
    });
    totalHeight = currentY - y;
  }

  return totalHeight;
}

interface DrawConnectionsParams {
  parent: SVGGElement;
  containerData: any;
  domData: any;
  containerNodePositions: GraphRenderState['containerNodePositions'];
  domNodePositions: GraphRenderState['domNodePositions'];
  selectorMap: Map<string, string>;
}

function drawAllConnections(params: DrawConnectionsParams, deps: GraphRenderDeps): void {
  const { parent, containerData, domData, containerNodePositions, domNodePositions, selectorMap } = params;

  console.log('[drawAllConnections] Called');
  console.log('[drawAllConnections] containerData:', !!containerData, 'domData:', !!domData);

  if ((window as any).api?.debugLog && (window as any).DEBUG === '1') {
    (window as any).api
      .debugLog('floating-panel-graph', 'drawAllConnections', {
        hasContainer: Boolean(containerData),
      })
      .catch((err: unknown) => {
        logger.error('graph-render', 'Failed to log connection drawing', err);
      });
  }

  if (!containerData || !domData) {
    console.log('[drawAllConnections] Missing data - containerData:', containerData, 'domData:', domData);
    return;
  }

  console.log('[drawAllConnections] Starting connection drawing');
  console.log(
    '[drawAllConnections] containerData.keys:',
    containerData ? Object.keys(containerData) : 'N/A',
  );
  console.log(
    '[drawAllConnections] domData has children:',
    domData ? domData.children?.length || 0 : 'N/A',
  );

  populateSelectorMap(containerData, selectorMap, domNodePositions);
  console.log('[drawAllConnections] selectorMap populated with', selectorMap.size, 'entries');

  function drawConnectionsForNode(node: any): void {
    if (!node || typeof node !== 'object') {
      console.log('[drawConnectionsForNode] Invalid node or not object');
      return;
    }

    console.log(
      '[drawConnectionsForNode] Checking node:',
      node.id || node.name,
      'has match:',
      !!node.match,
      'match exists:',
      !!node.match?.nodes,
      'nodes length:',
      node.match?.nodes?.length || 0,
    );

    if (node.match && node.match.nodes && node.match.nodes.length > 0) {
      console.log('[drawConnectionsForNode] Using match nodes for:', node.id || node.name);
      const containerPos = containerNodePositions.get(node.id || node.name);

      for (const matchNode of node.match.nodes) {
        let domPath = matchNode.dom_path;
        if (!domPath && matchNode.selector) {
          domPath = selectorMap.get(matchNode.selector);
        }

        const domPos = domNodePositions.get(domPath);
        const selector = matchNode.selector;

        console.log('[drawConnectionsForNode] Drawing connection:', {
          containerId: node.id || node.name,
          domPath,
          selector,
          domPos,
        });

        if (containerPos && domPos && typeof domPos.indicatorY === 'number') {
          const startX = containerPos.x;
          const startY = containerPos.y;
          const endX = domPos.indicatorX;
          const endY = domPos.indicatorY;

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const midX = (startX + endX) / 2;
          path.setAttribute(
            'd',
            `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`,
          );
          path.setAttribute('stroke', '#4CAF50');
          path.setAttribute('stroke-width', '1.5');
          path.setAttribute('fill', 'none');
          path.setAttribute('opacity', '0.8');
          parent.appendChild(path);

          console.log(
            '[drawConnectionsForNode] Drew connection from',
            node.id || node.name,
            'to',
            domPath,
          );

          if ((window as any).api?.debugLog && (window as any).DEBUG === '1') {
            (window as any).api
              .debugLog('floating-panel-graph', 'drawConnectionsForNode', {
                containerId: node.id || node.name,
                domPath,
                status: 'drawn',
              })
              .catch((err: unknown) => {
                logger.error('graph-render', 'Failed to log connection success', err);
              });
          }
        } else if (domPath) {
          console.log(
            '[drawConnectionsForNode] Cannot draw to',
            domPath,
            ': missing positions or invalid Y',
          );
          deps.queueDomPathPreload(domPath, 'connection-miss');

          if ((window as any).api?.debugLog && (window as any).DEBUG === '1') {
            (window as any).api
              .debugLog('floating-panel-graph', 'drawConnectionsForNode', {
                containerId: node.id || node.name,
                domPath,
                status: 'failed',
                reason: 'missing positions or invalid Y',
                positionInMap: domNodePositions.has(domPath),
                mapKeysSample: Array.from(domNodePositions.keys()).slice(0, 5),
              })
              .catch((err: unknown) => {
                logger.error('graph-render', 'Failed to log connection failure', err);
              });
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
          path.setAttribute(
            'd',
            `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
          );
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

    console.log(
      '[drawConnectionsForNode] Checking children for:',
      node.id || node.name,
      'children count:',
      node.children?.length || 0,
    );
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child: any, index: number) => {
        console.log(
          '[drawConnectionsForNode] Processing child',
          index,
          'of',
          node.id || node.name,
        );
        drawConnectionsForNode(child);
      });
    }
  }

  drawConnectionsForNode(containerData);
  console.log('[drawAllConnections] Complete, connections drawn');
}

function drawConnectionToDom(
  parent: SVGGElement,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color = '#4CAF50',
): void {
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

function populateSelectorMap(
  containerData: any,
  selectorMap: Map<string, string>,
  domNodePositions: GraphRenderState['domNodePositions'],
): void {
  selectorMap.clear();
  if (!containerData) return;

  function traverse(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node.selectors)) {
      node.selectors.forEach((selector: any) => {
        if (selector.css) {
          const domNodes = Array.from(domNodePositions.keys());
          const matchedNode = domNodes.find(() => {
            return selector.css.includes('#') ? false : true;
          });
          if (matchedNode) {
            selectorMap.set(selector.css, matchedNode);
          }
        }
      });
    }

    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child: any) => traverse(child));
    }
  }

  traverse(containerData);
}

