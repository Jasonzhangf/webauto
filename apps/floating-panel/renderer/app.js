const STORAGE_KEY = 'webauto-floating-config';
const REFRESH_INTERVAL = 8000;
let autoConnectAttempted = false;

const dom = {
  connectionStatus: document.getElementById('connectionStatus'),
  connectButton: document.getElementById('connectButton'),
  hostInput: document.getElementById('hostInput'),
  portInput: document.getElementById('portInput'),
  protocolSelect: document.getElementById('protocolSelect'),
  capabilityInput: document.getElementById('capabilityInput'),
  createSessionForm: document.getElementById('createSessionForm'),
  sessionList: document.getElementById('sessionList'),
  refreshSessions: document.getElementById('refreshSessions'),
  matchForm: document.getElementById('matchForm'),
  urlInput: document.getElementById('urlInput'),
  matchResult: document.getElementById('matchResult'),
  logStream: document.getElementById('logStream'),
  clearLogs: document.getElementById('clearLogs'),
  sessionInfoRow: document.getElementById('sessionInfoRow'),
  selectedSessionMeta: document.getElementById('selectedSessionMeta'),
  pinButton: document.getElementById('pinButton'),
  minButton: document.getElementById('minButton'),
  closeButton: document.getElementById('closeButton'),
  collapseButton: document.getElementById('collapseButton'),
  floatingBall: document.getElementById('floatingBall'),
};

const state = {
  client: null,
  connected: false,
  sessions: [],
  selectedSessionId: null,
  logs: [],
  pinned: true,
  refreshTimer: null,
  config: {
    host: '127.0.0.1',
    port: '8765',
    protocol: 'ws',
  },
  collapsed: false,
};

class ControlPlaneClient {
  constructor(opts) {
    this.url = opts.url;
    this.onStatus = opts.onStatus;
    this.onLog = opts.onLog;
    this.socket = null;
    this.connected = false;
    this.queue = [];
    this.intentionalClose = false;
    this.lastSentAt = 0;
    this.minDelay = 450;
    this.timeoutMs = 20000;
  }

  async connect() {
    if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
      return;
    }
    this.intentionalClose = false;
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;

      const cleanup = () => {
        socket.removeEventListener('open', handleOpen);
        socket.removeEventListener('close', handleClose);
        socket.removeEventListener('error', handleError);
        socket.removeEventListener('message', handleMessage);
      };

      const handleOpen = () => {
        this.connected = true;
        this._emitStatus('connected');
        resolve();
      };

      const handleClose = (evt) => {
        this.connected = false;
        this._emitStatus('disconnected');
        cleanup();
        if (!this.intentionalClose && evt.code !== 1000) {
          this._emitLog('connection-lost', { code: evt.code, reason: evt.reason });
        }
      };

      const handleError = (err) => {
        cleanup();
        reject(err);
      };

      const handleMessage = (message) => {
        const payload = this._safeParse(message.data);
        const next = this.queue.shift();
        if (next) {
          clearTimeout(next.timeout);
          next.resolve(payload);
        } else {
          this._emitLog('orphan-response', payload);
        }
      };

