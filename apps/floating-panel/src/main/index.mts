import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let win: BrowserWindow | null = null;
let ws: WebSocket | null = null;

const WS_URL = process.env.WEBAUTO_FLOATING_WS_URL || 'ws://127.0.0.1:7701/ws';
const BUS_URL = process.env.WEBAUTO_FLOATING_BUS_URL || 'ws://127.0.0.1:7701/bus';
const HEADLESS = process.env.WEBAUTO_FLOATING_HEADLESS === '1';
const DEVTOOLS = process.env.WEBAUTO_FLOATING_DEVTOOLS === '1';

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: 320,
    height: 480,
    x: width - 340,
    y: 60,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: !HEADLESS,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  if (DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
  win.on('closed', () => { win = null; });
}

function connectBus() {
  ws = new WebSocket(BUS_URL);
  ws.on('open', () => {
    win?.webContents.send('bus:status', { connected: true });
  });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      win?.webContents.send('bus:event', msg);
    } catch {}
  });
  ws.on('close', () => {
    win?.webContents.send('bus:status', { connected: false });
    setTimeout(connectBus, 3000);
  });
  ws.on('error', () => {
    win?.webContents.send('bus:status', { connected: false });
  });
}

app.whenReady().then(() => {
  createWindow();
  connectBus();
});

app.on('window-all-closed', () => {
  ws?.close();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('health', async () => {
  try {
    const res = await fetch('http://127.0.0.1:7701/health');
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('ui:action', async (_evt, { action, payload }) => {
  try {
    const res = await fetch(`http://127.0.0.1:7701/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
});
