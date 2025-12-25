import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST = path.join(__dirname, '..', 'dist');

const log = (msg) => console.log(`[ui-window-test] ${msg}`);

function createWindow() {
  const win = new BrowserWindow({
    width: 300,
    height: 200,
    show: false,
    webPreferences: {
      preload: path.join(DIST, 'main', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(DIST, 'renderer', 'index.html'));

  win.webContents.once('did-finish-load', async () => {
    await new Promise(r => setTimeout(r, 300));

    try {
      const hasApi = await win.webContents.executeJavaScript('Boolean(window.api)');
      if (!hasApi) {
        log('window.api missing');
        app.quit();
        process.exit(1);
      }
      log('window.api OK');

      app.quit();
      process.exit(0);
    } catch (e) {
      log('error: ' + (e?.message || String(e)));
      app.quit();
      process.exit(1);
    }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
