import electron from 'electron';
const { app, BrowserWindow, ipcMain, screen } = electron;
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { getErrorHandler } from '../../../../modules/core/src/error-handler.mjs';

// 使用 process.cwd() 获取项目根目录
const PROJECT_ROOT = process.cwd();
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const MAIN_DIR = path.join(DIST_DIR, 'main');
const LOG_FILE_PATH = path.join(os.tmpdir(), 'webauto-floating-panel.log');

let win: BrowserWindow | null = null;
let ws: WebSocket | null = null;
let busConnected = false;
let pendingStatus: any = null;
let pendingEvents: any[] = [];
let consoleLoggingBroken = false;
let errorHandlerPromise: Promise<any> | null = null;

const WS_URL = process.env.WEBAUTO_FLOATING_WS_URL || 'ws://127.0.0.1:7701/ws';
const BUS_URL = process.env.WEBAUTO_FLOATING_BUS_URL || 'ws://127.0.0.1:7701/bus';
const HEADLESS = process.env.WEBAUTO_FLOATING_HEADLESS === '1';
const DEVTOOLS = process.env.WEBAUTO_FLOATING_DEVTOOLS === '1';

const STATE_FILE = path.join(os.homedir(), '.webauto', 'floating-window-state.json');

function ensureWebAutoDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    log('Failed to load window state: ' + e);
  }
  return null;
}

function saveWindowState(bounds: any) {
  try {
    ensureWebAutoDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(bounds), 'utf8');
  } catch (e) {
    log('Failed to save window state: ' + e);
  }
}

function log(msg: string) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const line = `[${timestamp}] [floating-main] ${msg}`;

  // Skip console.log entirely to avoid EIO errors
  // Only write to log file
  try {
    fs.appendFileSync(LOG_FILE_PATH, `${line}\n`, 'utf8');
  } catch {
    // Completely swallow errors - no logging at all if file fails
  }
}

function logDebug(module: string, event: string, data: any) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const line = `[${timestamp}] [debug-${module}] ${event}: ${JSON.stringify(data)}`;

  try {
    fs.appendFileSync(LOG_FILE_PATH, `${line}\n`, 'utf8');
  } catch {
    // Ignore errors
  }
}

async function reportError(module: string, err: unknown, context: any = {}) {
  try {
    if (!errorHandlerPromise) {
      errorHandlerPromise = getErrorHandler();
    }
    const handler = await errorHandlerPromise;
    const errorObj = err instanceof Error ? err : new Error(String(err));
    await handler.log(module, errorObj, context);
  } catch (innerErr) {
    log(`ErrorHandler failed: ${innerErr}`);
  }
}

function flushPendingMessages() {
  if (!win || !win.isVisible()) {
    return;
  }
  
  for (const event of pendingEvents) {
    try {
      win.webContents.send('bus:event', event);
    } catch (err) {
      reportError('bus-event', err, { event });
    }
  }
  pendingEvents = [];
  
  if (pendingStatus) {
    try {
      win.webContents.send('bus:status', pendingStatus);
    } catch (err) {
      reportError('bus-status', err, { status: pendingStatus });
    }
    pendingStatus = null;
  }
}

function saveCurrentWindowState() {
  if (!win) return;
  try {
    const bounds = win.getBounds();
    saveWindowState(bounds);
    log(`Saved window state: ${JSON.stringify(bounds)}`);
  } catch (e) {
    log(`Failed to save window state: ${e}`);
  }
}

let saveStateTimeout: NodeJS.Timeout | null = null;
function scheduleSaveState() {
  if (saveStateTimeout) clearTimeout(saveStateTimeout);
  saveStateTimeout = setTimeout(saveCurrentWindowState, 1000);
}

