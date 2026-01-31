/**
 * 浏览器引擎管理器
 * - Chromium: Playwright 内置
 * - Camoufox: 通过 camoufox npm 包（Firefox 内核）
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);

let logDebug = () => {};
try {
  // 在服务运行态（dist）可用；在脚本直接跑源码时也不会因为 dist 缺失而崩
  const mod = await import('../../dist/modules/logging/src/index.js');
  logDebug = mod.logDebug || (() => {});
} catch {
  // ignore
}

async function loadCamoufox() {
  try {
    return await import('camoufox');
  } catch (err) {
    try {
      return require('camoufox');
    } catch (err2) {
      throw err2 || err;
    }
  }
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
      const camoufox = await loadCamoufox();
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

    const camoufox = await loadCamoufox();
    const Camoufox = camoufox.Camoufox;
    if (!Camoufox) {
      throw new Error('camoufox_invalid_api');
    }

    // Camoufox JS 直接返回 Browser 对象
    const opts = {
      headless: !!launchOpts.headless,
      os: ['windows', 'macos'],
      window: [launchOpts.viewport.width, launchOpts.viewport.height],
      data_dir: profileDir,
      humanize: true,
      // 字体与语言（防止中文乱码）
      locale: 'zh-CN',
      fonts: [
        // macOS 常见中文字体
        'PingFang SC',
        'Hiragino Sans GB',
        'STHeiti',
        // Windows 常见中文字体
        'Microsoft YaHei',
        'SimHei',
        'SimSun',
        'Microsoft JhengHei',
        // 跨平台字体
        'Noto Sans CJK SC',
        'Source Han Sans SC',
        'Arial Unicode MS',
        'Helvetica',
        'Arial',
        'Sans-Serif',
      ],
      custom_fonts_only: false,
    };

    logDebug('engine-manager', 'camoufox:launch', {
      profileId: path.basename(profileDir),
      headless: !!opts.headless,
      window: opts.window,
    });

    // Camoufox 可能返回 Browser 或 BrowserContext
    const result = await Camoufox(opts);

    // 检查返回类型
    if (result && typeof result.newContext === 'function') {
      return await result.newContext();
    }
    // 如果已经是 Context，直接返回
    if (result && typeof result.pages === 'function') {
      return result;
    }

    throw new Error('camoufox_invalid_response');
  }
}

export default EngineManager;
