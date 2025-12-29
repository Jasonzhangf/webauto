import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import { chromium, BrowserContext, Page, Browser } from 'playwright';
import { ProfileLock } from './ProfileLock.js';
import { ensurePageRuntime } from './pageRuntime.js';

export interface BrowserSessionOptions {
  profileId: string;
  sessionName?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
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

  onExit?: (profileId: string) => void;
  private exitNotified = false;

  constructor(private options: BrowserSessionOptions) {
    const profileId = options.profileId || 'default';
    const root = path.join(os.homedir(), '.webauto', 'profiles');
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

    const viewport = this.options.viewport || { width: 1440, height: 900 };
    const userAgent = this.options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    this.context = await chromium.launchPersistentContext(this.profileDir, {
      headless: !!this.options.headless,
      viewport,
      userAgent,
      acceptDownloads: false,
      bypassCSP: false,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
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
    const cookieDir = path.join(os.homedir(), '.webauto', 'cookies');
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
