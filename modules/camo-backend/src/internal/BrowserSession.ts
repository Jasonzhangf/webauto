import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import type { BrowserContext, Page, Browser } from 'playwright';
import { ProfileLock } from './ProfileLock.js';
import { ensurePageRuntime } from './pageRuntime.js';
import { logDebug } from '../../../../modules/logging/src/index.js';
import { getStateBus } from './state-bus.js';
import { loadOrGenerateFingerprint, applyFingerprint } from './fingerprint.js';
import { launchEngineContext } from './engine-manager.js';
import { resolveCookiesRoot, resolveProfilesRoot } from './storage-paths.js';

const stateBus = getStateBus();

export interface BrowserSessionOptions {
  profileId: string;
  sessionName?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  engine?: 'camoufox' | null;
  fingerprintPlatform?: 'windows' | 'macos' | null;
}

export class BrowserSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private lock: ProfileLock;
  private profileDir: string;
  private lastKnownUrl: string | null = null;
  private mode: 'dev' | 'run' = 'dev';
  private lastCookieSignature: string | null = null;
  private lastCookieSaveTs = 0;
  private runtimeObservers = new Set<(event: any) => void>();
  private bridgedPages = new WeakSet<Page>();
  private lastViewport: { width: number; height: number } | null = null;
  private fingerprint: any = null;

  onExit?: (profileId: string) => void;
  private exitNotified = false;

  constructor(private options: BrowserSessionOptions) {
    const profileId = options.profileId || 'default';
    const root = resolveProfilesRoot();
    this.profileDir = path.join(root, profileId);
    fs.mkdirSync(this.profileDir, { recursive: true });
    this.lock = new ProfileLock(profileId);
    
  }

  get id(): string {
    return this.options.profileId;
  }

  get currentPage(): Page | undefined {
    return this.page;
  }

  get modeName(): 'dev' | 'run' {
    return this.mode;
  }

  setMode(next: string = 'dev') {
    this.mode = next === 'run' ? 'run' : 'dev';
  }

  getInfo() {
    return {
      session_id: this.options.profileId,
      profileId: this.options.profileId,
      current_url: this.getCurrentUrl(),
      mode: this.mode,
      headless: !!this.options.headless,
    };
  }

  async start(initialUrl?: string): Promise<void> {
    if (!this.lock.acquire()) {
      throw new Error(`无法获取 profile ${this.options.profileId} 的锁`);
    }

    const engine = 'camoufox';

    // 加载或生成指纹（支持 Win/Mac 随机）
    const fingerprint = await loadOrGenerateFingerprint(this.options.profileId, {
      platform: this.options.fingerprintPlatform || null,
    });
    this.fingerprint = fingerprint;
    
    logDebug('browser-service', 'session:fingerprint', {
      profileId: this.options.profileId,
      platform: fingerprint.platform,
      userAgent: fingerprint.userAgent?.substring(0, 50) + '...',
    });

    const viewport = this.options.viewport || { width: 3840, height: 2046 };
    const deviceScaleFactor = this.resolveDeviceScaleFactor();

    // 使用 EngineManager 启动上下文（Chromium 已移除，仅支持 Camoufox）
    this.context = await launchEngineContext({
      engine,
      headless: !!this.options.headless,
      profileDir: this.profileDir,
      viewport: fingerprint?.viewport || viewport,
      userAgent: fingerprint?.userAgent,
      locale: 'zh-CN',
      timezoneId: fingerprint?.timezoneId || 'Asia/Shanghai',
    });

    // 应用指纹到上下文（Playwright JS 注入）
    await applyFingerprint(this.context, fingerprint);

    // NOTE: deviceScaleFactor override was Chromium-only (CDP). Chromium removed.

    this.lastViewport = { width: viewport.width, height: viewport.height };
    this.browser = this.context.browser();
    this.browser.on('disconnected', () => this.notifyExit());
    this.context.on('close', () => this.notifyExit());

    const existing = this.context.pages();
    this.page = existing.length ? existing[0] : await this.context.newPage();

    this.setupPageHooks(this.page);
    this.context.on('page', (p) => this.setupPageHooks(p));

    if (initialUrl) {
      await this.goto(initialUrl);
    }
  }

  private setupPageHooks(page: Page) {
    const profileTag = `[session:${this.options.profileId}]`;
    const ensure = (reason: string) => {
      ensurePageRuntime(page, true).catch((err) => {
        console.warn(`${profileTag} ensure runtime failed (${reason})`, err?.message || err);
      });
    };
    this.bindRuntimeBridge(page);
    page.on('domcontentloaded', () => ensure('domcontentloaded'));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        ensure('framenavigated');
      }
    });
    page.on('pageerror', (error) => {
      console.warn(`${profileTag} pageerror`, error?.message || error);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.warn(`${profileTag} console.error`, msg.text());
      }
    });

    ensure('initial');
  }

  addRuntimeEventObserver(observer: (event: any) => void): () => void {
    this.runtimeObservers.add(observer);
    logDebug('browser-service', 'runtimeObserver:add', { sessionId: this.id, total: this.runtimeObservers.size });
    return () => {
      this.runtimeObservers.delete(observer);
      logDebug('browser-service', 'runtimeObserver:remove', { sessionId: this.id, total: this.runtimeObservers.size });
    };
  }

  private emitRuntimeEvent(event: any) {
    const payload = {
      ts: Date.now(),
      sessionId: this.id,
      ...event,
    };
    logDebug('browser-service', 'runtimeEvent', {
      sessionId: this.id,
      type: event?.type || 'unknown',
      observers: this.runtimeObservers.size,
    });
    this.runtimeObservers.forEach((observer) => {
      try {
        observer(payload);
      } catch (err) {
        console.warn('[BrowserSession] runtime observer error', err);
      }
    });
    this.publishRuntimeState(payload);
  }

  private publishRuntimeState(payload: any) {
    try {
      stateBus.setState(`browser-session:${this.id}`, {
        status: 'running',
        lastRuntimeEvent: payload?.type || 'unknown',
        lastUrl: payload?.pageUrl || this.getCurrentUrl(),
        lastUpdate: payload?.ts || Date.now(),
      });
      stateBus.publish('browser.runtime.event', payload);
    } catch (err) {
      logDebug('browser-service', 'runtimeEvent:stateBus:error', {
        sessionId: this.id,
        error: (err as Error)?.message || err,
      });
    }
  }

  private bindRuntimeBridge(page: Page) {
    if (this.bridgedPages.has(page)) return;
    this.bridgedPages.add(page);
    page.exposeFunction('webauto_dispatch', (evt: any) => {
      this.emitRuntimeEvent({
        ...evt,
        pageUrl: page.url(),
      });
    }).catch((err) => {
      console.warn(`[session:${this.id}] failed to expose webauto_dispatch`, err?.message || err);
    });
  }

  private getActivePage(): Page | null {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }
    if (!this.context) return null;
    const alive = this.context.pages().find((p) => !p.isClosed());
    if (alive) {
      this.page = alive;
      return alive;
    }
    this.page = undefined;
    return null;
  }

  private resolveDeviceScaleFactor(): number | null {
    const raw = String(process.env.WEBAUTO_DEVICE_SCALE || '').trim();
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    if (os.platform() === 'win32' && this.options.profileId?.startsWith('xiaohongshu_')) {
      return 1;
    }
    return null;
  }

  private async syncDeviceScaleFactor(page: Page, viewport: { width: number; height: number }): Promise<void> {
    if (String(this.options.engine ?? 'camoufox') !== 'chromium') return;
    const desired = this.resolveDeviceScaleFactor();
    if (!desired || !this.context) return;
    try {
      const client = await this.context.newCDPSession(page);
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: desired,
        mobile: false,
        scale: 1,
      });
    } catch (error: any) {
      console.warn(`[browser-session] sync device scale failed: ${error?.message || String(error)}`);
    }
  }

  private async ensurePageViewport(page: Page): Promise<void> {
    if (!this.lastViewport) return;
    const current = page.viewportSize();
    if (current && current.width === this.lastViewport.width && current.height === this.lastViewport.height) {
      return;
    }
    await page.setViewportSize({
      width: this.lastViewport.width,
      height: this.lastViewport.height,
    });
    await this.syncWindowBounds(page, { ...this.lastViewport });
    await this.syncDeviceScaleFactor(page, { ...this.lastViewport });
  }

  private ensureContext(): BrowserContext {
    if (!this.context) {
      throw new Error('browser context not ready');
    }
    return this.context;
  }

  private async ensurePrimaryPage(): Promise<Page> {
    const ctx = this.ensureContext();
    const existing = this.getActivePage();
    if (existing) {
      return existing;
    }
    this.page = await ctx.newPage();
    this.setupPageHooks(this.page);
    try {
      await this.ensurePageViewport(this.page);
    } catch {
      /* ignore */
    }
    return this.page;
  }

  async ensurePage(url?: string): Promise<Page> {
    let page = await this.ensurePrimaryPage();
    if (url) {
      const current = this.getCurrentUrl();
      if (!current || this.normalizeUrl(current) !== this.normalizeUrl(url)) {
        await this.goto(url);
        page = await this.ensurePrimaryPage();
      }
    }
    return page;
  }

  async goBack(): Promise<{ ok: boolean; url: string }> {
    const page = await this.ensurePrimaryPage();
    try {
      const res = await page
        .goBack({ waitUntil: 'domcontentloaded' })
        .catch((): null => null);
      await ensurePageRuntime(page, true).catch(() => {});
      this.lastKnownUrl = page.url();
      return { ok: Boolean(res), url: page.url() };
    } catch {
      await ensurePageRuntime(page, true).catch(() => {});
      this.lastKnownUrl = page.url();
      return { ok: false, url: page.url() };
    }
  }

  listPages(): { index: number; url: string; active: boolean }[] {
    if (!this.context) return [];
    const pages = this.context.pages().filter((p) => !p.isClosed());
    const active = this.getActivePage();
    return pages.map((p, index) => ({
      index,
      url: p.url(),
      active: active === p,
    }));
  }

  async newPage(url?: string): Promise<{ index: number; url: string }> {
    const ctx = this.ensureContext();
    const isMac = process.platform === 'darwin';
    const shortcut = isMac ? 'Meta+t' : 'Control+t';
    let page = null;

    // Strictly use keyboard shortcut to create a new tab in the same window
    const opener = this.page || ctx.pages()[0];
    if (!opener) throw new Error('no_opener_page');

    await opener.bringToFront().catch((): any => null);
    const before = ctx.pages().filter((p) => !p.isClosed()).length;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const waitPage = ctx.waitForEvent('page', { timeout: 8000 }).catch((): any => null);
      await opener.keyboard.press(shortcut).catch((): any => null);
      page = await waitPage;

      const pagesNow = ctx.pages().filter((p) => !p.isClosed());
      const after = pagesNow.length;
      if (page && after > before) break;
      if (!page && after > before) {
        page = pagesNow[pagesNow.length - 1] || null;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    let after = ctx.pages().filter((p) => !p.isClosed()).length;
    if (!page || after <= before) {
      try {
        page = await ctx.newPage();
        await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch((): any => null);
      } catch {
        // ignore fallback errors
      }
      after = ctx.pages().filter((p) => !p.isClosed()).length;
      if (!page && after > before) {
        const pagesNow = ctx.pages().filter((p) => !p.isClosed());
        page = pagesNow[pagesNow.length - 1] || null;
      }
    }
    if (!page || after <= before) {
      throw new Error('new_tab_failed');
    }

    this.setupPageHooks(page);
    this.page = page;
    try {
      await this.ensurePageViewport(page);
    } catch {
      /* ignore */
    }
    try {
      await this.maybeCenterWindow(page, this.lastViewport || { width: 1920, height: 1080 });
    } catch {
      /* ignore */
    }
    try {
      await page.bringToFront();
    } catch {
      /* ignore */
    }
    if (url) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await ensurePageRuntime(page);
      this.lastKnownUrl = url;
    }
    const pages = ctx.pages().filter((p) => !p.isClosed());
    return { index: Math.max(0, pages.indexOf(page)), url: page.url() };
  }

  async switchPage(index: number): Promise<{ index: number; url: string }> {
    const ctx = this.ensureContext();
    const pages = ctx.pages().filter((p) => !p.isClosed());
    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= pages.length) {
      throw new Error(`invalid_page_index: ${index}`);
    }
    const page = pages[idx];
    this.page = page;
    try {
      await this.ensurePageViewport(page);
    } catch {
      /* ignore */
    }
    try {
      await page.bringToFront();
    } catch {
      /* ignore */
    }
    await ensurePageRuntime(page, true).catch(() => {});
    this.lastKnownUrl = page.url();
    return { index: idx, url: page.url() };
  }

  async closePage(index?: number): Promise<{ closedIndex: number; activeIndex: number; total: number }> {
    const ctx = this.ensureContext();
    const pages = ctx.pages().filter((p) => !p.isClosed());
    if (pages.length === 0) {
      return { closedIndex: -1, activeIndex: -1, total: 0 };
    }
    const active = this.getActivePage();
    const requested = typeof index === 'number' && Number.isFinite(index) ? index : null;
    const closedIndex =
      requested !== null ? requested : Math.max(0, pages.findIndex((p) => p === active));
    if (closedIndex < 0 || closedIndex >= pages.length) {
      throw new Error(`invalid_page_index: ${index}`);
    }
    const page = pages[closedIndex];
    await page.close().catch(() => {});

    const remaining = ctx.pages().filter((p) => !p.isClosed());
    const nextIndex = remaining.length === 0 ? -1 : Math.min(Math.max(0, closedIndex - 1), remaining.length - 1);
    if (nextIndex >= 0) {
      const nextPage = remaining[nextIndex];
      this.page = nextPage;
      try {
        await nextPage.bringToFront();
      } catch {
        /* ignore */
      }
      await ensurePageRuntime(nextPage, true).catch(() => {});
      this.lastKnownUrl = nextPage.url();
    } else {
      this.page = undefined;
    }
    return { closedIndex, activeIndex: nextIndex, total: remaining.length };
  }

  async saveCookiesForActivePage(): Promise<{ path: string; count: number }[]> {
    if (!this.context) return [];
    const page = this.getActivePage();
    if (!page) return [];
    const cookies = await this.context.cookies();
    if (!cookies.length) return [];

    const digest = this.hashCookies(cookies);
    const now = Date.now();
    if (digest === this.lastCookieSignature && now - this.lastCookieSaveTs < 2000) {
      return [];
    }

    const targets = this.resolveCookieTargets(page.url());
    if (!targets.length) return [];

    const payload = JSON.stringify(
      {
        timestamp: now,
        profileId: this.options.profileId,
        url: page.url(),
        cookies,
      },
      null,
      2,
    );
    const results: { path: string; count: number }[] = [];
    for (const target of targets) {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, payload, 'utf-8');
      results.push({ path: target, count: cookies.length });
    }

    this.lastCookieSignature = digest;
    this.lastCookieSaveTs = now;
    return results;
  }

  async getCookies(): Promise<any[]> {
    if (!this.context) return [];
    return this.context.cookies();
  }

  async saveCookiesToFile(filePath: string): Promise<{ path: string; count: number }> {
    const cookies = await this.getCookies();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify({ timestamp: Date.now(), cookies }, null, 2), 'utf-8');
    return { path: filePath, count: cookies.length };
  }

  async saveCookiesIfStable(filePath: string, opts: { minDelayMs?: number } = {}): Promise<{ path: string; count: number } | null> {
    const minDelayMs = Math.max(1000, Number(opts.minDelayMs) || 2000);
    const page = this.getActivePage();
    if (!page) return null;
    const html = await page.content();
    const isLoggedIn = html.includes('Frame_wrap_') && !html.includes('LoginCard') && !html.includes('passport');
    if (!isLoggedIn) return null;
    const cookies = await this.getCookies();
    if (!cookies.length) return null;
    const digest = this.hashCookies(cookies);
    const now = Date.now();
    if (digest === this.lastCookieSignature && now - this.lastCookieSaveTs < minDelayMs) {
      return null;
    }
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify({ timestamp: now, cookies }, null, 2), 'utf-8');
    this.lastCookieSignature = digest;
    this.lastCookieSaveTs = now;
    return { path: filePath, count: cookies.length };
  }

  async injectCookiesFromFile(filePath: string): Promise<{ count: number }> {
    if (!this.context) throw new Error('context not ready');
    const raw = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
    const cookies = Array.isArray(raw) ? raw : Array.isArray(raw?.cookies) ? raw.cookies : [];
    if (!cookies.length) return { count: 0 };
    await this.context.addCookies(cookies);
    return { count: cookies.length };
  }

  async goto(url: string): Promise<void> {
    const page = await this.ensurePrimaryPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await ensurePageRuntime(page);
    this.lastKnownUrl = url;
  }

  async screenshot(fullPage = true) {
    const page = await this.ensurePrimaryPage();
    return page.screenshot({ fullPage });
  }

  async click(selector: string): Promise<void> {
    const page = await this.ensurePrimaryPage();
    await page.click(selector, { timeout: 20000 });
  }

  async fill(selector: string, text: string): Promise<void> {
    const page = await this.ensurePrimaryPage();
    await page.fill(selector, text, { timeout: 20000 });
  }

  private async ensureInputReady(page: Page): Promise<void> {
    if (this.options.headless) return;
    if (os.platform() !== 'win32') return;
    let needsFocus = false;
    try {
      const state = await page.evaluate(() => ({
        hasFocus: typeof document?.hasFocus === 'function' ? document.hasFocus() : true,
        hidden: !!document?.hidden,
        visibilityState: String(document?.visibilityState || 'visible'),
      }));
      needsFocus = !state.hasFocus || state.hidden || state.visibilityState !== 'visible';
    } catch {
      // If we cannot read focus state, conservatively try to bring page to front.
      needsFocus = true;
    }
    if (!needsFocus) return;
    try {
      await page.bringToFront();
      await page.waitForTimeout(80);
    } catch {
      // Keep best-effort behavior and do not block input flow on platform quirks.
    }
  }

  /**
   * 基于屏幕坐标的系统级鼠标点击（Playwright 原生）
   * @param opts 屏幕坐标及点击选项
   */
  async mouseClick(opts: { x: number; y: number; button?: 'left' | 'right' | 'middle'; clicks?: number; delay?: number }): Promise<void> {
    const page = await this.ensurePrimaryPage();
    await this.ensureInputReady(page);
    const { x, y, button = 'left', clicks = 1, delay = 50 } = opts;

    // 移动鼠标到目标位置（模拟轨迹）
    await page.mouse.move(x, y, { steps: 3 });

    // 执行点击（支持多次、间隔随机抖动）
    for (let i = 0; i < clicks; i++) {
      if (i > 0) {
        // 多次点击间隔 100-200ms
        await new Promise(r => setTimeout(r, 100 + Math.random() * 100));
      }
      await page.mouse.click(x, y, {
        button,
        clickCount: 1,
        delay // 按键间隔
      });
    }
  }

  /**
   * 基于屏幕坐标的鼠标移动（Playwright 原生）
   * @param opts 目标坐标及移动选项
   */
  async mouseMove(opts: { x: number; y: number; steps?: number }): Promise<void> {
    const page = await this.ensurePrimaryPage();
    await this.ensureInputReady(page);
    const { x, y, steps = 3 } = opts;

    await page.mouse.move(x, y, { steps });
  }

  /**
   * 基于键盘的系统输入（Playwright keyboard）
   */
  async keyboardType(opts: { text: string; delay?: number; submit?: boolean }): Promise<void> {
    const page = await this.ensurePrimaryPage();
    await this.ensureInputReady(page);
    const { text, delay = 80, submit } = opts;

    if (text && text.length > 0) {
      await page.keyboard.type(text, { delay });
    }

    if (submit) {
      await page.keyboard.press('Enter');
    }
  }

  async keyboardPress(opts: { key: string; delay?: number }): Promise<void> {
    const page = await this.ensurePrimaryPage();
    await this.ensureInputReady(page);
    const { key, delay } = opts;
    await page.keyboard.press(key, typeof delay === 'number' ? { delay } : undefined);
  }

  /**
   * 基于鼠标滚轮的系统滚动（Playwright mouse.wheel）
   * @param opts deltaY 为垂直滚动（正=向下，负=向上），deltaX 可选
   */
  async mouseWheel(opts: { deltaY: number; deltaX?: number }): Promise<void> {
    const page = await this.ensurePrimaryPage();
    await this.ensureInputReady(page);
    const { deltaX = 0, deltaY } = opts;
    await page.mouse.wheel(Number(deltaX) || 0, Number(deltaY) || 0);
  }

  private async syncWindowBounds(
    page: Page,
    viewport: { width: number; height: number },
  ): Promise<void> {
    const engine = String(this.options.engine ?? 'camoufox');
    // Log viewport metrics for diagnosis
    try {
      const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth || 0,
        innerHeight: window.innerHeight || 0,
        outerWidth: window.outerWidth || 0,
        outerHeight: window.outerHeight || 0,
        screenX: Math.floor(window.screenX || 0),
        screenY: Math.floor(window.screenY || 0),
        devicePixelRatio: window.devicePixelRatio || 1,
        visualViewport: window.visualViewport ? {
          width: window.visualViewport.width || 0,
          height: window.visualViewport.height || 0,
          offsetLeft: window.visualViewport.offsetLeft || 0,
          offsetTop: window.visualViewport.offsetTop || 0,
          scale: window.visualViewport.scale || 1,
        } : null,
      }));
      console.log(`[viewport-metrics] target=${viewport.width}x${viewport.height} inner=${metrics.innerWidth}x${metrics.innerHeight} outer=${metrics.outerWidth}x${metrics.outerHeight} screen=(${metrics.screenX},${metrics.screenY}) dpr=${metrics.devicePixelRatio} visual=${JSON.stringify(metrics.visualViewport)}`);

      // If inner dimensions don't match target, retry setViewportSize
      const widthDelta = Math.abs(metrics.innerWidth - viewport.width);
      const heightDelta = Math.abs(metrics.innerHeight - viewport.height);
      if (widthDelta > 50 || heightDelta > 50) {
        console.warn(`[viewport-metrics] MISMATCH detected: widthDelta=${widthDelta} heightDelta=${heightDelta}, retrying setViewportSize...`);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(500);
        const retry = await page.evaluate(() => ({
          innerWidth: window.innerWidth || 0,
          innerHeight: window.innerHeight || 0,
        }));
        console.log(`[viewport-metrics] after retry: inner=${retry.innerWidth}x${retry.innerHeight}`);
      }
    } catch (err) {
      console.warn(`[viewport-metrics] log failed: ${err?.message || String(err)}`);
    }

    if (engine !== 'chromium') return;
    if (this.options.headless) return;
    if (!this.context) return;

    try {
      const client = await this.context.newCDPSession(page);
      const { windowId } = await client.send('Browser.getWindowForTarget');
      const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth || 0,
        innerHeight: window.innerHeight || 0,
        outerWidth: window.outerWidth || 0,
        outerHeight: window.outerHeight || 0,
      }));

      const deltaW = Math.max(0, Math.floor((metrics.outerWidth || 0) - (metrics.innerWidth || 0)));
      const deltaH = Math.max(0, Math.floor((metrics.outerHeight || 0) - (metrics.innerHeight || 0)));
      const targetWidth = Math.max(300, Math.floor(Number(viewport.width) + deltaW));
      const targetHeight = Math.max(300, Math.floor(Number(viewport.height) + deltaH));

      await client.send('Browser.setWindowBounds', {
        windowId,
        bounds: { width: targetWidth, height: targetHeight },
      });
    } catch (error: any) {
      console.warn(`[browser-session] sync window bounds failed: ${error?.message || String(error)}`);
    }
  }

  private async maybeCenterWindow(page: Page, viewport: { width: number; height: number }): Promise<void> {
    if (this.options.headless) return;
    try {
      const metrics = await page.evaluate(() => ({
        screenX: Math.floor(window.screenX || 0),
        screenY: Math.floor(window.screenY || 0),
        outerWidth: Math.floor(window.outerWidth || 0),
        outerHeight: Math.floor(window.outerHeight || 0),
        innerWidth: Math.floor(window.innerWidth || 0),
        innerHeight: Math.floor(window.innerHeight || 0),
        screenWidth: Math.floor(window.screen?.availWidth || window.screen?.width || 0),
        screenHeight: Math.floor(window.screen?.availHeight || window.screen?.height || 0),
      }));

      const sw = Math.max(metrics.screenWidth || 0, viewport.width);
      const sh = Math.max(metrics.screenHeight || 0, viewport.height);

      // Try to resize outer window to fit viewport (inner) + chrome delta
      const deltaW = Math.max(0, (metrics.outerWidth || 0) - (metrics.innerWidth || 0));
      const deltaH = Math.max(0, (metrics.outerHeight || 0) - (metrics.innerHeight || 0));
      const targetOuterW = Math.max(viewport.width + deltaW, 300);
      const targetOuterH = Math.max(viewport.height + deltaH, 300);

      await page.evaluate(({w, h}) => { try { window.resizeTo(w, h); } catch {} }, { w: targetOuterW, h: targetOuterH });
      await page.waitForTimeout(200);

      const ow = Math.max(metrics.outerWidth || 0, targetOuterW);
      const oh = Math.max(metrics.outerHeight || 0, targetOuterH);
      const targetX = Math.max(0, Math.floor((sw - ow) / 2));
      const targetY = Math.max(0, Math.floor((sh - oh) / 2));

      // Only move if we're clearly off-center
      if (Math.abs(metrics.screenX - targetX) > 5 || Math.abs(metrics.screenY - targetY) > 5) {
        await page.evaluate(({x, y}) => { try { window.moveTo(x, y); } catch {} }, { x: targetX, y: targetY });
        await page.waitForTimeout(200);
      }
    } catch (err: any) {
      console.warn('[browser-session] maybeCenterWindow failed:', err?.message || String(err));
    }
  }

  async setViewportSize(opts: { width: number; height: number }): Promise<{ width: number; height: number }> {
    const page = await this.ensurePrimaryPage();
    const width = Math.max(800, Math.floor(Number(opts.width) || 0));
    const height = Math.max(700, Math.floor(Number(opts.height) || 0));
    if (!width || !height) {
      throw new Error('invalid_viewport_size');
    }
    await page.setViewportSize({ width, height });
    await this.syncWindowBounds(page, { width, height });
    await this.syncDeviceScaleFactor(page, { width, height });
    await this.maybeCenterWindow(page, { width, height });
    this.lastViewport = { width, height };
    return { width, height };
  }

  async evaluate(expression: string, arg?: any) {
    const page = await this.ensurePrimaryPage();
    if (typeof arg === 'undefined') {
      return page.evaluate(expression);
    }
    return page.evaluate(expression, arg);
  }

  getCurrentUrl(): string | null {
    const page = this.getActivePage();
    if (page) {
      return page.url() || this.lastKnownUrl;
    }
    return this.lastKnownUrl;
  }

  private resolveCookieTargets(currentUrl?: string | null): string[] {
    const cookieDir = resolveCookiesRoot();
    const targets = new Set<string>([path.join(cookieDir, `${this.options.profileId}.json`)]);

    if (currentUrl) {
      try {
        const { hostname } = new URL(currentUrl);
        const hostSegment = this.sanitizeHost(hostname);
        if (hostSegment) {
          targets.add(path.join(cookieDir, `${hostSegment}-latest.json`));
        }
        if (hostname && hostname.includes('weibo')) {
          targets.add(path.join(cookieDir, 'weibo.com-latest.json'));
        }
      } catch {
        targets.add(path.join(cookieDir, 'default-latest.json'));
      }
    }
    return Array.from(targets);
  }

  private sanitizeHost(host?: string | null): string {
    if (!host) return 'default';
    return host.replace(/[^a-z0-9.-]/gi, '_');
  }

  private hashCookies(cookies: any[]): string {
    const normalized = cookies
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
      }))
      .sort((a, b) => {
        if (a.domain === b.domain) {
          if (a.name === b.name) return (a.path || '').localeCompare(b.path || '');
          return a.name.localeCompare(b.name);
        }
        return (a.domain || '').localeCompare(b.domain || '');
      });
    const hash = crypto.createHash('sha1');
    hash.update(JSON.stringify(normalized));
    return hash.digest('hex');
  }

  async close(): Promise<void> {
    try {
      await this.context?.close();
    } finally {
      await this.browser?.close();
      this.lock.release();
      this.runtimeObservers.clear();
      this.notifyExit();
    }
  }

  private notifyExit() {
    if (this.exitNotified) return;
    this.exitNotified = true;
    this.onExit?.(this.options.profileId);
  }

  private normalizeUrl(raw: string) {
    try {
      const url = new URL(raw);
      return `${url.origin}${url.pathname}`;
    } catch {
      return raw;
    }
  }
}