function createWindow() {
  log(`Creating window (HEADLESS=${HEADLESS}, DEVTOOLS=${DEVTOOLS})`);
  log(`PROJECT_ROOT: ${PROJECT_ROOT}`);
  log(`DIST_DIR: ${DIST_DIR}`);
  

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const savedState = loadWindowState();
  
  let width = 320;
  let height = 480;
  let x = Math.max(0, Math.round((screenW - width) / 2));
  let y = Math.max(0, Math.round((screenH - height) / 2));

  if (savedState) {
    if (savedState.width && savedState.height) {
      width = savedState.width;
      height = savedState.height;
    }
    if (typeof savedState.x === 'number' && typeof savedState.y === 'number') {
      x = savedState.x;
      y = savedState.y;
    }
  }

  log(`Window geometry: ${width}x${height} at (${x}, ${y})`);
  
  win = new BrowserWindow({
    width: width,
    height: height,
    x: x,
    y: y,
    frame: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: true,
    minWidth: 280,
    minHeight: 200,
    show: true,
    webPreferences: {
      preload: path.join(MAIN_DIR, 'preload.mjs'),
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false, // 保持 sandbox: false 以允许 Node.js 集成和 ESM preload (参考文档)
      webSecurity: false
    }
  });
  
  const htmlPath = path.join(DIST_DIR, 'renderer', 'index.html');
  log(`Loading HTML from: ${htmlPath}`);
  
  win.loadFile(htmlPath).then(() => {
    log('HTML loaded successfully');
    
    // 延迟显示窗口并刷新消息队列
    setTimeout(() => {
      if (win && win.isVisible()) {
        win.show();
        log('Window shown');
        setTimeout(() => {
          flushPendingMessages();
        }, 200);
      }
    }, 500);
  }).catch((err) => {
    log(`Failed to load HTML: ${err}`);
  });
  

  // 监听渲染进程控制台输出
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = ['verbose', 'info', 'warning', 'error'][level] || 'log';
    log(`[renderer-${levelStr}] ${message} (${sourceId}:${line})`);
  });

  // 监听加载失败事件
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    log(`[did-fail-load] ${errorCode}: ${errorDescription} (${validatedURL})`);
  });

  // 监听崩溃事件
  win.webContents.on('render-process-gone', (event, details) => {
    log(`[render-process-gone] ${details.reason} (exitCode: ${details.exitCode})`);
  });
  if (DEVTOOLS) {
    win.webContents.openDevTools({ mode: 'detach' });
    log('DevTools opened');
  }

  win.webContents.on('did-finish-load', async () => {
    log('did-finish-load');
    try {
      const info = await win.webContents.executeJavaScript(
        `({
          title: document.title,
          bg: getComputedStyle(document.body).backgroundColor,
          hasContainer: !!document.getElementById('container')
        })`,
        true,
      );
      log(`[renderer-state] ${JSON.stringify(info)}`);
    } catch (err) {
      log(`[renderer-state] error: ${err}`);
    }
  });
  
  win.on('ready-to-show', () => {
    log('Window ready-to-show event');
  });
  
  win.on('moved', () => {
    scheduleSaveState();
  });
  
  win.on('resized', () => {
    scheduleSaveState();
  });
  
  win.on('closed', () => { 
    log('Window closed');
    saveCurrentWindowState();
    win = null; 
  });
}

function connectBus() {
  log(`Connecting to bus: ${BUS_URL}`);
  ws = new WebSocket(BUS_URL);
  
  ws.on('open', () => {
    log('Bus WebSocket OPEN event');
    busConnected = true;
    pendingStatus = { connected: true };
    
    // 立即发送总线状态
    if (win && win.isVisible()) {
      log('Window visible, flushing immediately');
      flushPendingMessages();
    } else {
      log('Window not visible yet, status will be sent later');
    }
  });
  
  ws.on('message', (data) => {
    log('Bus message received');
    try {
      const msg = JSON.parse(data.toString());
      log(`Bus message: topic=${msg.topic || 'unknown'}, payload exists=${!!msg.payload}`);
      
      pendingEvents.push(msg);
      
      if (win && win.isVisible()) {
        log('Window visible, flushing events immediately');
        flushPendingMessages();
      } else {
        log(`Window not visible yet, event queued (${pendingEvents.length} pending)`);
      }
    } catch (e) {
      log(`Failed to parse bus message: ${e}`);
    }
  });
  
  ws.on('close', () => {
    log('Bus WebSocket CLOSED');
    busConnected = false;
    pendingStatus = { connected: false };
    
    if (win && win.isVisible()) {
      win.webContents.send('bus:status', { connected: false });
    }
    
    log('Reconnecting in 3s...');
    setTimeout(connectBus, 3000);
  });
  
  ws.on('error', (err) => {
    log(`Bus WebSocket ERROR: ${err}`);
    busConnected = false;
    pendingStatus = { connected: false };
    
    if (win && win.isVisible()) {
      win.webContents.send('bus:status', { connected: false });
    }
  });
}

