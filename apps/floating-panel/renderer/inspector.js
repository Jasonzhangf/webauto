const dom = {
  session: document.getElementById('inspectorSession'),
  url: document.getElementById('inspectorUrl'),
  containerTree: document.getElementById('containerTree'),
  domTree: document.getElementById('domTree'),
  linkLayer: document.getElementById('linkLayer'),
  linkDetails: document.getElementById('linkDetails'),
  refresh: document.getElementById('refreshInspector'),
  close: document.getElementById('closeInspector'),
  workspace: document.getElementById('inspectorWorkspace'),
  toast: document.getElementById('toast'),
};

const state = {
  payload: null,
  selectedContainer: null,
  selectedDomPath: null,
  linkPairs: [],
  drawHandle: null,
  toastHandle: null,
};

const isEmbed = !window.desktopAPI;

function init() {
  bindEvents();
  setupBridge();
}

function bindEvents() {
  dom.refresh?.addEventListener('click', () => {
    sendInspectorCommand({ type: 'refresh' });
  });
  if (isEmbed) {
    if (dom.close) {
      dom.close.style.display = 'none';
    }
  } else {
    dom.close?.addEventListener('click', () => window.close());
  }
  window.addEventListener('resize', () => scheduleConnectorDraw());
  dom.containerTree?.addEventListener('scroll', () => scheduleConnectorDraw());
  dom.domTree?.addEventListener('scroll', () => scheduleConnectorDraw());
}

function setupBridge() {
  if (window.desktopAPI) {
    window.desktopAPI.onInspectorData?.(handleIncomingPayload);
    window.desktopAPI.onInspectorEvent?.(handleInspectorEvent);
    window.desktopAPI.notifyInspectorReady?.();
  } else {
    window.addEventListener('message', handleInlineMessage);
    window.parent?.postMessage({ channel: 'inline-inspector', type: 'ready' }, '*');
  }
}

function handleInlineMessage(event) {
  const data = event.data;
  if (!data || data.channel !== 'inline-inspector') return;
  if (data.type === 'data') {
    handleIncomingPayload(data.payload);
    return;
  }
  if (data.type === 'event') {
    handleInspectorEvent(data.payload);
    return;
  }
}

function sendInspectorCommand(command) {
  if (window.desktopAPI?.sendInspectorCommand) {
    window.desktopAPI.sendInspectorCommand(command);
  } else {
    window.parent?.postMessage({ channel: 'inline-inspector', type: 'command', payload: command }, '*');
  }
}

function handleIncomingPayload(payload) {
  if (!payload) return;
  const snapshot = payload.snapshot || payload.containerSnapshot || null;
  state.payload = { ...payload, snapshot };
  state.selectedContainer = snapshot?.root_match?.container?.id || null;
  state.selectedDomPath = null;
  renderInspector();
}

function handleInspectorEvent(event) {
  if (!event) return;
  if (event.type === 'snapshot' && event.data) {
    state.payload = event.data;
    renderInspector();
    return;
  }
  if (event.type === 'toast') {
    showToast(event.data?.message || '已完成', false);
    return;
  }
  if (event.type === 'error') {
    showToast(event.error || '操作失败', true);
  }
}

function renderInspector() {
  const payload = state.payload;
  if (!payload) {
    dom.containerTree.innerHTML = '<div class="empty-state">等待匹配结果...</div>';
    dom.domTree.innerHTML = '<div class="empty-state">等待匹配结果...</div>';
    dom.linkDetails.innerHTML = '<div class="empty-state">暂无匹配详情</div>';
    dom.session.textContent = '会话: -';
    dom.url.textContent = 'URL: -';
    state.linkPairs = [];
    scheduleConnectorDraw();
    return;
  }

  const snapshot = payload.snapshot || null;
  dom.session.textContent = `会话: ${payload.sessionId || payload.profileId || '未知'}`;
  dom.url.textContent = `URL: ${payload.targetUrl || 'N/A'}`;

  renderContainerTree(snapshot?.container_tree);
  renderDomTree(snapshot?.dom_tree);
  buildLinkPairs(snapshot?.matches || {});
  if (state.selectedContainer) {
    const domPath = state.selectedDomPath || pickDomPath(state.selectedContainer);
    state.selectedDomPath = domPath || null;
  }
  applyHighlights();
  scheduleConnectorDraw();
}

function renderContainerTree(root) {
  dom.containerTree.innerHTML = '';
  if (!root) {
    dom.containerTree.innerHTML = '<div class="empty-state">未检测到容器定义</div>';
    return;
  }
  dom.containerTree.appendChild(createContainerNode(root));
}