      socket.addEventListener('open', handleOpen, { once: true });
      socket.addEventListener('close', handleClose);
      socket.addEventListener('error', handleError, { once: true });
      socket.addEventListener('message', handleMessage);
    });
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.socket) {
      this.socket.close(1000, 'manual-close');
    }
    this.connected = false;
    this.queue.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('connection closed'));
    });
    this.queue = [];
    this._emitStatus('disconnected');
  }

  async send(command, sessionId = '') {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    await this._throttle();
    const payload = {
      type: 'command',
      session_id: sessionId || command.parameters?.sessionId || '',
      data: command,
      timestamp: Date.now(),
    };
    this._emitLog('request', payload);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.queue = this.queue.filter((p) => p !== pending);
        reject(new Error('请求超时'));
      }, this.timeoutMs);

      const pending = {
        resolve: (response) => {
          this._emitLog('response', response);
          resolve(response);
        },
        reject: (error) => {
          this._emitLog('error', { error: error?.message || String(error) });
          reject(error);
        },
        timeout,
      };

      this.queue.push(pending);

      try {
        this.socket.send(JSON.stringify(payload));
      } catch (err) {
        clearTimeout(timeout);
        this.queue = this.queue.filter((p) => p !== pending);
        pending.reject(err);
      }
    });
  }

  _emitStatus(status) {
    this.onStatus?.(status);
  }

  _emitLog(type, payload) {
    this.onLog?.(type, payload);
  }

  _safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      this._emitLog('parse-error', raw);
      return raw;
    }
  }

  async _throttle() {
    const elapsed = Date.now() - this.lastSentAt;
    if (elapsed < this.minDelay) {
      await new Promise((resolve) => setTimeout(resolve, this.minDelay - elapsed));
    }
    this.lastSentAt = Date.now();
  }
}

function init() {
  loadConfig();
  bindEventListeners();
  updateConnectionStatus();
  updatePinButton();
  maybeAutoConnect();
  setupFloatingBallControl();
}

function loadConfig() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      state.config = {
        host: parsed.host || state.config.host,
        port: parsed.port || state.config.port,
        protocol: parsed.protocol || state.config.protocol,
      };
      state.pinned = parsed.pinned ?? state.pinned;
    }
  } catch (err) {
    console.warn('配置解析失败', err);
  }

  dom.hostInput.value = state.config.host;
  dom.portInput.value = state.config.port;
  dom.protocolSelect.value = state.config.protocol;
  dom.pinButton.dataset.state = state.pinned ? 'pinned' : 'unpinned';
}

