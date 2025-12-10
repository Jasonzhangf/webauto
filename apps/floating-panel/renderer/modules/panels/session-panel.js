export function createSessionPanel(options = {}) {
  const {
    state,
    ui,
    showMessage,
    invokeAction,
    loadContainerSnapshot,
    ensureAutoRefreshTimer,
    renderContainers,
    queueFitWindow = () => {},
    refreshSessions = null,
  } = options;

  function renderBrowserPanel() {
    if (!ui?.browserStatusText || !ui?.browserDetails) return;
    const status = state.browserStatus || {};
    const sessionCount = state.sessions?.length || 0;
    const healthy = typeof status.healthy === 'boolean' ? status.healthy : sessionCount > 0;
    const label = healthy ? '服务就绪' : '服务未就绪';
    if (ui.metaText) {
      ui.metaText.textContent = healthy ? '就绪' : '未就绪';
      ui.metaText.dataset.state = healthy ? 'ok' : 'warn';
    }
    ui.browserStatusText.textContent = label;
    ui.browserStatusText.dataset.state = healthy ? 'ok' : 'warn';
    if (healthy) {
      ui.browserDetails.textContent = `活动会话 ${sessionCount} 个`;
    } else if (sessionCount > 0) {
      ui.browserDetails.textContent = `检测到 ${sessionCount} 个会话，等待服务心跳`;
    } else {
      ui.browserDetails.textContent = status.error || '请先启动浏览器服务（端口 7704/8765）';
    }
    queueFitWindow();
  }

  function renderSessions() {
    if (!ui?.sessionList) return;
    const sessions = state.sessions || [];
    ui.sessionList.innerHTML = '';
    if (!sessions.length) {
      const empty = document.createElement('div');
      empty.className = 'placeholder';
      empty.innerHTML = '<strong>暂无会话</strong><p>使用上方表单创建新的浏览器会话。</p>';
      ui.sessionList.appendChild(empty);
      return;
    }
    sessions.forEach((session) => {
      const card = document.createElement('div');
      card.className = 'session-card';
      card.dataset.active = session.profileId === state.selectedSession ? 'true' : 'false';

      const title = document.createElement('div');
      title.className = 'session-title';
      title.textContent = session.profileId || 'unknown';

      const meta = document.createElement('div');
      meta.className = 'session-meta';
      meta.innerHTML = `<span>${session.mode || session.modeName || '未知模式'}</span><span>${
        session.current_url || session.currentUrl || '未导航'
      }</span>`;

      const actions = document.createElement('div');
      actions.className = 'session-actions';
      const selectBtn = document.createElement('button');
      selectBtn.className = 'ghost';
      selectBtn.textContent = state.selectedSession === session.profileId ? '已选' : '选择';
      selectBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        setSelectedSession(session.profileId);
        renderSessions();
        loadContainerSnapshot?.();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '停止';
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        handleDeleteSession(session.profileId);
      });

      actions.appendChild(selectBtn);
      actions.appendChild(deleteBtn);

      card.addEventListener('click', () => {
        setSelectedSession(session.profileId);
        renderSessions();
        loadContainerSnapshot?.();
      });

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(actions);
      ui.sessionList.appendChild(card);
    });
    updateSessionCaptureButtons();
    queueFitWindow();
  }

  function renderLogsPanel() {
    if (!ui?.logStream) return;
    const logs = state.logs || [];
    ui.logStream.innerHTML = '';
    if (!logs.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'log-row log-row-muted';
      placeholder.textContent = '暂无日志';
      ui.logStream.appendChild(placeholder);
    } else {
      logs.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'log-row';
        row.textContent = line;
        ui.logStream.appendChild(row);
      });
    }
    queueFitWindow();
  }

  function updateSessionCaptureButtons() {
    const disabled = !state?.selectedSession || state?.domPicker?.status === 'active';
    [ui?.sidebarCaptureButton, ui?.domActionPickSidebar].forEach((btn) => {
      if (btn) btn.disabled = disabled;
    });
  }

  function setSelectedSession(profileId) {
    if (state.selectedSession === profileId) {
      ensureAutoRefreshTimer?.();
      return;
    }
    state.selectedSession = profileId || null;
    if (state.snapshotMeta) {
      state.snapshotMeta = { url: null, capturedAt: 0 };
    }
    ensureAutoRefreshTimer?.(true);
  }

  async function handleCreateSession() {
    const profile = (ui?.profileInput?.value || '').trim() || `profile-${Date.now().toString(36)}`;
    const url = (ui?.launchUrlInput?.value || '').trim();
    const headless = Boolean(ui?.headlessToggle?.checked);
    try {
      await invokeAction?.('session:create', { profile, url, headless });
      showMessage?.(`已创建/唤醒 ${profile}`, 'success');
      ui?.sessionForm?.reset();
      await refreshSessions?.();
    } catch (err) {
      showMessage?.(err?.message || '创建会话失败', 'error');
    }
  }

  async function handleDeleteSession(profileId) {
    if (!profileId) return;
    try {
      await invokeAction?.('session:delete', { profile: profileId });
      showMessage?.(`会话 ${profileId} 已停止`, 'success');
      await refreshSessions?.();
    } catch (err) {
      showMessage?.(err?.message || '删除失败', 'error');
    }
  }

  async function handleCreateSessionSubmit(event) {
    event?.preventDefault?.();
    await handleCreateSession();
  }

  return {
    renderBrowserPanel,
    renderSessions,
    renderLogsPanel,
    handleCreateSessionSubmit,
    handleDeleteSession,
    setSelectedSession,
    updateSessionCaptureButtons,
  };
}
