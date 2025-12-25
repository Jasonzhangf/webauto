const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const preloadPath = process.env.PRELOAD_PATH || path.resolve(__dirname, '../dist/main/preload.cjs');

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Preload Test</title>
  </head>
  <body>
    <div id="root">preload test</div>
  </body>
</html>`;

let sawPreloadError = null;

const logResult = (ok, detail = '') => {
  if (ok) {
    console.log('[preload-test] window.api OK');
  } else {
    const suffix = detail ? `: ${detail}` : '';
    console.log(`[preload-test] FAILED${suffix}`);
  }
};

const runTest = async () => {
  const win = new BrowserWindow({
    width: 300,
    height: 200,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  });

  win.webContents.on('preload-error', (_event, preloadErr) => {
    sawPreloadError = preloadErr;
  });

  win.webContents.on('console-message', (_event, _level, message) => {
    if (message.startsWith('[preload]')) {
      console.log(message);
    }
  });

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await win.loadURL(dataUrl);

  const hasApi = await win.webContents.executeJavaScript('Boolean(window.api)', true);

  if (hasApi && !sawPreloadError) {
    logResult(true);
  } else if (sawPreloadError) {
    logResult(false, sawPreloadError.message || String(sawPreloadError));
  } else {
    logResult(false, 'window.api missing');
  }

  win.close();
  app.quit();
};

app.whenReady().then(runTest).catch((err) => {
  logResult(false, err?.message || String(err));
  app.quit();
});
