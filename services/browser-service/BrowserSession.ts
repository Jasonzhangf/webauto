import fs from 'fs';
import path from 'path';
import os from 'os';
import { chromium, BrowserContext, Page, Browser } from 'playwright';
import { ProfileLock } from './ProfileLock.js';

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
  private cookieDir: string;
  private lastKnownUrl: string | null = null;

  onExit?: (profileId: string) => void;
  private exitNotified = false;

  constructor(private options: BrowserSessionOptions) {
    const profileId = options.profileId || 'default';
    const root = path.join(os.homedir(), '.webauto', 'profiles');
    this.profileDir = path.join(root, profileId);
    fs.mkdirSync(this.profileDir, { recursive: true });
    this.lock = new ProfileLock(profileId);
    const cookieRoot = path.join(os.homedir(), '.webauto', 'cookies');
    fs.mkdirSync(cookieRoot, { recursive: true });
    this.cookieDir = cookieRoot;
  }

  get id(): string {
    return this.options.profileId;
  }

  get currentPage(): Page | undefined {
    return this.page;
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
      await this.seedCookiesForUrl(initialUrl);
      await this.goto(initialUrl);
    }
  }

  private setupPageHooks(page: Page) {
    page.on('load', async () => {
      try {
        await this.persistCookieSnapshot(page.url());
      } catch (err) {
        console.warn('[BrowserSession] save cookies failed:', err);
      }
    });
  }

  async saveCookiesForActivePage(): Promise<void> {
    if (this.page) {
      await this.persistCookieSnapshot(this.page.url());
    }
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

  async injectCookiesFromFile(filePath: string): Promise<{ count: number }> {
    if (!this.context) throw new Error('context not ready');
    const raw = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
    const cookies = Array.isArray(raw) ? raw : Array.isArray(raw?.cookies) ? raw.cookies : [];
    if (!cookies.length) return { count: 0 };
    await this.context.addCookies(cookies);
    return { count: cookies.length };
  }

  async goto(url: string): Promise<void> {
    if (!this.page) throw new Error('page not ready');
    await this.seedCookiesForUrl(url);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    this.lastKnownUrl = url;
  }

  async screenshot(fullPage = true) {
    if (!this.page) throw new Error('page not ready');
    return this.page.screenshot({ fullPage });
  }

  getCurrentUrl(): string | null {
    if (this.page) {
      return this.page.url() || this.lastKnownUrl;
    }
    return this.lastKnownUrl;
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

  private async seedCookiesForUrl(url?: string) {
    if (!this.context || !url) return;
    const host = this.getHost(url);
    if (!host) return;
    const candidate = [
      path.join(this.cookieDir, `${host}.json`),
      path.join(this.cookieDir, `${this.etld(host)}.json`),
    ];
    for (const file of candidate) {
      if (!file) continue;
      if (!fs.existsSync(file)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const cookies = Array.isArray(raw) ? raw : raw?.cookies || [];
        if (!Array.isArray(cookies) || cookies.length === 0) continue;
        await this.context.addCookies(cookies);
        return;
      } catch {
        // ignore
      }
    }
  }

  private async persistCookieSnapshot(url?: string) {
    if (!this.context || !url) return;
    const host = this.getHost(url);
    if (!host) return;
    this.lastKnownUrl = url;
    const cookies = await this.context.cookies();
    const payload = {
      timestamp: Date.now(),
      url,
      cookies,
    };
    const file = path.join(this.cookieDir, `${host}.json`);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private getHost(url?: string): string | null {
    if (!url) return null;
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private etld(host: string | null) {
    if (!host) return '';
    const parts = host.split('.').filter(Boolean);
    if (parts.length >= 2) return parts.slice(-2).join('.');
    return host;
  }
}
