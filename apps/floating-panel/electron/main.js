import { app, BrowserWindow, ipcMain, nativeTheme, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const windowStateKeeper = require('electron-window-state');
const Positioner = require('electron-positioner');

const repoRoot = path.resolve(__dirname, '../../..');
const CLI_TARGETS = {
  'browser-control': path.join(repoRoot, 'modules/browser-control/src/cli.ts'),
  'session-manager': path.join(repoRoot, 'modules/session-manager/src/cli.ts'),
  logging: path.join(repoRoot, 'modules/logging/src/cli.ts'),
  operations: path.join(repoRoot, 'modules/operations/src/cli.ts'),
  'container-matcher': path.join(repoRoot, 'modules/container-matcher/src/cli.ts'),
};

const NORMAL_SIZE = { width: 360, height: 500 };
const COLLAPSED_SIZE = { width: 180, height: 80 };

let mainWindow;
let positioner;
let isCollapsed = false;
let lastNormalBounds = null;
let inspectorWindow = null;
let inspectorReady = false;
let inspectorPendingPayload = null;
let inspectorContext = null;
let inspectorBusy = false;

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

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 280,
    minHeight: 320,
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
  });

  mainWindow.on('ready-to-show', () => {
    enforceWorkAreaBounds();
    snapToEdges();
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

async function captureInspectorSnapshot(options = {}) {
  const profile = options.profile;
  const sessions = await fetchSessions();
  const targetSession = profile ? findSessionByProfile(sessions, profile) : null;
  const sessionId = targetSession?.session_id || targetSession?.sessionId || profile || null;
  const profileId = profile || targetSession?.profileId || targetSession?.profile_id || null;
  const targetUrl = options.url || targetSession?.current_url || targetSession?.currentUrl;
  if (!targetUrl) {
    throw new Error('无法确定会话 URL，请先在浏览器中打开目标页面');
  }

  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'webauto-inspector-'));
  const fixturePath = path.join(tmpDir, 'dom.html');
  try {
    const domArgs = ['dom-dump', '--url', targetUrl, '--headless', 'true', '--output', fixturePath];
    if (profileId) {
      domArgs.push('--profile', profileId);
    }
    await runCliCommand('browser-control', domArgs);
    const treeArgs = ['inspect-tree', '--url', targetUrl, '--fixture', fixturePath];
    if (typeof options.maxDepth === 'number') {
      treeArgs.push('--max-depth', String(options.maxDepth));
    }
    if (typeof options.maxChildren === 'number') {
      treeArgs.push('--max-children', String(options.maxChildren));
    }
    const tree = await runCliCommand('container-matcher', treeArgs);
    const snapshot = tree?.data || tree;
    if (!snapshot || !snapshot.container_tree) {
      throw new Error('容器树为空，检查容器定义或选择器是否正确');
    }
    return {
      sessionId: sessionId || profileId || 'unknown-session',
      profileId: profileId || 'default',
      targetUrl,
      snapshot,
    };
  } finally {
    fsPromises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
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
