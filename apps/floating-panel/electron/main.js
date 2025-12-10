import { app, BrowserWindow, ipcMain, nativeTheme, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import WebSocket, { WebSocketServer } from 'ws';
import { messageBus } from './messageBus.js';
import { ControllerClient } from './controllerClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const windowStateKeeper = require('electron-window-state');
const Positioner = require('electron-positioner');

const repoRoot = path.resolve(__dirname, '../../..');
const USER_CONTAINER_ROOT = path.join(os.homedir(), '.webauto', 'container-lib');
const CONTAINER_INDEX_PATH = path.join(repoRoot, 'container-library.index.json');
const NORMAL_SIZE = { width: 960, height: 640 };
const COLLAPSED_SIZE = { width: 180, height: 80 };
const DEFAULT_WS_HOST = process.env.WEBAUTO_WS_HOST || '127.0.0.1';
const DEFAULT_WS_PORT = Number(process.env.WEBAUTO_WS_PORT || 8765);
const DEFAULT_HTTP_HOST = process.env.WEBAUTO_BROWSER_HTTP_HOST || '127.0.0.1';
const DEFAULT_HTTP_PORT = Number(process.env.WEBAUTO_BROWSER_HTTP_PORT || 7704);
const DEFAULT_HTTP_PROTOCOL = process.env.WEBAUTO_BROWSER_HTTP_PROTO || 'http';
const AUTO_STICK_ENABLED = process.env.WEBAUTO_AUTO_STICK === '1';
const FLOATING_HEADLESS = process.env.WEBAUTO_FLOATING_HEADLESS === '0' ? false : true;
const BUS_BRIDGE_PORT = Number(process.env.WEBAUTO_FLOATING_BUS_PORT || 0);
const CONTROLLER_HOST = process.env.WEBAUTO_CONTROLLER_HOST || '127.0.0.1';
const CONTROLLER_PORT = Number(process.env.WEBAUTO_CONTROLLER_PORT || 8970);
const CONTROLLER_ENDPOINT = process.env.WEBAUTO_CONTROLLER_URL || `ws://${CONTROLLER_HOST}:${CONTROLLER_PORT}`;
const CONTROLLER_AUTOSTART = process.env.WEBAUTO_CONTROLLER_AUTOSTART !== '0';
let headlessMode = FLOATING_HEADLESS;

const controllerClient = new ControllerClient({
  endpoint: CONTROLLER_ENDPOINT,
  repoRoot,
  messageBus,
  autoStart: CONTROLLER_AUTOSTART,
  spawnArgs: [`--host=${CONTROLLER_HOST}`, `--port=${CONTROLLER_PORT}`],
  spawnEnv: {
    WEBAUTO_USER_CONTAINER_ROOT: USER_CONTAINER_ROOT,
    WEBAUTO_CONTAINER_INDEX: CONTAINER_INDEX_PATH,
    WEBAUTO_BROWSER_HTTP_HOST: DEFAULT_HTTP_HOST,
    WEBAUTO_BROWSER_HTTP_PORT: String(DEFAULT_HTTP_PORT),
    WEBAUTO_BROWSER_HTTP_PROTO: DEFAULT_HTTP_PROTOCOL,
    WEBAUTO_WS_HOST: DEFAULT_WS_HOST,
    WEBAUTO_WS_PORT: String(DEFAULT_WS_PORT),
  },
  logger: console,
});
controllerClient.init();
const shutdownController = () => {
  controllerClient.dispose().catch(() => {});
};
app.on('will-quit', shutdownController);
process.on('exit', shutdownController);

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
let busBridge;
const busClients = new Set();

registerBusHandlers();

messageBus.on('__broadcast__', (event) => {
  broadcastBusEvent(event);
});

function broadcastBusEvent(event) {
  const targets = [mainWindow, inspectorWindow].filter((win) => win && !win.isDestroyed());
  targets.forEach((win) => {
    try {
      win.webContents.send('bus:event', event);
    } catch (err) {
      console.warn('[bus] failed to forward event', err?.message || err);
    }
  });
  if (busClients.size) {
    const payload = JSON.stringify({ topic: event.topic, payload: event.payload });
    busClients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    });
  }
}

function registerBusHandlers() {
  const topics = [
    ['ui.window.shrinkToBall', () => toggleCollapse(true)],
    ['ui.window.restoreFromBall', () => toggleCollapse(false)],
    [
      'ui.window.toggleHeadless',
      (payload = {}) => {
        if (typeof payload?.headless === 'boolean') {
          applyHeadlessMode(payload.headless);
        } else {
          applyHeadlessMode(!headlessMode);
        }
      },
    ],
    [
      'ui.window.setHeadless',
      (payload = {}) => {
        if (typeof payload?.headless === 'boolean') {
          applyHeadlessMode(payload.headless);
        }
      },
    ],
    ['ui.ball.doubleClick', () => toggleCollapse(false)],
    [
      'ui.window.stickToBrowser',
      async (payload = {}) => {
        await handleStickBrowser(payload || {});
      },
    ],
    ['ui.window.requestState', () => publishWindowState()],
  ];
  topics.forEach(([topic, handler]) => {
    messageBus.subscribe(topic, async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        console.warn(`[bus] handler for ${topic} failed`, err);
        messageBus.publish('ui.window.error', { topic, message: err?.message || String(err) });
      }
    });
  });
}

