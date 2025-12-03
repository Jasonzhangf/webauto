import { app, BrowserWindow, ipcMain, nativeTheme, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let mainWindow;
let isCollapsed = false;
let lastExpandedBounds = null;
const COLLAPSED_SIZE = { width: 84, height: 84 };
const EXPANDED_MIN = { width: 360, height: 480 };

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: EXPANDED_MIN.width,
    minHeight: EXPANDED_MIN.height,
    frame: false,
    vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
    visualEffectState: 'active',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 12 } : undefined,
    backgroundColor: '#1b1b1bd8',
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
      spellcheck: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setSkipTaskbar(false);

  const rendererPath = path.resolve(__dirname, '../renderer/index.html');
  mainWindow.loadFile(rendererPath);

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

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

ipcMain.on('window-control', (_event, action) => {
  if (!mainWindow) return;
  switch (action) {
    case 'close':
      mainWindow.close();
      break;
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'toggle-devtools':
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
      break;
    default:
      break;
  }
});

ipcMain.handle('window:set-pin', (_event, shouldPin) => {
  if (!mainWindow) return false;
  const pin = Boolean(shouldPin);
  mainWindow.setAlwaysOnTop(pin, 'floating');
  return mainWindow.isAlwaysOnTop();
});

ipcMain.handle('app:get-meta', () => ({
  version: app.getVersion(),
  isDev,
  platform: process.platform,
  autoConnectUrl: process.env.WEBAUTO_FLOATING_WS_URL || '',
  autoMatchUrl: process.env.WEBAUTO_FLOATING_TARGET_URL || '',
}));

ipcMain.handle('window:set-collapsed', (_event, shouldCollapse) => {
  if (!mainWindow) return { collapsed: isCollapsed };
  const next = Boolean(shouldCollapse);
  if (next === isCollapsed) {
    return { collapsed: isCollapsed, bounds: mainWindow.getBounds() };
  }

  if (next) {
    lastExpandedBounds = mainWindow.getBounds();
    mainWindow.setResizable(false);
    mainWindow.setMinimumSize(COLLAPSED_SIZE.width, COLLAPSED_SIZE.height);
    mainWindow.setMaximumSize(COLLAPSED_SIZE.width, COLLAPSED_SIZE.height);
    mainWindow.setSize(COLLAPSED_SIZE.width, COLLAPSED_SIZE.height);
  } else {
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(EXPANDED_MIN.width, EXPANDED_MIN.height);
    mainWindow.setMaximumSize(9999, 9999);
    if (lastExpandedBounds) {
      mainWindow.setBounds(lastExpandedBounds);
    } else {
      mainWindow.setSize(420, 720);
    }
  }

  isCollapsed = next;
  return { collapsed: isCollapsed, bounds: mainWindow.getBounds() };
});

ipcMain.handle('window:get-bounds', () => {
  if (!mainWindow) return null;
  return mainWindow.getBounds();
});

ipcMain.handle('window:set-position', (_event, pos) => {
  if (!mainWindow || !pos) return null;
  const x = Number(pos.x) || 0;
  const y = Number(pos.y) || 0;
  mainWindow.setPosition(Math.round(x), Math.round(y));
  return mainWindow.getBounds();
});

ipcMain.handle('window:get-workarea', () => {
  const primary = screen.getPrimaryDisplay();
  return primary?.workArea || null;
});
