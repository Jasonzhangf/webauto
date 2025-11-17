/**
 * ⚠️ PlaywrightBrowser 已废弃
 *
 * 项目统一架构：
 * - 浏览器内核统一由 Python + Camoufox 提供（见 browser_interface / BrowserService）
 * - Node.js 层只能通过 HTTP / 远程服务控制浏览器，不得直接启动 Chromium / Playwright
 *
 * 这个文件仅保留导出占位符，防止旧代码 import 时报错。
 * 一旦被实例化，会立刻抛出异常，强制开发者迁移到正确路径。
 */

import { BrowserError } from './browser-errors.js';

export class PlaywrightBrowser {
  constructor() {
    throw new BrowserError(
      'PlaywrightBrowser 已被禁用：\n' +
        'Node 侧不得直接启动浏览器内核，请通过 Python BrowserService / browser_interface 统一访问浏览器。\n' +
        '建议路径：使用 libs/browser/remote-service.js 或 services/browser_launcher.py 提供的 HTTP API。',
    );
  }

  // 下面的方法仅为类型占位，永远不会被正常调用
  async start() {
    throw new BrowserError('PlaywrightBrowser.start() 已被禁用，请改用 Python BrowserService。');
  }
}

