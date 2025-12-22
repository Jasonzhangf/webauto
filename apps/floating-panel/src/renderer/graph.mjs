let canvas, ctx;
let containerData = null;
let domData = null;
let selectedNode = null;
let hoveredNode = null;

// Simple SVG-based graph rendering instead of canvas
export function initGraph(canvasEl) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '300');
  svg.style.border = '1px solid #333';
  svg.style.backgroundColor = '#1a1a1a';
  canvasEl.appendChild(svg);
  canvas = svg;
}

export function updateContainerTree(data) {
  if (!canvas) return;
  containerData = data;
  renderGraph();
}

export function updateDomTree(data) {
  domData = data;
  renderGraph();
}

function renderGraph() {
  if (!canvas) return;
  
  // Clear previous content
  while (canvas.firstChild) {
    canvas.removeChild(canvas.firstChild);
  }

  // Render container tree
  if (containerData) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(10, 20)');
    
    renderContainerNode(g, containerData, 150, 0, 0);
    
    canvas.appendChild(g);
  }

  // Render DOM tree (simplified)
  if (domData && Array.isArray(domData)) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(350, 20)');
    
    renderDomNodes(g, domData.slice(0, 10), 0, 0);
    
    canvas.appendChild(g);
  }

  // Draw connection lines
  if (containerData && domData && Array.isArray(domData)) {
    const connections = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    connections.setAttribute('stroke', '#4a9eff');
    connections.setAttribute('stroke-width', '1');
    connections.setAttribute('fill', 'none');
    connections.setAttribute('opacity', '0.6');
    
    // Simple connection from container to DOM root
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '160');
    line.setAttribute('y1', '50');
    line.setAttribute('x2', '350');
    line.setAttribute('y2', '50');
    connections.appendChild(line);
    
    canvas.appendChild(connections);
  }
}

function renderContainerNode(parent, node, x, y, depth) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${x}, ${y})`);
  
  // Node rectangle
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '140');
  rect.setAttribute('height', '30');
  rect.setAttribute('fill', '#2a2a2a');
  rect.setAttribute('stroke', '#4a9eff');
  rect.setAttribute('stroke-width', '2');
  rect.setAttribute('rx', '5');
  rect.style.cursor = 'pointer';
  
  // Highlight on hover
  rect.addEventListener('mouseenter', () => {
    rect.setAttribute('fill', '#3a3a3a');
  });
  rect.addEventListener('mouseleave', () => {
    rect.setAttribute('fill', '#2a2a2a');
  });
  
  // Node text
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', '70');
  text.setAttribute('y', '20');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', '#9aff9a');
  text.setAttribute('font-size', '12');
  text.setAttribute('font-family', 'monospace');
  text.textContent = node.name || node.id || 'Unknown';
  
  g.appendChild(rect);
  g.appendChild(text);
  parent.appendChild(g);
  
  // Render children
  if (node.children && node.children.length > 0) {
    node.children.forEach((child, index) => {
      const childY = y + 40 + index * 35;
      
      // Connection line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '70');
      line.setAttribute('y1', '30');
      line.setAttribute('x2', '70');
      line.setAttribute('y2', childY - y);
      line.setAttribute('stroke', '#4a9eff');
      line.setAttribute('stroke-width', '1');
      parent.appendChild(line);
      
      renderContainerNode(parent, child, x, childY, depth + 1);
    });
  }
}

function renderDomNodes(parent, nodes, x, y) {
  nodes.forEach((node, index) => {
    const nodeY = y + index * 25;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${x}, ${nodeY})`);
    
    // DOM node indicator
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', '120');
    rect.setAttribute('height', '20');
    rect.setAttribute('fill', '#1a1a1a');
    rect.setAttribute('stroke', '#ff9a4a');
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('rx', '3');
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '5');
    text.setAttribute('y', '14');
    text.setAttribute('fill', '#d1f7d1');
    text.setAttribute('font-size', '10');
    text.setAttribute('font-family', 'monospace');
    text.textContent = `${node.tag || 'DIV'} ${node.classes?.[0] || ''}`.substring(0, 15);
    
    g.appendChild(rect);
    g.appendChild(text);
    parent.appendChild(g);
  });
}
