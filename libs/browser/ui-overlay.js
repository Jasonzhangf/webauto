/**
 * 浏览器 UI Overlay 注入模块
 * - 提供右上角悬浮菜单 + 容器编辑面板的 UI 雏形
 * - 当前实现仅为 UI/交互骨架，不绑定真实容器数据
 * - 使用 Shadow DOM 与页面内容隔离
 */

/**
 * 构造注入悬浮菜单的脚本
 * @param {{ sessionId: string, profileId?: string }} param0
 * @returns {string}
 */
export function buildOverlayScript({ sessionId, profileId = 'default' }) {
  const sid = JSON.stringify(sessionId);
  const pid = JSON.stringify(profileId);
  return `(() => {
    try {
      const ROOT_ID = '__webauto_overlay_root__';
      if (document.getElementById(ROOT_ID)) return;

      const root = document.createElement('div');
      root.id = ROOT_ID;
      root.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;pointer-events:none;';

      const host = document.createElement('div');
      root.appendChild(host);

      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = \`
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
        background: rgba(15,23,42,0.92);
        border: 1px solid rgba(55,65,81,0.9);
        color: #e5e7eb;
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
        width: 420px;
        height: 560px;
        background: #020617;
        border-radius: 14px;
        border: 1px solid #1e293b;
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
        border-bottom: 1px solid #1f2937;
        background: linear-gradient(90deg,#020617,#0b1120);
        font-size: 11px;
        color: #e5e7eb;
      }
      .wa-header-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .wa-badge {
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(59,130,246,0.15);
        border: 1px solid rgba(59,130,246,0.4);
        color: #bfdbfe;
      }
      .wa-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .wa-icon-btn {
        border: none;
        background: transparent;
        color: #6b7280;
        font-size: 13px;
        padding: 2px 4px;
        border-radius: 4px;
        cursor: default;
      }
      .wa-icon-btn:hover {
        background: rgba(55,65,81,0.6);
        color: #e5e7eb;
      }
      .wa-tabs {
        display: flex;
        padding: 6px 10px;
        gap: 6px;
        border-bottom: 1px solid #1f2937;
        background: #020617;
        font-size: 12px;
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
        background: #020617;
      }
      .wa-left {
        width: 46%;
        border-right: 1px solid #1f2937;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #020617;
      }
      .wa-right {
        flex: 1;
        padding: 10px 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #020617;
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
        background: rgba(15,23,42,0.9);
        border: 1px solid #1e293b;
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
        padding: 2px 8px;
        border-radius: 999px;
        background: #020617;
        border: 1px solid #374151;
        font-size: 11px;
        color: #d1d5db;
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
        background: #2563eb;
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
      \`;

      shadow.appendChild(style);

      const rootWrap = document.createElement('div');
      rootWrap.className = 'wa-root';

      // 顶部 pill（SID/Profile + 打开编辑器按钮）
      const pill = document.createElement('div');
      pill.className = 'wa-pill';

      const sidLabel = document.createElement('span');
      sidLabel.className = 'wa-pill-label';
      sidLabel.textContent = 'SID';
      const sidVal = document.createElement('span');
      sidVal.id = '__waOverlay_sid';
      sidVal.textContent = ${sid};

      const sep = document.createElement('span');
      sep.className = 'wa-pill-sep';

      const pidLabel = document.createElement('span');
      pidLabel.className = 'wa-pill-label';
      pidLabel.textContent = 'P';
      const pidVal = document.createElement('span');
      pidVal.id = '__waOverlay_pid';
      pidVal.textContent = ${pid};

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
      badgeSid.textContent = 'SID: ' + ${sid};
      const badgePid = document.createElement('span');
      badgePid.className = 'wa-badge';
      badgePid.textContent = 'Profile: ' + ${pid};
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

      function clearTreeSelection() {
        treeNodes.forEach((n) => n.classList.remove('wa-tree-node-selected'));
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
          box.style.left = rect.left + scrollX - 2 + 'px';
          box.style.top = rect.top + scrollY - 2 + 'px';
          box.style.width = Math.max(rect.width + 4, 4) + 'px';
          box.style.height = Math.max(rect.height + 4, 4) + 'px';
          box.style.display = 'block';
        } catch {}
      }

      function renderOpsForContainer(id) {
        const c = containersById[id] || {};
        currentContainerId = id;
        currentOps = Object.assign({}, c.actions || {});

        // 更新当前事件 key（默认: event.<id>.appear）
        try {
          const msgInput = sectionOps && sectionOps.__waMsgInput;
          const statusEl = sectionOps && sectionOps.__waOpStatus;
          const defaultKey = c.eventKey || 'event.' + id + '.appear';
          currentEventKey = defaultKey;
          if (msgInput) {
            msgInput.value = defaultKey;
          }
          if (statusEl) {
            statusEl.textContent = '';
          }
        } catch {}

        // 渲染已注册 Operation 列表
        opList.innerHTML = '';
        const activeKeys = Object.keys(currentOps).filter((k) => currentOps[k]);
        if (!activeKeys.length) {
          const li = document.createElement('li');
          li.className = 'wa-op-item';
          li.innerHTML = '<span class="wa-op-name">暂无已注册 Operation</span>';
          opList.appendChild(li);
        } else {
          activeKeys.forEach((key) => {
            const li = document.createElement('li');
            li.className = 'wa-op-item';
            li.innerHTML =
              '<span class="wa-op-handle">●</span><span class="wa-op-name">' + key + '</span>';
            opList.appendChild(li);
          });
        }

        // 渲染可添加 Operation 芯片
        const OPS = [
          { key: 'click', label: '点击 (click)' },
          { key: 'type', label: '输入 (type)' },
          { key: 'fill', label: '填充值 (fill)' },
        ];
        pal.innerHTML = '';
        OPS.forEach((op) => {
          const chip = document.createElement('span');
          chip.className = 'wa-op-chip';
          const active = !!currentOps[op.key];
          chip.textContent = op.label;
          chip.style.background = active ? '#1d4ed8' : '#020617';
          chip.style.borderColor = active ? '#60a5fa' : '#374151';
          chip.style.color = active ? '#eff6ff' : '#d1d5db';
          chip.addEventListener('click', () => {
            currentOps[op.key] = !currentOps[op.key];
            renderOpsForContainer(id);
          });
          pal.appendChild(chip);
        });
      }

      function renderContainerTree(containers) {
        containersById = containers || {};
        tree.innerHTML = '';
        treeNodes = [];

        const parentMap = {};
        Object.keys(containersById).forEach((id) => {
          const c = containersById[id] || {};
          (c.children || []).forEach((childId) => {
            parentMap[childId] = id;
          });
        });

        const roots = Object.keys(containersById).filter((id) => !parentMap[id]);
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
          node.className =
            'wa-tree-node' + (depth === 0 ? ' wa-tree-node-root' : ' wa-tree-node-child');
          node.textContent = c.description || id;
          node.style.marginLeft = depth > 0 ? 14 * depth + 'px' : '0';
          node.dataset.containerId = id;
          tree.appendChild(node);
          treeNodes.push(node);

          node.addEventListener('click', () => {
            clearTreeSelection();
            node.classList.add('wa-tree-node-selected');
            const selector = c.selector || '';
            highlightContainer(selector);
            // 将当前容器信息回填到右侧“容器详情”区域
            try {
              f1v.textContent = c.description || id;
              f2v.textContent = selector || '';
              f3v.textContent = id;
              renderOpsForContainer(id);
            } catch {}
          });

          (c.children || []).forEach((childId) => {
            makeNode(childId, depth + 1);
          });
        }

        roots.forEach((id) => makeNode(id, 0));
      }

      // 首次加载容器树
      try {
        fetch(DEBUG_BASE + '/api/v1/containers?url=' + encodeURIComponent(window.location.href))
          .then((r) => r.json())
          .then((j) => {
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

      const sectionOps = document.createElement('div');
      sectionOps.className = 'wa-section';
      const st2 = document.createElement('div');
      st2.className = 'wa-section-title';
      st2.innerHTML =
        '已注册 Operation <span class="wa-section-sub">（为指定事件配置 click/type/fill，然后保存）</span>';
      sectionOps.appendChild(st2);
      // 事件 key 编辑行
      const msgRow = document.createElement('div');
      msgRow.className = 'wa-field';
      const msgLabel = document.createElement('label');
      msgLabel.textContent = '事件 key';
      const msgInput = document.createElement('input');
      msgInput.type = 'text';
      msgInput.style.flex = '1';
      msgInput.style.fontSize = '11px';
      msgInput.style.background = '#020617';
      msgInput.style.border = '1px solid #1f2937';
      msgInput.style.color = '#e5e7eb';
      msgInput.placeholder = '如 event.home.search.searchbox.appear';
      msgRow.appendChild(msgLabel);
      msgRow.appendChild(msgInput);
      sectionOps.appendChild(msgRow);
      const opStatus = document.createElement('div');
      opStatus.className = 'wa-section-sub';
      opStatus.style.marginTop = '2px';
      opStatus.style.fontSize = '10px';
      opStatus.style.color = '#9ca3af';
      opStatus.textContent = '';
      sectionOps.appendChild(opStatus);
      const opList = document.createElement('ul');
      opList.className = 'wa-op-list';
      sectionOps.appendChild(opList);
      const btnLink = document.createElement('button');
      btnLink.className = 'wa-btn-link';
      btnLink.textContent = '保存 Operation 配置';
      sectionOps.appendChild(btnLink);
      // 将元素挂到 sectionOps 上，方便渲染函数/保存逻辑访问
      sectionOps.__waMsgInput = msgInput;
      sectionOps.__waOpStatus = opStatus;

      const sectionPalette = document.createElement('div');
      sectionPalette.className = 'wa-section';
      const st3 = document.createElement('div');
      st3.className = 'wa-section-title';
      st3.textContent = '可添加 Operation';
      sectionPalette.appendChild(st3);
      const pal = document.createElement('div');
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

      right.appendChild(sectionDetail);
      right.appendChild(sectionOps);
      right.appendChild(sectionPalette);
      right.appendChild(sectionChildren);

      tabContentTree.appendChild(left);
      tabContentTree.appendChild(right);

      const tabContentDom = document.createElement('div');
      tabContentDom.className = 'wa-tab-content dom-mode';
      tabContentDom.style.display = 'none';
      tabContentDom.innerHTML =
        '<p>DOM 选取模式（占位 UI）：</p><ol><li>将鼠标移动到页面元素上（未来会显示蓝色高亮）。</li><li>点击元素以选择为子容器。</li><li>在这里填写容器信息并保存。</li></ol>';

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
      });
      tabDom.addEventListener('click', () => {
        tabDom.classList.add('active');
        tabTree.classList.remove('active');
        tabContentTree.style.display = 'none';
        tabContentDom.style.display = 'block';
      });

      const allNodes = [rootNode, nodeNav, nodeSide, nodeProduct, child1, child2];
      allNodes.forEach(node => {
        node.addEventListener('click', () => {
          allNodes.forEach(n => n.classList.remove('wa-tree-node-selected'));
          node.classList.add('wa-tree-node-selected');
        });
      });
    } catch {}
  })();`;
}

/**
 * 在 Playwright BrowserContext 上安装 overlay init 脚本
 * @param context
 * @param {{ sessionId: string, profileId?: string }} param1
 */
export async function installOverlay(context, { sessionId, profileId = 'default' }) {
  try {
    const script = buildOverlayScript({ sessionId, profileId });
    await context.addInitScript(script);
  } catch {
    // overlay 注入失败不影响主流程
  }
}