function persistConfig() {
  const snapshot = {
    host: dom.hostInput.value.trim() || '127.0.0.1',
    port: dom.portInput.value.trim() || '8765',
    protocol: dom.protocolSelect.value || 'ws',
    pinned: state.pinned,
  };
  state.config = snapshot;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function bindEventListeners() {
  dom.connectButton.addEventListener('click', handleConnectToggle);
  dom.refreshSessions.addEventListener('click', (event) => {
    event.preventDefault();
    refreshSessions();
  });
  dom.createSessionForm.addEventListener('submit', handleCreateSession);
  dom.matchForm.addEventListener('submit', handleMatch);
  dom.clearLogs.addEventListener('click', () => {
    state.logs = [];
    renderLogs();
  });

  dom.hostInput.addEventListener('change', persistConfig);
  dom.portInput.addEventListener('change', persistConfig);
  dom.protocolSelect.addEventListener('change', persistConfig);

  dom.pinButton.addEventListener('click', async () => {
    state.pinned = !state.pinned;
    updatePinButton();
    persistConfig();
    await window.desktopAPI?.togglePin(state.pinned);
  });

  dom.minButton.addEventListener('click', () => window.desktopAPI?.minimize());
  dom.closeButton.addEventListener('click', () => window.desktopAPI?.close());
  dom.collapseButton.addEventListener('click', async () => {
    await setCollapsedState(true);
  });
}

async function handleConnectToggle() {
  if (state.connected) {
    disconnectClient();
    return;
  }

  persistConfig();

  try {
    dom.connectButton.disabled = true;
    await establishClient();
    await refreshSessions();
  } catch (err) {
    appendLog('error', err?.message || String(err));
  } finally {
    dom.connectButton.disabled = false;
  }
}

async function establishClient() {
  const url = `${state.config.protocol}://${state.config.host}:${state.config.port}`;
  state.client = new ControlPlaneClient({
    url,
    onStatus: handleConnectionStatusChange,
    onLog: appendLog,
  });
  await state.client.connect();
  state.connected = true;
  startAutoRefresh();
  updateConnectionStatus();
}

function disconnectClient() {
  stopAutoRefresh();
  if (state.client) {
    state.client.disconnect();
  }
  state.connected = false;
  updateConnectionStatus();
}

function handleConnectionStatusChange(status) {
  state.connected = status === 'connected';
  updateConnectionStatus();
  if (state.connected) {
    refreshSessions();
  } else {
    stopAutoRefresh();
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  state.refreshTimer = setInterval(() => {
    if (state.connected) {
      refreshSessions();
    }
  }, REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}

async function refreshSessions() {
  if (!state.client || !state.connected) {
    return;
  }
  dom.refreshSessions.disabled = true;
  try {
    const response = await state.client.send({
      command_type: 'session_control',
      action: 'list',
    });
    if (response?.data?.success) {
      state.sessions = response.data.sessions || [];
      if (state.sessions.length && !state.sessions.find((s) => s.session_id === state.selectedSessionId)) {
        state.selectedSessionId = state.sessions[0].session_id;
      }
    } else {
      appendLog('error', response?.data?.error || '会话列表获取失败');
    }
    renderSessions();
    renderSelectedSession();
  } catch (err) {
    appendLog('error', err?.message || String(err));
  } finally {
    dom.refreshSessions.disabled = false;
  }
}

async function handleCreateSession(event) {
  event.preventDefault();
  if (!state.client) return;
  const capabilities = dom.capabilityInput.value.trim() || 'dom';
  const capabilityList = capabilities
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  dom.capabilityInput.disabled = true;
  try {
    const response = await state.client.send({
      command_type: 'session_control',
      action: 'create',
      capabilities: capabilityList,
    });
    if (response?.data?.success) {
      state.selectedSessionId = response.data.session_id;
      await refreshSessions();
    } else {
      appendLog('error', response?.data?.error || '会话创建失败');
    }
  } catch (err) {
    appendLog('error', err?.message || String(err));
  } finally {
    dom.capabilityInput.disabled = false;
  }
}

async function handleMatch(event) {
  event.preventDefault();
  if (!state.client) return;
  if (!state.selectedSessionId) {
    dom.matchResult.textContent = '请先选择会话';
    return;
  }
  const url = dom.urlInput.value.trim();
  if (!url) {
    dom.matchResult.textContent = '请输入 URL';
    return;
  }

  dom.matchResult.textContent = '匹配中...';
  try {
    const response = await state.client.send(
      {
        command_type: 'container_operation',
        action: 'match_root',
        page_context: { url },
      },
      state.selectedSessionId,
    );
    dom.matchResult.textContent = renderMatchResult(response);
    await refreshSessions();
  } catch (err) {
    dom.matchResult.textContent = err?.message || '匹配失败';
  }
}

function renderMatchResult(response) {
  if (!response) return '无响应';
  if (!response.data?.success) {
    return response.data?.error || '未匹配到容器';
  }
  const payload = response.data.data || {};
  const container = payload.matched_container;
  const matchDetails = payload.match_details || {};
  const selector = matchDetails.matched_selector || matchDetails.selector || '未返回选择器';
  const lines = [
    `容器: ${container?.name || container?.id || 'N/A'}`,
    `ID: ${container?.id || '未知'}`,
    `匹配选择器: ${selector}`,
  ];
  if (matchDetails?.confidence) {
    lines.push(`得分: ${(matchDetails.confidence * 100).toFixed(1)}%`);
  }
  return lines.join('\n');
}

async function deleteSession(sessionId) {
  if (!state.client) return;
  try {
    const response = await state.client.send(
      {
        command_type: 'session_control',
        action: 'delete',
        parameters: { sessionId },
      },
      sessionId,
    );
    if (!response?.data?.success) {
      appendLog('error', response?.data?.error || '删除失败');
    }
    if (state.selectedSessionId === sessionId) {
      state.selectedSessionId = null;
    }
    await refreshSessions();
  } catch (err) {
    appendLog('error', err?.message || String(err));
  }
}

function renderSessions() {
  if (!state.sessions.length) {
    dom.sessionList.innerHTML = '<div class="info-row">当前无活跃会话</div>';
    return;
  }

  dom.sessionList.innerHTML = '';
  state.sessions.forEach((session) => {
    const wrapper = document.createElement('div');
    wrapper.className = `session-chip ${session.session_id === state.selectedSessionId ? 'active' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `
      <span class="id">${session.session_id}</span>
      <span class="mode">模式: ${session.mode || '未知'} · 状态: ${session.status || '未知'}</span>
      <span class="hint">URL: ${session.current_url || 'N/A'}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const selectBtn = document.createElement('button');
    selectBtn.className = 'ghost';
    selectBtn.textContent = '激活';
    selectBtn.addEventListener('click', () => {
      state.selectedSessionId = session.session_id;
      renderSessions();
      renderSelectedSession();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ghost';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', () => deleteSession(session.session_id));

    actions.appendChild(selectBtn);
    actions.appendChild(deleteBtn);

    wrapper.appendChild(meta);
    wrapper.appendChild(actions);

    dom.sessionList.appendChild(wrapper);
  });
}

function renderSelectedSession() {
  if (!state.selectedSessionId) {
    dom.sessionInfoRow.textContent = '未选择会话';
    dom.selectedSessionMeta.textContent = '';
    return;
  }
  const session = state.sessions.find((s) => s.session_id === state.selectedSessionId);
  if (!session) {
    dom.sessionInfoRow.textContent = '会话已失效或不存在';
    dom.selectedSessionMeta.textContent = '';
    return;
  }

  dom.sessionInfoRow.textContent = `当前会话: ${session.session_id}\n模式: ${session.mode} · URL: ${session.current_url || 'N/A'}`;
  dom.selectedSessionMeta.textContent = session.capabilities ? session.capabilities.join(', ') : '';
}

function updateConnectionStatus() {
  dom.connectionStatus.textContent = state.connected ? '已连接' : '未连接';
  dom.connectionStatus.style.background = state.connected ? 'rgba(34,211,238,0.18)' : 'rgba(248,113,113,0.15)';
  dom.connectionStatus.style.color = state.connected ? 'var(--accent)' : 'var(--danger)';
  dom.connectButton.textContent = state.connected ? '断开' : '连接';
  dom.matchForm.querySelector('button').disabled = !state.connected;
  dom.createSessionForm.querySelector('button').disabled = !state.connected;
  dom.capabilityInput.disabled = !state.connected;
}

function appendLog(type, payload) {
  const timestamp = new Date();
  state.logs.unshift({ type, payload, timestamp });
  state.logs = state.logs.slice(0, 60);
  renderLogs();
}

function renderLogs() {
  dom.logStream.innerHTML = '';
  if (!state.logs.length) {
    dom.logStream.innerHTML = '<div class="log-entry">暂无日志</div>';
    return;
  }

  state.logs.forEach((entry) => {
    const node = document.createElement('div');
    node.className = `log-entry ${entry.type.includes('error') ? 'error' : entry.type.includes('response') ? 'success' : ''}`;
    const title = document.createElement('div');
    title.className = 'timestamp';
    title.textContent = `${entry.timestamp.toLocaleTimeString()} · ${entry.type}`;
    const body = document.createElement('pre');
    body.textContent = typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload, null, 2);
    node.appendChild(title);
    node.appendChild(body);
    dom.logStream.appendChild(node);
  });
}

function updatePinButton() {
  dom.pinButton.classList.toggle('active', state.pinned);
  dom.pinButton.textContent = state.pinned ? '📌' : '📍';
}

async function maybeAutoConnect() {
  if (autoConnectAttempted || state.connected) return;
  autoConnectAttempted = true;

  let autoUrl = '';
  if (window.desktopAPI?.getMeta) {
    try {
      const meta = await window.desktopAPI.getMeta();
      autoUrl = meta?.autoConnectUrl || '';
    } catch (err) {
      appendLog('error', err?.message || String(err));
    }
  }

  if (autoUrl) {
    try {
      const parsed = new URL(autoUrl);
      dom.protocolSelect.value = parsed.protocol.replace(':', '') || 'ws';
      dom.hostInput.value = parsed.hostname || '127.0.0.1';
      dom.portInput.value = parsed.port || (parsed.protocol === 'wss:' ? '443' : '80');
      persistConfig();
      await connectUsingCurrentConfig();
      return;
    } catch (err) {
      appendLog('error', err?.message || String(err));
    }
  }

  await connectUsingCurrentConfig();
}

async function connectUsingCurrentConfig() {
  persistConfig();
  dom.connectButton.disabled = true;
  try {
    await establishClient();
    await refreshSessions();
  } catch (err) {
    appendLog('error', err?.message || String(err));
  } finally {
    dom.connectButton.disabled = false;
  }
}

async function setCollapsedState(collapsed) {
  if (state.collapsed === collapsed) return;
  state.collapsed = collapsed;
  document.body.classList.toggle('is-collapsed', collapsed);
  try {
    await window.desktopAPI?.setCollapsed(collapsed);
  } catch (err) {
    appendLog('error', err?.message || String(err));
  }
}

function setupFloatingBallControl() {
  if (!dom.floatingBall) return;
  let dragging = false;
  let pointerId = null;
  let offset = { x: 0, y: 0 };
  let moved = false;
  let start = { x: 0, y: 0 };
  const DRAG_THRESHOLD = 6;

  dom.floatingBall.addEventListener('pointerdown', async (event) => {
    if (!state.collapsed) return;
    dragging = true;
    moved = false;
    pointerId = event.pointerId;
    dom.floatingBall.setPointerCapture(pointerId);
    dom.floatingBall.classList.add('dragging');
    start = { x: event.screenX, y: event.screenY };
    const bounds = await window.desktopAPI?.getBounds();
    offset = {
      x: event.screenX - (bounds?.x || 0),
      y: event.screenY - (bounds?.y || 0),
    };
  });

  dom.floatingBall.addEventListener('pointermove', async (event) => {
    if (!dragging) return;
    const dx = Math.abs(event.screenX - start.x);
    const dy = Math.abs(event.screenY - start.y);
    if (!moved && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
      moved = true;
    }
    if (!moved) return;
    const targetX = event.screenX - offset.x;
    const targetY = event.screenY - offset.y;
    await window.desktopAPI?.moveWindow(targetX, targetY);
  });

  const release = async (event) => {
    if (!dragging) return;
    if (pointerId !== null) {
      try {
        dom.floatingBall.releasePointerCapture(pointerId);
      } catch {}
    }
    dom.floatingBall.classList.remove('dragging');
    dragging = false;
    pointerId = null;
    if (moved) {
      await snapFloatingBall();
    } else {
      await setCollapsedState(false);
    }
  };

  dom.floatingBall.addEventListener('pointerup', release);
  dom.floatingBall.addEventListener('pointercancel', release);
  dom.floatingBall.addEventListener('dblclick', async (event) => {
    event.preventDefault();
    if (state.collapsed) {
      await setCollapsedState(false);
    }
  });
}

async function snapFloatingBall() {
  const bounds = await window.desktopAPI?.getBounds();
  const work = await window.desktopAPI?.getWorkArea();
  if (!bounds || !work) return;
  const padding = 16;
  const centerX = bounds.x + bounds.width / 2;
  const workCenter = work.x + work.width / 2;
  const targetX = centerX < workCenter
    ? work.x + padding
    : work.x + work.width - bounds.width - padding;
  const minY = work.y + padding;
  const maxY = work.y + work.height - bounds.height - padding;
  const targetY = Math.min(Math.max(bounds.y, minY), maxY);
  await window.desktopAPI?.moveWindow(targetX, targetY);
}

init();
