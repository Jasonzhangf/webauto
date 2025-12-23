import { app, BrowserWindow, ipcMain, screen } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import windowStateKeeper from 'electron-window-state';

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

const WS_URL = process.env.WEBAUTO_FLOATING_WS_URL || 'ws://127.0.0.1:7701/ws';
const BUS_URL = process.env.WEBAUTO_FLOATING_BUS_URL || 'ws://127.0.0.1:7701/bus';
const HEADLESS = process.env.WEBAUTO_FLOATING_HEADLESS === '1';
const DEVTOOLS = process.env.WEBAUTO_FLOATING_DEVTOOLS === '1';

function log(msg: string) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const line = `[${timestamp}] [floating-main] ${msg}`;

  if (!consoleLoggingBroken) {
    try {
      console.log(line);
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code !== 'EIO') {
        throw error;
      }
      consoleLoggingBroken = true;
    }
  }

  try {
    fs.appendFileSync(LOG_FILE_PATH, `${line}\n`, 'utf8');
  } catch {
    // Swallow errors when writing logs to prevent crash loops
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
      log(`ERROR sending event: ${err}`);
    }
  }
  pendingEvents = [];
  
  if (pendingStatus) {
    try {
      win.webContents.send('bus:status', pendingStatus);
    } catch (err) {
      log(`ERROR sending status: ${err}`);
    }
    pendingStatus = null;
  }
}

function createWindow() {
  log(`Creating window (HEADLESS=${HEADLESS}, DEVTOOLS=${DEVTOOLS})`);
  log(`PROJECT_ROOT: ${PROJECT_ROOT}`);
  log(`DIST_DIR: ${DIST_DIR}`);
  
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const defaultWidth = 320;
  const defaultHeight = 480;
  const fallbackX = Math.max(0, width - defaultWidth - 20);
  const fallbackY = 60;

  const mainWindowState = windowStateKeeper({
    defaultWidth,
    defaultHeight
  });

  const windowBounds = {
    width: mainWindowState.width,
    height: mainWindowState.height,
    x: typeof mainWindowState.x === 'number' ? mainWindowState.x : fallbackX,
    y: typeof mainWindowState.y === 'number' ? mainWindowState.y : fallbackY
  };

  log(`Window geometry: ${windowBounds.width}x${windowBounds.height} at (${windowBounds.x}, ${windowBounds.y})`);
  
  win = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: 280,
    minHeight: 200,
    show: true,
    webPreferences: {
      preload: path.join(MAIN_DIR, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  mainWindowState.manage(win);
  
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
  
  if (DEVTOOLS) {
    win.webContents.openDevTools({ mode: 'detach' });
    log('DevTools opened');
  }
  
  win.on('ready-to-show', () => {
    log('Window ready-to-show event');
  });
  
  win.on('moved', () => {
    log('Window moved event');
  });
  
  win.on('closed', () => { 
    log('Window closed');
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
    log(`Health check error: ${e}`);
    return { ok: false };
  }

ipcMain.handle('ui:highlight', async (_evt, { selector, color }) => {
  try {
    log(`Highlight element: ${selector}, color: ${color}`);
    const res = await fetch('http://127.0.0.1:7701/v1/browser/highlight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector, color })
    });
    return await res.json();
  } catch (e) {
    log(`Highlight error: ${e}`);

ipcMain.handle('window:minimize', async (_evt) => {
  if (win) {

ipcMain.handle('ui:highlight', async (_evt, { selector, color }) => {
  try {
    log(`Highlight element: ${selector}, color: ${color}`);
    const res = await fetch('http://127.0.0.1:7701/v1/browser/highlight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector, color })
    });
    return await res.json();
  } catch (e) {
    log(`Highlight error: ${e}`);
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

    return { success: false, error: String(e) };
  }
});

});

ipcMain.handle('ui:action', async (_evt, { action, payload }) => {
  try {
    log(`UI action: ${action}`);
    const res = await fetch(`http://127.0.0.1:7701/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    return await res.json();
  } catch (e) {
    log(`UI action error: ${e}`);
    return { success: false, error: String(e) };
  }
});

log('Main process started');
