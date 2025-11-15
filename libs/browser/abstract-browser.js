/**
 * 抽象浏览器接口（约束高层封装使用）
 *
 * 说明：
 * - 高层模块仅通过该接口暴露的方法进行操作
 * - 禁止直接 import 'camoufox' / 'playwright'
 * - 由具体实现（CamoufoxBrowser）在内部使用底层库
 */

export class AbstractBrowser {
  async start() { throw new Error('Not implemented'); }
  async close() { throw new Error('Not implemented'); }
  isStarted() { return false; }
  async newPage() { throw new Error('Not implemented'); }
  async goto(_url, _page, _waitTime) { throw new Error('Not implemented'); }
  async quickTest(_url, _waitTime) { throw new Error('Not implemented'); }
  async getPageInfo(_page) { throw new Error('Not implemented'); }
  getPageCount() { return 0; }
  async getCookies() { return []; }
  async addCookies(_cookies) { return; }
  async loadCookies(_path) { return false; }
  async saveCookies(_path) { return false; }
}

