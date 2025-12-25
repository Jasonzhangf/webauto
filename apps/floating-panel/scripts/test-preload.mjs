import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = process.env.PRELOAD_PATH || path.resolve(__dirname, '../dist/main/preload.mjs');
const preloadUrl = pathToFileURL(preloadPath).toString();

const log = (msg) => console.log(`[preload-test] ${msg}`);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 300,
    height: 200,
    show: false,
    webPreferences: {
      preload: preloadUrl,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  });

  win.webContents.on('preload-error', (_event, error) => {
    log(`FAILED: ${error.message || error}`);
  });

  win.webContents.once('dom-ready', async () => {
    const hasApi = await win.webContents.executeJavaScript('Boolean(window.api)');
    if (hasApi) {
      log('window.api OK');
    } else {
      log('FAILED: window.api missing');
    }
    win.close();
    app.quit();
  });

  await win.loadURL('data:text/html,<html><body>preload test</body></html>');
}).catch((err) => {
  log(`FAILED: ${err.message || err}`);
  app.quit();
});
