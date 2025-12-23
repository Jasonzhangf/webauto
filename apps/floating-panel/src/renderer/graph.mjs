let canvas = null;
let containerData = null;
let domData = null;
const expandedNodes = new Set();
let isDraggingGraph = false;
let dragStart = { x: 0, y: 0 };
let graphOffset = { x: 0, y: 0 };

// SVG-based graph rendering with improved styling
export function initGraph(canvasEl) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.overflow = 'visible';
  svg.style.backgroundColor = '#1e1e1e';
  svg.style.cursor = 'grab';
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

  // Render container tree (left panel)
  let containerHeight = 0;
  if (containerData) {
    containerHeight = renderContainerNode(mainGroup, containerData, 0, 0, 0);
  }

  // Render DOM tree (right panel)
  let domHeight = 0;
  if (domData) {
    const domGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    domGroup.setAttribute('transform', 'translate(250, 0)');
    domHeight = renderDomNodeRecursive(domGroup, domData, 0, 0);
    mainGroup.appendChild(domGroup);
    
    // Draw connection from container to DOM
    if (containerData) {
      const connection = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      connection.setAttribute('d', `M 150 14 C 200 14, 200 14, 250 14`);
      connection.setAttribute('stroke', '#666');
      connection.setAttribute('stroke-width', '2');
      connection.setAttribute('fill', 'none');
      connection.setAttribute('stroke-dasharray', '5,5');
      mainGroup.appendChild(connection);
    }
  }

  canvas.appendChild(mainGroup);
}

