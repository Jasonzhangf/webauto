let canvas = null;
let containerData = null;
let domData = null;
const expandedNodes = new Set();
let isDraggingGraph = false;
let dragStart = { x: 0, y: 0 };
let graphOffset = { x: 0, y: 0 };
let selectedContainer = null;
let selectedDom = null;
const domNodePositions = new Map();
const containerNodePositions = new Map();
const selectorMap = new Map();


function populateSelectorMap(containerData) {
  selectorMap.clear();
  if (!containerData) return;
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    // Map selectors to DOM paths
    if (node.selectors && Array.isArray(node.selectors)) {
      node.selectors.forEach(selector => {
        if (selector.css) {
          // Find matching DOM nodes
          const domNodes = Array.from(domNodePositions.keys());
          const matchedNode = domNodes.find(path => {
            // Simple heuristic: if the DOM path contains the selector class/id
            return selector.css.includes('#') ? false : true;
          });
          if (matchedNode) {
            selectorMap.set(selector.css, matchedNode);
          }
        }
      });
    }
    
    // Process children recursively
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(child => traverse(child));
    }
  }
  
  traverse(containerData);
}


export function initGraph(canvasEl) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.overflow = 'hidden';
  svg.style.backgroundColor = '#1e1e1e';
  svg.style.cursor = 'grab';
  canvasEl.style.overflow = 'hidden';
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

export function updateContainerTree(data) {
  if (!canvas) return;
  containerData = data;
  // Only expand root, not all children - implement on-demand loading
  if (data && (data.id || data.name)) {
    const rootId = data.id || data.name || 'root';
    expandedNodes.clear(); // Clear all expansions
    expandedNodes.add(rootId); // Only expand root
  }
  renderGraph();
}

export function updateDomTree(data) {
  if (!canvas) return;
  domData = data;
  // Don't expand all DOM nodes - expand based on visibility only
  // expandAllDomNodes(data); // REMOVED: Implement on-demand loading
  renderGraph();
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

function renderGraph() {
  if (!canvas) return;
  while (canvas.firstChild) {
    canvas.removeChild(canvas.firstChild);
  }

  const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  mainGroup.setAttribute('transform', `translate(${graphOffset.x + 10}, ${graphOffset.y + 10})`);

  const domNodesMap = new Map();
  domNodePositions.clear();
  containerNodePositions.clear();
  
  if (domData) {
    collectDomNodes(domData, domNodesMap, 0);
  }

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
  }

  canvas.appendChild(mainGroup);
}

function collectDomNodes(node, map, currentY) {
  if (!node || typeof node !== 'object') return;
  const path = node.path || node.id || node.selectors?.[0] || `node-${Math.random()}`;
  map.set(path, node);
  console.log("[collectDomNodes] path:", path, "currentY:", currentY, "node:", node.tag, node.id, node.classes?.[0]);  domNodePositions.set(path, currentY);
  if (node.children && Array.isArray(node.children)) {
    let y = currentY + 28;
    node.children.forEach(child => {
      collectDomNodes(child, map, y);
      y += 28;
    });
  }
}

function renderContainerNode(parent, node, x, y, depth, domNodesMap) {
  const nodeId = node.id || node.name || 'root';
  const isExpanded = expandedNodes.has(nodeId);
  const hasChildren = node.children && node.children.length > 0;
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
    
    // 使用 match 信息中的 selector 来高亮
    if (node.match && node.match.nodes && node.match.nodes.length > 0) {
      const selector = node.match.nodes[0].selector;
      console.log('[Container] Highlighting with selector:', selector);
      if (selector && typeof window.api?.highlightElement === 'function') {
        window.api.highlightElement(selector, 'green').catch(err => {
          console.error('Failed to highlight:', err);
        });
      }
    } else if (node.selectors && node.selectors.length > 0) {
      // 回退使用容器定义中的 selector
      console.log('[Container] Fallback highlighting with selector:', node.selectors[0]);
      if (typeof window.api?.highlightElement === 'function') {
        window.api.highlightElement(node.selectors[0], 'green').catch(err => {
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

  const nodeId = node.path || node.id || `dom-${x}-${y}`;
  const isExpanded = expandedNodes.has(nodeId);
  const hasChildren = node.children && node.children.length > 0;
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
    
    const selector = node.id ? `#${node.id}` : (node.path || '');
    if (selector && typeof window.api?.highlightElement === 'function') {
      console.log('[DOM Node] Highlighting:', selector);
      window.api.highlightElement(selector, 'blue').catch(err => {
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

  let totalHeight = 24;

  if (hasChildren && isExpanded) {
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
      totalHeight = currentY - y;
    });
  } else {
    // If not expanded but has children, still return a height to show the + indicator
    return 24;
  }

  return totalHeight;
}

function drawAllConnections(parent) {
  console.log('[drawAllConnections] Called');
  console.log('[drawAllConnections] containerData:', !!containerData, 'domData:', !!domData);
  
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
        const domPath = matchNode.dom_path;
        const domNodeY = domNodePositions.get(domPath);
        const selector = matchNode.selector;
        
        console.log('[drawConnectionsForNode] Drawing connection:', {
          containerId: node.id || node.name,
          domPath,
          selector,
          domNodeY
        });
        
        if (containerPos && domNodeY !== undefined && domNodeY >= 0) {
          const startX = containerPos.x;
          const startY = containerPos.y;
          const endX = 410;
          const endY = domNodeY + 12;
          
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const midX = (startX + endX) / 2;
          path.setAttribute('d', `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`);
          path.setAttribute('stroke', '#4CAF50');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke-dasharray', '4,2');
          path.setAttribute('opacity', '0.7');
          parent.appendChild(path);
          console.log('[drawConnectionsForNode] Drew connection from', node.id || node.name, 'to', domPath);
        } else {
          console.log('[drawConnectionsForNode] Cannot draw to', domPath, ': missing positions or invalid Y');
        }
      }
    } else if (node.match && node.match.selectors && node.match.selectors.length > 0) {
      console.log('[drawConnectionsForNode] Using selectors for:', node.id || node.name);
      const containerPos = containerNodePositions.get(node.id || node.name);
      
      for (const selector of node.match.selectors) {
        const domPath = selectorMap.get(selector);
        const domNodeY = domNodePositions.get(domPath);
        
        if (containerPos && domNodeY !== undefined && domNodeY >= 0) {
          const startX = containerPos.x;
          const startY = containerPos.y;
          const endX = 410;
          const endY = domNodeY + 12;
          
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

function drawConnectionToDom(parent, startX, startY, endX, endY) {
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
