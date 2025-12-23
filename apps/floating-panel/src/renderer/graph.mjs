let canvas = null;
let containerData = null;
let domData = null;
const expandedNodes = new Set();
let isDraggingGraph = false;
let dragStart = { x: 0, y: 0 };
let graphOffset = { x: 0, y: 0 };
let selectedContainer = null;
let selectedDom = null;

// SVG-based graph rendering with improved styling
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
  
  // Enable drag for the entire canvas
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
  renderGraph();
}

export function updateDomTree(data) {
  if (!canvas) return;
  domData = data;
  renderGraph();
}

function renderGraph() {
  if (!canvas) return;
  
  // Clear previous content
  while (canvas.firstChild) {
    canvas.removeChild(canvas.firstChild);
  }

  // Create main container group with offset
  const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  mainGroup.setAttribute('transform', `translate(${graphOffset.x + 10}, ${graphOffset.y + 10})`);

  // Find all DOM nodes by their path/selector
  const domNodesMap = new Map();
  if (domData) {
    collectDomNodes(domData, domNodesMap);
  }

  // Render container tree (left panel)
  if (containerData) {
    const containerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    containerGroup.setAttribute('transform', 'translate(0, 0)');
    renderContainerNode(containerGroup, containerData, 0, 0, 0, domNodesMap);
    mainGroup.appendChild(containerGroup);
  }

  // Render DOM tree (right panel)
  if (domData) {
    const domGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    domGroup.setAttribute('transform', 'translate(400, 0)');
    const domHeight = renderDomNodeRecursive(domGroup, domData, 0, 0);
    mainGroup.appendChild(domGroup);
  }

  canvas.appendChild(mainGroup);
}

function collectDomNodes(node, map) {
  if (!node || typeof node !== 'object') return;
  
  const path = node.path || node.id || node.selectors?.[0] || `node-${Math.random()}`;
  if (path) {
    map.set(path, node);
  }
  
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => collectDomNodes(child, map));
  }
}

