import { safeJsonParse } from '../../utils/json.js';

export function createContainerOpsManager(deps = {}) {
  const {
    state,
    ui,
    findContainerNode,
    getContainerAlias,
    getContainerOperationsFromNode,
    showMessage,
    invokeAction,
    resolveCurrentPageUrl,
    applyContainerSnapshotData,
  } = deps;

  function syncEditor(containerId, options = {}) {
    if (!ui?.containerOpsPanel) return;
    if (!containerId || !state?.containerSnapshot?.container_tree) {
      resetEditorState();
      renderPanel();
      return;
    }
    if (!options.force && state.containerOpsEditor.containerId === containerId && state.containerOpsEditor.dirty) {
      renderPanel();
      return;
    }
    const node = findContainerNode?.(state.containerSnapshot.container_tree, containerId);
    const operations = getContainerOperationsFromNode?.(node) || [];
    const serialized = JSON.stringify(operations, null, 2);
    Object.assign(state.containerOpsEditor, {
      containerId,
      text: serialized,
      dirty: false,
      error: '',
      lastSerialized: serialized,
      saving: false,
    });
    if (ui.containerOpsEditor) {
      ui.containerOpsEditor.value = serialized;
    }
    renderPanel();
  }

  function resetEditorState() {
    state.containerOpsEditor = {
      containerId: null,
      text: '[]',
      dirty: false,
      error: '',
      lastSerialized: '[]',
      saving: false,
    };
  }

  function renderPanel() {
    const panel = ui?.containerOpsPanel;
    if (!panel) return;
    const containerId = state.selectedContainerId;
    const editor = state.containerOpsEditor;
    const containerNode = containerId ? findContainerNode?.(state.containerSnapshot?.container_tree, containerId) : null;
    if (!containerId || !containerNode) {
      panel.dataset.state = 'disabled';
      panel.dataset.busy = 'false';
      ui.containerOpsTarget && (ui.containerOpsTarget.textContent = '未选择容器');
      ui.containerOpsStatus && (ui.containerOpsStatus.textContent = '');
      ui.containerOpsList && (ui.containerOpsList.innerHTML = '');
      ui.containerOpsEditor && (ui.containerOpsEditor.value = '[]');
      return;
    }
    panel.dataset.state = 'ready';
    panel.dataset.busy = editor.saving ? 'true' : 'false';
    const alias = getContainerAlias?.(containerNode) || containerId;
    if (ui.containerOpsTarget) {
      ui.containerOpsTarget.textContent = `${alias} · ${containerId}`;
    }
    const parsedDraft = safeJsonParse(editor.text);
    const operations = parsedDraft || getContainerOperationsFromNode?.(containerNode) || [];
    if (ui.containerOpsList) {
      ui.containerOpsList.innerHTML = '';
      if (!operations.length) {
        const empty = document.createElement('div');
        empty.className = 'placeholder';
        empty.textContent = '暂无操作配置';
        ui.containerOpsList.appendChild(empty);
      } else {
        operations.forEach((op, index) => {
          const card = document.createElement('div');
          card.className = 'ops-card';
          const type = document.createElement('div');
          type.className = 'ops-card-type';
          type.textContent = `${index + 1}. ${op?.type || 'unknown'}`;
          const config = document.createElement('pre');
          config.className = 'ops-card-config';
          config.textContent = JSON.stringify(op?.config || {}, null, 2);
          card.appendChild(type);
          card.appendChild(config);
          ui.containerOpsList.appendChild(card);
        });
      }
    }
    if (ui.containerOpsEditor && (!editor.dirty || editor.containerId !== containerId)) {
      ui.containerOpsEditor.value = editor.text;
    }
    const count = Array.isArray(operations) ? operations.length : 0;
    let statusText = `${count} 个操作`;
    if (editor.error) {
      statusText += ` · ${editor.error}`;
    } else if (editor.dirty) {
      statusText += parsedDraft ? ' · 未保存' : ' · JSON 未解析';
    } else {
      statusText += ' · 已同步';
    }
    ui.containerOpsStatus && (ui.containerOpsStatus.textContent = statusText);
  }

  function handleEditorInput() {
    if (!ui?.containerOpsEditor) return;
    state.containerOpsEditor.text = ui.containerOpsEditor.value;
    state.containerOpsEditor.dirty = true;
    state.containerOpsEditor.error = '';
    state.containerOpsEditor.containerId = state.selectedContainerId;
    renderPanel();
  }

  function addTemplate(kind) {
    if (!state.selectedContainerId || !ui?.containerOpsEditor) return;
    const current = safeJsonParse(ui.containerOpsEditor.value) || [];
    current.push(buildTemplate(kind));
    const nextText = JSON.stringify(current, null, 2);
    ui.containerOpsEditor.value = nextText;
    Object.assign(state.containerOpsEditor, {
      text: nextText,
      dirty: true,
      error: '',
      containerId: state.selectedContainerId,
    });
    renderPanel();
  }

  function buildTemplate(kind) {
    if (kind === 'highlight') {
      return {
        type: 'highlight',
        config: {
          style: deps.defaultHighlightStyle || '3px solid #34a853',
          duration: Number(deps.defaultHighlightDuration || 2200),
        },
      };
    }
    if (kind === 'extract-links') {
      return {
        type: 'extract',
        config: {
          target: 'links',
          selector: 'a[href]',
          include_text: true,
          max_items: 20,
          whitelist: {
            prefix: ['https://', 'http://'],
          },
          blacklist: {
            contains: ['javascript:', 'passport.weibo.com'],
          },
        },
      };
    }
    return { type: 'custom', config: {} };
  }

  function resetTemplate() {
    if (!state.selectedContainerId) return;
    syncEditor(state.selectedContainerId, { force: true });
  }

  async function saveOperations() {
    if (!state.selectedContainerId) {
      showMessage?.('请选择容器后再保存操作', 'warn');
      return;
    }
    if (!state.selectedSession) {
      showMessage?.('当前没有会话，无法保存操作', 'warn');
      return;
    }
    const text = ui?.containerOpsEditor?.value || state.containerOpsEditor.text || '[]';
    let operations;
    try {
      operations = JSON.parse(text);
    } catch (err) {
      state.containerOpsEditor.error = 'JSON 解析失败';
      renderPanel();
      showMessage?.('操作配置 JSON 无效', 'error');
      return;
    }
    if (!Array.isArray(operations)) {
      state.containerOpsEditor.error = '操作配置必须是数组';
      renderPanel();
      showMessage?.('操作配置必须是数组', 'error');
      return;
    }
    state.containerOpsEditor.saving = true;
    renderPanel();
    try {
      const res = await invokeAction?.('containers:update-operations', {
        profile: state.selectedSession,
        url: resolveCurrentPageUrl?.(),
        containerId: state.selectedContainerId,
        operations,
      });
      applyContainerSnapshotData?.(res, { toastMessage: '容器操作已保存' });
      state.containerOpsEditor.dirty = false;
      state.containerOpsEditor.error = '';
      state.containerOpsEditor.lastSerialized = JSON.stringify(operations, null, 2);
      if (ui?.containerOpsEditor) {
        ui.containerOpsEditor.value = state.containerOpsEditor.lastSerialized;
      }
    } catch (err) {
      state.containerOpsEditor.error = err?.message || '保存失败';
      showMessage?.(err?.message || '保存容器操作失败', 'error');
    } finally {
      state.containerOpsEditor.saving = false;
      renderPanel();
    }
  }

  return {
    syncEditor,
    renderPanel,
    handleEditorInput,
    addTemplate,
    resetTemplate,
    saveOperations,
  };
}
