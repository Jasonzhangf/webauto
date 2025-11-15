/**
 * 浏览器模块对外 API（无副作用版本）
 * - 仅导出高层函数与配置
 * - 不自动启动远程服务
 * - 不导出底层实现类
 */

import {
  // 生命周期 / 模式
  getBrowser,
  startBrowser,
  closeAll,
  quickTest,
  stealthMode,
  headlessMode,
  getManager,
  // 配置
  getDefaultConfig,
  getStealthConfig,
  getHeadlessConfig,
} from './browser-manager.js';

import { CookieManager } from './cookie-manager.js';

// 便捷：获取状态
export function getStatus() {
  return getManager().getStatus();
}

// 便捷：Cookie API 包装（使用当前浏览器实例）
export async function getCookies() {
  const b = await startBrowser();
  return await b.getCookies();
}

export async function saveCookies(path) {
  const b = await startBrowser();
  return await b.saveCookies(path);
}

export async function loadCookies(path) {
  const b = await startBrowser();
  return await b.loadCookies(path);
}

export function getStandardCookiePath(platform, type = 'domestic') {
  const m = new CookieManager();
  return m.getStandardCookiePath(platform, type);
}

// --------- 高层浏览器会话 API（给 workflow / 容器使用） ---------

/**
 * 启动一个浏览器会话（上层统一入口）
 * @param {{ profileId?: string, headless?: boolean, config?: object }} opts
 * @returns {Promise<{ browser: any, profileId: string }>}
 */
export async function startSession(opts = {}) {
  const profileId = opts.profileId || 'default';
  const baseConfig = opts.config || {};
  const config = { ...getDefaultConfig(), ...baseConfig, profileId };
  const browser = await startBrowser({ ...config, headless: !!opts.headless });
  return { browser, profileId };
}

/**
 * 在指定会话中导航到 URL
 * @param {{ browser?: any, url: string, waitTime?: number }} opts
 * @returns {Promise<any>} page
 */
export async function navigateInSession(opts) {
  const { browser: existing, url, waitTime = 3 } = opts;
  const browser = existing || (await startBrowser());
  const page = await browser.goto(url, null, waitTime);
  return page;
}


// 直接导出核心高层函数
export {
  getBrowser,
  startBrowser,
  closeAll,
  quickTest,
  stealthMode,
  headlessMode,
  getManager,
  getDefaultConfig,
  getStealthConfig,
  getHeadlessConfig,
};
