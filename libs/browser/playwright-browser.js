/**
 * Playwright 驱动的浏览器封装（ESM 全量）
 * - 仅内部使用 Playwright，不对外暴露底层 API
 * - 提供与 Python 版一致的抽象能力（start/newPage/goto/cookies/auto session）
 */

import { BrowserConfig } from './browser-config.js';
import { BrowserError, BrowserNotStartedError, PageNotCreatedError, NavigationError } from './browser-errors.js';
import { CookieManager } from './cookie-manager.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import {
  generateFingerprint,
  applyFingerprint,
  loadFingerprint,
  saveFingerprint
} from './fingerprint-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class PlaywrightBrowser {
  constructor(config = null, headless = false) {
    this.config = config || BrowserConfig.getDefaultConfig();
    this.config.headless = headless;

    this.profileId = this.config.profileId || 'default';
    this.persistSession = this.config.persistSession !== undefined ? !!this.config.persistSession : true;
    this.profileRoot = this.config.profileRoot || join(homedir(), '.webauto', 'profiles');
    this.profileDir = join(this.profileRoot, this.profileId);
    this.storageStatePath = join(this.profileDir, `session_${this.profileId}.json`);
    this.fingerprintPath = join(this.profileDir, 'fingerprint.json');
    this.lockFilePath = join(this.profileDir, '.lock');

    this.fingerprint = null;
    this.controlMode = 'user';

    this.playwright = null;
    this.browser = null;
    this.context = null;
    this.pages = [];
    this.cookieManager = new CookieManager(this.profileDir);

    this._started = false;
    this.engineInfo = { name: 'playwright/chromium' };
  }

  async start() {
    if (this._started) return;

    await this._acquireProfileLock();

    try {
      const { chromium } = await import('playwright');
      this.playwright = chromium;

      const headless = this.config.headless || false;
      const locale = this.config.locale || 'zh-CN';

      this._ensureProfileDir();
      const launchArgs = Array.isArray(this.config.args) ? this.config.args : [];
      const args = [
        `--lang=${locale}`,
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        ...launchArgs,
      ];
      this.browser = await this.playwright.launch({ headless, args });

      // 指纹
      this.fingerprint = loadFingerprint(this.fingerprintPath) || generateFingerprint(this.profileId);
      saveFingerprint(this.fingerprintPath, this.fingerprint);

      // 上下文
      const ctxOptions = {};
      if (this.config.userAgent) ctxOptions.userAgent = this.config.userAgent;
      if (this.config.viewport) ctxOptions.viewport = this.config.viewport;
      if (this.persistSession && existsSync(this.storageStatePath)) {
        // 验证存储文件完整性
        const validation = await this._validateStorageFile(this.storageStatePath);
        if (validation.valid) {
          ctxOptions.storageState = this.storageStatePath;
        } else {
          console.warn(`存储文件损坏，跳过加载: ${validation.error}`);
        }
      }
      this.context = await this.browser.newContext(ctxOptions);

      await this._setupChineseSupport();
      await this._setupAntiDetection();
      await applyFingerprint(this.context, this.fingerprint);

      if (!headless) await this._ensureWindowVisible();

      this._started = true;
    } catch (error) {
      await this._cleanup();
      await this._releaseProfileLock();
      throw new BrowserError(`浏览器启动失败: ${error.message}`);
    }
  }

  async close() {
    try {
      if (this.persistSession && this.context) {
        this._ensureProfileDir();
        await this._saveOptimizedStorageState();
      }
    } catch (error) {
      console.error('保存存储状态时出错:', error.message);
    } finally {
      await this._cleanup();
      await this._releaseProfileLock();
    }
  }

  async _cleanup() {
    for (const page of this.pages) {
      try { await page.close(); } catch {}
    }
    this.pages = [];
    if (this.context) { try { await this.context.close(); } catch {} this.context = null; }
    if (this.browser) { try { await this.browser.close(); } catch {} this.browser = null; }
    this._started = false;
  }

  async newPage() {
    if (!this._started) throw new BrowserNotStartedError('浏览器未启动');
    try {
      const page = await this.context.newPage();
      this.pages.push(page);
      return page;
    } catch (error) {
      throw new PageNotCreatedError(`页面创建失败: ${error.message}`);
    }
  }

  async goto(url, page = null, waitTime = 3) {
    if (page === null) page = await this.newPage();
    try {
      await page.goto(url);
      await page.waitForTimeout(waitTime * 1000);
      return page;
    } catch (error) {
      throw new NavigationError(`导航到 ${url} 失败: ${error.message}`);
    }
  }

  async _setupChineseSupport() {
    await this.context.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Charset': 'UTF-8'
    });
  }

  async _setupAntiDetection() {
    const antiDetectionScript = `
      try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch {}
      Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
      Object.defineProperty(navigator, 'languages', { value: ['zh-CN','zh','en'], configurable: true });
      try { Object.defineProperty(navigator, 'plugins', { value: [{name:'PDF Viewer'},{name:'Chrome PDF Viewer'}], configurable: true }); } catch {}
      try { Object.defineProperty(navigator, 'mimeTypes', { value: [{type:'application/pdf'}], configurable: true }); } catch {}
      try {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(param){ if(param===0x9245) return 'Google Inc.'; if(param===0x9246) return 'ANGLE (NVIDIA, NVIDIA GeForce, D3D11)'; return getParameter.call(this,param); };
      } catch {}
    `;
    await this.context.addInitScript(antiDetectionScript);
  }

  async _ensureWindowVisible() {
    try {
      if (!this.context) return;
      let pages = this.context.pages();
      if (!pages || pages.length === 0) pages = [await this.context.newPage()];
      try { await pages[0].bringToFront(); } catch {}
    } catch {}
  }

  async quickTest(url = 'https://www.baidu.com', waitTime = 3) {
    const page = await this.goto(url, null, waitTime);
    try {
      const title = await page.title();
      const charset = await page.evaluate(() => document.characterSet);
      const language = await page.evaluate(() => navigator.language);
      console.log('测试成功:', { url, title, charset, language });
    } finally {
      await page.close();
      const i = this.pages.indexOf(page); if (i > -1) this.pages.splice(i, 1);
    }
  }

  async getPageInfo(page) {
    try {
      return {
        url: page.url(),
        title: await page.title(),
        charset: await page.evaluate('document.characterSet'),
        language: await page.evaluate('navigator.language'),
        userAgent: await page.evaluate('navigator.userAgent'),
        hasWebdriver: await page.evaluate('navigator.webdriver !== undefined')
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  isStarted() { return this._started; }
  getPageCount() { return this.pages.length; }

  async loadCookies(cookiePath) { return await this.cookieManager.loadCookies(this.context, cookiePath); }
  async saveCookies(cookiePath) { return await this.cookieManager.saveCookies(this.context, cookiePath); }
  async getCookies() { return await this.context.cookies(); }
  async addCookies(cookies) { await this.context.addCookies(cookies); }

  setControlMode(mode){ if (mode!=='user' && mode!=='remote') throw new Error(`无效的控制模式: ${mode}`); this.controlMode = mode; }
  getControlMode(){ return this.controlMode; }

  _ensureProfileDir(){ if (!existsSync(this.profileRoot)) mkdirSync(this.profileRoot, { recursive: true }); if (!existsSync(this.profileDir)) mkdirSync(this.profileDir, { recursive: true }); }

  async _saveStorageState(){ try { await this.context.storageState({ path: this.storageStatePath }); return true; } catch { return false; } }

  async _validateStorageFile(filePath) {
    try {
      const { readFile } = await import('fs/promises');
      const data = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);

      // 基本结构验证
      if (!parsed || typeof parsed !== 'object') {
        return { valid: false, error: '文件格式无效：不是对象' };
      }

      if (!Array.isArray(parsed.cookies)) {
        return { valid: false, error: '文件格式无效：cookies不是数组' };
      }

      if (!Array.isArray(parsed.origins)) {
        return { valid: false, error: '文件格式无效：origins不是数组' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: `文件解析失败: ${error.message}` };
    }
  }

  async _acquireProfileLock() {
    const { writeFile, readFile } = await import('fs/promises');
    const { existsSync } = await import('fs');

    const maxRetries = 30;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        if (existsSync(this.lockFilePath)) {
          const lockData = await readFile(this.lockFilePath, 'utf8');
          const lock = JSON.parse(lockData);
          const now = Date.now();

          // 检查锁是否过期（5分钟）
          if (now - lock.timestamp > 5 * 60 * 1000) {
            console.warn('发现过期的锁文件，强制释放');
            await this._releaseProfileLock();
          } else {
            console.log(`Profile被占用，等待解锁... (${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        }

        // 创建锁文件
        const lockData = {
          pid: process.pid,
          timestamp: Date.now(),
          hostname: require('os').hostname()
        };

        await writeFile(this.lockFilePath, JSON.stringify(lockData, null, 2));
        return true;
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new BrowserError(`无法获取profile锁: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  async _releaseProfileLock() {
    try {
      const { unlinkSync, existsSync } = await import('fs');
      if (existsSync(this.lockFilePath)) {
        unlinkSync(this.lockFilePath);
      }
    } catch (error) {
      console.warn('释放锁文件失败:', error.message);
    }
  }

  async _isOriginRecentlyAccessed(origin, cutoffTime) {
    // 简化实现：基于文件修改时间判断
    try {
      const { statSync } = await import('fs');
      const stats = statSync(this.storageStatePath);
      return stats.mtime.getTime() > cutoffTime;
    } catch {
      return true; // 如果无法判断，保留数据
    }
  }

  async _saveOptimizedStorageState() {
    try {
      const tempPath = `${this.storageStatePath}.tmp`;
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

      // 获取当前状态
      const currentState = await this.context.storageState();

      // 过滤过期cookies
      const validCookies = currentState.cookies.filter(cookie => {
        if (!cookie.expires) return true; // 会话cookie保留
        return cookie.expires * 1000 > now;
      });

      // 过滤30天前的origin数据
      const recentOrigins = [];
      for (const origin of currentState.origins) {
        if (await this._isOriginRecentlyAccessed(origin.origin, thirtyDaysAgo)) {
          recentOrigins.push(origin);
        }
      }

      const optimizedState = {
        ...currentState,
        cookies: validCookies,
        origins: recentOrigins,
        lastOptimized: now
      };

      // 原子写入：先写临时文件，再重命名
      const { writeFile, rename } = await import('fs/promises');
      await writeFile(tempPath, JSON.stringify(optimizedState, null, 2));

      // 验证写入的文件
      const validation = await this._validateStorageFile(tempPath);
      if (validation.valid) {
        await rename(tempPath, this.storageStatePath);
        console.log(`存储状态已优化并保存: ${validCookies.length} cookies, ${recentOrigins.length} origins`);
        return true;
      } else {
        // 删除临时文件
        const { unlink } = await import('fs/promises');
        await unlink(tempPath);
        throw new Error(`优化后的存储文件验证失败: ${validation.error}`);
      }
    } catch (error) {
      console.error('保存优化存储状态失败:', error.message);
      // fallback到原始方法
      return await this._saveStorageState();
    }
  }
}