function createContainerNode(node) {
  const wrapper = document.createElement('div');
  wrapper.className = 'container-node';
  wrapper.dataset.containerId = node.id;

  const head = document.createElement('div');
  head.className = 'node-head';

  if ((node.children || []).length) {
    const toggle = document.createElement('button');
    toggle.className = 'collapse-toggle';
    toggle.textContent = '−';
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      wrapper.classList.toggle('collapsed');
      toggle.textContent = wrapper.classList.contains('collapsed') ? '+' : '−';
      scheduleConnectorDraw();
    });
    head.appendChild(toggle);
  } else {
    const spacer = document.createElement('div');
    spacer.style.width = '26px';
    head.appendChild(spacer);
  }

  const info = document.createElement('div');
  info.className = 'node-info';
  info.innerHTML = `
    <div class="title">${node.name || node.id}</div>
    <div class="meta">${node.id}</div>
  `;

  const stats = document.createElement('div');
  stats.className = 'node-stats';
  const matchCount = document.createElement('span');
  matchCount.className = node.match?.match_count ? 'match-count success' : 'match-count';
  matchCount.textContent = `匹配: ${node.match?.match_count || 0}`;
  stats.appendChild(matchCount);

  head.appendChild(info);
  head.appendChild(stats);
  wrapper.appendChild(head);

  head.addEventListener('click', () => {
    highlightLink(node.id, pickDomPath(node.id));
  });

  const actions = document.createElement('div');
  actions.className = 'node-actions';
  const highlightBtn = document.createElement('button');
  highlightBtn.textContent = '高亮';
  highlightBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    highlightLink(node.id, pickDomPath(node.id));
  });

  const editBtn = document.createElement('button');
  editBtn.textContent = '编辑';
  editBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    requestSelectorEdit(node);
  });

  const addBtn = document.createElement('button');
  addBtn.textContent = '新子容器';
  addBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    requestCreateChild(node);
  });

  actions.appendChild(highlightBtn);
  actions.appendChild(editBtn);
  actions.appendChild(addBtn);
  wrapper.appendChild(actions);

  if ((node.children || []).length) {
    const childrenHost = document.createElement('div');
    childrenHost.className = 'container-children';
    node.children.forEach((child) => {
      childrenHost.appendChild(createContainerNode(child));
    });
    wrapper.appendChild(childrenHost);
  }

  return wrapper;
}

function renderDomTree(root) {
  dom.domTree.innerHTML = '';
  if (!root) {
    dom.domTree.innerHTML = '<div class="empty-state">未能捕获 DOM 树</div>';
    return;
  }
  dom.domTree.appendChild(createDomNode(root));
}

function createDomNode(node) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dom-node';
  wrapper.dataset.domPath = node.path;

  const head = document.createElement('div');
  head.className = 'dom-node-head';
  const meta = document.createElement('div');
  meta.className = 'dom-meta';
  const idPart = node.id ? `#${node.id}` : '';
  const classPart = (node.classes || []).length ? `.${node.classes.slice(0, 3).join('.')}` : '';
  meta.innerHTML = `
    <span class="tag">&lt;${(node.tag || '').toLowerCase()}&gt;</span>
    <span class="hint">${idPart}${classPart || ''}</span>
  `;

  const actions = document.createElement('div');
  actions.className = 'dom-actions';
  if ((node.children || []).length) {
    const toggle = document.createElement('button');
    toggle.textContent = '−';
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      wrapper.classList.toggle('collapsed');
      toggle.textContent = wrapper.classList.contains('collapsed') ? '+' : '−';
      scheduleConnectorDraw();
    });
    actions.appendChild(toggle);
  }

  head.appendChild(meta);
  head.appendChild(actions);
  wrapper.appendChild(head);

  head.addEventListener('click', () => {
    if (state.selectedContainer) {
      highlightLink(state.selectedContainer, node.path);
    } else if ((node.containers || []).length) {
      highlightLink(node.containers[0].container_id, node.path);
    } else {
      state.selectedDomPath = node.path;
      state.selectedContainer = null;
      applyHighlights();
    }
  });

  if ((node.containers || []).length) {
    const attachments = document.createElement('div');
    attachments.className = 'dom-attachments';
    node.containers.forEach((ref) => {
      const pill = document.createElement('button');
      pill.textContent = ref.container_name || ref.container_id;
      pill.addEventListener('click', (event) => {
        event.stopPropagation();
        highlightLink(ref.container_id, node.path);
      });
      attachments.appendChild(pill);
    });
    wrapper.appendChild(attachments);
  }

  if ((node.children || []).length) {
    const childrenHost = document.createElement('div');
    childrenHost.className = 'dom-children';
    node.children.forEach((child) => {
      childrenHost.appendChild(createDomNode(child));
    });
    wrapper.appendChild(childrenHost);
  }

  return wrapper;
}

function highlightLink(containerId, domPath) {
  if (!containerId) return;
  state.selectedContainer = containerId;
  state.selectedDomPath = domPath || pickDomPath(containerId) || null;
  applyHighlights();
}

function pickDomPath(containerId) {
  const match = state.payload?.snapshot?.matches?.[containerId];
  if (!match || !match.nodes || !match.nodes.length) {
    return null;
  }
  return match.nodes[0].dom_path || null;
}

