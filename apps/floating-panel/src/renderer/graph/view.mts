import { logger } from '../logger.mts';
import { computeContainerDomConnections } from './matcher.mts';

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

    // 每次渲染前清理建议节点的锚点坐标，由 renderContainerNode 在实际绘制时写入。
    if (suggestedNode) {
      try {
        delete (suggestedNode as any).anchorX;
        delete (suggestedNode as any).anchorY;
      } catch {}
    }

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
        currentRootSelector,
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
      const domPos = domNodePositions.get(suggestedNode.domPath);

      // 优先使用 renderContainerNode 在建议卡片上写入的锚点坐标，
      // 若不存在则回退到父容器中心点，避免旧数据导致崩溃。
      const parentPos = containerNodePositions.get(suggestedNode.parentId || suggestedNode.containerId || '');
      const anchorX =
        typeof suggestedNode.anchorX === 'number'
          ? suggestedNode.anchorX
          : parentPos?.x ?? null;
      const anchorY =
        typeof suggestedNode.anchorY === 'number'
          ? suggestedNode.anchorY
          : parentPos?.y ?? null;

      if (domPos && anchorX !== null && anchorY !== null) {
        drawConnectionToDom(
          mainGroup,
          anchorX,
          anchorY,
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
  currentRootSelector: string | null;
}

function renderContainerNode(params: RenderContainerNodeParams): number {
  const {
    parent,
    node,
    x,
    y,
    depth,
    domNodePositions,
    containerNodePositions,
    expandedNodes,
    selectedContainer,
    suggestedNode,
    currentProfile,
    currentUrl,
    currentRootSelector,
  } = params;

  const nodeId = node.id || node.name || 'root';
  const isExpanded = expandedNodes.has(nodeId);
  const hasChildren = (node.children && node.children.length > 0) || (node.childCount > 0);
  const isSelected = selectedContainer === nodeId;

  // 行高与矩形高度保持一致，便于连线完全居中
  const ROW_HEIGHT = 28;
  const VERTICAL_GAP = 8;

  containerNodePositions.set(nodeId, {
    x: x + depth * 20 + 180,
    y: y + ROW_HEIGHT / 2,
  });

  if ((window as any).api?.debugLog) {
    (window as any).api
      .debugLog('floating-panel-graph', 'container-layout', {
        id: nodeId,
        depth,
        x,
        y,
        hasChildren,
        isExpanded,
      })
      .catch(() => {});
  }

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

    const api = (window as any).api;
    if (!api) return;

    // 清除旧的 DOM 高亮
    if (typeof api.clearHighlight === 'function') {
      api
        .clearHighlight('dom')
        .catch((err: unknown) => {
          logger.error('clear-highlight', 'Failed to clear DOM highlight', err);
        });
    }

    // 优先使用匹配结果中的 dom_path / selector
    let target: string | null = null;
    if (node.match && Array.isArray(node.match.nodes) && node.match.nodes.length > 0) {
      const matchNode = node.match.nodes[0];
      target = matchNode.selector || matchNode.dom_path || null;
    } else if (Array.isArray(node.selectors) && node.selectors.length > 0) {
      const first = node.selectors[0];
      target = (typeof first === 'string' ? first : first?.css) || null;
    }

    if (target && typeof api.highlightElement === 'function') {
      api
        .highlightElement(
          target,
          'green',
          { channel: 'container', rootSelector: currentRootSelector, url: currentUrl },
          currentProfile,
        )
        .catch((err: unknown) => {
          logger.error('container-highlight', 'Failed to highlight container', err);
        });
    }

    // 将当前选中的容器节点广播给渲染层其它模块（例如“容器详情”面板）。
    try {
      window.dispatchEvent(
        new CustomEvent('webauto:container-selected', {
          detail: {
            containerId: nodeId,
            container: node,
          },
        }),
      );
    } catch (err) {
      logger.warn('container-select', 'Failed to dispatch container-selected event', err as Error);
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

  let totalHeight = ROW_HEIGHT;

  // 只要当前节点是展开状态，就渲染“建议子容器”和真实子容器；
  // 即使当前还没有 children，也允许出现确认框。
  if (isExpanded) {
    let currentY = y + ROW_HEIGHT + VERTICAL_GAP;

    if (suggestedNode && suggestedNode.parentId === nodeId) {
      const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vertLine.setAttribute('x1', '10');
      // 从父节点垂直居中位置开始连线，避免与容器中心错位
      vertLine.setAttribute('y1', String(y + ROW_HEIGHT / 2));
      vertLine.setAttribute('x2', '10');
      vertLine.setAttribute('y2', String(currentY + ROW_HEIGHT / 2));
      // 建议子容器与父节点之间仍然保留树结构连线，
      // 但使用普通树线颜色，避免与「建议→DOM」橙色连线混淆。
      vertLine.setAttribute('stroke', '#666');
      vertLine.setAttribute('stroke-width', '1');
      vertLine.setAttribute('stroke-dasharray', '4 2');
      parent.appendChild(vertLine);

      const horizLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      horizLine.setAttribute('x1', '10');
      horizLine.setAttribute('y1', String(currentY + ROW_HEIGHT / 2));
      horizLine.setAttribute('x2', String((depth + 1) * 20 + 10));
      horizLine.setAttribute('y2', String(currentY + ROW_HEIGHT / 2));
      horizLine.setAttribute('stroke', '#666');
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
      textSuggest.setAttribute('x', '10');
      textSuggest.setAttribute('y', '18');
      textSuggest.setAttribute('fill', '#fbbc05');
      textSuggest.setAttribute('font-size', '10');
      textSuggest.setAttribute('font-family', 'Consolas, monospace');
      textSuggest.setAttribute('pointer-events', 'none');
      textSuggest.textContent = '新子容器名称';

      const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      foreign.setAttribute('x', '70');
      foreign.setAttribute('y', '4');
      foreign.setAttribute('width', '104');
      foreign.setAttribute('height', '20');

      // 使用 HTML input 作为名称编辑框，默认值为建议名称；按回车触发确认。
      const input = document.createElement('input');
      input.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      input.value = (suggestedNode && (suggestedNode as any).name) || '新增容器';
      input.style.width = '100%';
      input.style.height = '100%';
      input.style.fontSize = '10px';
      input.style.padding = '1px 4px';
      input.style.borderRadius = '2px';
      input.style.border = '1px solid #555';
      input.style.background = '#1e1e1e';
      input.style.color = '#fbbc05';
      input.style.boxSizing = 'border-box';

      foreign.appendChild(input);

      gSuggest.appendChild(rectSuggest);
      gSuggest.appendChild(textSuggest);
      gSuggest.appendChild(foreign);
      parent.appendChild(gSuggest);

      // 记录“确认添加子容器”卡片的中心坐标，供连线使用（起点从当前建议节点出发）。
      try {
        if (suggestedNode) {
          (suggestedNode as any).anchorX = x + (depth + 1) * 20 + 90; // 180 / 2
          (suggestedNode as any).anchorY = currentY + ROW_HEIGHT / 2;
        }
      } catch {}

      const handleConfirmClick = async (event: MouseEvent | KeyboardEvent) => {
        event.stopPropagation();

        const rawName = input.value || '';
        const trimmedName = rawName.trim();
        if (suggestedNode) {
          (suggestedNode as any).name =
            trimmedName ||
            ((suggestedNode as any).name as string) ||
            '新增容器';
        }

        logger.info('picker', 'Confirm adding sub-container', suggestedNode);

        try {
          // 将“确认添加”转交给 graph.mjs，由其在本地构建虚拟子容器节点
          const detail = {
            parentId: suggestedNode.parentId,
            domPath: suggestedNode.domPath,
            selector: suggestedNode.selector,
            name: suggestedNode.name,
          };
          window.dispatchEvent(
            new CustomEvent('webauto:container-confirm-add', { detail }),
          );
        } catch (err) {
          logger.error('picker', 'Error dispatching virtual child event', err);
        }
      };

      rectSuggest.addEventListener('click', handleConfirmClick);
      gSuggest.addEventListener('click', handleConfirmClick);
      input.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          handleConfirmClick(ev);
        }
      });

      // 默认聚焦到名称输入框，进入编辑状态；直接回车等价于接受当前默认名。
      setTimeout(() => {
        try {
          input.focus();
          input.select();
        } catch {
          // ignore focus error
        }
      }, 0);

	      currentY += ROW_HEIGHT + VERTICAL_GAP;
	      totalHeight = currentY - y;
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => {
        const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        vertLine.setAttribute('x1', '10');
        // 使用父节点垂直中心点作为树连线起点
        vertLine.setAttribute('y1', String(y + ROW_HEIGHT / 2));
        vertLine.setAttribute('x2', '10');
        vertLine.setAttribute('y2', String(currentY + ROW_HEIGHT / 2));
        vertLine.setAttribute('stroke', '#666');
        vertLine.setAttribute('stroke-width', '1');
        parent.appendChild(vertLine);

        const horizLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        horizLine.setAttribute('x1', '10');
        horizLine.setAttribute('y1', String(currentY + ROW_HEIGHT / 2));
        horizLine.setAttribute('x2', String((depth + 1) * 20 + 10));
        horizLine.setAttribute('y2', String(currentY + ROW_HEIGHT / 2));
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
          currentRootSelector,
        });

	        currentY += childHeight + VERTICAL_GAP;
	        totalHeight = currentY - y;
	      });
	    }
	  } else {
	    return ROW_HEIGHT;
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
  const { parent, containerData, domData, containerNodePositions, domNodePositions } = params;

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

  // 1) 使用通用匹配函数，仅依赖 container_tree 与 dom_tree 本身的数据，
  //    产生「容器 → DOM 路径」的映射。
  const connections = computeContainerDomConnections(containerData, domData);
  console.log('[drawAllConnections] computed connections:', connections.length);

  function drawConnectionsForNode(node: any): void {
    if (!node || typeof node !== 'object') {
      console.log('[drawConnectionsForNode] Invalid node or not object');
      return;
    }

    const nodeId = node.id || node.name;
    if (!nodeId) {
      console.log('[drawConnectionsForNode] Node without id/name, skipping');
      return;
    }

    // 2) 从预先计算好的 connections 中筛选出当前容器的所有 domPath。
    const targets = connections.filter((c) => c.containerId === nodeId);
    const containerPos = containerNodePositions.get(nodeId);

    if (targets.length > 0) {
      for (const { domPath } of targets) {
        const domPos = domNodePositions.get(domPath);

        console.log('[drawConnectionsForNode] Drawing connection (pure-match):', {
          containerId: nodeId,
          domPath,
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

          if ((window as any).DEBUG === '1') {
            console.log(
              '[drawConnectionsForNode] Drew connection from',
              nodeId,
              'to',
              domPath,
            );
          }
        } else if (domPath) {
          console.log(
            '[drawConnectionsForNode] Cannot draw to',
            domPath,
            ': missing positions or invalid Y',
          );
          deps.queueDomPathPreload(domPath, 'connection-miss');
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
  _containerData: any,
  selectorMap: Map<string, string>,
  _domNodePositions: GraphRenderState['domNodePositions'],
): void {
  // 硬编码 selector → DOM 的映射已废弃，这里仅清空旧数据，避免误用。
  selectorMap.clear();
}