app.whenReady().then(() => {
  log('App ready');
  
  // 确保只有一个主窗口
  const existingWindows = BrowserWindow.getAllWindows();
  if (existingWindows.length > 0) {
    log(`Closing ${existingWindows.length} existing windows`);
    existingWindows.forEach(w => w.close());
  }
  
  createWindow();
  connectBus();
});

app.on('window-all-closed', () => {
  log('All windows closed');
  ws?.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('health', async () => {
  try {
    log('Health check requested');
    const res = await fetch('http://127.0.0.1:7701/health');
    log(`Health check result: ${res.ok}`);
    return { ok: res.ok };
  } catch (e) {
    reportError('health-check', e, { endpoint: 'http://127.0.0.1:7701/health' });
    return { ok: false };
  }
});

ipcMain.handle('ui:highlight', async (_evt, { selector, color, options = {}, profile = null }) => {
  try {
    log(`Highlight request: ${selector}, color: ${color}, options: ${JSON.stringify(options)}`);
    if (!profile) {
      throw new Error('缺少会话/ profile 信息');
    }

    // 自动识别是否为 DOM 路径 (以 root 开头或包含 /)
    const isPath = selector && (selector.startsWith('root') || selector.includes('/'));
    const endpoint = isPath ? '/v1/browser/highlight-dom-path' : '/v1/browser/highlight';

    // 对于 DOM 路径高亮，需要将 color 转换为 style
    const finalOptions = isPath && color
      ? { ...options, style: `2px dashed ${color}` }
      : options || {};

    const body = {
      profile,
      ...(isPath ? { path: selector } : { selector }),
      ...(!isPath && color ? { color } : {}),  // selector 高亮保留 color
      options: finalOptions
    };

    const res = await fetch(`http://127.0.0.1:7701${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) {
    reportError('highlight-api', e, { selector, color, isPath: typeof isPath !== 'undefined' ? isPath : false, endpoint: typeof endpoint !== 'undefined' ? endpoint : '' });
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('ui:debug-log', async (_evt, { module, event, data }) => {
  logDebug(module || 'floating-panel', event || 'renderer', data || {});
  log(`[renderer-debug] ${module}:${event} ${JSON.stringify(data)}`);
  return { success: true };
});

ipcMain.handle('ui:clearHighlight', async (_evt, channel = null) => {
  try {
    log(`Clear highlight request: ${channel || 'all'}`);
    const res = await fetch(`http://127.0.0.1:7701/v1/browser/clear-highlight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'weibo_fresh', channel: channel || undefined })
    });
    return await res.json();
  } catch (e) {
    reportError('clear-highlight-api', e, { channel });
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('window:minimize', async (_evt) => {
  if (win) {
    log('Minimizing window');
    win.minimize();
  }
});

ipcMain.handle('window:close', async (_evt) => {
  if (win) {
    log('Closing window');
    win.close();
  }
});

ipcMain.handle('ui:action', async (_evt, { action, payload, request_id }) => {
  try {
    log(`UI action: ${action} requestId=${request_id || 'n/a'}`);
    const res = await fetch(`http://127.0.0.1:7701/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload, request_id })
    });
    return await res.json();
  } catch (e) {
    log(`UI action error: ${e}`);
    return { success: false, error: String(e), request_id };
  }
});

log('Main process started');