function applyHighlights() {
  document.querySelectorAll('.container-node.selected').forEach((node) => {
    node.classList.remove('selected');
  });
  if (state.selectedContainer) {
    dom.containerTree
      ?.querySelector(`[data-container-id="${state.selectedContainer}"]`)
      ?.classList.add('selected');
  }

  document.querySelectorAll('.dom-node.selected').forEach((node) => {
    node.classList.remove('selected');
  });
  if (state.selectedDomPath) {
    const target = dom.domTree?.querySelector(`[data-dom-path="${state.selectedDomPath}"]`);
    if (target) {
      target.classList.add('selected');
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  renderLinkDetails();
  scheduleConnectorDraw();
}

function renderLinkDetails() {
  dom.linkDetails.innerHTML = '';
  if (!state.selectedContainer || !state.payload) {
    dom.linkDetails.innerHTML = '<div class="empty-state">选择一个容器查看详细映射</div>';
    return;
  }
  const match = state.payload.snapshot?.matches?.[state.selectedContainer];
  if (!match) {
    dom.linkDetails.innerHTML = '<div class="empty-state">该容器暂无匹配 DOM 节点</div>';
    return;
  }

  const title = document.createElement('div');
  title.className = 'link-row';
  title.innerHTML = `<strong>${match.container?.name || state.selectedContainer}</strong>
    <div>selector: ${(match.selectors || [])[0] || '未定义'}</div>`;
  dom.linkDetails.appendChild(title);

  (match.nodes || []).forEach((nodeInfo) => {
    const row = document.createElement('div');
    row.className = 'link-row';
    row.innerHTML = `
      <strong>${(nodeInfo.tag || '').toLowerCase()}</strong>
      <span>${nodeInfo.textSnippet || ''}</span>
    `;
    if (nodeInfo.dom_path) {
      const btn = document.createElement('button');
      btn.textContent = '定位';
      btn.addEventListener('click', () => {
        highlightLink(state.selectedContainer, nodeInfo.dom_path);
      });
      row.appendChild(btn);
    }
    dom.linkDetails.appendChild(row);
  });
}

function buildLinkPairs(matches) {
  state.linkPairs = [];
  Object.entries(matches).forEach(([containerId, entry]) => {
    const nodes = entry.nodes || [];
    if (!nodes.length) return;
    const target = nodes[0].dom_path;
    if (!target) return;
    state.linkPairs.push({ containerId, domPath: target });
  });
}

function scheduleConnectorDraw() {
  if (state.drawHandle) {
    cancelAnimationFrame(state.drawHandle);
  }
  state.drawHandle = requestAnimationFrame(() => drawConnectors());
}

function drawConnectors() {
  state.drawHandle = null;
  dom.linkLayer.innerHTML = '';
  const viewport = dom.workspace.getBoundingClientRect();
  dom.linkLayer.setAttribute('width', viewport.width);
  dom.linkLayer.setAttribute('height', viewport.height);
  dom.linkLayer.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);

  state.linkPairs.forEach((link) => {
    const containerEl = dom.containerTree?.querySelector(
      `[data-container-id="${link.containerId}"] .node-head`,
    );
    const domEl = dom.domTree?.querySelector(`[data-dom-path="${link.domPath}"] .dom-node-head`);
    if (!containerEl || !domEl) return;

    const startRect = containerEl.getBoundingClientRect();
    const endRect = domEl.getBoundingClientRect();
    const startX = startRect.right - viewport.left;
    const startY = startRect.top + startRect.height / 2 - viewport.top;
    const endX = endRect.left - viewport.left;
    const endY = endRect.top + endRect.height / 2 - viewport.top;
    const deltaX = (endX - startX) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`,
    );
    path.classList.add('link-line');
    if (
      state.selectedContainer === link.containerId &&
      (!state.selectedDomPath || state.selectedDomPath === link.domPath)
    ) {
      path.classList.add('active');
    }
    dom.linkLayer.appendChild(path);
  });
}

function requestSelectorEdit(node) {
  const current = (node.selectors || [])[0]?.css || '';
  const value = prompt(`为容器 ${node.id} 输入新的 CSS 选择器`, current) || '';
  const trimmed = value.trim();
  if (!trimmed) return;
  sendInspectorCommand({
    type: 'update-selector',
    containerId: node.id,
    selector: trimmed,
    url: state.payload?.targetUrl,
  });
}

function requestCreateChild(node) {
  const nextId =
    prompt('输入新子容器 ID', `${node.id}.${Math.random().toString(36).slice(2, 6)}`) || '';
  const trimmedId = nextId.trim();
  if (!trimmedId) return;
  const selector = prompt('输入子容器的 CSS 选择器', '') || '';
  const trimmedSelector = selector.trim();
  if (!trimmedSelector) return;
  sendInspectorCommand({
    type: 'create-child',
    parentId: node.id,
    containerId: trimmedId,
    selector: trimmedSelector,
    url: state.payload?.targetUrl,
  });
}

function showToast(message, isError = false) {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.style.color = isError ? '#fca5a5' : '#d9f99d';
  dom.toast.classList.add('show');
  if (state.toastHandle) {
    clearTimeout(state.toastHandle);
  }
  state.toastHandle = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, 2200);
}

init();