function startBusBridge() {
  if (!BUS_BRIDGE_PORT || busBridge) {
    return;
  }
  try {
    busBridge = new WebSocketServer({ port: BUS_BRIDGE_PORT, host: '127.0.0.1' });
  } catch (err) {
    console.warn('[bus] bridge start failed', err?.message || err);
    return;
  }
  busBridge.on('connection', (socket) => {
    busClients.add(socket);
    socket.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        if (payload?.topic) {
          messageBus.publish(payload.topic, payload.payload);
        }
      } catch (err) {
        console.warn('[bus] invalid client message', err?.message || err);
      }
    });
    socket.on('close', () => busClients.delete(socket));
    socket.on('error', () => busClients.delete(socket));
  });
  busBridge.on('listening', () => {
    console.log(`[bus] bridge listening on ws://127.0.0.1:${BUS_BRIDGE_PORT}`);
  });
  busBridge.on('error', (err) => {
    console.warn('[bus] bridge error', err?.message || err);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
} else {
  if (process.env.ELECTRON_ENABLE_LOGGING === '1') {
    app.commandLine.appendSwitch('enable-logging');
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

startBusBridge();

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
    transparent: !FLOATING_HEADLESS,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: FLOATING_HEADLESS ? '#050711' : '#050711d0',
    show: !FLOATING_HEADLESS,
    alwaysOnTop: !FLOATING_HEADLESS,
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
  if (!FLOATING_HEADLESS) {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }
  const rendererPath = path.resolve(__dirname, '../renderer/index.html');
  mainWindow.loadFile(rendererPath);
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer][${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.session.webRequest.onErrorOccurred((details) => {
    if (!details?.url?.includes('app.js') && !details?.url?.includes('/renderer/')) return;
    console.warn('[renderer] resource load error', details.url, details.error);
  });
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents
      .executeJavaScript(
        'console.log("[floating] scripts", Array.from(document.scripts).map(s => s.src || "inline"));',
      )
      .catch((err) => console.warn('[floating] dom-ready eval failed', err));
  });
  mainWindow.webContents.on('did-finish-load', () => {
    broadcastCollapseState();
    if (!FLOATING_HEADLESS) {
      scheduleAutoStick();
    }
  });

  mainWindow.on('ready-to-show', () => {
    enforceWorkAreaBounds();
    snapToEdges();
    if (!FLOATING_HEADLESS) {
      scheduleAutoStick();
    }
    if (FLOATING_HEADLESS) {
      console.log('[floating] headless window ready');
    }
    broadcastHeadlessState();
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
  if (!AUTO_STICK_ENABLED || FLOATING_HEADLESS || autoStickScheduled || process.platform !== 'darwin') {
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

function publishWindowState() {
  broadcastCollapseState();
  broadcastHeadlessState();
}

function broadcastCollapseState() {
  if (mainWindow) {
    mainWindow.webContents.send('window:collapse-state', { isCollapsed });
  }
  messageBus.publish('ui.window.stateChanged', { collapsed: isCollapsed, mode: isCollapsed ? 'ball' : 'normal' });
}

function broadcastHeadlessState() {
  if (mainWindow) {
    mainWindow.webContents.send('window:headless-state', { headless: headlessMode });
  }
  messageBus.publish('ui.window.headlessChanged', { headless: headlessMode });
}

function applyHeadlessMode(enabled) {
  headlessMode = Boolean(enabled);
  if (!mainWindow) return;
  if (headlessMode) {
    mainWindow.hide();
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    scheduleAutoStick();
  }
  broadcastHeadlessState();
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
  console.log('[window-control]', payload);
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
    case 'set-headless':
      applyHeadlessMode(typeof value === 'boolean' ? value : !headlessMode);
      break;
    case 'publish':
      if (payload?.topic) {
        messageBus.publish(payload.topic, payload.payload);
      }
      break;
    default:
      break;
  }
});

ipcMain.on('bus:publish', (_event, payload = {}) => {
  if (!payload?.topic) return;
  messageBus.publish(payload.topic, payload.payload);
});

ipcMain.on('ui:log', (_event, payload = {}) => {
  const level = payload.level;
  const args = Array.isArray(payload.args) ? payload.args : [payload.args];
  const prefix = '[floating-ui]';
  switch (level) {
    case 'warn':
      console.warn(prefix, ...args);
      break;
    case 'error':
      console.error(prefix, ...args);
      break;
    default:
      console.log(prefix, ...args);
      break;
  }
});

ipcMain.handle('inspector:open', async (_event, payload = {}) => {
  const profile = payload.profile;
  if (!profile) {
    throw new Error('缺少 profile');
  }
  const context = await controllerClient.captureSnapshot({
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
        const context = await controllerClient.captureSnapshot({
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
  if (action === 'window:stick-browser') {
    try {
      return await handleStickBrowser(payload);
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }
  try {
    return await controllerClient.call(action, payload);
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

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

function formatInspectorPayload(context) {
  if (!context) return null;
  return {
    sessionId: context.sessionId,
    profileId: context.profileId,
    targetUrl: context.targetUrl,
    snapshot: context.snapshot,
  };
}