function renderContainerNode(parent, node, x, y, depth) {
  const nodeId = node.id || node.name || 'root';
  const isExpanded = expandedNodes.has(nodeId);
  const hasChildren = node.children && node.children.length > 0;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${x + depth * 20}, ${y})`);

  // Background rectangle with improved colors
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '150');
  rect.setAttribute('height', '28');
  rect.setAttribute('fill', '#2d2d30');
  rect.setAttribute('stroke', '#555');
  rect.setAttribute('stroke-width', '1');
  rect.setAttribute('rx', '4');
  rect.style.cursor = 'pointer';

  // Hover effect
  rect.addEventListener('mouseenter', () => {
    rect.setAttribute('fill', '#3e3e42');
    rect.setAttribute('stroke', '#007acc');
  });
  rect.addEventListener('mouseleave', () => {
    rect.setAttribute('fill', '#2d2d30');
    rect.setAttribute('stroke', '#555');
  });
  
  // Toggle expansion on click
  rect.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hasChildren) {
      if (isExpanded) {
        expandedNodes.delete(nodeId);
      } else {
        expandedNodes.add(nodeId);
      }
      renderGraph();
    }
  });

  // Node text with better readability
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', '8');
  text.setAttribute('y', '19');
  text.setAttribute('fill', '#cccccc');
  text.setAttribute('font-size', '12');
  text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  text.setAttribute('pointer-events', 'none');
  text.textContent = node.name || node.id || 'Unknown';

  // Expand/collapse indicator
  const indicatorBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  indicatorBg.setAttribute('cx', '135');
  indicatorBg.setAttribute('cy', '14');
  indicatorBg.setAttribute('r', '7');
  indicatorBg.setAttribute('fill', hasChildren ? '#4CAF50' : '#666');

  const indicatorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  indicatorText.setAttribute('x', '135');
  indicatorText.setAttribute('y', '17');
  indicatorText.setAttribute('text-anchor', 'middle');
  indicatorText.setAttribute('fill', '#fff');
  indicatorText.setAttribute('font-size', '10');
  indicatorText.setAttribute('font-weight', 'bold');
  indicatorText.setAttribute('pointer-events', 'none');
  indicatorText.textContent = hasChildren ? (isExpanded ? '-' : '+') : '•';

  g.appendChild(rect);
  g.appendChild(text);
  g.appendChild(indicatorBg);
  g.appendChild(indicatorText);
  parent.appendChild(g);

  let totalHeight = 28;

  // Draw children if expanded
  if (hasChildren && isExpanded) {
    let currentY = y + 35;
    node.children.forEach((child, index) => {
      // Vertical line from parent to children
      const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vertLine.setAttribute('x1', String(135));
      vertLine.setAttribute('y1', String(y + 28));
      vertLine.setAttribute('x2', String(135));
      vertLine.setAttribute('y2', String(currentY + 14));
      vertLine.setAttribute('stroke', '#666');
      vertLine.setAttribute('stroke-width', '1');
      parent.appendChild(vertLine);
      
      // Horizontal line to child
      const horizLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      horizLine.setAttribute('x1', String(135));
      horizLine.setAttribute('y1', String(currentY + 14));
      horizLine.setAttribute('x2', String(depth + 1 * 20 + 135));
      horizLine.setAttribute('y2', String(currentY + 14));
      horizLine.setAttribute('stroke', '#666');
      horizLine.setAttribute('stroke-width', '1');
      parent.appendChild(horizLine);
      
      const childHeight = renderContainerNode(parent, child, x, currentY, depth + 1);
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

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${x}, ${y})`);

  // DOM node background
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '200');
  rect.setAttribute('height', '24');
  rect.setAttribute('fill', '#252526');
  rect.setAttribute('stroke', '#3e3e42');
  rect.setAttribute('stroke-width', '1');
  rect.setAttribute('rx', '3');
  rect.style.cursor = 'pointer';

  // Hover effect
  rect.addEventListener('mouseenter', () => {
    rect.setAttribute('fill', '#2d2d30');
    rect.setAttribute('stroke', '#007acc');
  });
  rect.addEventListener('mouseleave', () => {
    rect.setAttribute('fill', '#252526');
    rect.setAttribute('stroke', '#3e3e42');
  });

  // Toggle on click
  rect.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hasChildren) {
      if (isExpanded) {
        expandedNodes.delete(nodeId);
      } else {
        expandedNodes.add(nodeId);
      }
      renderGraph();
    }
  });

  // Tag label
  const tagText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  tagText.setAttribute('x', '8');
  tagText.setAttribute('y', '16');
  tagText.setAttribute('fill', '#4ec9b0');
  tagText.setAttribute('font-size', '11');
  tagText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  tagText.setAttribute('font-weight', 'bold');
  tagText.setAttribute('pointer-events', 'none');
  tagText.textContent = node.tag || 'DIV';

  // ID or classes
  const infoText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  const label = node.id ? `#${node.id}` : (node.classes?.[0] ? `.${node.classes[0]}` : '');
  infoText.setAttribute('x', '60');
  infoText.setAttribute('y', '16');
  infoText.setAttribute('fill', '#9cdcfe');
  infoText.setAttribute('font-size', '10');
  infoText.setAttribute('font-family', 'monospace');
  infoText.setAttribute('pointer-events', 'none');
  infoText.textContent = label.substring(0, 25);

  // Expand/collapse indicator
  const indicatorBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  indicatorBg.setAttribute('cx', '190');
  indicatorBg.setAttribute('cy', '12');
  indicatorBg.setAttribute('r', '6');
  indicatorBg.setAttribute('fill', hasChildren ? '#4CAF50' : '#666');

  const indicatorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  indicatorText.setAttribute('x', '190');
  indicatorText.setAttribute('y', '15');
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

  let totalHeight = 24;

  // Draw children if expanded
  if (hasChildren && isExpanded) {
    let currentY = y + 30;
    node.children.forEach((child) => {
      // Vertical line from parent to children
      const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vertLine.setAttribute('x1', '10');
      vertLine.setAttribute('y1', String(y + 24));
      vertLine.setAttribute('x2', '10');
      vertLine.setAttribute('y2', String(currentY + 12));
      vertLine.setAttribute('stroke', '#555');
      vertLine.setAttribute('stroke-width', '1');
      parent.appendChild(vertLine);

      const childHeight = renderDomNodeRecursive(parent, child, x + 15, currentY);
      currentY += childHeight + 6;
      totalHeight = currentY - y;
    });
  }

  return totalHeight;
}
