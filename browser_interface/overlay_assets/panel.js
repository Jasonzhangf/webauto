(() => {
  try {
    const ROOT_ID = '__webauto_overlay_root_v2__';
    const IS_DEV_MODE = true;
    const API_BASE = (() => {
      const candidates = [
        () => typeof window !== 'undefined' ? window.__webautoApiBase : null,
        () => typeof window !== 'undefined' ? window.__WEB_AUTO_API_BASE : null,
        () => typeof window !== 'undefined' ? window.__webautoServiceBase : null,
        () => typeof window !== 'undefined' ? window.__WEB_AUTO_SERVICE_BASE : null,
        () => {
          const meta = document.querySelector('meta[name="webauto-api-base"]');
          return meta && meta.content ? meta.content : null;
        },
      ];
      for (const getter of candidates) {
        try {
          const value = getter();
          if (value) {
            return String(value).replace(/\/+$/, '');
          }
        } catch { }
      }
      return 'http://127.0.0.1:8888';
    })();

    function apiUrl(path = '') {
      const normalized = path.startsWith('/') ? path : `/${path}`;
      return `${API_BASE}${normalized}`;
    }

    function apiFetch(path, options) {
      return fetch(apiUrl(path), options);
    }

    const containerBootstrapState = {
      lastUrl: null,
      lastSource: null,
      retries: 0,
    };

    function normalizeUrl(raw) {
      if (!raw || typeof raw !== 'string') return '';
      try {
        const url = new URL(raw, window.location.origin);
        url.hash = '';
        return url.toString();
      } catch {
        return raw.split('#')[0] || raw;
      }
    }

    const pendingContainerPayloads = [];

    function tryRenderBootstrap(payload, source = 'bootstrap') {
      if (!payload || typeof payload !== 'object') return false;
      const containers = payload.containers || payload.data || null;
      if (!containers || typeof containers !== 'object') return false;
      const targetUrl = normalizeUrl(payload.url || window.location.href);
      const currentUrl = normalizeUrl(window.location.href);
      if (targetUrl && targetUrl !== currentUrl) {
        return false;
      }
      if (!window.__waRenderFilteredContainerTree) {
        pendingContainerPayloads.push({ payload, source });
        return false;
      }
      containerBootstrapState.lastUrl = targetUrl;
      containerBootstrapState.lastSource = source;
      containerBootstrapState.retries = 0;
      try {
        window.__waRenderFilteredContainerTree(containers);
        if (window.__waOverlayDebug) {
          console.log('[overlay] containers rendered via', source);
        }
      } catch (error) {
        console.warn('[overlay] render from bootstrap failed', error);
        return false;
      }
      return true;
    }

    window.addEventListener('webauto:containers', event => {
      tryRenderBootstrap(event.detail || {}, 'event');
    });

    function ensureOverlay() {
      try {
        if (document.getElementById(ROOT_ID)) return;

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;pointer-events:none;';

        // 如存在旧版 overlay（旧 ID），优先移除，避免多层 UI 干扰
        try {
          const legacy = document.getElementById('__webauto_overlay_root__');
          if (legacy && legacy !== root) {
            legacy.remove();
          }
        } catch { }

        const host = document.createElement('div');
        root.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}
.wa-root {
  pointer-events: auto;
  position: relative;
}
.wa-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(6,78,59,0.96); /* 深绿系：Python/Camoufox 专用 */
  border: 1px solid rgba(34,197,94,0.9);
  color: #dcfce7;
  font-size: 11px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.75);
  cursor: default;
}
.wa-pill-label {
  opacity: .6;
}
.wa-pill-sep {
  width: 1px;
  height: 12px;
  background: rgba(55,65,81,0.9);
}
.wa-pill-btn {
  border-radius: 999px;
  padding: 2px 6px;
  border: 1px solid rgba(59,130,246,0.7);
  background: rgba(37,99,235,0.12);
  color: #bfdbfe;
  font-size: 11px;
  cursor: default;
}

/* 增强的容器树样式 */
.wa-tree-root-container {
  border: 1px solid #22c55e;
  border-radius: 8px;
  margin-bottom: 8px;
  background: rgba(34, 197, 94, 0.05);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.wa-tree-root-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(90deg, #064e3b, #065f46);
  cursor: pointer;
  user-select: none;
  border-radius: 7px 7px 0 0;
  transition: background 0.3s;
}

.wa-tree-root-header:hover {
  background: linear-gradient(90deg, #065f46, #047857);
}

.wa-tree-root-title {
  font-weight: 600;
  color: #dcfce7;
  flex: 1;
  font-size: 13px;
}

.wa-tree-root-stats {
  font-size: 11px;
  color: #86efac;
  opacity: 0.8;
  background: rgba(22, 163, 74, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
}

.wa-expand-icon {
  color: #86efac;
  font-size: 14px;
  transition: transform 0.2s;
  width: 16px;
  text-align: center;
}

.wa-tree-children {
  padding: 8px 0;
  background: rgba(2, 44, 34, 0.3);
  border-radius: 0 0 7px 7px;
}

.wa-tree-node-child {
  padding: 4px 0;
  position: relative;
}

.wa-tree-connector {
  color: #22c55e;
  font-size: 12px;
  margin-right: 4px;
}

.wa-tree-node-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  transition: all 0.2s;
  cursor: pointer;
}

.wa-tree-node-content:hover {
  background: rgba(34, 197, 94, 0.15);
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.3) inset;
}

.wa-tree-node-label {
  color: #f9fafb;
  font-size: 13px;
}

.wa-tree-node-selected .wa-tree-node-content {
  background: rgba(34, 197, 94, 0.25);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.5);
}

.wa-tree-loading {
  padding: 20px;
  text-align: center;
  color: #86efac;
  font-size: 13px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.wa-tree-node {
  color: #f9fafb;
  padding: 8px 12px;
  font-size: 13px;
}

.wa-tree-node-root {
  font-weight: 600;
}

.wa-tree-node-child {
  margin-left: 20px;
  opacity: 0.9;
}

.wa-tree-progress {
  padding: 16px;
  background: rgba(2, 44, 34, 0.5);
  border-radius: 8px;
  margin-bottom: 8px;
}

.wa-progress-text {
  color: #86efac;
  font-size: 12px;
  margin-bottom: 8px;
  text-align: center;
}

.wa-progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(34, 197, 94, 0.2);
  border-radius: 3px;
  overflow: hidden;
}

.wa-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #16a34a);
  transition: width 0.3s;
  border-radius: 3px;
}
      .wa-panel {
        position: absolute;
        top: 18px;
        right: 0;
        width: fit-content;
        min-width: 420px;
        max-width: calc(100vw - 16px);
        height: auto;
        min-height: 420px;
        max-height: calc(100vh - 16px);
        background: #022c22;
        border-radius: 14px;
        border: 1px solid #16a34a;
        box-shadow: 0 18px 45px rgba(0,0,0,0.7);
        display: flex;
        flex-direction: column;
        overflow: visible;
      }
      .wa-panel.wa-panel-dragging {
        cursor: grabbing;
        opacity: 0.96;
      }
      .wa-panel.hidden {
        display: none;
      }
      .wa-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-bottom: 1px solid #064e3b;
        background: linear-gradient(90deg,#022c22,#064e3b);
        font-size: 11px;
        color: #dcfce7;
        cursor: move;
        user-select: none;
      }
      .wa-header button {
        cursor: pointer;
      }
      .wa-header-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }
.wa-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(22,163,74,0.18);
  border: 1px solid rgba(34,197,94,0.7);
  color: #bbf7d0;
}
.wa-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.wa-icon-btn {
  border: none;
  background: transparent;
  color: #6ee7b7;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: default;
}
.wa-icon-btn:hover {
  background: rgba(22,163,74,0.4);
  color: #ecfdf5;
}
.wa-tabs {
  display: flex;
  padding: 6px 10px;
}
.wa-tab {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: #9ca3af;
  cursor: default;
}
.wa-tab.active {
  background: rgba(59,130,246,0.15);
  border-color: rgba(59,130,246,0.7);
  color: #eff6ff;
}
      .wa-body {
        flex: 1;
        display: flex;
        min-height: 0;
        background: #022c22;
        gap: 8px;
        flex-wrap: wrap;
        align-content: flex-start;
      }
      .wa-left {
        flex: 1 1 40%;
        border-right: 1px solid #064e3b;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #022c22;
        min-width: 260px;
        max-width: 480px;
        box-sizing: border-box;
      }
      .wa-right {
        flex: 1 1 58%;
        min-width: 300px;
        padding: 10px 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #022c22;
        min-height: 0;
        box-sizing: border-box;
      }
      @media (max-width: 960px) {
        .wa-body {
          flex-direction: column;
        }
        .wa-left {
          width: 100%;
          border-right: none;
          border-bottom: 1px solid #064e3b;
          min-width: 0;
        }
        .wa-right {
          width: 100%;
        }
      }