function renderContainerNode(parent, node, x, y, depth, domNodesMap) {
  const nodeId = node.id || node.name || 'root';
  const isExpanded = expandedNodes.has(nodeId);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedContainer === nodeId;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${x + depth * 20}, ${y})`);
  g.dataset.containerId = nodeId;

  // Background rectangle
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '180');
  rect.setAttribute('height', '32');
  rect.setAttribute('fill', isSelected ? '#264f36' : '#2d2d30');
  rect.setAttribute('stroke', isSelected ? '#4CAF50' : '#555');
  rect.setAttribute('stroke-width', isSelected ? '2' : '1');
  rect.setAttribute('rx', '4');
  rect.style.cursor = 'pointer';

  // Hover effect
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
  
  // Toggle expansion and highlight on click
  rect.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedContainer = nodeId;
    selectedDom = null;
    if (hasChildren) {
      if (isExpanded) {
        expandedNodes.delete(nodeId);
      } else {
        expandedNodes.add(nodeId);
      }
    }
    
    // Highlight in browser
    if (node.selectors && node.selectors.length > 0 && window.api) {
      window.api.highlightElement(node.selectors[0], 'green').catch(e => {
        console.error('Failed to highlight:', e);
      });
    }
    
    renderGraph();
  });

  // Node text
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', '8');
  text.setAttribute('y', '21');
  text.setAttribute('fill', '#cccccc');
  text.setAttribute('font-size', '13');
  text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  text.setAttribute('pointer-events', 'none');
  text.textContent = node.name || node.id || 'Unknown';

  // Type badge
  const typeBadge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  typeBadge.setAttribute('x', '150');
  typeBadge.setAttribute('y', '6');
  typeBadge.setAttribute('width', '24');
  typeBadge.setAttribute('height', '20');
  typeBadge.setAttribute('fill', '#007acc');
  typeBadge.setAttribute('rx', '3');

  const typeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  typeText.setAttribute('x', '162');
  typeText.setAttribute('text-anchor', 'middle');
  typeText.setAttribute('y', '19');
  typeText.setAttribute('fill', '#ffffff');
  typeText.setAttribute('font-size', '9');
  typeText.setAttribute('font-weight', 'bold');
  typeText.setAttribute('pointer-events', 'none');
  typeText.textContent = node.type ? node.type.slice(0, 2).toUpperCase() : 'PG';

  // Expand/collapse indicator
  const indicatorBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  indicatorBg.setAttribute('cx', '175');
  indicatorBg.setAttribute('cy', '16');
  indicatorBg.setAttribute('r', '7');
  indicatorBg.setAttribute('fill', hasChildren ? '#4CAF50' : '#666');

  const indicatorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  indicatorText.setAttribute('x', '175');
  indicatorText.setAttribute('y', '19');
  indicatorText.setAttribute('text-anchor', 'middle');
  indicatorText.setAttribute('fill', '#fff');
  indicatorText.setAttribute('font-size', '10');
  indicatorText.setAttribute('font-weight', 'bold');
  indicatorText.setAttribute('pointer-events', 'none');
  indicatorText.textContent = hasChildren ? (isExpanded ? '-' : '+') : '•';

  g.appendChild(rect);
  g.appendChild(text);
  g.appendChild(typeBadge);
  g.appendChild(typeText);
  g.appendChild(indicatorBg);
  g.appendChild(indicatorText);
  parent.appendChild(g);

  let totalHeight = 32;

  // Draw connection lines to matched DOM nodes
  if (node.match && node.match.selector) {
    const domNode = domNodesMap.get(node.match.selector);
    if (domNode) {
      drawConnectionToDom(parent, node, domNode, depth, x, y);
    }
  }

  // Draw children if expanded
  if (hasChildren && isExpanded) {
    let currentY = y + 39;
    node.children.forEach((child, index) => {
      // Vertical line from parent to children
      const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vertLine.setAttribute('x1', '175');
      vertLine.setAttribute('y1', String(y + 32));
      vertLine.setAttribute('x2', '175');
      vertLine.setAttribute('y2', String(currentY + 16));
      vertLine.setAttribute('stroke', '#666');
      vertLine.setAttribute('stroke-width', '1');
      parent.appendChild(vertLine);
      
      // Horizontal line to child
      const horizLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      horizLine.setAttribute('x1', '175');
      horizLine.setAttribute('y1', String(currentY + 16));
      horizLine.setAttribute('x2', String((depth + 1) * 20 + 175));
      horizLine.setAttribute('y2', String(currentY + 16));
      horizLine.setAttribute('stroke', '#666');
      horizLine.setAttribute('stroke-width', '1');
      parent.appendChild(horizLine);
      
      const childHeight = renderContainerNode(parent, child, x, currentY, depth + 1, domNodesMap);
      currentY += childHeight + 7;
      totalHeight = currentY - y;
    });
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

  // DOM node background
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '220');
  rect.setAttribute('height', '28');
  rect.setAttribute('fill', isSelected ? '#264f36' : '#252526');
  rect.setAttribute('stroke', isSelected ? '#007acc' : '#3e3e42');
  rect.setAttribute('stroke-width', isSelected ? '2' : '1');
  rect.setAttribute('rx', '3');
  rect.style.cursor = 'pointer';

  // Hover effect
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

  // Toggle on click and highlight
  rect.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedDom = nodeId;
    selectedContainer = null;
    if (hasChildren) {
      if (isExpanded) {
        expandedNodes.delete(nodeId);
      } else {
        expandedNodes.add(nodeId);
      }
    }
    
    // Highlight in browser
    const selector = node.id ? `#${node.id}` : (node.path || '');
    if (selector && window.api) {
      window.api.highlightElement(selector, 'blue').catch(e => {
        console.error('Failed to highlight:', e);
      });
    }
    
    renderGraph();
  });

  // Tag label
  const tagText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  tagText.setAttribute('x', '8');
  tagText.setAttribute('y', '18');
  tagText.setAttribute('fill', '#4ec9b0');
  tagText.setAttribute('font-size', '12');
  tagText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  tagText.setAttribute('font-weight', 'bold');
  tagText.setAttribute('pointer-events', 'none');
  tagText.textContent = node.tag || 'DIV';

  // ID or classes
  const infoText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  const label = node.id ? `#${node.id}` : (node.classes?.[0] ? `.${node.classes[0]}` : '');
  infoText.setAttribute('x', '60');
  infoText.setAttribute('y', '18');
  infoText.setAttribute('fill', '#9cdcfe');
  infoText.setAttribute('font-size', '10');
  infoText.setAttribute('font-family', 'monospace');
  infoText.setAttribute('pointer-events', 'none');
  infoText.textContent = label.substring(0, 30);

  // Expand/collapse indicator
  const indicatorBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  indicatorBg.setAttribute('cx', '210');
  indicatorBg.setAttribute('cy', '14');
  indicatorBg.setAttribute('r', '6');
  indicatorBg.setAttribute('fill', hasChildren ? '#007acc' : '#666');

  const indicatorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  indicatorText.setAttribute('x', '210');
  indicatorText.setAttribute('y', '17');
  indicatorText.setAttribute('text-anchor', 'middle');
  indicatorText.setAttribute('fill', '#fff');
  indicatorText.setAttribute('font-size', '10');
  indicatorText.setAttribute('font-weight', 'bold');
  indicatorText.setAttribute('pointer-events', 'none');
  indicatorText.textContent = hasChildren ? (isExpanded ? '-' : '+') : '•';

  g.appendChild(rect);
  g.appendChild(tagText);
  g.appendChild(infoText);
  g.appendChild(indicatorBg);
  g.appendChild(indicatorText);
  parent.appendChild(g);

  let totalHeight = 28;

  // Draw children if expanded
  if (hasChildren && isExpanded) {
    let currentY = y + 34;
    node.children.forEach((child) => {
      // Vertical line
      const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vertLine.setAttribute('x1', '10');
      vertLine.setAttribute('y1', String(y + 28));
      vertLine.setAttribute('x2', '10');
      vertLine.setAttribute('y2', String(currentY + 14));
      vertLine.setAttribute('stroke', '#555');
      vertLine.setAttribute('stroke-width', '1');
      parent.appendChild(vertLine);

      const childHeight = renderDomNodeRecursive(parent, child, x + 15, currentY);
      currentY += childHeight + 6;
      totalHeight = currentY - y;
    });
  } else {
    return 28;
  }

  return totalHeight;
}

function drawConnectionToDom(parent, containerNode, domNode, depth, containerX, containerY) {
  // Calculate approximate Y position based on DOM tree structure
  const domY = calculateDomNodeY(domNode, 0) * 34;
  
  const startX = containerX + depth * 20 + 175;
  const startY = containerY + 16;
  const endX = 400 + 10; // DOM tree start at x=400
  const endY = domY + 14;
  
  // Draw curved connection line
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

function calculateDomNodeY(node, currentY) {
  return currentY + 1;
}
