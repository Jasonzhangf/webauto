let canvas = null;
let containerData = null;
let domData = null;
const expandedNodes = new Set();

// SVG-based graph rendering with improved styling
export function initGraph(canvasEl) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.overflow = 'auto';
  svg.style.backgroundColor = '#1e1e1e';
  canvasEl.appendChild(svg);
  canvas = svg;
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

  // Render container tree (left panel)
  if (containerData) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(10, 10)');
    renderContainerNode(g, containerData, 0, 0, 0);
    canvas.appendChild(g);
  }

  // Render DOM tree (right panel)
  if (domData) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(250, 10)');
    renderDomNodeRecursive(g, domData, 0, 0);
    canvas.appendChild(g);
  }
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
  rect.setAttribute('width', '200');
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
  rect.addEventListener('click', () => {
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
  text.setAttribute('font-size', '13');
  text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  text.textContent = node.name || node.id || 'Unknown';

  // Type badge
  const typeBadge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  typeBadge.setAttribute('x', '170');
  typeBadge.setAttribute('y', '4');
  typeBadge.setAttribute('width', '24');
  typeBadge.setAttribute('height', '20');
  typeBadge.setAttribute('fill', '#007acc');
  typeBadge.setAttribute('rx', '3');

  const typeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  typeText.setAttribute('x', '182');
  typeText.setAttribute('y', '17');
  typeText.setAttribute('text-anchor', 'middle');
  typeText.setAttribute('fill', '#ffffff');
  typeText.setAttribute('font-size', '9');
  typeText.setAttribute('font-weight', 'bold');
  typeText.textContent = node.type ? node.type.slice(0, 2).toUpperCase() : 'PG';

  // Expand/collapse indicator
  const indicatorBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  indicatorBg.setAttribute('cx', '155');
  indicatorBg.setAttribute('cy', '14');
  indicatorBg.setAttribute('r', '7');
  indicatorBg.setAttribute('fill', hasChildren ? '#4CAF50' : '#666');

  const indicatorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  indicatorText.setAttribute('x', '155');
  indicatorText.setAttribute('y', '17');
  indicatorText.setAttribute('text-anchor', 'middle');
  indicatorText.setAttribute('fill', '#fff');
  indicatorText.setAttribute('font-size', '10');
  indicatorText.setAttribute('font-weight', 'bold');
  indicatorText.textContent = hasChildren ? (isExpanded ? '-' : '+') : '•';

  g.appendChild(rect);
  g.appendChild(text);
 g.appendChild(typeBadge);
 g.appendChild(typeText);
 g.appendChild(indicatorBg);
 g.appendChild(indicatorText);
 parent.appendChild(g);

 // Draw children if expanded
 if (hasChildren && isExpanded) {
    let currentY = y + 28 + 7;
    node.children.forEach((child) => {
      // Connection line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(10 + depth * 20));
      line.setAttribute('y1', String(y + 28));
      line.setAttribute('x2', String(10 + (depth + 1) * 20));
      line.setAttribute('y2', String(currentY + 14));
      line.setAttribute('stroke', '#666');
      line.setAttribute('stroke-width', '1');
      parent.appendChild(line);
      
      renderContainerNode(parent, child, x, currentY, depth + 1);
      currentY += 35;
    });
  } else {
    return 28;
  }

  return currentY - (y + 28 + 7);
}

function renderDomNodeRecursive(parent, node, x, y) {
  if (!node || typeof node !== 'object') return y;

  const nodeId = node.path || node.id || `dom-${Math.random()}`;
  const isExpanded = expandedNodes.has(nodeId);
  const hasChildren = node.children && node.children.length > 0;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${x}, ${y})`);

  // DOM node background
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '220');
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
  rect.addEventListener('click', () => {
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
  tagText.textContent = node.tag || 'DIV';

  // ID or classes
  const infoText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  const label = node.id ? `#${node.id}` : (node.classes?.[0] ? `.${node.classes[0]}` : '');
  infoText.setAttribute('x', '60');
  infoText.setAttribute('y', '16');
  infoText.setAttribute('fill', '#9cdcfe');
  infoText.setAttribute('font-size', '10');
  infoText.setAttribute('font-family', 'monospace');
  infoText.textContent = label.substring(0, 25);

  // Expand/collapse indicator
  const indicatorBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  indicatorBg.setAttribute('cx', '210');
  indicatorBg.setAttribute('cy', '12');
  indicatorBg.setAttribute('r', '6');
  indicatorBg.setAttribute('fill', hasChildren ? '#4CAF50' : '#666');

  const indicatorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  indicatorText.setAttribute('x', '210');
  indicatorText.setAttribute('y', '15');
  indicatorText.setAttribute('text-anchor', 'middle');
  indicatorText.setAttribute('fill', '#fff');
  indicatorText.setAttribute('font-size', '10');
  indicatorText.setAttribute('font-weight', 'bold');
  indicatorText.textContent = hasChildren ? (isExpanded ? '-' : '+') : '•';

  g.appendChild(rect);
  g.appendChild(tagText);
  g.appendChild(infoText);
 g.appendChild(indicatorBg);
 g.appendChild(indicatorText);
 parent.appendChild(g);

 // Draw children if expanded
 if (hasChildren && isExpanded) {
   let currentY = y + 30;
   node.children.forEach((child) => {
     // Connection line
     const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
     line.setAttribute('x1', '10');
     line.setAttribute('y1', String(y + 24));
     line.setAttribute('x2', '15');
     line.setAttribute('y2', String(currentY + 12));
     line.setAttribute('stroke', '#555');
     line.setAttribute('stroke-width', '1');
     parent.appendChild(line);

     renderDomNodeRecursive(parent, child, x + 15, currentY);
     currentY += 30;
   });

  } else {
    return 24;
  }

  return currentY - (y + 30);
}
