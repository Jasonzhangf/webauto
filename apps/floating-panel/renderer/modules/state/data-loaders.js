export function createDataLoaders(deps = {}) {
  const {
    state,
    ui,
    invokeAction,
    showMessage,
    debugLog,
    setLoading,
    setSelectedSession,
    loadContainerSnapshot,
    ensureAutoRefreshTimer,
    uiStateService,
  } = deps;
  const renderHooks = {
    renderBrowserPanel: null,
    renderSessions: null,
    renderLogs: null,
  };

  const publishSessionState = (reason = 'sessions') => {
    if (!uiStateService || !state) return;
    uiStateService.updateSessions(
      {
        selected: state.selectedSession || null,
        list: summarizeSessions(state.sessions || []),
        lastUpdated: Date.now(),
      },
      reason,
    );
  };

  async function loadBrowserStatus() {
    if (!setLoading) return;
    setLoading('browser', true);
    try {
      const res = await invokeAction?.('browser:status');
      debugLog?.('loadBrowserStatus result', res);
      if (state) {
        state.browserStatus = res;
      }
      uiStateService?.updateWindow(
        {
          serviceHealthy: Boolean(res?.healthy ?? (state?.sessions?.length || 0) > 0),
          lastServiceCheckAt: Date.now(),
        },
        'browser-status',
      );
    } catch (err) {
      if (state) {
        state.browserStatus = { healthy: false, error: err?.message || String(err) };
      }
      showMessage?.(err?.message || '获取浏览器状态失败', 'error');
      uiStateService?.updateWindow(
        {
          serviceHealthy: false,
          lastServiceCheckAt: Date.now(),
        },
        'browser-status-error',
      );
    } finally {
      setLoading('browser', false);
      renderHooks.renderBrowserPanel?.();
    }
  }

  async function loadSessions(options = {}) {
    const { silent = false, skipSnapshot = false } = options;
    if (!setLoading || !state) return;
    if (silent && state.loading?.sessions) {
      return;
    }
    if (!silent) {
      setLoading('sessions', true);
    }
    try {
      const res = await invokeAction?.('session:list');
      const data = res?.sessions || res?.data?.sessions || res?.data || [];
      debugLog?.('loadSessions result', data);
      state.sessions = Array.isArray(data) ? data : [];
      const hasSelected =
        state.selectedSession && state.sessions.some((s) => s.profileId === state.selectedSession);
      if (!hasSelected) {
        if (state.sessions.length === 1) {
          setSelectedSession?.(state.sessions[0].profileId);
        } else {
          setSelectedSession?.(null);
        }
      } else {
        ensureAutoRefreshTimer?.();
      }
    } catch (err) {
      debugLog?.('loadSessions error', err?.message || err);
      if (!silent) {
        state.sessions = [];
        showMessage?.(err?.message || '会话列表获取失败', 'error');
      }
  } finally {
    if (!silent) {
      setLoading('sessions', false);
    }
    renderHooks.renderSessions?.();
    renderHooks.renderBrowserPanel?.();
    publishSessionState('sessions-load');
    const shouldLoadSnapshot = !skipSnapshot && !silent && state.selectedSession;
    debugLog?.('loadSessions snapshot check', {
      skipSnapshot,
      silent,
      selected: state.selectedSession,
      shouldLoadSnapshot: Boolean(shouldLoadSnapshot),
    });
    if (shouldLoadSnapshot) {
      loadContainerSnapshot?.(true);
    }
    ensureAutoRefreshTimer?.();
  }
}

  async function loadLogs() {
    setLoading?.('logs', true);
    try {
      const res = await invokeAction?.('logs:stream', {
        source: ui?.logSourceSelect?.value || 'browser',
        lines: 120,
      });
      const data = res?.lines || res?.data?.lines || [];
      if (state) {
        state.logs = Array.isArray(data) ? data : [];
      }
    } catch (err) {
      if (state) {
        state.logs = [];
      }
      showMessage?.(err?.message || '日志读取失败', 'error');
    } finally {
      setLoading?.('logs', false);
      renderHooks.renderLogs?.();
    }
  }

  function attachRenderers(hooks = {}) {
    if (hooks.renderBrowserPanel) renderHooks.renderBrowserPanel = hooks.renderBrowserPanel;
    if (hooks.renderSessions) renderHooks.renderSessions = hooks.renderSessions;
    if (hooks.renderLogs) renderHooks.renderLogs = hooks.renderLogs;
  }

  return {
    loadBrowserStatus,
    loadSessions,
    loadLogs,
    attachRenderers,
  };
}

function summarizeSessions(list = []) {
  return list.map((session) => ({
    id: session.profileId || session.session_id || 'unknown',
    url: session.current_url || session.currentUrl || null,
    mode: session.mode || session.modeName || null,
    headless: Boolean(session.headless),
  }));
}
