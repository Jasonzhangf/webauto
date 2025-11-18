            (() => {
              try {
                const ROOT_ID = '__webauto_overlay_root_v2__';

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
                    } catch {}

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
      .wa-panel {
        position: absolute;
        top: 26px;
        right: 0;
        width: 520px; /* 面板整体稍微加宽，给右侧更多空间 */
        height: 560px;
        background: #022c22;
        border-radius: 14px;
        border: 1px solid #16a34a;
        box-shadow: 0 18px 45px rgba(0,0,0,0.7);
        display: flex;
        flex-direction: column;
        overflow: hidden;
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
        /* 允许整个面板内容在固定高度内滚动，避免 Operation 区被裁掉 */
        overflow: auto;
      }
      .wa-left {
        width: 40%; /* 左侧树瘦一点，把空间让给右侧编辑区 */
        border-right: 1px solid #064e3b;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #022c22;
      }
      .wa-right {
        flex: 1;
        min-width: 0;
        padding: 10px 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #022c22;
        min-height: 0;
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
                    } catch (e) {}

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

                    const DEBUG_BASE = 'http://127.0.0.1:8888';

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

                    function clearTreeSelection() {
                      treeNodes.forEach(n => n.classList.remove('wa-tree-node-selected'));
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
                      } catch {}
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
                      } catch (e) {}

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
                            } catch (e2) {}
                          });
                          li.addEventListener('dragover', (e) => {
                            try {
                              if (e) {
                                e.preventDefault();
                                if (e.dataTransfer) {
                                  e.dataTransfer.dropEffect = 'move';
                                }
                              }
                            } catch (e2) {}
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
                            } catch (e2) {}
                          });
                          li.addEventListener('dragend', () => {
                            try { dragKey = null; } catch (e2) {}
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
                            const selector2 = c2.selector || '';
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
                            const base = DEBUG_BASE;
                            const run = async () => {
                              try {
                                if (op.key === 'click') {
                                  await fetch(base + '/api/v1/sessions/' + encodeURIComponent(sid) + '/click', {
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
                                      await fetch(base + '/api/v1/sessions/' + encodeURIComponent(sid) + '/key', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ key: step.value })
                                      });
                                    } else {
                                      await fetch(base + '/api/v1/sessions/' + encodeURIComponent(sid) + '/input', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ selector: selector2, text: step.value, mode })
                                      });
                                    }
                                  }
                                } else if (op.key === 'pressEnter' || op.key === 'pressEsc') {
                                  const sendKey = op.key === 'pressEnter' ? 'Enter' : 'Escape';
                                  await fetch(base + '/api/v1/sessions/' + encodeURIComponent(sid) + '/key', {
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
                            try { run(); } catch (e) {}
                          } catch {}
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
                          const selector = c.selector || '';
                          highlightContainer(selector);
                          domInfo.textContent = '已选容器: ' + id + ' (' + (selector || '无 selector') + ')';
                          // 将当前容器信息回填到右侧“容器详情”区域
                          try {
                            f1v.textContent = c.description || id;
                            f2v.textContent = selector || '';
                            f3v.textContent = id;
                            renderOpsForContainer(id);
                          } catch {}
                        });

                        (c.children || []).forEach(childId => {
                          makeNode(childId, depth + 1);
                        });
                      }

                      roots.forEach(id => makeNode(id, 0));
                    }

                    // 首次加载容器树
                    try {
                      fetch(DEBUG_BASE + '/api/v1/containers?url=' + encodeURIComponent(window.location.href))
                        .then(r => r.json())
                        .then(j => {
                          if (!j || !j.success) return;
                          const containers = (j.data && j.data.containers) || {};
                          renderContainerTree(containers);
                        })
                        .catch(() => {});
                    } catch {}
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
                    const f1v = document.createElement('div');
                    f1v.className = 'wa-field-value';
                    f1v.textContent = '商品列表容器';
                    f1.appendChild(f1l);
                    f1.appendChild(f1v);
                    const f2 = document.createElement('div');
                    f2.className = 'wa-field';
                    const f2l = document.createElement('label');
                    f2l.textContent = 'Selector';
                    const f2v = document.createElement('div');
                    f2v.className = 'wa-field-value';
                    f2v.textContent = '.product-list';
                    f2.appendChild(f2l);
                    f2.appendChild(f2v);
                    const f3 = document.createElement('div');
                    f3.className = 'wa-field';
                    const f3l = document.createElement('label');
                    f3l.textContent = '容器 ID';
                    const f3v = document.createElement('div');
                    f3v.className = 'wa-field-value';
                    f3v.textContent = 'product_list';
                    f3.appendChild(f3l);
                    f3.appendChild(f3v);
                    sectionDetail.appendChild(f1);
                    sectionDetail.appendChild(f2);
                    sectionDetail.appendChild(f3);

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
                        const selector = c.selector || '';
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
                          const base = DEBUG_BASE;
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
                                  await fetch(base + '/api/v1/sessions/' + encodeURIComponent(sid) + '/key', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ key: step.value })
                                  });
                                } else {
                                  await fetch(base + '/api/v1/sessions/' + encodeURIComponent(sid) + '/input', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ selector, text: step.value, mode })
                                  });
                                }
                              }
                            }
                            // 2) 点击
                            if (currentOps.click) {
                              await fetch(base + '/api/v1/sessions/' + encodeURIComponent(sid) + '/click', {
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
                                await fetch(base + '/api/v1/sessions/' + encodeURIComponent(sid) + '/key', {
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
                        try { doTest(); } catch {}
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
                        const selector = c.selector || '';
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
                        fetch(DEBUG_BASE + '/api/v1/containers', {
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
          } catch {}
        });
      } catch {}

      // 放弃编辑：清空当前表单
      btnCancel.addEventListener('click', () => {
        lastPicked = null;
        fieldIdValue.value = '';
        fieldTitleValue.value = '';
        fieldSelectorValue.value = '';
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
            parentId: null,
            actions: null
          };
          const DEBUG_BASE = 'http://127.0.0.1:8888';
          fetch(DEBUG_BASE + '/api/v1/containers', {
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

                    rootWrap.appendChild(pill);
                    rootWrap.appendChild(panel);

                    shadow.appendChild(rootWrap);
                    document.documentElement.appendChild(root);

                    window.__webautoOverlay = {
                      update(info){
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
                        } catch {}
                      }
                    };

                    // 基础 UI 行为：打开/折叠面板，标签切换，树节点简单高亮
                    openBtn.addEventListener('click', () => {
                      panel.classList.toggle('hidden');
                    });
                    collapseBtn.addEventListener('click', () => {
                      panel.classList.add('hidden');
                    });
                    closeBtn.addEventListener('click', () => {
                      root.style.display = 'none';
                    });

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
        } catch {}
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
        } catch {}
      });

                    const allNodes = [rootNode, nodeNav, nodeSide, nodeProduct, child1, child2];
                    allNodes.forEach(node => {
                      node.addEventListener('click', () => {
                        allNodes.forEach(n => n.classList.remove('wa-tree-node-selected'));
                        node.classList.add('wa-tree-node-selected');
                      });
                    });
                  } catch {}
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
                    } catch {}
                  });
                  observer.observe(target, { childList: true, subtree: true });
                } catch {}

                // 兜底：每隔几秒检查一次，确保极端情况下 overlay 仍能恢复
                try {
                  if (!window.__webautoOverlayKeepAlive) {
                    window.__webautoOverlayKeepAlive = setInterval(() => {
                      try {
                        if (!document.getElementById(ROOT_ID)) {
                          ensureOverlay();
                        }
                      } catch {}
                    }, 4000);
                  }
                } catch {}
              } catch {}
            })();
            """

            script = script_template.replace("__SID__", sid).replace("__PID__", pid)

            # 1) 在 Context 级别注册 init script，确保“新页面 / 刷新”时都会尝试注入
            try:
                context.add_init_script(script)
            except Exception:
                # 有些 Camoufox/Playwright 版本在此处可能有限制，失败不阻断后续逻辑
                pass

            # 2) 为当前已存在的页面手动执行一次注入
            try:
                existing_pages = list(getattr(context, "pages", []) or [])
            except Exception:
                existing_pages = []
