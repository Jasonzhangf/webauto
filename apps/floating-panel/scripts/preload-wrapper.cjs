const path = require('node:path');
const { pathToFileURL } = require('node:url');

const target = process.env.PRELOAD_PATH || path.join(__dirname, '../dist/main/preload.mjs');

(async () => {
  try {
    await import(pathToFileURL(target).toString());
    console.log('[preload-wrapper] preload loaded');
  } catch (err) {
    console.error('[preload-wrapper] failed to import preload', err?.message || err);
    // 在 Electron 主进程里，直接 require 到 preload 会失败，我们改用子进程方式跑真正的 preload 测试
    process.exit(1);
  }
})();
