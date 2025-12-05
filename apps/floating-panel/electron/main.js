import { app, BrowserWindow, ipcMain, nativeTheme, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const windowStateKeeper = require('electron-window-state');
const Positioner = require('electron-positioner');

const repoRoot = path.resolve(__dirname, '../../..');
const USER_CONTAINER_ROOT = path.join(os.homedir(), '.webauto', 'container-lib');
const CONTAINER_INDEX_PATH = path.join(repoRoot, 'container-library.index.json');
let containerIndexCache = null;
const CLI_TARGETS = {
  'browser-control': path.join(repoRoot, 'modules/browser-control/src/cli.ts'),
  'session-manager': path.join(repoRoot, 'modules/session-manager/src/cli.ts'),
  logging: path.join(repoRoot, 'modules/logging/src/cli.ts'),
  operations: path.join(repoRoot, 'modules/operations/src/cli.ts'),
  'container-matcher': path.join(repoRoot, 'modules/container-matcher/src/cli.ts'),
};

const NORMAL_SIZE = { width: 960, height: 640 };
const COLLAPSED_SIZE = { width: 180, height: 80 };
const DEFAULT_WS_HOST = process.env.WEBAUTO_WS_HOST || '127.0.0.1';
const DEFAULT_WS_PORT = Number(process.env.WEBAUTO_WS_PORT || 8765);
const AUTO_STICK_ENABLED = process.env.WEBAUTO_AUTO_STICK === '0' ? false : true;

let mainWindow;
let positioner;
let isCollapsed = false;
let lastNormalBounds = null;
let inspectorWindow = null;
let inspectorReady = false;
let inspectorPendingPayload = null;
let inspectorContext = null;
let inspectorBusy = false;
let autoStickScheduled = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const createWindow = () => {
  const windowState = windowStateKeeper({
    defaultWidth: NORMAL_SIZE.width,
    defaultHeight: NORMAL_SIZE.height,
  });

  const desiredWidth = Math.max(windowState.width || NORMAL_SIZE.width, NORMAL_SIZE.width);
  const desiredHeight = Math.max(windowState.height || NORMAL_SIZE.height, NORMAL_SIZE.height);

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: desiredWidth,
    height: desiredHeight,
    minWidth: Math.max(520, Math.floor(NORMAL_SIZE.width * 0.4)),
    minHeight: 360,
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#050711d0',
    alwaysOnTop: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  positioner = new Positioner(mainWindow);
  if (windowState.x === undefined || windowState.y === undefined) {
    positioner.move('rightCenter');
  }

  windowState.manage(mainWindow);
  lastNormalBounds = mainWindow.getBounds();
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const rendererPath = path.resolve(__dirname, '../renderer/index.html');
  mainWindow.loadFile(rendererPath);
  mainWindow.webContents.on('did-finish-load', () => {
    broadcastCollapseState();
    scheduleAutoStick();
  });

  mainWindow.on('ready-to-show', () => {
    enforceWorkAreaBounds();
    snapToEdges();
    scheduleAutoStick();
  });

  let snapTimer;
  mainWindow.on('move', () => {
    clearTimeout(snapTimer);
    enforceWorkAreaBounds();
    snapTimer = setTimeout(() => {
      enforceWorkAreaBounds();
      snapToEdges();
    }, 140);
  });

  mainWindow.on('resize', () => {
    if (!isCollapsed && mainWindow && !mainWindow.isMaximized()) {
      lastNormalBounds = mainWindow.getBounds();
    }
  });

  mainWindow.on('maximize', () => {
    if (!mainWindow) return;
    mainWindow.unmaximize();
    restoreNormalBounds();
    snapToEdges();
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.setFullScreen(false);
    restoreNormalBounds();
    snapToEdges();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

function restoreNormalBounds() {
  if (!mainWindow) return;
  const target = lastNormalBounds || { ...NORMAL_SIZE, x: undefined, y: undefined };
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds(
    {
      x: bounds.x,
      y: bounds.y,
      width: target.width || NORMAL_SIZE.width,
      height: target.height || NORMAL_SIZE.height,
    },
    false,
  );
  mainWindow.setResizable(true);
  isCollapsed = false;
}

function snapToEdges() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  if (!display) return;
  const area = display.workArea;
  const threshold = 40;
  let { x, y } = bounds;
  if (Math.abs(bounds.x - area.x) < threshold) {
    x = area.x;
  } else if (Math.abs(bounds.x + bounds.width - (area.x + area.width)) < threshold) {
    x = area.x + area.width - bounds.width;
  }
  if (Math.abs(bounds.y - area.y) < threshold) {
    y = area.y;
  } else if (Math.abs(bounds.y + bounds.height - (area.y + area.height)) < threshold) {
    y = area.y + area.height - bounds.height;
  }
  if (x !== bounds.x || y !== bounds.y) {
    mainWindow.setBounds({ ...bounds, x: Math.round(x), y: Math.round(y) }, false);
  }
}

function scheduleAutoStick(delay = 800) {
  if (!AUTO_STICK_ENABLED || autoStickScheduled || process.platform !== 'darwin') {
    return;
  }
  autoStickScheduled = true;
  setTimeout(() => {
    alignWithFrontmostBrowser().catch((err) => {
      console.warn('[floating] auto stick failed:', err?.message || err);
    });
  }, delay);
}

async function alignWithFrontmostBrowser() {
  const display = screen.getPrimaryDisplay();
  const area = display?.workArea || screen.getPrimaryDisplay().workArea;
  const browserWidth = Math.round(area.width * 0.72);
  const spacer = 12;
  const floatWidth = Math.round(area.width * 0.28) - spacer;
  const floatHeight = Math.min(NORMAL_SIZE.height, area.height - spacer * 2);
  const floatX = area.x + browserWidth + spacer;
  const floatY = area.y + spacer;

  await resizeFrontmostWindow({
    x: area.x,
    y: area.y,
    width: browserWidth,
    height: area.height,
  });

  if (mainWindow) {
    mainWindow.setBounds(
      {
        x: floatX,
        y: floatY,
        width: floatWidth,
        height: floatHeight,
      },
      false,
    );
    lastNormalBounds = mainWindow.getBounds();
    snapToEdges();
    mainWindow.focus();
  }
}

function enforceWorkAreaBounds() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  if (!display) return;
  const area = display.workArea;
  const maxX = area.x + area.width - bounds.width;
  const maxY = area.y + area.height - bounds.height;
  const clampedX = Math.min(Math.max(bounds.x, area.x), maxX);
  const clampedY = Math.min(Math.max(bounds.y, area.y), maxY);
  if (clampedX !== bounds.x || clampedY !== bounds.y) {
    mainWindow.setBounds({ ...bounds, x: Math.round(clampedX), y: Math.round(clampedY) }, false);
  }
}

function broadcastCollapseState() {
  if (!mainWindow) return;
  mainWindow.webContents.send('window:collapse-state', { isCollapsed });
}

function toggleCollapse(nextState) {
  if (!mainWindow) return;
  const targetState = typeof nextState === 'boolean' ? nextState : !isCollapsed;
  isCollapsed = targetState;
  const bounds = mainWindow.getBounds();
  if (isCollapsed) {
    mainWindow.setBounds(
      {
        x: bounds.x,
        y: bounds.y,
        width: COLLAPSED_SIZE.width,
        height: COLLAPSED_SIZE.height,
      },
      false,
    );
    mainWindow.setResizable(false);
  } else {
    const width = lastNormalBounds?.width || NORMAL_SIZE.width;
    const height = lastNormalBounds?.height || NORMAL_SIZE.height;
    mainWindow.setBounds(
      {
        x: bounds.x,
        y: bounds.y,
        width,
        height,
      },
      false,
    );
    mainWindow.setResizable(true);
    lastNormalBounds = mainWindow.getBounds();
  }
  enforceWorkAreaBounds();
  snapToEdges();
  broadcastCollapseState();
}

function fitWindowHeight(contentHeight) {
  if (!mainWindow || isCollapsed) return;
  const numeric = Number(contentHeight);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
  const area = display?.workArea || screen.getPrimaryDisplay().workArea;
  const padding = 20;
  const minHeight = NORMAL_SIZE.height;
  const maxHeight = Math.max(minHeight, area.height - 30);
  const targetHeight = Math.max(Math.min(Math.round(numeric + padding), maxHeight), minHeight);
  if (Math.abs(targetHeight - bounds.height) < 4) return;
  let targetY = bounds.y;
  const bottomEdge = targetY + targetHeight;
  const maxBottom = area.y + area.height;
  if (bottomEdge > maxBottom) {
    targetY = Math.max(area.y, maxBottom - targetHeight);
  }
  mainWindow.setBounds(
    {
      x: bounds.x,
      y: targetY,
      width: bounds.width,
      height: targetHeight,
    },
    false,
  );
  lastNormalBounds = mainWindow.getBounds();
  snapToEdges();
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('window-control', (_event, rawAction) => {
  if (!mainWindow) return;
  const payload =
    typeof rawAction === 'string'
      ? { action: rawAction }
      : rawAction && typeof rawAction === 'object'
        ? rawAction
        : { action: undefined };
  const { action, value } = payload;
  switch (action) {
    case 'close':
      mainWindow.close();
      break;
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'toggle-collapse':
      toggleCollapse(typeof value === 'boolean' ? value : undefined);
      break;
    default:
      break;
  }
});

ipcMain.handle('inspector:open', async (_event, payload = {}) => {
  const profile = payload.profile;
  if (!profile) {
    throw new Error('缺少 profile');
  }
  const context = await captureInspectorSnapshot({
    profile,
    url: payload.url,
    maxDepth: payload.maxDepth,
    maxChildren: payload.maxChildren,
  });
  inspectorContext = { profile: context.profileId, url: context.targetUrl };
  await ensureInspectorWindow();
  pushInspectorSnapshot(context);
  if (inspectorWindow) {
    inspectorWindow.show();
    inspectorWindow.focus();
  }
  return { success: true };
});

ipcMain.on('inspector:ready', (event) => {
  if (!inspectorWindow || event.sender !== inspectorWindow.webContents) {
    return;
  }
  inspectorReady = true;
  if (inspectorPendingPayload) {
    inspectorWindow.webContents.send('inspector:data', inspectorPendingPayload);
  }
});

ipcMain.on('inspector:command', async (_event, command = {}) => {
  if (!command?.type) return;
  switch (command.type) {
    case 'refresh':
      if (inspectorBusy) {
        sendInspectorEvent({ type: 'toast', data: { message: '正在刷新，请稍候' } });
        return;
      }
      if (!inspectorContext?.profile && !command.profile) {
        sendInspectorEvent({ type: 'error', error: '缺少 profile，无法刷新' });
        return;
      }
      inspectorBusy = true;
      try {
        const context = await captureInspectorSnapshot({
          profile: command.profile || inspectorContext?.profile || inspectorPendingPayload?.profileId,
          url: command.url || inspectorContext?.url || inspectorPendingPayload?.targetUrl,
          maxDepth: command.maxDepth,
          maxChildren: command.maxChildren,
        });
        inspectorContext = { profile: context.profileId, url: context.targetUrl };
        pushInspectorSnapshot(context);
        sendInspectorEvent({ type: 'toast', data: { message: '容器视图已刷新' } });
      } catch (err) {
        sendInspectorEvent({ type: 'error', error: err?.message || '刷新失败' });
      } finally {
        inspectorBusy = false;
      }
      break;
    case 'update-selector':
    case 'create-child':
      sendInspectorEvent({ type: 'error', error: '容器编辑功能尚未开放' });
      break;
    default:
      sendInspectorEvent({ type: 'error', error: `Unsupported container action: ${command.type}` });
      break;
  }
});

ipcMain.on('window:fit-height', (_event, payload) => {
  const height = typeof payload === 'number' ? payload : payload?.height;
  fitWindowHeight(height);
});

ipcMain.handle('ui:action', async (_event, request) => {
  const action = request?.action;
  const payload = request?.payload || {};
  if (!action) {
    return { success: false, error: 'Missing action' };
  }
  try {
    switch (action) {
      case 'browser:status':
        return await runCliCommand('browser-control', ['status']);
      case 'session:list':
        return await runCliCommand('session-manager', ['list']);
      case 'session:create':
        return await handleSessionCreate(payload);
      case 'session:delete':
        return await handleSessionDelete(payload);
      case 'logs:stream':
        return await handleLogsStream(payload);
      case 'operations:list':
        return await runCliCommand('operations', ['list']);
      case 'operations:run':
        return await handleOperationRun(payload);
      case 'containers:inspect':
        return await handleContainerInspect(payload);
      case 'containers:remap':
        return await handleContainerRemap(payload);
      case 'window:stick-browser':
        return await handleStickBrowser(payload);
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

async function handleSessionCreate(payload = {}) {
  if (!payload.profile) {
    throw new Error('缺少 profile');
  }
  const args = ['create', '--profile', payload.profile];
  if (payload.url) args.push('--url', payload.url);
  if (payload.headless !== undefined) args.push('--headless', String(payload.headless));
  if (payload.keepOpen !== undefined) args.push('--keep-open', String(payload.keepOpen));
  return runCliCommand('session-manager', args);
}

async function handleSessionDelete(payload = {}) {
  if (!payload.profile) {
    throw new Error('缺少 profile');
  }
  return runCliCommand('session-manager', ['delete', '--profile', payload.profile]);
}

async function handleLogsStream(payload = {}) {
  const args = ['stream'];
  if (payload.source) args.push('--source', payload.source);
  if (payload.session) args.push('--session', payload.session);
  if (payload.lines) args.push('--lines', String(payload.lines));
  return runCliCommand('logging', args);
}

async function handleOperationRun(payload = {}) {
  const op = payload.op || payload.operation || payload.id;
  if (!op) throw new Error('缺少操作 ID');
  const args = ['run', '--op', op];
  if (payload.config) {
    args.push('--config', JSON.stringify(payload.config));
  }
  return runCliCommand('operations', args);
}

async function handleContainerInspect(payload = {}) {
  const profile = payload.profile;
  if (!profile) throw new Error('缺少 profile');
  const context = await captureInspectorSnapshot({
    profile,
    url: payload.url,
    maxDepth: payload.maxDepth,
    maxChildren: payload.maxChildren,
  });
  const snapshot = context.snapshot;
  return {
    success: true,
    data: {
      sessionId: context.sessionId,
      profileId: context.profileId,
      url: context.targetUrl,
      snapshot,
      containerSnapshot: snapshot,
      domTree: snapshot?.dom_tree || null,
    },
  };
}

async function handleContainerRemap(payload = {}) {
  const containerId = payload.containerId || payload.id;
  const selector = (payload.selector || '').trim();
  const definition = payload.definition || {};
  if (!containerId) {
    throw new Error('缺少容器 ID');
  }
  if (!selector) {
    throw new Error('缺少新的 selector');
  }
  const siteKey = payload.siteKey || resolveSiteKeyFromUrl(payload.url) || inferSiteFromContainerId(containerId);
  if (!siteKey) {
    throw new Error('无法确定容器所属站点');
  }
  const normalizedDefinition = { ...definition, id: containerId };
  const existingSelectors = Array.isArray(normalizedDefinition.selectors) ? normalizedDefinition.selectors : [];
  const filtered = existingSelectors.filter((item) => (item?.css || '').trim() && (item.css || '').trim() !== selector);
  normalizedDefinition.selectors = [{ css: selector, variant: 'primary', score: 1 }, ...filtered];
  await writeUserContainerDefinition(siteKey, containerId, normalizedDefinition);
  return handleContainerInspect({ profile: payload.profile, url: payload.url });
}

async function handleStickBrowser(payload = {}) {
  const display = screen.getDisplayMatching(mainWindow?.getBounds() || screen.getPrimaryDisplay().bounds);
  const area = display?.workArea || screen.getPrimaryDisplay().workArea;
  const browserWidth = Math.round(area.width * (payload.browserWidthRatio || 0.68));
  const floatOffset = 12;
  await resizeFrontmostWindow({
    x: area.x,
    y: area.y,
    width: browserWidth,
    height: area.height,
  });
  if (mainWindow) {
    mainWindow.setBounds(
      {
        x: area.x + browserWidth + floatOffset,
        y: area.y + Math.round(area.height * 0.05),
        width: NORMAL_SIZE.width,
        height: NORMAL_SIZE.height,
      },
      false,
    );
    toggleCollapse(false);
    mainWindow.focus();
  }
  return { success: true };
}

async function resizeFrontmostWindow(bounds) {
  if (process.platform !== 'darwin') {
    throw new Error('浏览器贴边目前仅支持 macOS');
  }
  const script = `
tell application "System Events"
  set frontProc to first process whose frontmost is true
  tell frontProc
    if (count of windows) > 0 then
      set position of window 1 to {${bounds.x}, ${bounds.y}}
      set size of window 1 to {${bounds.width}, ${bounds.height}}
    end if
  end tell
end tell`;
  execSync(`osascript -e ${JSON.stringify(script)}`);
}

function runCliCommand(target, args = []) {
  const script = CLI_TARGETS[target];
  if (!script) throw new Error(`Unknown CLI target: ${target}`);
  return new Promise((resolve, reject) => {
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(npxCmd, ['tsx', script, ...args], {
      cwd: repoRoot,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve(normalizeCliResult(parseCliJson(stdout)));
      } else {
        reject(new Error(stderr.trim() || `CLI(${target}) exited with code ${code}`));
      }
    });
  });
}

function parseCliJson(output = '') {
  const trimmed = output.trim();
  if (!trimmed) return {};
  const match = trimmed.match(/(\{[\s\S]*\})\s*$/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      // ignore
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: trimmed };
  }
}

function normalizeCliResult(result) {
  if (result && typeof result === 'object' && 'data' in result && result.success) {
    return result.data;
  }
  return result;
}

async function fetchSessions() {
  try {
    const res = await runCliCommand('session-manager', ['list']);
    const sessions = res?.sessions || res?.data?.sessions || res?.data || [];
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

function findSessionByProfile(sessions, profile) {
  if (!profile) return null;
  return (
    sessions.find(
      (session) =>
        session?.profileId === profile ||
        session?.profile_id === profile ||
        session?.session_id === profile ||
        session?.sessionId === profile,
    ) || null
  );
}

function formatInspectorPayload(context) {
  if (!context) return null;
  return {
    sessionId: context.sessionId,
    profileId: context.profileId,
    targetUrl: context.targetUrl,
    snapshot: context.snapshot,
  };
}

function getBrowserWsUrl() {
  if (process.env.WEBAUTO_WS_URL) {
    return process.env.WEBAUTO_WS_URL;
  }
  const host = process.env.WEBAUTO_WS_HOST || DEFAULT_WS_HOST;
  const port = Number(process.env.WEBAUTO_WS_PORT || DEFAULT_WS_PORT);
  return `ws://${host}:${port}`;
}

function sendWsCommand(wsUrl, payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.terminate();
      reject(new Error('WebSocket command timeout'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeAllListeners();
    };

    socket.once('open', () => {
      try {
        socket.send(JSON.stringify(payload));
      } catch (err) {
        cleanup();
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    });

    socket.once('message', (data) => {
      cleanup();
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(data.toString('utf-8')));
      } catch (err) {
        reject(err);
      } finally {
        socket.close();
      }
    });

    socket.once('error', (err) => {
      cleanup();
      if (settled) return;
      settled = true;
      reject(err);
    });

    socket.once('close', () => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(new Error('WebSocket closed before response'));
      }
    });
  });
}

async function fetchContainerSnapshotFromService({
  sessionId,
  url,
  maxDepth,
  maxChildren,
}) {
  if (!sessionId || !url) {
    throw new Error('缺少 sessionId 或 URL');
  }
  const wsUrl = getBrowserWsUrl();
  const payload = {
    type: 'command',
    session_id: sessionId,
    data: {
      command_type: 'container_operation',
      action: 'inspect_tree',
      page_context: { url },
      parameters: {
        ...(typeof maxDepth === 'number' ? { max_depth: maxDepth } : {}),
        ...(typeof maxChildren === 'number' ? { max_children: maxChildren } : {}),
      },
    },
  };
  const response = await sendWsCommand(wsUrl, payload, 20000);
  if (response?.data?.success) {
    return response.data.data || response.data.snapshot || response.data;
  }
  throw new Error(response?.data?.error || response?.error || 'inspect_tree failed');
}

async function captureSnapshotFromFixture({
  profileId,
  url,
  maxDepth,
  maxChildren,
}) {
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'webauto-ui-'));
  const fixturePath = path.join(tmpDir, 'dom.html');
  try {
    const domArgs = ['dom-dump', '--url', url, '--headless', 'true', '--output', fixturePath];
    if (profileId) {
      domArgs.push('--profile', profileId);
    }
    await runCliCommand('browser-control', domArgs);
    const treeArgs = ['inspect-tree', '--url', url, '--fixture', fixturePath];
    if (typeof maxDepth === 'number') {
      treeArgs.push('--max-depth', String(maxDepth));
    }
    if (typeof maxChildren === 'number') {
      treeArgs.push('--max-children', String(maxChildren));
    }
    const tree = await runCliCommand('container-matcher', treeArgs);
    return tree?.data || tree;
  } finally {
    fsPromises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function captureInspectorSnapshot(options = {}) {
  const profile = options.profile;
  const sessions = await fetchSessions();
  const targetSession = profile ? findSessionByProfile(sessions, profile) : sessions[0] || null;
  const sessionId = targetSession?.session_id || targetSession?.sessionId || profile || null;
  const profileId = profile || targetSession?.profileId || targetSession?.profile_id || sessionId || null;
  const targetUrl = options.url || targetSession?.current_url || targetSession?.currentUrl;
  if (!targetUrl) {
    throw new Error('无法确定会话 URL，请先在浏览器中打开目标页面');
  }
  let liveError = null;
  let snapshot = null;
  if (sessionId) {
    try {
      snapshot = await fetchContainerSnapshotFromService({
        sessionId,
        url: targetUrl,
        maxDepth: options.maxDepth,
        maxChildren: options.maxChildren,
      });
    } catch (err) {
      liveError = err;
      console.warn('[floating] live inspect_tree failed:', err?.message || err);
    }
  }
  let fixtureSnapshot = null;
  if (!snapshot) {
    fixtureSnapshot = await captureSnapshotFromFixture({
      profileId,
      url: targetUrl,
      maxDepth: options.maxDepth,
      maxChildren: options.maxChildren,
    });
    snapshot = fixtureSnapshot;
  } else if (!snapshot?.dom_tree) {
    try {
      fixtureSnapshot = await captureSnapshotFromFixture({
        profileId,
        url: targetUrl,
        maxDepth: options.maxDepth,
        maxChildren: options.maxChildren,
      });
      if (fixtureSnapshot?.dom_tree) {
        snapshot.dom_tree = fixtureSnapshot.dom_tree;
        if (!snapshot.matches && fixtureSnapshot.matches) {
          snapshot.matches = fixtureSnapshot.matches;
        }
        const mergedMetadata = {
          ...(fixtureSnapshot.metadata || {}),
          ...(snapshot.metadata || {}),
        };
        if (!mergedMetadata.dom_source) {
          mergedMetadata.dom_source = 'fixture';
        }
        snapshot.metadata = mergedMetadata;
      }
    } catch (fixtureError) {
      console.warn('[floating] fixture DOM capture failed:', fixtureError?.message || fixtureError);
    }
  }
  if (!snapshot || !snapshot.container_tree) {
    const rootError = liveError || new Error('容器树为空，检查容器定义或选择器是否正确');
    throw rootError;
  }
  return {
    sessionId: sessionId || profileId || 'unknown-session',
    profileId: profileId || 'default',
    targetUrl,
    snapshot,
  };
}

async function writeUserContainerDefinition(siteKey, containerId, definition) {
  const parts = containerId.split('.').filter(Boolean);
  const targetDir = path.join(USER_CONTAINER_ROOT, siteKey, ...parts);
  await fsPromises.mkdir(targetDir, { recursive: true });
  const filePath = path.join(targetDir, 'container.json');
  await fsPromises.writeFile(filePath, JSON.stringify(definition, null, 2), 'utf-8');
}

function resolveSiteKeyFromUrl(url) {
  if (!url) return null;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const index = loadContainerIndex();
  let bestKey = null;
  let bestLen = -1;
  for (const [key, meta] of Object.entries(index)) {
    const domain = (meta?.website || '').toLowerCase();
    if (!domain) continue;
    if (host === domain || host.endsWith(`.${domain}`)) {
      if (domain.length > bestLen) {
        bestKey = key;
        bestLen = domain.length;
      }
    }
  }
  return bestKey;
}

function loadContainerIndex() {
  if (containerIndexCache) {
    return containerIndexCache;
  }
  if (!fs.existsSync(CONTAINER_INDEX_PATH)) {
    containerIndexCache = {};
    return containerIndexCache;
  }
  try {
    containerIndexCache = JSON.parse(fs.readFileSync(CONTAINER_INDEX_PATH, 'utf-8'));
  } catch {
    containerIndexCache = {};
  }
  return containerIndexCache;
}

function inferSiteFromContainerId(containerId) {
  if (!containerId) return null;
  const dotIdx = containerId.indexOf('.');
  if (dotIdx > 0) {
    return containerId.slice(0, dotIdx);
  }
  const underscoreIdx = containerId.indexOf('_');
  if (underscoreIdx > 0) {
    return containerId.slice(0, underscoreIdx);
  }
  return null;
}

async function ensureInspectorWindow() {
  if (inspectorWindow && !inspectorWindow.isDestroyed()) {
    return inspectorWindow;
  }
  inspectorWindow = new BrowserWindow({
    width: 960,
    height: 620,
    minWidth: 520,
    minHeight: 400,
    title: 'WebAuto 容器视图',
    autoHideMenuBar: true,
    show: true,
    backgroundColor: '#050711',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  inspectorReady = false;
  inspectorPendingPayload = null;
  const inspectorPath = path.resolve(__dirname, '../renderer/inspector.html');
  inspectorWindow.loadFile(inspectorPath);
  inspectorWindow.on('closed', () => {
    inspectorWindow = null;
    inspectorReady = false;
    inspectorPendingPayload = null;
    inspectorContext = null;
    inspectorBusy = false;
  });
  return inspectorWindow;
}

function pushInspectorSnapshot(context) {
  inspectorPendingPayload = formatInspectorPayload(context);
  if (inspectorWindow && inspectorReady && inspectorPendingPayload) {
    inspectorWindow.webContents.send('inspector:data', inspectorPendingPayload);
  }
}

function sendInspectorEvent(event) {
  if (inspectorWindow && inspectorReady) {
    inspectorWindow.webContents.send('inspector:event', event);
  }
}
