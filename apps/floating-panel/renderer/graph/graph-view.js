import { BaseControl } from '../ui/baseControl.js';
import { registerControl, unregisterControl } from '../ui/controlRegistry.js';

const DEFAULTS = {
  minWidth: 820,
  marginX: 120,
  columnGap: 420,
  nodeHeight: 34,
  nodePadding: 8,
  verticalSpacing: 20,
  font: '11px "JetBrains Mono", "SFMono-Regular", monospace',
  containerWidth: 230,
  domWidth: 280,
  domIndent: 26,
};

function drawRoundedRect(ctx, x, y, width, height, radius = 6) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export class ContainerDomGraphView extends BaseControl {
  constructor(rootEl) {
    super('graph-view', rootEl);
    this.root = rootEl;
    this.canvas = rootEl?.querySelector('#graphCanvas') || null;
    this.tooltip = rootEl?.querySelector('#graphTooltip') || null;
    this.ctx = this.canvas?.getContext('2d') || null;
    this.nodes = [];
    this.nodeMap = new Map();
    this.links = [];
    this.selection = { containerId: null, domPath: null };
    this.callbacks = { onSelectContainer: null, onSelectDom: null, onLinkNodes: null, onExpandDom: null };
    this.hoverNode = null;
    this.resizeObserver = null;
    this.interaction = {
      linkModeActive: false,
      linkContainerId: null,
      dragLink: null,
      pointer: { x: 0, y: 0 },
    };
    this.boundWindowPointerUp = (event) => this.handlePointerUp(event);
    this.layout = {
      containerX: DEFAULTS.marginX,
      domX: DEFAULTS.marginX + DEFAULTS.columnGap,
    };
    this.registerEvents();
    registerControl(this);
  }

  registerEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener('mousemove', (event) => this.handlePointerMove(event));
    this.canvas.addEventListener('mouseleave', () => this.handlePointerLeave());
    this.canvas.addEventListener('click', (event) => this.handlePointerClick(event));
    this.canvas.addEventListener('mousedown', (event) => this.handlePointerDown(event));
    window.addEventListener('mouseup', this.boundWindowPointerUp);
    if (typeof ResizeObserver !== 'undefined' && this.root) {
      this.resizeObserver = new ResizeObserver(() => this.draw());
      this.resizeObserver.observe(this.root);
    }
  }

  destroy() {
    unregisterControl(this);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('mouseup', this.boundWindowPointerUp);
    if (!this.canvas) return;
    this.canvas.removeEventListener('mousemove', this.handlePointerMove);
    this.canvas.removeEventListener('mouseleave', this.handlePointerLeave);
    this.canvas.removeEventListener('click', this.handlePointerClick);
    this.canvas.removeEventListener('mousedown', this.handlePointerDown);
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setData({ containers = [], domNodes = [], links = [] }) {
    const containerNodes = containers.map((row, index) => this.createContainerNode(row, index));
    const domList = domNodes.map((node, index) => this.createDomNode(node, index));
    this.nodes = [...containerNodes, ...domList];
    this.nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
    this.links = Array.isArray(links) ? links : [];
    this.draw();
    this.emit('dev:update', this.inspect());
  }

  setSelection({ containerId, domPath }) {
    this.selection = { containerId: containerId || null, domPath: domPath || null };
    this.draw();
    this.emit('dev:update', this.inspect());
  }

  setInteractionMode(options = {}) {
    const link = options.linkMode || {};
    this.interaction.linkModeActive = Boolean(link.active);
    this.interaction.linkContainerId = link.containerId || null;
    if (!this.interaction.linkModeActive) {
      this.interaction.dragLink = null;
    }
    this.draw();
    this.emit('dev:update', this.inspect());
  }

  createContainerNode(row, order = 0) {
    const container = row.container;
    const depth = row.depth || 0;
    return {
      id: container.id || container.container_id || container.containerId,
      type: 'container',
      label: container.name || container.id || '未命名容器',
      selector: this.getPrimarySelector(container),
      depth,
      parentId: row.parentId || null,
      order,
      width: DEFAULTS.containerWidth,
      height: DEFAULTS.nodeHeight,
    };
  }

  createDomNode(node, order = 0) {
    return {
      id: node.path,
      type: 'dom',
      parentId: node.parentPath || null,
      label: node.label,
      selector: node.selector || node.path,
      containerId: node.containerId,
      depth: node.depth || 0,
      order,
      width: DEFAULTS.domWidth,
      height: DEFAULTS.nodeHeight,
      expandable: Boolean(node.canExpand),
      expanded: Boolean(node.expanded),
      loading: Boolean(node.loading),
      expandBounds: null,
    };
  }

  getPrimarySelector(container) {
    const selectorCandidates = [
      container.match?.matched_selector,
      ...(container.match?.selectors || []),
      ...(Array.isArray(container.selectors) ? container.selectors.map((sel) => sel?.css).filter(Boolean) : []),
    ].filter(Boolean);
    return selectorCandidates[0] || '';
  }

  computeLayout(width) {
    const usableWidth = Math.max(width, DEFAULTS.minWidth);
    const margin = DEFAULTS.marginX;
    const gap = Math.max(DEFAULTS.columnGap, usableWidth * 0.32);
    this.layout.containerX = margin;
    this.layout.domX = margin + gap;
    const containerNodes = this.nodes.filter((node) => node.type === 'container');
    const domNodes = this.nodes.filter((node) => node.type === 'dom');
    containerNodes.forEach((node, index) => {
      node.x = this.layout.containerX;
      node.y = DEFAULTS.verticalSpacing + index * (DEFAULTS.nodeHeight + DEFAULTS.verticalSpacing + 6);
    });
    domNodes.forEach((node, index) => {
      const depthOffset = Math.max(node.depth || 0, 0) * DEFAULTS.domIndent;
      node.x = this.layout.domX + depthOffset;
      node.y = DEFAULTS.verticalSpacing + index * (DEFAULTS.nodeHeight + DEFAULTS.verticalSpacing + 6);
    });
  }

  draw() {
    if (!this.canvas || !this.ctx) return;
    const width = this.root?.clientWidth || DEFAULTS.minWidth;
    this.computeLayout(width);
    const height = Math.max(
      this.root?.clientHeight || 480,
      this.nodes.reduce((max, node) => Math.max(max, node.y + node.height + DEFAULTS.verticalSpacing), 360),
    );
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.save();
    this.ctx.scale(dpr, dpr);
    this.ctx.clearRect(0, 0, width, height);
    this.drawLinks();
    this.drawNodes();
    this.drawPendingLink();
    this.ctx.restore();
    this.emit('dev:update', this.inspect());
  }

  drawNodes() {
    this.drawContainerTreeConnectors();
    this.drawDomTreeConnectors();
    for (const node of this.nodes) {
      if (node.type === 'container') {
        this.drawContainerNode(node);
      } else {
        this.drawDomNode(node);
      }
    }
  }

  drawContainerNode(node) {
    const ctx = this.ctx;
    const isSelected = this.selection.containerId === node.id;
    const baseX = node.x + node.depth * 18;
    const padding = DEFAULTS.nodePadding;
    ctx.save();
    ctx.fillStyle = isSelected ? 'rgba(60,100,255,0.32)' : 'rgba(10,18,42,0.58)';
    ctx.strokeStyle = isSelected ? 'rgba(130,190,255,0.9)' : 'rgba(90,130,255,0.35)';
    ctx.lineWidth = isSelected ? 1.6 : 1;
    drawRoundedRect(ctx, baseX - node.width / 2, node.y, node.width, node.height, 7);
    ctx.fill();
    ctx.stroke();

    if (node.depth > 0) {
      ctx.strokeStyle = 'rgba(100,120,180,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(baseX - node.width / 2 - 6, node.y);
      ctx.lineTo(baseX - node.width / 2 - 6, node.y + node.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(baseX - node.width / 2 - 6, node.y + node.height / 2);
      ctx.lineTo(baseX - node.width / 2, node.y + node.height / 2);
      ctx.stroke();
    }

    const label = this.truncateText(node.label || '未命名容器', node.width - padding * 2, DEFAULTS.font);
    const selectorText = node.selector
      ? this.truncateText(node.selector, node.width - padding * 2, '10px "JetBrains Mono", "SFMono-Regular", monospace')
      : '';
    ctx.fillStyle = '#dce3ff';
    ctx.font = DEFAULTS.font;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, baseX - node.width / 2 + padding, node.y + node.height / 2 - 6);
    if (selectorText) {
      ctx.fillStyle = 'rgba(195,210,255,0.7)';
      ctx.font = '10px "JetBrains Mono", "SFMono-Regular", monospace';
      ctx.fillText(selectorText, baseX - node.width / 2 + padding, node.y + node.height / 2 + 8);
    }
    ctx.restore();
  }

  drawDomNode(node) {
    const ctx = this.ctx;
    const isSelected = this.selection.domPath === node.id;
    const padding = DEFAULTS.nodePadding;
    ctx.save();
    ctx.fillStyle = isSelected ? 'rgba(40,150,120,0.45)' : 'rgba(12,36,30,0.55)';
    ctx.strokeStyle = isSelected ? 'rgba(120,240,190,0.95)' : 'rgba(80,200,155,0.38)';
    ctx.lineWidth = isSelected ? 1.8 : 1;
    drawRoundedRect(ctx, node.x - node.width / 2, node.y, node.width, node.height, 7);
    ctx.fill();
    ctx.stroke();

    const label = this.truncateText(node.label || '', node.width - padding * 2, DEFAULTS.font);
    const selectorText = node.selector
      ? this.truncateText(node.selector, node.width - padding * 2, '10px "JetBrains Mono", "SFMono-Regular", monospace')
      : '';
    ctx.fillStyle = '#dbffef';
    ctx.font = DEFAULTS.font;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, node.x - node.width / 2 + padding, node.y + node.height / 2 - 6);
    if (selectorText) {
      ctx.fillStyle = 'rgba(190, 240, 215, 0.75)';
      ctx.font = '10px "JetBrains Mono", "SFMono-Regular", monospace';
      ctx.fillText(selectorText, node.x - node.width / 2 + padding, node.y + node.height / 2 + 8);
    }
    if (node.expandable || node.loading) {
      this.drawExpandIcon(node);
    } else {
      node.expandBounds = null;
    }
    ctx.restore();
  }

  drawExpandIcon(node) {
    const ctx = this.ctx;
    const size = 14;
    const padding = 6;
    const iconX = node.x - node.width / 2 - size - padding;
    const iconY = node.y + node.height / 2 - size / 2;
    node.expandBounds = { x: iconX, y: iconY, size };
    ctx.save();
    ctx.fillStyle = node.loading ? 'rgba(250,190,90,0.8)' : node.expanded ? 'rgba(80,140,200,0.85)' : 'rgba(80,200,155,0.8)';
    ctx.strokeStyle = 'rgba(12,36,30,0.8)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, iconX, iconY, size, size, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#051a16';
    ctx.font = '10px "JetBrains Mono", "SFMono-Regular", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const symbol = node.loading ? '…' : node.expanded ? '−' : '+';
    ctx.fillText(symbol, iconX + size / 2, iconY + size / 2 + 1);
    ctx.restore();
  }

  drawContainerTreeConnectors() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(110, 140, 200, 0.45)';
    ctx.lineWidth = 1;
    const containers = this.nodes.filter((node) => node.type === 'container');
    containers.forEach((node) => {
      if (!node.parentId) return;
      const parent = this.nodeMap.get(node.parentId);
      if (!parent) return;
      const parentBaseX = parent.x + parent.depth * 18;
      const parentAnchorX = parentBaseX - parent.width / 2 - 14;
      const parentAnchorY = parent.y + parent.height / 2;
      const childBaseX = node.x + node.depth * 18;
      const childAnchorX = childBaseX - node.width / 2 - 14;
      const childAnchorY = node.y + node.height / 2;
      ctx.beginPath();
      ctx.moveTo(parentAnchorX, parentAnchorY);
      ctx.lineTo(parentAnchorX, childAnchorY);
      ctx.lineTo(childAnchorX, childAnchorY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(childAnchorX, childAnchorY, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(130, 170, 240, 0.8)';
      ctx.fill();
    });
    ctx.restore();
  }

  drawDomTreeConnectors() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 210, 170, 0.35)';
    ctx.lineWidth = 1;
    const domNodes = this.nodes.filter((node) => node.type === 'dom');
    domNodes.forEach((node) => {
      if (!node.parentId) return;
      const parent = this.nodeMap.get(node.parentId);
      if (!parent || parent.type !== 'dom') return;
      const parentAnchorX = parent.x - parent.width / 2 - 12;
      const parentAnchorY = parent.y + parent.height / 2;
      const childAnchorX = node.x - node.width / 2 - 12;
      const childAnchorY = node.y + node.height / 2;
      ctx.beginPath();
      ctx.moveTo(parentAnchorX, parentAnchorY);
      ctx.lineTo(parentAnchorX, childAnchorY);
      ctx.lineTo(childAnchorX, childAnchorY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(childAnchorX, childAnchorY, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160, 240, 210, 0.7)';
      ctx.fill();
    });
    ctx.restore();
  }

  drawLinks() {
    const ctx = this.ctx;
    for (const link of this.links) {
      const from = this.nodes.find((node) => node.type === 'container' && node.id === link.from);
      const to = this.nodes.find((node) => node.type === 'dom' && node.id === link.to);
      if (!from || !to) continue;
      const highlight =
        this.selection.containerId === from.id ||
        (this.selection.domPath && this.selection.domPath === to.id);
      this.drawConnectorLine(
        from.x + from.depth * 18 + from.width / 2,
        from.y + from.height / 2,
        to.x - to.width / 2,
        to.y + to.height / 2,
        highlight,
      );
    }
  }

  drawPendingLink() {
    if (!this.interaction.dragLink || !this.ctx) return;
    const { startX, startY } = this.interaction.dragLink;
    const pointer = this.interaction.pointer;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 190, 90, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(pointer.x, pointer.y);
    ctx.stroke();
    ctx.restore();
  }

  drawConnectorLine(startX, startY, endX, endY, highlight) {
    const ctx = this.ctx;
    const ctrlX = startX + (endX - startX) * 0.55;
    ctx.save();
    ctx.strokeStyle = highlight ? 'rgba(90, 245, 190, 0.95)' : 'rgba(105, 140, 255, 0.4)';
    ctx.lineWidth = highlight ? 2.2 : 1.1;
    ctx.shadowColor = highlight ? 'rgba(90, 245, 190, 0.35)' : 'transparent';
    ctx.shadowBlur = highlight ? 6 : 0;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(ctrlX, startY, ctrlX, endY, endX, endY);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 7, endY - 4);
    ctx.lineTo(endX - 7, endY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  handlePointerMove(event) {
    this.updatePointerPosition(event);
    const node = this.hitTest(event);
    if (node !== this.hoverNode) {
      this.hoverNode = node;
      this.updateTooltip(node, event);
    } else if (node) {
      this.updateTooltipPosition(event);
    }
    if (this.interaction.dragLink) {
      this.draw();
    }
  }

  handlePointerLeave() {
    this.hoverNode = null;
    this.hideTooltip();
  }

  handlePointerClick(event) {
    const hit = this.hitTestWithRegion(event);
    const node = hit.node;
    if (!node) return;
    if (hit.region === 'expand' && node.type === 'dom') {
      if (this.callbacks.onExpandDom) {
        this.callbacks.onExpandDom(node.id);
      }
      return;
    }
    if (this.interaction.linkModeActive) {
      if (node.type === 'container') {
        this.interaction.linkContainerId = node.id;
        if (this.callbacks.onSelectContainer) {
          this.callbacks.onSelectContainer(node.id);
        }
        this.draw();
        return;
      }
      if (node.type === 'dom') {
        if (this.interaction.linkContainerId && this.callbacks.onLinkNodes) {
          this.callbacks.onLinkNodes(this.interaction.linkContainerId, node.id);
          return;
        }
        if (this.callbacks.onSelectDom) {
          this.callbacks.onSelectDom(node.id);
        }
        return;
      }
    }
    if (node.type === 'container' && this.callbacks.onSelectContainer) {
      this.callbacks.onSelectContainer(node.id);
    } else if (node.type === 'dom' && this.callbacks.onSelectDom) {
      this.callbacks.onSelectDom(node.id);
    }
  }

  handlePointerDown(event) {
    if (event.button !== 0) return;
    if (!this.interaction.linkModeActive) return;
    const hit = this.hitTestWithRegion(event);
    const node = hit.node;
    if (!node || node.type !== 'container' || hit.region === 'expand') return;
    const anchor = this.getContainerAnchor(node);
    this.updatePointerPosition(event);
    this.interaction.dragLink = {
      containerId: node.id,
      node,
      startX: anchor.x,
      startY: anchor.y,
    };
    this.interaction.linkContainerId = node.id;
    if (this.callbacks.onSelectContainer) {
      this.callbacks.onSelectContainer(node.id);
    }
    this.draw();
  }

  handlePointerUp(event) {
    if (!this.interaction.dragLink) return;
    const dragLink = this.interaction.dragLink;
    this.interaction.dragLink = null;
    this.updatePointerPosition(event);
    this.draw();
    const node = this.hitTest(event);
    if (node && node.type === 'dom' && this.callbacks.onLinkNodes) {
      this.callbacks.onLinkNodes(dragLink.containerId, node.id);
    }
  }

  hitTestWithRegion(event) {
    const coords = this.getPointerPosition(event);
    const expandNode =
      this.nodes.find((candidate) => candidate.expandBounds && pointInBounds(coords, candidate.expandBounds)) || null;
    if (expandNode) {
      return { node: expandNode, region: 'expand' };
    }
    const node = this.hitTest(event);
    if (!node) return { node: null, region: null };
    return { node, region: 'body' };
  }

  hitTest(event) {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return (
      this.nodes.find((node) => {
        const left = (node.type === 'container' ? node.x + node.depth * 18 : node.x) - node.width / 2;
        const right = left + node.width;
        const top = node.y;
        const bottom = top + node.height;
        return x >= left && x <= right && y >= top && y <= bottom;
      }) || null
    );
  }

  updateTooltip(node, event) {
    if (!this.tooltip) return;
    if (!node) {
      this.hideTooltip();
      return;
    }
    this.tooltip.querySelector('.graph-tooltip-title').textContent = node.label || '';
    this.tooltip.querySelector('.graph-tooltip-body').textContent = node.selector || '';
    this.tooltip.classList.remove('hidden');
    this.updateTooltipPosition(event);
  }

  updateTooltipPosition(event) {
    if (!this.tooltip) return;
    const rect = this.root.getBoundingClientRect();
    const x = event.clientX - rect.left + 10;
    const y = event.clientY - rect.top + 10;
    this.tooltip.style.transform = `translate(${x}px, ${y}px)`;
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.classList.add('hidden');
    }
  }

  updatePointerPosition(event) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.interaction.pointer = { x, y };
  }

  getPointerPosition(event) {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y };
  }

  getContainerAnchor(node) {
    const offsetX = node.depth * 18;
    const baseX = node.x + offsetX + node.width / 2;
    const baseY = node.y + node.height / 2;
    return { x: baseX, y: baseY };
  }

  truncateText(text, maxWidth, font) {
    if (!text) return '';
    if (!this.ctx) return text;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = font;
    const ellipsis = '…';
    const ellipsisWidth = ctx.measureText(ellipsis).width;
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.restore();
      return text;
    }
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(truncated).width + ellipsisWidth > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    ctx.restore();
    return truncated ? `${truncated}${ellipsis}` : ellipsis;
  }

  inspect() {
    return {
      ...super.inspect(),
      nodes: this.nodes.length,
      links: this.links.length,
      selection: this.selection,
      linkMode: this.interaction.linkModeActive,
    };
  }
}

function pointInBounds(point, bounds) {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.size &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.size
  );
}
