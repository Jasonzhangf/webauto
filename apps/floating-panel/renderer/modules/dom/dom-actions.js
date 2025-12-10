export function createDomActionsManager(options = {}) {
  const {
    state,
    ui,
    showMessage,
    invokeAction,
    applyContainerSnapshotData,
    renderContainers,
    getSelectedDomNode,
    getRootContainerId,
    getContainerAlias,
    findContainerNode,
    findNearestContainerIdForDom,
    buildDomNodeSelectors,
    buildChildContainerId,
    deriveDomAlias,
    getDomNodeSelector,
    formatDomNodeLabel,
    triggerHighlight,
    resolveCurrentPageUrl,
    remapContainerToDom,
    onHighlightCleared,
    uiStateService,
  } = options;

  function updateCaptureButtons() {
    const disabled = !state?.selectedSession || state?.domPicker?.status === 'active';
    [ui?.sidebarCaptureButton, ui?.domActionPickSidebar].forEach((btn) => {
      if (btn) btn.disabled = disabled;
    });
  }

  function renderPanel() {
    if (!ui?.domActionsPanel) return;
    const domNode = getSelectedDomNode?.() || null;
    const hasDom = Boolean(domNode && state?.selectedSession);
    ui.domActionsPanel.dataset.state = hasDom ? 'ready' : 'empty';
    updateCaptureButtons();
    if (ui.domHighlightHoldToggle) {
      ui.domHighlightHoldToggle.checked = Boolean(state?.highlightOptions?.sticky);
      ui.domHighlightHoldToggle.disabled = !state?.selectedSession;
    }
    if (ui.domActionClearHighlight) {
      const stickyActive = Boolean(state?.highlightFeedback?.persistent);
      ui.domActionClearHighlight.disabled =
        !state?.selectedSession || (!stickyActive && state?.highlightFeedback?.status !== 'pending');
    }
    if (!hasDom) {
      disableControls(true);
      if (ui.domActionTarget) ui.domActionTarget.textContent = '未选择 DOM 节点';
      if (ui.domActionStatus) ui.domActionStatus.textContent = '';
      if (ui.domActionFootnote) ui.domActionFootnote.textContent = '';
      if (ui.domActionContainerSelect) {
        ui.domActionContainerSelect.innerHTML = '';
        ui.domActionContainerSelect.disabled = true;
      }
      return;
    }
    if (ui.domActionTarget) {
      ui.domActionTarget.textContent = formatDomNodeLabel?.(domNode) || domNode.path || 'DOM 节点';
    }
    renderHighlightStatus(domNode);
    const parentId = findNearestContainerIdForDom?.(domNode.path);
    state.domActions.parentContainerId = parentId;
    if (ui.domActionFootnote) {
      if (parentId) {
        const parentNode = findContainerNode?.(state.containerSnapshot?.container_tree, parentId);
        const parentAlias = getContainerAlias?.(parentNode) || parentId;
        const childInfo = domNode.childCount ? ` · 子节点 ${domNode.childCount}` : '';
        ui.domActionFootnote.textContent = `最近容器：${parentAlias}${childInfo}`;
      } else {
        ui.domActionFootnote.textContent = domNode.childCount ? `子节点 ${domNode.childCount}` : '未找到可用父容器';
      }
    }
    const options = buildDomActionOptions(domNode, parentId);
    populateDomActionSelect(options);
    const disableDomControls = state.domActions.busy || !options.length;
    disableControls(disableDomControls);
    if (ui.domActionContainerSelect) {
      ui.domActionContainerSelect.disabled = disableDomControls;
    }
    if (ui.domActionHighlight) {
      ui.domActionHighlight.disabled = state.domActions.busy || !hasDom;
    }
    if (ui.domActionPick) {
      ui.domActionPick.disabled = state.domPicker?.status === 'active' || !hasDom || !state.selectedSession;
    }
    syncAliasInput();
    updateSuggestedFields(domNode, parentId);
  }

  function renderHighlightStatus(domNode) {
    if (!ui?.domActionStatus) return;
    if (state?.domPicker?.status === 'active') {
      ui.domActionStatus.textContent = state.domPicker.message || '正在拾取页面元素…';
      return;
    }
    const meta = state?.highlightFeedback || {};
    if (!domNode || !state?.selectedSession) {
      ui.domActionStatus.textContent = '';
      return;
    }
    let text = '';
    switch (meta.status) {
      case 'pending':
        text = `正在高亮 ${meta.selector || ''}`.trim();
        break;
      case 'success':
        text = meta.message || `已高亮 ${meta.selector || ''}`.trim();
        break;
      case 'error':
        text = meta.message || '高亮失败';
        break;
      default:
        text = '';
        break;
    }
    ui.domActionStatus.textContent = text;
  }

  function buildDomActionOptions(domNode, parentId) {
    const options = [];
    const seen = new Set();
    const push = (id, reason) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const node = findContainerNode?.(state.containerSnapshot?.container_tree, id);
      const label = getContainerAlias?.(node) || node?.name || id;
      options.push({ id, label, reason });
    };
    if (state.selectedContainerId) push(state.selectedContainerId, '当前');
    (domNode?.containers || []).forEach((entry) => {
      const id = entry?.container_id || entry?.container_name || entry?.containerId;
      push(id, '匹配');
    });
    if (parentId) push(parentId, '父容器');
    const rootId = getRootContainerId?.();
    if (rootId) push(rootId, '根节点');
    return options;
  }

  function populateDomActionSelect(options) {
    if (!ui?.domActionContainerSelect) return;
    const select = ui.domActionContainerSelect;
    select.innerHTML = '';
    let current = state.domActions.selectedContainerId;
    if (current && !options.some((opt) => opt.id === current)) {
      current = null;
    }
    if (!current && options.length) {
      current = options[0].id;
    }
    state.domActions.selectedContainerId = current || null;
    if (!options.length) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '无可用容器';
      select.appendChild(placeholder);
      select.value = '';
      return;
    }
    options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.id;
      option.textContent = opt.reason ? `${opt.label} · ${opt.reason}` : opt.label;
      select.appendChild(option);
    });
    if (current) {
      select.value = current;
    }
  }

  function getActionContainerId() {
    return state.domActions.selectedContainerId || state.selectedContainerId || getRootContainerId?.() || null;
  }

  function handleContainerChange() {
    state.domActions.selectedContainerId = ui?.domActionContainerSelect?.value || null;
    state.domActions.aliasDirty = false;
    state.domActions.aliasContainerId = null;
    syncAliasInput();
  }

  function handleAliasInputChange() {
    if (!ui?.domAliasInput) return;
    state.domActions.aliasDraft = ui.domAliasInput.value;
    state.domActions.aliasDirty = true;
  }

  function syncAliasInput() {
    if (!ui?.domAliasInput) return;
    const containerId = getActionContainerId();
    if (!containerId) {
      ui.domAliasInput.value = '';
      ui.domAliasInput.disabled = true;
      return;
    }
    if (state.domActions.aliasDirty && state.domActions.aliasContainerId === containerId) {
      return;
    }
    const containerNode = findContainerNode?.(state.containerSnapshot?.container_tree, containerId);
    const alias = getContainerAlias?.(containerNode) || '';
    ui.domAliasInput.value = alias;
    ui.domAliasInput.disabled = false;
    state.domActions.aliasDraft = alias;
    state.domActions.aliasDirty = false;
    state.domActions.aliasContainerId = containerId;
  }

  function updateSuggestedFields(domNode, parentId) {
    if (!domNode) return;
    if (state.domActions.lastSuggestionDomPath === domNode.path) {
      return;
    }
    const suggestion = buildChildContainerId?.(parentId, domNode);
    if (ui?.domNewContainerId) {
      ui.domNewContainerId.value = suggestion;
      ui.domNewContainerId.disabled = false;
    }
    if (ui?.domNewContainerAlias) {
      ui.domNewContainerAlias.value = deriveDomAlias?.(domNode);
      ui.domNewContainerAlias.disabled = false;
    }
    state.domActions.lastSuggestionDomPath = domNode.path;
  }

  function disableControls(disabled) {
    [ui?.domActionReplace, ui?.domActionCreate, ui?.domActionSaveAlias, ui?.domAliasInput, ui?.domNewContainerId, ui?.domNewContainerAlias].forEach((el) => {
      if (el) el.disabled = disabled;
    });
    if (ui?.domActionHighlight) ui.domActionHighlight.disabled = disabled;
    if (ui?.domActionPick) ui.domActionPick.disabled = disabled;
  }

  function setBusy(flag) {
    state.domActions.busy = flag;
    if (ui?.domActionsPanel) {
      ui.domActionsPanel.dataset.busy = flag ? 'true' : 'false';
    }
    renderPanel();
  }

  function setHighlightFeedback(updates = {}) {
    const previous = state.highlightFeedback || {};
    state.highlightFeedback = {
      ...previous,
      ...updates,
      persistent: updates.persistent ?? previous.persistent ?? false,
      timestamp: updates.timestamp || Date.now(),
    };
    renderPanel();
  }

  function handleHighlightResult(payload = {}) {
    const success = payload?.success !== false;
    const selector = payload?.selector || state.highlightFeedback?.selector;
    const count = payload?.details?.count;
    const message =
      payload?.message ||
      (success
        ? `已高亮 ${selector || ''}${count ? ` · ${count} 个节点` : ''}`.trim()
        : payload?.error || '高亮失败');
    setHighlightFeedback({
      selector,
      status: success ? 'success' : 'error',
      message,
      persistent: success ? undefined : false,
    });
    const channel = payload?.channel || state.highlightFeedback?.channel || 'dom-selection';
    const normalizedCount = typeof count === 'number' ? count : payload?.count || 0;
    uiStateService?.updateHighlight(
      {
        status: success ? 'success' : 'error',
        selector: selector || null,
        channel,
        count: normalizedCount || 0,
        lastUpdated: Date.now(),
      },
      'highlight-result',
    );
    if (!success) {
      showMessage?.(message || '高亮失败', 'error');
    }
  }

  async function clearHighlight(options = {}) {
    const silent = Boolean(options.silent);
    const channel = options.channel || null;
    if (!state?.selectedSession) {
      if (!silent) {
        showMessage?.('当前没有活跃会话', 'warn');
      }
      return;
    }
    try {
      if (!silent) {
        setHighlightFeedback({ status: 'pending', message: '正在清除高亮…', persistent: false, selector: null });
      }
      await invokeAction?.('browser:clear-highlight', { profile: state.selectedSession, ...(channel ? { channel } : {}) });
      onHighlightCleared?.();
      if (silent) {
        setHighlightFeedback({ status: 'idle', message: '', selector: null, persistent: false });
      } else {
        setHighlightFeedback({ status: 'success', message: '高亮已清除', selector: null, persistent: false });
      }
      uiStateService?.updateHighlight(
        {
          status: 'cleared',
          selector: null,
          channel: channel || null,
          count: 0,
          lastUpdated: Date.now(),
        },
        'highlight-clear',
      );
    } catch (err) {
      if (silent) {
        throw err;
      }
      setHighlightFeedback({ status: 'error', message: err?.message || '清除高亮失败', persistent: false });
      showMessage?.(err?.message || '清除高亮失败', 'error');
    }
  }

  function handleHighlightToggle() {
    if (!ui?.domHighlightHoldToggle) return;
    state.highlightOptions.sticky = Boolean(ui.domHighlightHoldToggle.checked);
  }

  function highlightSelectedDom() {
    const domNode = getSelectedDomNode?.();
    if (!domNode) {
      showMessage?.('请选择 DOM 节点', 'warn');
      return;
    }
    if (!state?.selectedSession) {
      showMessage?.('当前没有活跃会话，无法高亮', 'warn');
      return;
    }
    const selector = getDomNodeSelector?.(domNode);
    if (!selector) {
      showMessage?.('当前节点缺少可用 selector', 'error');
      return;
    }
    triggerHighlight?.(selector, {
      channel: 'dom-selection',
      sticky: true,
      duration: 0,
      clearBefore: true,
      remember: true,
    });
  }

  async function handleReplace() {
    const domNode = getSelectedDomNode?.();
    if (!domNode) {
      showMessage?.('请选择 DOM 节点', 'warn');
      return;
    }
    const containerId = getActionContainerId();
    if (!containerId) {
      showMessage?.('请选择目标容器', 'warn');
      return;
    }
    setBusy(true);
    try {
      await remapContainerToDom?.(containerId, domNode.path, domNode);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!state?.selectedSession) {
      showMessage?.('请选择会话后再创建容器', 'warn');
      return;
    }
    const domNode = getSelectedDomNode?.();
    if (!domNode) {
      showMessage?.('请选择 DOM 节点', 'warn');
      return;
    }
    const parentId = state.domActions.parentContainerId || findNearestContainerIdForDom?.(domNode.path);
    if (!parentId) {
      showMessage?.('未找到父容器，无法创建子容器', 'error');
      return;
    }
    const newId = (ui?.domNewContainerId?.value || '').trim();
    if (!newId) {
      showMessage?.('请输入新容器 ID', 'warn');
      return;
    }
    const alias = (ui?.domNewContainerAlias?.value || '').trim();
    const selectors = buildDomNodeSelectors?.(domNode) || [];
    if (!selectors.length) {
      showMessage?.('当前节点缺少可用 selector', 'error');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        profile: state.selectedSession,
        url: resolveCurrentPageUrl?.(),
        parentId,
        containerId: newId,
        selectors,
        alias,
        domPath: domNode.path,
        domMeta: {
          tag: domNode.tag,
          id: domNode.id,
          classes: domNode.classes || [],
        },
        definition: {
          name: alias || newId,
          selectors,
          metadata: {
            alias: alias || undefined,
            source_dom_path: domNode.path,
            source_dom_meta: {
              tag: domNode.tag,
              id: domNode.id,
              classes: domNode.classes || [],
            },
          },
        },
      };
      const res = await invokeAction?.('containers:create-child', payload);
      applyContainerSnapshotData?.(res, { toastMessage: '子容器已创建' });
      state.domActions.lastSuggestionDomPath = null;
      renderContainers?.();
    } catch (err) {
      showMessage?.(err?.message || '创建子容器失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAlias() {
    if (!state?.selectedSession) {
      showMessage?.('请选择会话后再更新别名', 'warn');
      return;
    }
    const containerId = getActionContainerId();
    if (!containerId) {
      showMessage?.('请选择容器', 'warn');
      return;
    }
    const alias = ui?.domAliasInput?.value || '';
    setBusy(true);
    try {
      const res = await invokeAction?.('containers:update-alias', {
        profile: state.selectedSession,
        url: resolveCurrentPageUrl?.(),
        containerId,
        alias,
      });
      applyContainerSnapshotData?.(res, { toastMessage: '容器别名已更新' });
      state.domActions.aliasDirty = false;
      state.domActions.aliasContainerId = containerId;
      renderContainers?.();
    } catch (err) {
      showMessage?.(err?.message || '更新别名失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  return {
    renderPanel,
    updateCaptureButtons,
    handleContainerChange,
    handleAliasInputChange,
    handleHighlightToggle,
    highlightSelectedDom,
    clearHighlight,
    handleReplace,
    handleCreate,
    handleSaveAlias,
    handleHighlightResult,
    setHighlightFeedback,
  };
}