.wa-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #9ca3af;
}
.wa-search {
  width: 140px;
  padding: 3px 6px;
  border-radius: 999px;
  border: 1px solid #1f2937;
  background: #020617;
  color: #e5e7eb;
  font-size: 11px;
}
.wa-search::placeholder {
  color: #4b5563;
}
.wa-tree {
  flex: 1;
  border-radius: 8px;
  background: #020617;
  border: 1px solid #111827;
  padding: 6px 4px;
  font-size: 12px;
  overflow: auto;
}
.wa-tree-node {
  padding: 2px 6px;
  border-radius: 4px;
  color: #9ca3af;
}
.wa-tree-node-root {
  font-weight: 500;
  color: #e5e7eb;
}
.wa-tree-node-selected {
  background: rgba(37,99,235,0.32);
  color: #eff6ff;
}
.wa-tree-node-child {
  margin-left: 14px;
}
.wa-tree-children {
  margin-top: 2px;
  margin-left: 14px;
}
.wa-section {
  border-radius: 10px;
  background: rgba(6,78,59,0.94);
  border: 1px solid #16a34a;
  padding: 8px 10px;
  font-size: 12px;
}
.wa-section-title {
  font-size: 12px;
  color: #e5e7eb;
  margin-bottom: 4px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.wa-section-sub {
  font-size: 10px;
  color: #6b7280;
}
.wa-field {
  display: flex;
  margin-bottom: 4px;
}
.wa-field label {
  width: 72px;
  color: #9ca3af;
  font-size: 11px;
}
.wa-field-value {
  flex: 1;
  color: #e5e7eb;
  font-size: 12px;
}
.wa-op-list {
  list-style: none;
  padding: 0;
  margin: 4px 0 4px;
}
.wa-op-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  border-radius: 6px;
  background: #020617;
  border: 1px solid #111827;
  margin-bottom: 3px;
}
.wa-op-handle {
  font-size: 11px;
  color: #4b5563;
  margin-right: 4px;
  cursor: grab;
  user-select: none;
}
.wa-op-name {
  flex: 1;
}
.wa-op-delete {
  border: none;
  background: transparent;
  color: #f97373;
  font-size: 11px;
}
.wa-btn-link {
  border: none;
  background: transparent;
  color: #93c5fd;
  font-size: 11px;
  padding: 0;
  margin-top: 2px;
}
.wa-key-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.wa-key-toolbar .wa-key-toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  width: 100%;
}
.wa-key-btn {
  border: 1px solid #2563eb;
  background: rgba(59,130,246,0.15);
  color: #bfdbfe;
  font-size: 11px;
  border-radius: 999px;
  padding: 2px 8px;
  cursor: pointer;
}
.wa-key-btn:hover {
  background: rgba(59,130,246,0.35);
}
.wa-key-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  color: #93c5fd;
  font-size: 11px;
}
.wa-key-toggle input[type="checkbox"] {
  accent-color: #22c55e;
}
      .wa-op-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.wa-op-chip {
  padding: 3px 10px;
  border-radius: 999px;
  background: #020617;
  border: 1px solid #374151;
  font-size: 11px;
  color: #9ca3af;
  cursor: pointer;
  user-select: none;
}
.wa-subcontainer-list {
  list-style: none;
  padding: 0;
  margin: 3px 0 6px;
  font-size: 11px;
  color: #d1d5db;
}
.wa-subcontainer-list li {
  padding: 2px 0;
}
.wa-btn-primary {
  border-radius: 999px;
  border: none;
  padding: 4px 10px;
  font-size: 11px;
  background: #16a34a;
  color: white;
}
.wa-footer {
  border-top: 1px solid #1f2937;
  padding: 4px 10px;
  font-size: 11px;
  color: #6b7280;
  display: flex;
  justify-content: space-between;
  background: #020617;
}
.wa-footer span {
  white-space: nowrap;
}
.wa-tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.wa-tab-content.dom-mode {
  padding: 10px;
  font-size: 12px;
  color: #d1d5db;
}
.wa-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, #16a34a 50%);
  border-radius: 0 0 14px 0;
  z-index: 10;
}
              `;

        shadow.appendChild(style);

        const rootWrap = document.createElement('div');
        rootWrap.className = 'wa-root';
        // 标记当前 overlay 版本，方便在 DevTools 中确认是否为最新脚本
        rootWrap.dataset.webautoOverlayVersion = 'v2-operations-edit';
        // 将当前 Session ID 暴露到页面全局，便于测试操作直接访问
        try {
          window.__webautoOverlaySessionId = __SID__;
          window.__webautoOverlayVersion = 'python-v2-operations-edit';
        } catch (e) { }

        // 顶部 pill（SID/Profile + 打开编辑器按钮）
        const pill = document.createElement('div');
        pill.className = 'wa-pill';

        const sidLabel = document.createElement('span');
        sidLabel.className = 'wa-pill-label';
        sidLabel.textContent = 'SID';
        const sidVal = document.createElement('span');
        sidVal.id = '__waOverlay_sid';
        sidVal.textContent = __SID__;

        const sep = document.createElement('span');
        sep.className = 'wa-pill-sep';

        const pidLabel = document.createElement('span');
        pidLabel.className = 'wa-pill-label';
        pidLabel.textContent = 'P';
        const pidVal = document.createElement('span');
        pidVal.id = '__waOverlay_pid';
        pidVal.textContent = __PID__;

        const openBtn = document.createElement('button');
        openBtn.className = 'wa-pill-btn';
        openBtn.textContent = '容器编辑';

        pill.appendChild(sidLabel);
        pill.appendChild(sidVal);
        pill.appendChild(sep);
        pill.appendChild(pidLabel);
        pill.appendChild(pidVal);
        pill.appendChild(openBtn);

        // 主面板
        const panel = document.createElement('div');
        panel.className = 'wa-panel hidden';

        const header = document.createElement('div');
        header.className = 'wa-header';

        const headerLeft = document.createElement('div');
        headerLeft.className = 'wa-header-left';
        const badgeSid = document.createElement('span');
        badgeSid.className = 'wa-badge';
        badgeSid.textContent = 'Session: ' + __SID__;
        const badgePid = document.createElement('span');
        badgePid.className = 'wa-badge';
        badgePid.textContent = 'Profile: ' + __PID__;
        headerLeft.appendChild(badgeSid);
        headerLeft.appendChild(badgePid);

        const headerActions = document.createElement('div');
        headerActions.className = 'wa-header-actions';
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'wa-icon-btn';
        collapseBtn.textContent = '▾';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'wa-icon-btn';
        closeBtn.textContent = '×';
        headerActions.appendChild(collapseBtn);
        headerActions.appendChild(closeBtn);

        header.appendChild(headerLeft);
        header.appendChild(headerActions);

        const tabs = document.createElement('div');
        tabs.className = 'wa-tabs';
        const tabTree = document.createElement('button');
        tabTree.className = 'wa-tab active';
        tabTree.textContent = '容器树';
        const tabDom = document.createElement('button');
        tabDom.className = 'wa-tab';
        tabDom.textContent = 'DOM 选取';
        tabs.appendChild(tabTree);
        tabs.appendChild(tabDom);

        const body = document.createElement('div');
        body.className = 'wa-body';
        panel.__waBody = body;

        const tabContentTree = document.createElement('div');
        tabContentTree.className = 'wa-tab-content';
        // 容器树 tab 采用左右布局：左侧树，右侧编辑区
        tabContentTree.style.display = 'flex';
        tabContentTree.style.flexDirection = 'row';

        const left = document.createElement('div');
        left.className = 'wa-left';
        const leftHeader = document.createElement('div');
        leftHeader.className = 'wa-section-header';
        const leftTitle = document.createElement('span');
        leftTitle.textContent = '容器树';
        const search = document.createElement('input');
        search.className = 'wa-search';
        search.placeholder = '搜索容器…';
        leftHeader.appendChild(leftTitle);
        leftHeader.appendChild(search);
        const tree = document.createElement('div');
        tree.className = 'wa-tree';

        // 容器树：从后端 /api/v1/containers?url=... 拉取当前页面的容器定义
        let treeNodes = [];
        let containersById = {};
        let currentContainerId = null;
        let currentOps = {};
        let currentEventKey = '';
        // Operation 区域元素（先声明，后面创建时赋值，避免 TDZ）
        let opList = null;
        let pal = null;
        let sectionOps = null;

        function getContainerSelectors(container) {
          if (!container) return [];
          if (container.selector) {
            return [container.selector];
          }
          if (Array.isArray(container.selectors)) {
            const list = [];
            container.selectors.forEach(sel => {
              if (!sel) return;
              if (sel.selector || sel.css) {
                list.push(sel.selector || sel.css);
                return;
              }
              const classes = Array.isArray(sel.classes) ? sel.classes.filter(Boolean) : [];
              const attrs = sel.attributes && typeof sel.attributes === 'object' ? sel.attributes : null;
              if (classes.length || attrs) {
                let css = classes.length ? ('.' + classes.join('.')) : '';
                if (attrs) {
                  Object.entries(attrs).forEach(([key, value]) => {
                    if (value === undefined || value === null || value === '') {
                      css += `[${key}]`;
                    } else if (value === true) {
                      css += `[${key}]`;
                    } else {
                      css += `[${key}="${value}"]`;
                    }
                  });
                }
                if (css) {
                  list.push(css);
                }
              }
            });
            return list.filter(Boolean);
          }
          return [];
        }

        function getPrimarySelector(container) {
          const selectors = getContainerSelectors(container);
          return selectors.length ? selectors[0] : '';
        }

        function clearTreeSelection() {
          treeNodes.forEach(n => n.classList.remove('wa-tree-node-selected'));
        }

        function selectContainer(node, id, container) {
          if (!node || !container) return;
          clearTreeSelection();
          node.classList.add('wa-tree-node-selected');
          const selectors = getContainerSelectors(container);
          const selector = selectors[0] || '';
          highlightContainer(selector);
          const selectorText = selectors.join(', ');
          domInfo.textContent = '已选容器: ' + id + ' (' + (selectorText || '无 selector') + ')';
          try {
            f1v.textContent = container.description || id;
            f2v.textContent = selectorText || '';
            f3v.textContent = id;
            renderOpsForContainer(id);
          } catch { }
        }

        function highlightContainer(selector) {
          try {
            if (!selector) return;
            const target = document.querySelector(selector);
            if (!target) return;
            const rect = target.getBoundingClientRect();
            let box = document.getElementById('__wa_container_highlight__');
            if (!box) {
              box = document.createElement('div');
              box.id = '__wa_container_highlight__';
              box.style.position = 'absolute';
              box.style.zIndex = '2147483645';
              box.style.pointerEvents = 'none';
              box.style.border = '2px solid #22c55e';
              box.style.borderRadius = '4px';
              box.style.boxShadow = '0 0 0 1px rgba(22,163,74,0.6)';
              box.style.background = 'rgba(22,163,74,0.10)';
              document.documentElement.appendChild(box);
            }
            const scrollX = window.scrollX || window.pageXOffset || 0;
            const scrollY = window.scrollY || window.pageYOffset || 0;
            box.style.left = (rect.left + scrollX - 2) + 'px';
            box.style.top = (rect.top + scrollY - 2) + 'px';
            box.style.width = Math.max(rect.width + 4, 4) + 'px';
            box.style.height = Math.max(rect.height + 4, 4) + 'px';
            box.style.display = 'block';
          } catch { }
        }

        function getInputPayload() {
          const section = sectionOps || {};
          const mode = section.__waInputMode || 'simple';
          const msgInputEl = section.__waMsgInput;
          if (mode === 'exact') {
            const raw = (section.__waExactInput && section.__waExactInput.value) || '';
            const lines = raw.split(/\\r?\\n/).map(l => l.trim()).filter(Boolean);
            const sequence = lines.map(line => {
              if (line.toLowerCase().startsWith('key:')) {
                return { kind: 'key', value: line.slice(4).trim() };
              }
              if (line.toLowerCase().startsWith('text:')) {
                return { kind: 'text', value: line.slice(5).trim() };
              }
              return { kind: 'text', value: line };
            });
            return { mode: 'exact', sequence };
          }
          const textInput = section.__waTestTextInput;
          const rawText = (textInput && textInput.value)
            ? textInput.value
            : (msgInputEl && msgInputEl.value ? msgInputEl.value : '');
          return { mode: 'simple', text: rawText || 'webauto-test' };
        }

        function renderOpsForContainer(id) {
          const c = containersById[id] || {};
          currentContainerId = id;
          // 直接引用同一份 actions，避免每次渲染都产生副本导致事件闭包改到旧对象
          if (!containersById[id]) containersById[id] = {};
          if (!containersById[id].actions) containersById[id].actions = {};
          currentOps = containersById[id].actions;

          // 更新当前事件 key（默认: event.<id>.appear）
          try {
            const msgInput = sectionOps && sectionOps.__waMsgInput;
            const statusEl = sectionOps && sectionOps.__waOpStatus;
            const defaultKey = (c.eventKey || ('event.' + id + '.appear'));
            currentEventKey = defaultKey;
            if (msgInput) {
              msgInput.value = defaultKey;
            }
            if (statusEl) {
              statusEl.textContent = '';
            }
          } catch (e) { }

          // 渲染已注册 Operation 列表（作为当前容器的 Operation 列表）
          if (!opList || !pal) return;
          opList.innerHTML = '';
          const activeKeys = Object.keys(currentOps).filter(k => currentOps[k]);
          let dragKey = null;

          function rebuildOpsWithOrder(orderKeys) {
            const next = [];
            orderKeys.forEach(k => {
              if (currentOps[k]) next.push(k);
            });
            // 清空并按新顺序写回同一引用
            Object.keys(currentOps).forEach(k => delete currentOps[k]);
            next.forEach(k => { currentOps[k] = true; });
            containersById[id].actions = currentOps;
            renderOpsForContainer(id);
          }

          if (!activeKeys.length) {
            const li = document.createElement('li');
            li.className = 'wa-op-item';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'wa-op-name';
            nameSpan.textContent = '当前列表为空（点击下方 “＋ 加入列表” 添加 Operation）';
            nameSpan.style.color = '#e5e7eb';
            li.appendChild(nameSpan);
            opList.appendChild(li);
          } else {
            activeKeys.forEach((key, index) => {
              const li = document.createElement('li');
              li.className = 'wa-op-item';
              li.draggable = true;

              li.addEventListener('dragstart', (e) => {
                try {
                  dragKey = key;
                  if (e && e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                  }
                } catch (e2) { }
              });
              li.addEventListener('dragover', (e) => {
                try {
                  if (e) {
                    e.preventDefault();
                    if (e.dataTransfer) {
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }
                } catch (e2) { }
              });
              li.addEventListener('drop', (e) => {
                try {
                  if (e) e.preventDefault();
                  if (!dragKey || dragKey === key) return;
                  const order = activeKeys.slice();
                  const fromIdx = order.indexOf(dragKey);
                  const toIdx = order.indexOf(key);
                  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
                  order.splice(fromIdx, 1);
                  order.splice(toIdx, 0, dragKey);
                  dragKey = null;
                  rebuildOpsWithOrder(order);
                } catch (e2) { }
              });
              li.addEventListener('dragend', () => {
                try { dragKey = null; } catch (e2) { }
              });

              const handleSpan = document.createElement('span');
              handleSpan.className = 'wa-op-handle';
              handleSpan.textContent = '●';
              const nameSpan = document.createElement('span');
              nameSpan.className = 'wa-op-name';
              nameSpan.textContent = key;
              nameSpan.style.color = '#f9fafb';

              const btnUp = document.createElement('button');
              btnUp.className = 'wa-btn-link';
              btnUp.textContent = '↑';
              btnUp.addEventListener('click', () => {
                if (index <= 0) return;
                const order = activeKeys.slice();
                const tmp = order[index - 1];
                order[index - 1] = order[index];
                order[index] = tmp;
                rebuildOpsWithOrder(order);
              });

              const btnDown = document.createElement('button');
              btnDown.className = 'wa-btn-link';
              btnDown.textContent = '↓';
              btnDown.addEventListener('click', () => {
                if (index >= activeKeys.length - 1) return;
                const order = activeKeys.slice();
                const tmp = order[index + 1];
                order[index + 1] = order[index];
                order[index] = tmp;
                rebuildOpsWithOrder(order);
              });

              const removeBtn = document.createElement('button');
              removeBtn.className = 'wa-btn-link';
              removeBtn.textContent = '移除';
              removeBtn.addEventListener('click', () => {
                delete currentOps[key];
                containersById[id].actions = currentOps;
                renderOpsForContainer(id);
              });

              li.appendChild(handleSpan);
              li.appendChild(nameSpan);
              li.appendChild(btnUp);
              li.appendChild(btnDown);
              li.appendChild(removeBtn);
              opList.appendChild(li);
            });
          }

          // 渲染可用 Operation 列表：每一项都有“单项测试”和“＋ 加入列表”
          const OPS = [
            { key: 'click', label: '点击 (click)' },
            { key: 'type', label: '输入-键盘 (type)' },
            { key: 'fill', label: '输入-填充值 (fill)' },
            { key: 'pressEnter', label: '按 Enter' },
            { key: 'pressEsc', label: '按 Esc' },
          ];
          pal.innerHTML = '';
          OPS.forEach(op => {
            const row = document.createElement('div');
            row.className = 'wa-op-item';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'wa-op-name';
            nameSpan.textContent = op.label;
            nameSpan.style.color = '#f9fafb';
            const testBtn = document.createElement('button');
            testBtn.className = 'wa-btn-link';
            testBtn.textContent = '单项测试';
            testBtn.addEventListener('click', () => {
              try {
                const statusEl = sectionOps && sectionOps.__waOpStatus;
                const c2 = containersById[currentContainerId] || {};
                const selector2 = getPrimarySelector(c2) || '';
                if (!selector2) {
                  if (statusEl) statusEl.textContent = '当前容器没有 selector，无法测试 Operation';
                  return;
                }
                const payload = getInputPayload();
                let sid = null;
                try { sid = (window && window.__webautoOverlaySessionId) || null; } catch (e) { sid = null; }
                if (!sid) {
                  if (statusEl) statusEl.textContent = '无法获取 Session ID，测试中止';
                  return;
                }
                const run = async () => {
                  try {
                    if (op.key === 'click') {
                      await apiFetch('/api/v1/sessions/' + encodeURIComponent(sid) + '/click', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ selector: selector2 })
                      });
                    } else if (op.key === 'type' || op.key === 'fill') {
                      const mode = op.key === 'type' ? 'type' : 'fill';
                      const steps = payload.mode === 'exact'
                        ? (payload.sequence.length ? payload.sequence : [{ kind: 'text', value: 'webauto-test' }])
                        : [{ kind: 'text', value: payload.text }];
                      for (const step of steps) {
                        if (step.kind === 'key') {
                          await apiFetch('/api/v1/sessions/' + encodeURIComponent(sid) + '/key', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: step.value })
                          });
                        } else {
                          await apiFetch('/api/v1/sessions/' + encodeURIComponent(sid) + '/input', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ selector: selector2, text: step.value, mode })
                          });
                        }
                      }
                    } else if (op.key === 'pressEnter' || op.key === 'pressEsc') {
                      const sendKey = op.key === 'pressEnter' ? 'Enter' : 'Escape';
                      await apiFetch('/api/v1/sessions/' + encodeURIComponent(sid) + '/key', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: sendKey })
                      });
                    }
                    if (statusEl) statusEl.textContent = '已发送单项 Operation: ' + op.key;
                  } catch (e) {
                    if (statusEl) {
                      statusEl.textContent = '单项 Operation 失败: ' + (e && e.message ? e.message : String(e));
                    }
                  }
                };
                try { run(); } catch (e) { }
              } catch { }
            });
            const addBtn = document.createElement('button');
            addBtn.className = 'wa-btn-link';
            const isActive = !!currentOps[op.key];
            addBtn.textContent = isActive ? '✓ 已在列表' : '＋ 加入列表';
            addBtn.style.color = isActive ? '#4ade80' : '#93c5fd';
            addBtn.addEventListener('click', () => {
              if (currentOps[op.key]) {
                // 已在列表中，避免重复添加；如需移除请在上方列表里点“移除”
                return;
              }
              currentOps[op.key] = true;
              containersById[id].actions = currentOps;
              renderOpsForContainer(id);
            });
            row.appendChild(nameSpan);
            row.appendChild(testBtn);
            row.appendChild(addBtn);
            pal.appendChild(row);
          });
        }

        // 检查 selector 是否在当前文档命中（支持逗号分隔的联合选择器）
        function checkContainerExists(selector) {
          if (!selector) return false;
          const debug = !!(window.__waOverlayDebug);

          const testOne = (sel) => {
            try {
              const list = document.querySelectorAll(sel);
              if (debug) console.log('[overlay][match] test', sel, '=>', list.length);
              return list.length > 0;
            } catch (e) {
              if (debug) console.warn('[overlay][match] invalid selector', sel, e);
              return false;
            }
          };

          if (selector.includes(',')) {
            return selector.split(',').map(s => s.trim()).filter(Boolean).some(testOne);
          }
          return testOne(selector.trim());
        }

        // 简化版：只返回基础分数
        async function calculateMatchScore(container) {
          if (!container || !getPrimarySelector(container)) return 0;
          return 10; // 所有匹配的容器返回相同分数
        }

        // 过滤匹配的根容器（简化版：只验证根容器）
        async function filterMatchedRootContainers(containers) {
          const matchedContainers = {};
          const matchedRootIds = new Set();

          // 1. 识别所有根容器
          const parentMap = {};
          Object.entries(containers).forEach(([id, c]) => {
            (c.children || []).forEach(childId => {
              parentMap[childId] = id;
            });
          });

          const allRootIds = Object.keys(containers).filter(id => !parentMap[id]);

          // 2. 只验证根容器
          for (const rootId of allRootIds) {
            const rootContainer = containers[rootId];
            if (!rootContainer) continue;
            const selectors = getContainerSelectors(rootContainer);
            const exists = selectors.some(sel => checkContainerExists(sel));
            if (window.__waOverlayDebug) {
              console.log('[overlay][match] root', rootId, 'selector="' + (selectors.join(', ') || '') + '" =>', exists);
            }
            if (exists) {
              matchedContainers[rootId] = rootContainer;
              matchedRootIds.add(rootId);
              // 添加所有子容器
              addSubtreeToMatched(rootId, containers, matchedContainers);
            }
          }

          return {
            matchedContainers,
            matchedRoots: Array.from(matchedRootIds),
            stats: {
              rootCount: allRootIds.length,
              matched: Object.keys(matchedContainers).length
            }
          };
        }

        // 简化版：直接添加所有子容器
        function addSubtreeToMatched(containerId, allContainers, matchedContainers) {
          const container = allContainers[containerId];
          if (!container || !container.children) return;

          container.children.forEach(childId => {
            if (allContainers[childId]) {
              matchedContainers[childId] = allContainers[childId];
              // 递归添加子容器的子容器
              addSubtreeToMatched(childId, allContainers, matchedContainers);
            }
          });
        }

        // 显示树形结构加载进度
        function showTreeProgress(current, total) {
          const progress = document.createElement('div');
          progress.className = 'wa-tree-progress';
          progress.innerHTML = `
                  <div class="wa-progress-text">正在匹配容器... (${current}/${total})</div>
                  <div class="wa-progress-bar">
                    <div class="wa-progress-fill" style="width: ${(current / total) * 100}%"></div>
                  </div>
                `;
          return progress;
        }

        // 渲染根容器（带折叠功能）
              function renderRootContainer(id, containers, depth, expandedStates) {
                const container = containers[id];
                // 若根本身未命中且也没有任何匹配的子孙，则跳过
                const hasRootMatch = !!container;
                if (!hasRootMatch) return;

          const rootElement = document.createElement('div');
          rootElement.className = 'wa-tree-root-container';

          // 根容器头部（可折叠）
          const header = document.createElement('div');
          header.className = 'wa-tree-root-header';

          // 折叠/展开图标
          const expandIcon = document.createElement('span');
          expandIcon.className = 'wa-expand-icon';
          expandIcon.textContent = '▾';

          // 容器标题
          const title = document.createElement('span');
          title.className = 'wa-tree-root-title';
          title.textContent = container.description || id;

          // 匹配统计
                const matchedCount = countMatchedDescendants(id, containers);
                // 根容器本身命中即可展示；或者其子孙有命中
                // 因为 containers 传入的是 matchedContainers，若根命中一定存在于 containers 中
                // 因此这里不再因为 0 而过滤
          const stats = document.createElement('span');
          stats.className = 'wa-tree-root-stats';
          stats.textContent = `(${matchedCount} 匹配)`;

          header.appendChild(expandIcon);
          header.appendChild(title);
          header.appendChild(stats);

          // 子容器容器
          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'wa-tree-children';

          // 递归渲染子容器
          (container.children || []).forEach(childId => {
            if (containers[childId]) {
              renderChildContainer(childId, containers, childrenContainer, 1);
            }
          });

          // 折叠/展开逻辑 + 选中
          let isExpanded = expandedStates[id] !== false; // 默认展开
          childrenContainer.style.display = isExpanded ? 'block' : 'none';
          expandIcon.textContent = isExpanded ? '▾' : '▸';

          const toggleExpand = () => {
            isExpanded = !isExpanded;
            childrenContainer.style.display = isExpanded ? 'block' : 'none';
            expandIcon.textContent = isExpanded ? '▾' : '▸';
            expandedStates[id] = isExpanded;
          };

          header.addEventListener('click', () => {
            toggleExpand();
            selectContainer(rootElement, id, container);
          });

          rootElement.appendChild(header);
          rootElement.appendChild(childrenContainer);
          tree.appendChild(rootElement);
          treeNodes.push(rootElement);
        }

        // 渲染子容器
        function renderChildContainer(id, containers, parentElement, depth) {
          const container = containers[id];
          if (!container) return;

          const node = document.createElement('div');
          node.className = 'wa-tree-node wa-tree-node-child';
          node.style.marginLeft = (14 * depth) + 'px';
          node.dataset.containerId = id;

          const row = document.createElement('div');
          row.className = 'wa-tree-node-row';

          // 连接线
          const connector = document.createElement('span');
          connector.className = 'wa-tree-connector';
          connector.textContent = depth > 0 ? '├─ ' : '';

          // 容器内容
          const content = document.createElement('span');
          content.className = 'wa-tree-node-content';

          const label = document.createElement('span');
          label.className = 'wa-tree-node-label';
          label.textContent = container.description || id;

          const childIds = (container.children || []).filter(childId => containers[childId]);
          let childWrapper = null;
          let expandIcon = null;

          if (childIds.length) {
            expandIcon = document.createElement('span');
            expandIcon.className = 'wa-expand-icon';
            expandIcon.textContent = '▾';
            content.insertBefore(expandIcon, content.firstChild);
          }

          content.appendChild(label);
          row.appendChild(connector);
          row.appendChild(content);
          node.appendChild(row);

          const toggleExpand = () => {
            if (!childWrapper) return;
            const visible = childWrapper.style.display !== 'none';
            childWrapper.style.display = visible ? 'none' : 'block';
            if (expandIcon) {
              expandIcon.textContent = visible ? '▸' : '▾';
            }
          };

          row.addEventListener('click', (evt) => {
            evt.stopPropagation();
            selectContainer(node, id, container);
            if (evt.target === expandIcon) {
              toggleExpand();
            } else if (childWrapper && evt.detail >= 2) {
              // 双击任意位置也可折叠/展开
              toggleExpand();
            }
          });

          if (childIds.length) {
            childWrapper = document.createElement('div');
            childWrapper.className = 'wa-tree-children';
            childWrapper.style.marginLeft = '18px';
            childIds.forEach(childId => {
              renderChildContainer(childId, containers, childWrapper, depth + 1);
            });
            node.appendChild(childWrapper);
          }

          parentElement.appendChild(node);
          treeNodes.push(node);
        }

        // 计算匹配的子容器数量
        function countMatchedDescendants(containerId, containers) {
          const container = containers[containerId];
          if (!container || !container.children) return 0;

          let count = 0;
          const checkChildren = (children) => {
            children.forEach(childId => {
              if (containers[childId]) {
                count++;
                const child = containers[childId];
                if (child.children) {
                  checkChildren(child.children);
                }
              }
            });
          };

          checkChildren(container.children);
          return count;
        }

        // 新的容器树渲染函数（带过滤）
        async function renderFilteredContainerTree(containers) {
          tree.innerHTML = '';
          treeNodes = [];

          if (!containers || Object.keys(containers).length === 0) {
            const empty = document.createElement('div');
            empty.className = 'wa-tree-node';
            empty.textContent = '当前页面尚未创建任何容器';
            tree.appendChild(empty);
            treeNodes.push(empty);
            return;
          }

          // 显示进度条
          const total = Object.keys(containers).length;
          let processed = 0;
          const progressElement = showTreeProgress(0, total);
          tree.appendChild(progressElement);

          try {
            // 过滤匹配的容器
            const matchedData = await filterMatchedRootContainers(containers);
            // 用匹配结果作为当前容器源，便于右侧详情读取 selector/children
            containersById = matchedData.matchedContainers || {};
            tree.removeChild(progressElement);

            // 如果过滤后没有任何命中，等待 DOM 稳定后自动重试几次
            if (!matchedData.matchedRoots || matchedData.matchedRoots.length === 0) {
              if (containerBootstrapState.retries < 5) {
                containerBootstrapState.retries += 1;
                setTimeout(() => {
                  try {
                    renderFilteredContainerTree(containers);
                  } catch (error) {
                    console.warn('[overlay] retry render failed', error);
                  }
                }, 400 * containerBootstrapState.retries);
                return;
              }
              console.warn('[overlay] matchedRoots 为 0，回退到完整容器树渲染');
              containerBootstrapState.retries = 0;
              renderContainerTree(containers);
              return;
            }
            containerBootstrapState.retries = 0;

            // 按匹配度排序根容器
            const rootScores = await Promise.all(
              matchedData.matchedRoots.map(async (rootId) => {
                const score = await calculateMatchScore(containers[rootId]);
                return { id: rootId, score };
              })
            );

            const sortedRoots = rootScores
              .sort((a, b) => b.score - a.score)
              .map(item => item.id);

            const expandedStates = {};

            // 渲染根容器（只要根本身命中，或其子孙有命中，都应显示）
            sortedRoots.forEach(rootId => {
              renderRootContainer(rootId, matchedData.matchedContainers, 0, expandedStates);
            });

            // 自动选中第一个根容器，便于右侧详情回填
            try {
              if (sortedRoots.length) {
                const first = sortedRoots[0];
                const domNode = tree.querySelector('.wa-tree-root-container .wa-tree-root-header');
                const cont = matchedData.matchedContainers[first];
                if (domNode && cont) {
                  selectContainer(domNode.parentElement, first, cont);
                }
              }
            } catch {}

            console.log(`渲染完成: ${matchedData.stats.rootCount} 个根容器, ${matchedData.stats.matched} 个匹配容器`);
          } catch (error) {
            console.error('容器树渲染失败:', error);
            tree.removeChild(progressElement);
            const errorNode = document.createElement('div');
            errorNode.className = 'wa-tree-node';
            errorNode.textContent = '渲染容器树时发生错误';
            tree.appendChild(errorNode);
            treeNodes.push(errorNode);
          }
        }

        function renderContainerTree(containers) {
          containersById = containers || {};
          tree.innerHTML = '';
          treeNodes = [];

          const parentMap = {};
          Object.keys(containersById).forEach(id => {
            const c = containersById[id] || {};
            (c.children || []).forEach(childId => {
              parentMap[childId] = id;
            });
          });

          const roots = Object.keys(containersById).filter(id => !parentMap[id]);
          if (!roots.length) {
            const empty = document.createElement('div');
            empty.className = 'wa-tree-node';
            empty.textContent = '当前页面尚未创建任何容器';
            tree.appendChild(empty);
            treeNodes.push(empty);
            return;
          }

          function makeNode(id, depth) {
            const c = containersById[id] || {};
            const node = document.createElement('div');
            node.className = 'wa-tree-node' + (depth === 0 ? ' wa-tree-node-root' : ' wa-tree-node-child');
            node.textContent = (c.description || id);
            node.style.marginLeft = depth > 0 ? (14 * depth) + 'px' : '0';
            node.dataset.containerId = id;
            tree.appendChild(node);
            treeNodes.push(node);

            node.addEventListener('click', () => {
              clearTreeSelection();
              node.classList.add('wa-tree-node-selected');
              const selectors = getContainerSelectors(c);
              const selector = selectors[0] || '';
              highlightContainer(selector);
              const selectorText = selectors.join(', ');
              domInfo.textContent = '已选容器: ' + id + ' (' + (selectorText || '无 selector') + ')';
              // 将当前容器信息回填到右侧"容器详情"区域
              try {
                f1v.value = c.description || id;
                f2v.value = selectorText || '';
                f3v.value = id;

                // Update Parent ID in Create Form if it exists
                try {
                  if (fieldParentIdValue) {
                    fieldParentIdValue.value = id;
                  }
                } catch { }

                renderOpsForContainer(id);
              } catch { }
            });

            (c.children || []).forEach(childId => {
              makeNode(childId, depth + 1);
            });
          }

          roots.forEach(id => makeNode(id, 0));
        }
        window.__waRenderFilteredContainerTree = renderFilteredContainerTree;
        if (pendingContainerPayloads.length) {
          const queued = pendingContainerPayloads.splice(0);
          queued.forEach(item => {
            tryRenderBootstrap(item.payload, item.source || 'queued');
          });
        }

        // 首次加载容器树（使用新的过滤渲染）
        async function loadContainerTree() {
          if (tryRenderBootstrap(window.__webautoBootstrapContainers, 'bootstrap-cache')) {
            return;
          }
          try {
            const resp = await apiFetch('/api/v1/containers?url=' + encodeURIComponent(window.location.href));
            const j = await resp.json();
            if (!j || !j.success) return;
            const containers = (j.data && j.data.containers) || {};
            window.__webautoBootstrapContainers = {
              url: window.location.href,
              containers
            };
            tryRenderBootstrap(window.__webautoBootstrapContainers, 'api');
          } catch (error) {
            console.error('加载容器树失败:', error);
            renderFilteredContainerTree({});
          }
        }

        try {
          loadContainerTree();
        } catch (error) {
          console.error('初始化容器树失败:', error);
        }
        left.appendChild(leftHeader);
        left.appendChild(tree);

        const right = document.createElement('div');
        right.className = 'wa-right';

        const sectionDetail = document.createElement('div');
        sectionDetail.className = 'wa-section';
        const st1 = document.createElement('div');
        st1.className = 'wa-section-title';
        st1.textContent = '容器详情';
        sectionDetail.appendChild(st1);
        const f1 = document.createElement('div');
        f1.className = 'wa-field';
        const f1l = document.createElement('label');
        f1l.textContent = '标题';
        const f1v = document.createElement('input'); // Changed to input
        f1v.className = 'wa-field-value';
        f1v.style.background = '#020617';
        f1v.style.border = '1px solid #1f2937';
        f1v.style.color = '#e5e7eb';
        f1v.style.padding = '2px 4px';
        f1.appendChild(f1l);
        f1.appendChild(f1v);

        const f2 = document.createElement('div');
        f2.className = 'wa-field';
        const f2l = document.createElement('label');
        f2l.textContent = 'Selector';
        const f2v = document.createElement('input'); // Changed to input
        f2v.className = 'wa-field-value';
        f2v.style.background = '#020617';
        f2v.style.border = '1px solid #1f2937';
        f2v.style.color = '#e5e7eb';
        f2v.style.padding = '2px 4px';
        f2.appendChild(f2l);
        f2.appendChild(f2v);

        const f3 = document.createElement('div');
        f3.className = 'wa-field';
        const f3l = document.createElement('label');
        f3l.textContent = '容器 ID';
        const f3v = document.createElement('input'); // Changed to input
        f3v.className = 'wa-field-value';
        f3v.style.background = '#020617';
        f3v.style.border = '1px solid #1f2937';
        f3v.style.color = '#e5e7eb';
        f3v.style.padding = '2px 4px';
        f3v.readOnly = true; // ID usually shouldn't change easily, or maybe allow it? Let's keep it readonly for now or allow edit if backend supports rename.
        f3.appendChild(f3l);
        f3.appendChild(f3v);

        const btnContainerActions = document.createElement('div');
        btnContainerActions.style.display = 'flex';
        btnContainerActions.style.gap = '8px';
        btnContainerActions.style.marginTop = '8px';

        const btnUpdateContainer = document.createElement('button');
        btnUpdateContainer.className = 'wa-btn-primary';
        btnUpdateContainer.textContent = '更新信息';

        const btnDeleteContainer = document.createElement('button');
        btnDeleteContainer.className = 'wa-btn-link';
        btnDeleteContainer.textContent = '删除容器';
        btnDeleteContainer.style.color = '#f87171';

        btnContainerActions.appendChild(btnUpdateContainer);
        btnContainerActions.appendChild(btnDeleteContainer);

        sectionDetail.appendChild(f1);
        sectionDetail.appendChild(f2);
        sectionDetail.appendChild(f3);
        sectionDetail.appendChild(btnContainerActions);

        // Update Logic
        btnUpdateContainer.addEventListener('click', () => {
          if (!currentContainerId) return;
          const payload = {
            id: currentContainerId,
            title: f1v.value,
            selector: f2v.value,
            url: window.location.href
          };
          apiFetch('/api/v1/containers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(r => r.json()).then(j => {
            if (j && j.success) {
              alert('容器更新成功');
              loadContainerTree();
            } else {
              alert('更新失败: ' + (j.error || 'Unknown'));
            }
          });
        });

        // Delete Logic
        btnDeleteContainer.addEventListener('click', () => {
          if (!currentContainerId) return;
          if (!confirm('确定要删除容器 ' + currentContainerId + ' 吗？')) return;

          apiFetch('/api/v1/containers/' + encodeURIComponent(currentContainerId), {
            method: 'DELETE'
          }).then(r => r.json()).then(j => {
            if (j && j.success) {
              alert('容器已删除');
              currentContainerId = null;
              sectionDetail.style.display = 'none'; // Hide details
              loadContainerTree();
            } else {
              alert('删除失败: ' + (j.error || 'Unknown'));
            }
          });
        });

        sectionOps = document.createElement('div');
        sectionOps.className = 'wa-section';
        const st2 = document.createElement('div');
        st2.className = 'wa-section-title';
        st2.innerHTML = '已注册 Operation <span class="wa-section-sub">（为指定事件配置 click/type/fill，然后保存）</span>';
        sectionOps.appendChild(st2);
        // 事件 key 编辑行：允许为当前容器指定业务事件名
        const msgRow = document.createElement('div');
        msgRow.className = 'wa-field';
        const msgLabel = document.createElement('label');
        msgLabel.textContent = '事件 key';
        const msgInput = document.createElement('input');
        msgInput.type = 'text';
        msgInput.style.flex = '1';
        msgInput.style.fontSize = '12px';
        msgInput.style.padding = '3px 6px';
        // 深底白字，对比度更高
        msgInput.style.background = '#020617';
        msgInput.style.border = '1px solid #22c55e';
        msgInput.style.color = '#f9fafb';
        msgInput.placeholder = '如 event.home.search.searchbox.appear';
        msgRow.appendChild(msgLabel);
        msgRow.appendChild(msgInput);
        sectionOps.appendChild(msgRow);
        // 测试文本编辑行：用于本地试运行 type/fill 时填入的内容
        const testTextRow = document.createElement('div');
        testTextRow.className = 'wa-field';
        testTextRow.style.alignItems = 'stretch';
        const testTextLabel = document.createElement('label');
        testTextLabel.textContent = '测试文本';
        testTextLabel.style.marginBottom = '4px';
        testTextLabel.style.display = 'block';
        testTextRow.appendChild(testTextLabel);

        const testTextTabs = document.createElement('div');
        testTextTabs.style.display = 'flex';
        testTextTabs.style.marginBottom = '4px';
        testTextTabs.style.gap = '6px';
        const tabSimple = document.createElement('button');
        tabSimple.type = 'button';
        tabSimple.textContent = '普通文本';
        tabSimple.className = 'wa-btn-link';
        tabSimple.style.padding = '2px 6px';
        tabSimple.style.border = '1px solid #22c55e';
        tabSimple.style.borderRadius = '4px';
        tabSimple.style.background = '#065f46';
        const tabExact = document.createElement('button');
        tabExact.type = 'button';
        tabExact.textContent = '精确键序列';
        tabExact.className = 'wa-btn-link';
        tabExact.style.padding = '2px 6px';
        tabExact.style.border = '1px solid transparent';
        tabExact.style.borderRadius = '4px';
        testTextTabs.appendChild(tabSimple);
        testTextTabs.appendChild(tabExact);
        testTextRow.appendChild(testTextTabs);

        const simpleInput = document.createElement('input');
        simpleInput.type = 'text';
        simpleInput.style.flex = '1';
        simpleInput.style.fontSize = '12px';
        simpleInput.style.padding = '6px 8px';
        simpleInput.style.background = '#020617';
        simpleInput.style.border = '1px solid #22c55e';
        simpleInput.style.color = '#f9fafb';
        simpleInput.placeholder = '用于 type/fill 的普通文本，例如：硬盘固态m2';

        const exactArea = document.createElement('textarea');
        exactArea.style.flex = '1';
        exactArea.style.fontSize = '12px';
        exactArea.style.padding = '6px 8px';
        exactArea.style.background = '#020617';
        exactArea.style.border = '1px solid #22c55e';
        exactArea.style.color = '#f9fafb';
        exactArea.style.fontFamily = 'monospace';
        exactArea.style.minHeight = '80px';
        exactArea.placeholder = '逐行输入要发送的键，如：\ntext: 支付宝账号\nkey: Tab\nkey: Enter';
        exactArea.style.display = 'none';

        const help = document.createElement('div');
        help.className = 'wa-section-sub';
        help.style.marginTop = '4px';
        help.textContent = '精确键序列示例：text: hello\\nkey: Tab\\nkey: Control+V';

        const switchInputMode = (mode) => {
          if (mode === 'simple') {
            simpleInput.style.display = 'block';
            exactArea.style.display = 'none';
            tabSimple.style.borderColor = '#22c55e';
            tabSimple.style.background = '#065f46';
            tabExact.style.borderColor = 'transparent';
            tabExact.style.background = 'transparent';
          } else {
            simpleInput.style.display = 'none';
            exactArea.style.display = 'block';
            tabExact.style.borderColor = '#22c55e';
            tabExact.style.background = '#065f46';
            tabSimple.style.borderColor = 'transparent';
            tabSimple.style.background = 'transparent';
          }
          sectionOps.__waInputMode = mode;
        };

        tabSimple.addEventListener('click', () => switchInputMode('simple'));
        tabExact.addEventListener('click', () => switchInputMode('exact'));
        switchInputMode('simple');

        testTextRow.appendChild(simpleInput);
        testTextRow.appendChild(exactArea);
        // 快捷按键工具栏 + 即时发送开关
        const keyToolbar = document.createElement('div');
        keyToolbar.className = 'wa-key-toolbar';

        const sendToggleWrap = document.createElement('label');
        sendToggleWrap.className = 'wa-key-toggle';
        const sendToggle = document.createElement('input');
        sendToggle.type = 'checkbox';
        sendToggle.checked = true; // 默认即时发送
        const sendToggleText = document.createElement('span');
        sendToggleText.textContent = '快捷键即时发送';
        sendToggleWrap.appendChild(sendToggle);
        sendToggleWrap.appendChild(sendToggleText);

        const toolbarRow1 = document.createElement('div');
        toolbarRow1.className = 'wa-key-toolbar-row';
        const toolbarRow2 = document.createElement('div');
        toolbarRow2.className = 'wa-key-toolbar-row';

        const keysRow1 = [
          { label: 'Enter', key: 'Enter' },
          { label: 'Tab', key: 'Tab' },
          { label: 'Esc', key: 'Escape' },
          { label: 'Space', key: 'Space' },
          { label: 'Backspace', key: 'Backspace' },
          { label: 'Delete', key: 'Delete' }
        ];
        const keysRow2 = [
          { label: '←', key: 'ArrowLeft' },
          { label: '→', key: 'ArrowRight' },
          { label: '↑', key: 'ArrowUp' },
          { label: '↓', key: 'ArrowDown' },
          { label: 'Home', key: 'Home' },
          { label: 'End', key: 'End' },
          { label: 'Ctrl+A', key: 'Control+A' },
          { label: 'Ctrl+C', key: 'Control+C' },
          { label: 'Ctrl+V', key: 'Control+V' },
          { label: 'Cmd+A', key: 'Meta+A' },
          { label: 'Cmd+C', key: 'Meta+C' },
          { label: 'Cmd+V', key: 'Meta+V' }
        ];

        function makeKeyBtn(item) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'wa-key-btn';
          btn.textContent = item.label;
          btn.addEventListener('click', async () => {
            // 插入到精确序列区
            if ((sectionOps.__waInputMode || 'simple') !== 'exact') {
              switchInputMode('exact');
            }
            if (exactArea.value && !exactArea.value.endsWith('\n')) {
              exactArea.value += '\n';
            }
            exactArea.value += ('key:' + item.key);
            exactArea.focus();

            // 按需即时发送
            try {
              if (sendToggle.checked) {
                const statusEl = sectionOps.__waOpStatus;
                let sid = null;
                try { sid = (window && window.__webautoOverlaySessionId) || null; } catch (e) { sid = null; }
                if (!sid) {
                  if (statusEl) statusEl.textContent = '无法获取 Session ID，无法发送快捷键';
                  return;
                }
                await apiFetch('/api/v1/sessions/' + encodeURIComponent(sid) + '/key', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ key: item.key })
                });
                if (statusEl) statusEl.textContent = '已发送快捷键: ' + item.label;
              }
            } catch (e) {
              const statusEl = sectionOps.__waOpStatus;
              if (statusEl) statusEl.textContent = '发送快捷键失败: ' + (e && e.message ? e.message : String(e));
            }
          });
          return btn;
        }

        keysRow1.forEach(k => toolbarRow1.appendChild(makeKeyBtn(k)));
        keysRow2.forEach(k => toolbarRow2.appendChild(makeKeyBtn(k)));

        keyToolbar.appendChild(toolbarRow1);
        keyToolbar.appendChild(toolbarRow2);
        keyToolbar.appendChild(sendToggleWrap);
        testTextRow.appendChild(keyToolbar);
        testTextRow.appendChild(help);
        sectionOps.appendChild(testTextRow);
        const opStatus = document.createElement('div');
        opStatus.className = 'wa-section-sub';
        opStatus.style.marginTop = '2px';
        opStatus.style.fontSize = '10px';
        opStatus.style.color = '#9ca3af';
        opStatus.textContent = '';
        sectionOps.appendChild(opStatus);
        opList = document.createElement('ul');
        opList.className = 'wa-op-list';
        sectionOps.appendChild(opList);
        const btnSaveOps = document.createElement('button');
        btnSaveOps.className = 'wa-btn-link';
        btnSaveOps.textContent = '保存 Operation 配置';
        const btnTestOps = document.createElement('button');
        btnTestOps.className = 'wa-btn-link';
        btnTestOps.style.marginLeft = '8px';
        btnTestOps.textContent = '测试当前 Operation';
        sectionOps.appendChild(btnSaveOps);
        sectionOps.appendChild(btnTestOps);
        // 将元素挂到 sectionOps 上，方便渲染函数/保存逻辑访问
        sectionOps.__waMsgInput = msgInput;
        sectionOps.__waOpStatus = opStatus;
        sectionOps.__waTestTextInput = simpleInput;
        sectionOps.__waExactInput = exactArea;
        sectionOps.__waInputMode = 'simple';

        // 测试当前 Operation：针对当前容器执行一次 click/type/fill，用于观察效果
        btnTestOps.addEventListener('click', () => {
          try {
            const statusEl = sectionOps.__waOpStatus;
            if (!currentContainerId) {
              if (statusEl) {
                statusEl.textContent = '请先在左侧选择一个容器';
              }
              return;
            }
            const c = containersById[currentContainerId] || {};
            const selector = getPrimarySelector(c) || '';
            if (!selector) {
              if (statusEl) {
                statusEl.textContent = '当前容器没有 selector，无法测试 Operation';
              }
              return;
            }
            if (!currentOps || (!currentOps.click && !currentOps.type && !currentOps.fill && !currentOps.pressEnter && !currentOps.pressEsc)) {
              if (statusEl) {
                statusEl.textContent = '当前未启用任何 Operation（click/type/fill/pressKey），无法测试';
              }
              return;
            }
            if (statusEl) {
              statusEl.textContent = '正在测试当前 Operation...';
            }
            // 先执行 type/fill，再执行 click（如果启用）
            const doTest = async () => {
              // Session ID 优先从全局变量取，避免 Shadow DOM 查询失败
              let sid = null;
              try {
                sid = (window && window.__webautoOverlaySessionId) || null;
              } catch (e) {
                sid = null;
              }
              if (!sid) {
                if (statusEl) statusEl.textContent = '无法获取 Session ID，测试中止';
                return;
              }
              const payload = getInputPayload();
              const steps = payload.mode === 'exact'
                ? (payload.sequence.length ? payload.sequence : [{ kind: 'text', value: 'webauto-test' }])
                : [{ kind: 'text', value: payload.text }];
              try {
                // 1) 文本输入：根据 type/fill 选择模式
                if (currentOps.type || currentOps.fill || payload.mode === 'exact') {
                  const mode = currentOps.type ? 'type' : (currentOps.fill ? 'fill' : 'type');
                  for (const step of steps) {
                    if (step.kind === 'key') {
                      await apiFetch('/api/v1/sessions/' + encodeURIComponent(sid) + '/key', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: step.value })
                      });
                    } else {
                      await apiFetch('/api/v1/sessions/' + encodeURIComponent(sid) + '/input', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ selector, text: step.value, mode })
                      });
                    }
                  }
                }
                // 2) 点击
                if (currentOps.click) {
                  await apiFetch('/api/v1/sessions/' + encodeURIComponent(sid) + '/click', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ selector })
                  });
                }
                // 3) 特殊按键：按 Enter / 按 Esc
                if (currentOps.pressEnter || currentOps.pressEsc) {
                  const keys = [];
                  if (currentOps.pressEnter) keys.push('Enter');
                  if (currentOps.pressEsc) keys.push('Escape');
                  for (const key of keys) {
                    await apiFetch('/api/v1/sessions/' + encodeURIComponent(sid) + '/key', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ key })
                    });
                  }
                }
                if (statusEl) {
                  statusEl.textContent = '测试 Operation 已发送（根据页面反馈确认效果）';
                }
              } catch (e) {
                if (statusEl) {
                  statusEl.textContent = '测试 Operation 失败: ' + (e && e.message ? e.message : String(e));
                }
              }
            };
            // 不阻塞 UI 线程
            try { doTest(); } catch { }
          } catch (e) {
            const statusEl = sectionOps.__waOpStatus;
            if (statusEl) {
              statusEl.textContent = '测试 Operation 失败: ' + (e && e.message ? e.message : String(e));
            }
          }
        });

        // 保存 Operation 配置：调用 BrowserService API 更新 container-library.json 中的 actions
        btnSaveOps.addEventListener('click', () => {
          try {
            const statusEl = sectionOps.__waOpStatus;
            if (!currentContainerId) {
              if (statusEl) {
                statusEl.textContent = '请先在左侧选择一个容器';
              }
              return;
            }
            const c = containersById[currentContainerId] || {};
            const selector = getPrimarySelector(c) || '';
            if (!selector) {
              if (statusEl) {
                statusEl.textContent = '当前容器没有 selector，无法保存 Operation';
              }
              return;
            }
            const msgInputEl = sectionOps.__waMsgInput;
            const rawKey = msgInputEl && msgInputEl.value
              ? msgInputEl.value.trim()
              : '';
            const finalEventKey = rawKey || ('event.' + currentContainerId + '.appear');
            currentEventKey = finalEventKey;

            const payload = {
              id: currentContainerId,
              title: c.description || currentContainerId,
              selector: selector,
              url: window.location.href,
              parentId: null,
              actions: currentOps,
              eventKey: finalEventKey
            };
            if (statusEl) {
              statusEl.textContent = '正在保存 Operation 配置...';
            }
            apiFetch('/api/v1/containers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).then(r => r.json()).then(j => {
              if (!statusEl) return;
              if (j && j.success) {
                statusEl.textContent = '已保存 Operation: ' + currentContainerId;
              } else {
                statusEl.textContent = '保存失败: ' + (j && j.error ? j.error : '未知错误');
              }
            }).catch(e => {
              if (statusEl) {
                statusEl.textContent = '保存失败: ' + (e && e.message ? e.message : String(e));
              }
            });
          } catch (e) {
            const statusEl = sectionOps.__waOpStatus;
            if (statusEl) {
              statusEl.textContent = '保存失败: ' + (e && e.message ? e.message : String(e));
            }
          }
        });

        const sectionPalette = document.createElement('div');
        sectionPalette.className = 'wa-section';
        const st3 = document.createElement('div');
        st3.className = 'wa-section-title';
        st3.textContent = '可添加 Operation';
        sectionPalette.appendChild(st3);
        pal = document.createElement('div');
        pal.className = 'wa-op-palette';
        sectionPalette.appendChild(pal);

        const sectionChildren = document.createElement('div');
        sectionChildren.className = 'wa-section';
        const st4 = document.createElement('div');
        st4.className = 'wa-section-title';
        st4.textContent = '子容器';
        sectionChildren.appendChild(st4);
        const subList = document.createElement('ul');
        subList.className = 'wa-subcontainer-list';
        const li1 = document.createElement('li');
        li1.textContent = 'item-card（商品卡片）';
        const li2 = document.createElement('li');
        li2.textContent = 'price-area（价格区域）';
        subList.appendChild(li1);
        subList.appendChild(li2);
        const btnAddChild = document.createElement('button');
        btnAddChild.className = 'wa-btn-primary';
        btnAddChild.textContent = '＋ 添加子容器';
        sectionChildren.appendChild(subList);
        sectionChildren.appendChild(btnAddChild);

        // 优先展示 Operation 编辑区域，再展示容器详情
        right.appendChild(sectionOps);
        right.appendChild(sectionDetail);
        right.appendChild(sectionPalette);
        right.appendChild(sectionChildren);

        tabContentTree.appendChild(left);
        tabContentTree.appendChild(right);

        const tabContentDom = document.createElement('div');
        tabContentDom.className = 'wa-tab-content dom-mode';
        tabContentDom.style.display = 'none';
        tabContentDom.innerHTML = '<p>DOM 选取模式：</p><ol><li>切换到本标签或按 F2 开启 DOM 选取模式。</li><li>鼠标移动到页面元素上会高亮该元素。</li><li>点击元素以选中，下面会显示对应 Selector。</li><li>ESC 或切回容器树退出 DOM 选取模式。</li></ol>';

        const domInfo = document.createElement('div');
        domInfo.className = 'wa-dom-info';
        domInfo.style.marginTop = '6px';
        domInfo.style.fontSize = '11px';
        domInfo.style.color = '#d1d5db';
        domInfo.textContent = '当前未选中任何元素（切换到 DOM 选取标签或按 F2 开启）';
        tabContentDom.appendChild(domInfo);

        // 容器创建区域（根容器/子容器）
        const createBox = document.createElement('div');
        createBox.className = 'wa-section';
        createBox.style.marginTop = '8px';
        const createTitle = document.createElement('div');
        createTitle.className = 'wa-section-title';
        createTitle.textContent = '创建容器';
        createBox.appendChild(createTitle);

        const fieldId = document.createElement('div');
        fieldId.className = 'wa-field';
        const fieldIdLabel = document.createElement('label');
        fieldIdLabel.textContent = '容器 ID';
        const fieldIdValue = document.createElement('input');
        fieldIdValue.type = 'text';
        fieldIdValue.style.flex = '1';
        fieldIdValue.style.fontSize = '11px';
        fieldIdValue.style.background = '#020617';
        fieldIdValue.style.border = '1px solid #1f2937';
        fieldIdValue.style.color = '#e5e7eb';
        fieldIdValue.placeholder = '例如 home.root 或 auto_root_1';
        fieldId.appendChild(fieldIdLabel);
        fieldId.appendChild(fieldIdValue);
        createBox.appendChild(fieldId);

        const fieldParentId = document.createElement('div');
        fieldParentId.className = 'wa-field';
        const fieldParentIdLabel = document.createElement('label');
        fieldParentIdLabel.textContent = '父容器 ID';
        const fieldParentIdValue = document.createElement('input');
        fieldParentIdValue.type = 'text';
        fieldParentIdValue.style.flex = '1';
        fieldParentIdValue.style.fontSize = '11px';
        fieldParentIdValue.style.background = '#020617';
        fieldParentIdValue.style.border = '1px solid #1f2937';
        fieldParentIdValue.style.color = '#e5e7eb';
        fieldParentIdValue.placeholder = '留空则为根容器';
        fieldParentId.appendChild(fieldParentIdLabel);
        fieldParentId.appendChild(fieldParentIdValue);
        createBox.appendChild(fieldParentId);

        const fieldTitle = document.createElement('div');
        fieldTitle.className = 'wa-field';
        const fieldTitleLabel = document.createElement('label');
        fieldTitleLabel.textContent = '标题';
        const fieldTitleValue = document.createElement('input');
        fieldTitleValue.type = 'text';
        fieldTitleValue.style.flex = '1';
        fieldTitleValue.style.fontSize = '11px';
        fieldTitleValue.style.background = '#020617';
        fieldTitleValue.style.border = '1px solid #1f2937';
        fieldTitleValue.style.color = '#e5e7eb';
        fieldTitleValue.placeholder = '例如 1688 首页根容器';
        fieldTitle.appendChild(fieldTitleLabel);
        fieldTitle.appendChild(fieldTitleValue);
        createBox.appendChild(fieldTitle);

        const fieldSelector = document.createElement('div');
        fieldSelector.className = 'wa-field';
        const fieldSelectorLabel = document.createElement('label');
        fieldSelectorLabel.textContent = 'Selector';
        const fieldSelectorValue = document.createElement('textarea');
        fieldSelectorValue.style.flex = '1';
        fieldSelectorValue.style.fontSize = '11px';
        fieldSelectorValue.style.background = '#020617';
        fieldSelectorValue.style.border = '1px solid #1f2937';
        fieldSelectorValue.style.color = '#e5e7eb';
        fieldSelectorValue.style.height = '40px';
        fieldSelectorValue.placeholder = '点击页面元素后，这里会自动填入其 selector';
        fieldSelector.appendChild(fieldSelectorLabel);
        fieldSelector.appendChild(fieldSelectorValue);
        createBox.appendChild(fieldSelector);

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.justifyContent = 'flex-end';
        btnRow.style.gap = '6px';
        const btnCancel = document.createElement('button');
        btnCancel.className = 'wa-icon-btn';
        btnCancel.textContent = '放弃';
        const btnSave = document.createElement('button');
        btnSave.className = 'wa-btn-primary';
        btnSave.textContent = '保存容器';
        btnRow.appendChild(btnCancel);
        btnRow.appendChild(btnSave);
        createBox.appendChild(btnRow);

        tabContentDom.appendChild(createBox);

        let lastPicked = null;

        // 监听页面级 DOM 选取结果事件，并在 UI 中展示 + 预填容器表单
        try {
          window.addEventListener('__webauto_dom_picked', (ev) => {
            try {
              const detail = ev.detail || {};
              const sel = detail.selector || '(无)';
              const tag = detail.tagName || '';
              lastPicked = detail;
              domInfo.textContent = '已选元素: ' + (tag ? tag + ' ' : '') + sel;

              // 自动生成容器 ID / 标题 / selector
              const cls = (detail.className || '').split(/\s+/).filter(Boolean)[0] || '';
              const baseId = cls ? (tag.toLowerCase() + '.' + cls) : tag.toLowerCase() || 'container';
              if (!fieldIdValue.value) {
                fieldIdValue.value = baseId;
              }
              if (!fieldTitleValue.value) {
                fieldTitleValue.value = '容器: ' + (tag || '') + (cls ? (' .' + cls) : '');
              }
              fieldSelectorValue.value = sel;

              // Auto-detect root
              const hasRoot = document.querySelector('.wa-tree-root-container');
              if (!hasRoot && !fieldParentIdValue.value) {
                fieldParentIdValue.placeholder = '当前无根容器，此容器将作为根容器';
              }
            } catch { }
          });
        } catch { }

        // 放弃编辑：清空当前表单
        btnCancel.addEventListener('click', () => {
          lastPicked = null;
          fieldIdValue.value = '';
          fieldTitleValue.value = '';
          fieldSelectorValue.value = '';
          fieldParentIdValue.value = ''; // Clear parent ID
          domInfo.textContent = '当前未选中任何元素（切换到 DOM 选取标签或按 F2 开启）';
        });

        // 保存容器：通过 BrowserService API 写入 container-library.json
        btnSave.addEventListener('click', () => {
          try {
            const id = fieldIdValue.value.trim();
            const title = fieldTitleValue.value.trim();
            const selector = fieldSelectorValue.value.trim();
            if (!id || !selector) {
              domInfo.textContent = '保存失败：容器 ID 和 selector 不能为空';
              return;
            }
            const payload = {
              id,
              title,
              selector,
              url: window.location.href,
              parentId: fieldParentIdValue.value.trim() || null, // Use the input value
              actions: null
            };
            apiFetch('/api/v1/containers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).then(r => r.json()).then(j => {
              if (j && j.success) {
                domInfo.textContent = '已保存容器: ' + id;
              } else {
                domInfo.textContent = '保存失败: ' + (j && j.error ? j.error : '未知错误');
              }
            }).catch(e => {
              domInfo.textContent = '保存失败: ' + (e && e.message ? e.message : String(e));
            });
          } catch (e) {
            domInfo.textContent = '保存失败: ' + (e && e.message ? e.message : String(e));
          }
        });

        body.appendChild(tabContentTree);
        body.appendChild(tabContentDom);

        const footer = document.createElement('div');
        footer.className = 'wa-footer';
        const fLeft = document.createElement('span');
        fLeft.textContent = '状态：容器编辑 v2（支持 Operation & 事件 key 配置）';
        const fRight = document.createElement('span');
        fRight.textContent = 'F2 切换 DOM 选取 · ESC 取消';
        footer.appendChild(fLeft);
        footer.appendChild(fRight);

        panel.appendChild(header);
        panel.appendChild(tabs);
        panel.appendChild(body);
        panel.appendChild(footer);

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wa-resize-handle';
        panel.appendChild(resizeHandle);

        // Resize Logic
        let isResizing = false;
        let lastDownX = 0;
        let lastDownY = 0;

        resizeHandle.addEventListener('pointerdown', (e) => {
          isResizing = true;
          lastDownX = e.clientX;
          lastDownY = e.clientY;
          e.stopPropagation();
          e.preventDefault();
          document.addEventListener('pointermove', onResizeMove);
          document.addEventListener('pointerup', onResizeUp);
        });

        function onResizeMove(e) {
          if (!isResizing) return;
          const dx = e.clientX - lastDownX;
          const dy = e.clientY - lastDownY;

          const newW = panel.offsetWidth + dx;
          const newH = panel.offsetHeight + dy;

          if (newW > 300) {
            panel.style.width = newW + 'px';
            panel.style.maxWidth = 'none'; // Override max-width
            lastDownX = e.clientX;
          }
          if (newH > 300) {
            panel.style.height = newH + 'px';
            panel.style.maxHeight = 'none'; // Override max-height
            lastDownY = e.clientY;
          }
        }

        function onResizeUp() {
          isResizing = false;
          document.removeEventListener('pointermove', onResizeMove);
          document.removeEventListener('pointerup', onResizeUp);
        }

        const SNAP_MARGIN = 12;
        function refreshPanelSize() {
          try {
            const availH = Math.max(360, window.innerHeight - SNAP_MARGIN * 2);
            const availW = Math.max(420, window.innerWidth - SNAP_MARGIN * 2);
            panel.style.maxHeight = availH + 'px';
            panel.style.maxWidth = availW + 'px';
            panel.style.width = 'fit-content';
            panel.style.height = 'auto';
            const contentW = panel.scrollWidth;
            if (contentW > availW) {
              panel.style.width = availW + 'px';
            }
            const contentH = panel.scrollHeight;
            if (contentH > availH) {
              panel.style.height = availH + 'px';
              if (panel.__waBody) panel.__waBody.style.overflowY = 'auto';
            } else {
              panel.style.height = 'auto';
              if (panel.__waBody) panel.__waBody.style.overflowY = 'visible';
            }
          } catch { }
        }
        root.dataset.waFloating = 'false';
        function snapPanelHome() {
          try {
            panel.style.width = 'auto';
            panel.style.maxWidth = Math.max(420, window.innerWidth - SNAP_MARGIN * 2) + 'px';
            panel.style.maxHeight = Math.max(360, window.innerHeight - SNAP_MARGIN * 2) + 'px';
            root.style.top = SNAP_MARGIN + 'px';
            root.style.right = SNAP_MARGIN + 'px';
            root.style.left = 'auto';
            root.dataset.waFloating = 'false';
            refreshPanelSize();
          } catch { }
        }
        snapPanelHome();

        function ensureLeftAnchor() {
          if (root.style.right === 'auto') return;
          const rect = root.getBoundingClientRect();
          root.style.left = rect.left + 'px';
          root.style.top = rect.top + 'px';
          root.style.right = 'auto';
        }

        function clamp(val, min, max) {
          return Math.min(Math.max(val, min), max);
        }

        function updatePanelPosition(left, top) {
          const rect = root.getBoundingClientRect();
          const maxLeft = Math.max(SNAP_MARGIN, window.innerWidth - rect.width - SNAP_MARGIN);
          const maxTop = Math.max(SNAP_MARGIN, window.innerHeight - rect.height - SNAP_MARGIN);
          root.style.left = clamp(left, SNAP_MARGIN, maxLeft) + 'px';
          root.style.top = clamp(top, SNAP_MARGIN, maxTop) + 'px';
          root.style.right = 'auto';
          root.dataset.waFloating = 'true';
        }

        const dragState = { active: false, offsetX: 0, offsetY: 0 };

        function endDrag() {
          if (!dragState.active) return;
          dragState.active = false;
          panel.classList.remove('wa-panel-dragging');
          document.removeEventListener('pointermove', onDragMove);
          document.removeEventListener('pointerup', endDrag);
        }

        function onDragMove(e) {
          if (!dragState.active) return;
          e.preventDefault();
          updatePanelPosition(e.clientX - dragState.offsetX, e.clientY - dragState.offsetY);
        }

        function startDrag(e) {
          if (e.button !== undefined && e.button !== 0) return;
          if (e.target.closest('.wa-header-actions')) return;
          dragState.active = true;
          ensureLeftAnchor();
          const rect = root.getBoundingClientRect();
          dragState.offsetX = e.clientX - rect.left;
          dragState.offsetY = e.clientY - rect.top;
          panel.classList.add('wa-panel-dragging');
          document.addEventListener('pointermove', onDragMove);
          document.addEventListener('pointerup', endDrag);
        }

        header.addEventListener('pointerdown', startDrag);
        header.addEventListener('dblclick', (e) => {
          e.preventDefault();
          snapPanelHome();
          refreshPanelSize();
        });

        function handleResize() {
          if (window.innerWidth < 920 || window.innerHeight < 620) {
            snapPanelHome();
            return;
          }
          if (root.dataset.waFloating !== 'true') {
            snapPanelHome();
            return;
          }
          const rect = root.getBoundingClientRect();
          updatePanelPosition(rect.left, rect.top);
        }

        window.addEventListener('resize', () => {
          refreshPanelSize();
          handleResize();
        });

        refreshPanelSize();

        rootWrap.appendChild(pill);
        rootWrap.appendChild(panel);

        shadow.appendChild(rootWrap);
        document.documentElement.appendChild(root);

        window.__webautoOverlay = {
          update(info) {
            try {
              if (!info) return;
              if (info.sessionId) {
                const el = shadow.getElementById('__waOverlay_sid');
                if (el) el.textContent = String(info.sessionId);
              }
              if (info.profileId) {
                const el = shadow.getElementById('__waOverlay_pid');
                if (el) el.textContent = String(info.profileId);
              }
            } catch { }
          }
        };

        // 基础 UI 行为：打开/折叠面板，标签切换，树节点简单高亮
        const showPanel = () => {
          panel.classList.remove('hidden');
        };
        const hidePanel = () => {
          panel.classList.add('hidden');
        };

        openBtn.addEventListener('click', () => {
          if (panel.classList.contains('hidden')) {
            showPanel();
          } else {
            hidePanel();
          }
        });
        collapseBtn.addEventListener('click', hidePanel);
        closeBtn.addEventListener('click', hidePanel);

        tabTree.addEventListener('click', () => {
          tabTree.classList.add('active');
          tabDom.classList.remove('active');
          tabContentTree.style.display = 'flex';
          tabContentDom.style.display = 'none';
          // 退出 DOM 选取模式，避免误选
          try {
            if (window.__webautoDomSelect && typeof window.__webautoDomSelect.disable === 'function') {
              window.__webautoDomSelect.disable();
            }
            domInfo.textContent = '当前未选中任何元素（切换到 DOM 选取标签或按 F2 开启）';
          } catch { }
        });
        tabDom.addEventListener('click', () => {
          tabDom.classList.add('active');
          tabTree.classList.remove('active');
          tabContentTree.style.display = 'none';
          tabContentDom.style.display = 'block';
          // 进入 DOM 选取模式：自动开启选取
          try {
            if (window.__webautoDomSelect && typeof window.__webautoDomSelect.enable === 'function') {
              window.__webautoDomSelect.enable();
            }
            domInfo.textContent = 'DOM 选取已开启：移动鼠标高亮元素，点击选中（ESC 或切回容器树退出）';
          } catch { }
        });

        const allNodes = [rootNode, nodeNav, nodeSide, nodeProduct, child1, child2];
        allNodes.forEach(node => {
          node.addEventListener('click', () => {
            allNodes.forEach(n => n.classList.remove('wa-tree-node-selected'));
            node.classList.add('wa-tree-node-selected');
          });
        });
      } catch { }
    }

    // 首次执行，确保当前文档已有 overlay
    ensureOverlay();


    // DOM 变动时自动“自愈”，防止站点用 JS 重写页面把 overlay 干掉
    try {
      const target = document.documentElement || document.body || document;
      const observer = new MutationObserver(() => {
        try {
          if (!document.getElementById(ROOT_ID)) {
            ensureOverlay();
          }
        } catch { }
      });
      observer.observe(target, { childList: true, subtree: true });
    } catch { }

    // 兜底：每隔几秒检查一次，确保极端情况下 overlay 仍能恢复
    try {
      if (!window.__webautoOverlayKeepAlive) {
        window.__webautoOverlayKeepAlive = setInterval(() => {
          try {
            if (!document.getElementById(ROOT_ID)) {
              ensureOverlay();
            }
          } catch { }
        }, 4000);
      }
    } catch { }
  } catch { }
})();
