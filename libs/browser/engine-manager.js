/**
 * 浏览器引擎管理器
 * - Chromium: Playwright 内置
 * - Camoufox: 通过 camoufox npm 包（Firefox 内核）
 */

import path from 'node:path';
import { chromium } from 'playwright';

let logDebug = () => {};
try {
  // 在服务运行态（dist）可用；在脚本直接跑源码时也不会因为 dist 缺失而崩
  const mod = await import('../../dist/modules/logging/src/index.js');
  logDebug = mod.logDebug || (() => {});
} catch {
  // ignore
}

/** @typedef {'chromium' | 'camoufox'} EngineType */

export class EngineManager {
  /**
   * @param {EngineType} engine
   */
  constructor(engine = 'chromium') {
    this.engine = engine;
  }

  /**
   * @param {string | null | undefined} raw
   * @returns {EngineType}
   */
  static resolveEngineType(raw) {
    if (!raw) return 'chromium';
    const normalized = String(raw).trim().toLowerCase();
    if (normalized === 'camoufox' || normalized === 'firefox') return 'camoufox';
    return 'chromium';
  }

  /**
   * @returns {Promise<string | null>}
   */
  static async getCamoufoxPath() {
    try {
      // NOTE: 这里不能直接依赖 dist/modules 下的运行时（避免 scripts 直接跑时报错）。
      // Camoufox 本体由 npm 包提供。
      const camoufox = await import('camoufox');
      const launchPath = camoufox.getLaunchPath?.();
      if (launchPath) {
        logDebug('engine-manager', 'camoufox:found', { path: launchPath });
        return launchPath;
      }
      logDebug('engine-manager', 'camoufox:missing-launch-path', { keys: Object.keys(camoufox || {}) });
    } catch (err) {
      // dist 运行时未就绪时，不让这里成为 hard crash
      try {
        logDebug('engine-manager', 'camoufox:not-found', { error: err?.message || String(err) });
      } catch {
        // ignore
      }
    }
    return null;
  }

  /**
   * @param {{
   *  engine?: EngineType;
   *  headless?: boolean;
   *  profileDir: string;
   *  fingerprint?: any;
   *  viewport?: { width: number; height: number };
   *  locale?: string;
   *  timezoneId?: string;
   * }} options
   */
  async launchPersistentContext(options) {
    const {
      engine = this.engine,
      headless = false,
      profileDir,
      fingerprint,
      viewport = { width: 1440, height: 900 },
      locale = 'zh-CN',
      timezoneId = 'Asia/Shanghai',
    } = options;

    logDebug('engine-manager', 'launch:start', {
      engine,
      profileId: path.basename(profileDir),
      hasFingerprint: !!fingerprint,
    });

    const launchOpts = {
      headless,
      viewport: fingerprint?.viewport || viewport,
      userAgent: fingerprint?.userAgent,
      acceptDownloads: false,
      bypassCSP: false,
      locale,
      timezoneId: fingerprint?.timezoneId || timezoneId,
    };

    if (engine === 'camoufox') {
      return this.launchCamoufoxContext(profileDir, launchOpts);
    }

    return chromium.launchPersistentContext(profileDir, launchOpts);
  }

  /**
   * @param {string} profileDir
   * @param {any} launchOpts
   */
  async launchCamoufoxContext(profileDir, launchOpts) {
    const camoufoxPath = await EngineManager.getCamoufoxPath();
    if (!camoufoxPath) {
      throw new Error('camoufox_not_found');
    }

    const camoufox = await import('camoufox');
    const Camoufox = camoufox.Camoufox;
    if (!Camoufox?.launch) {
      throw new Error('camoufox_invalid_api');
    }

    const defaults = (camoufox.launchOptions && camoufox.launchOptions()) || {};

    // Camoufox 使用的是 Firefox 内核：这里尽量透传通用参数。
    // 具体参数差异由 camoufox 包内部适配。
    const opts = {
      ...defaults,
      headless: !!launchOpts.headless,
      userDataDir: profileDir,
      viewport: launchOpts.viewport,
      locale: launchOpts.locale,
      timezone: launchOpts.timezoneId,
      userAgent: launchOpts.userAgent,
      humanize: true,
      images: true,
    };

    logDebug('engine-manager', 'camoufox:launch', {
      profileId: path.basename(profileDir),
      headless: !!opts.headless,
    });

    const browser = await Camoufox.launch(opts);
    const context = await browser.newContext();
    return context;
  }
}

export default EngineManager;
