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
  private lastKnownUrl: string | null = null;

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
  }

  async saveCookiesForActivePage(): Promise<void> {
    return;
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

}
