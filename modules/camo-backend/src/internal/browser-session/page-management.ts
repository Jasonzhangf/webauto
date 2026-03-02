import { spawnSync } from 'node:child_process';
import type { BrowserContext, Page } from 'playwright';
import { ensurePageRuntime } from '../pageRuntime.js';
import { resolveNavigationWaitUntil, normalizeUrl } from './utils.js';

export interface PageManagementDeps {
  ensureContext: () => BrowserContext;
  getActivePage: () => Page | null;
  getCurrentUrl: () => string | null;
  setActivePage: (page: Page | undefined) => void;
  setupPageHooks: (page: Page) => void;
  ensurePageViewport: (page: Page) => Promise<void>;
  maybeCenterPage: (page: Page, viewport: { width: number; height: number }) => Promise<void>;
  recordLastKnownUrl: (url: string | null) => void;
  isHeadless: () => boolean;
}

export class BrowserSessionPageManagement {
  constructor(private deps: PageManagementDeps) {}

  private tryOsNewTabShortcut(): boolean {
    if (this.deps.isHeadless()) return false;
    if (process.platform === 'darwin') {
      const res = spawnSync(
        'osascript',
        ['-e', 'tell application "System Events" to keystroke "t" using command down'],
        { windowsHide: true },
      );
      return res.status === 0;
    }
    if (process.platform === 'win32') {
      const script = 'Add-Type -AssemblyName System.Windows.Forms; $ws = New-Object -ComObject WScript.Shell; $ws.SendKeys("^t");';
      const res = spawnSync('powershell', ['-NoProfile', '-Command', script], { windowsHide: true });
      return res.status === 0;
    }
    return false;
  }

  async ensurePrimaryPage(): Promise<Page> {
    const ctx = this.deps.ensureContext();
    const existing = this.deps.getActivePage();
    if (existing) {
      try {
        await this.deps.ensurePageViewport(existing);
      } catch {
        /* ignore */
      }
      return existing;
    }
    const page = await ctx.newPage();
    this.deps.setActivePage(page);
    this.deps.setupPageHooks(page);
    try {
      await this.deps.ensurePageViewport(page);
    } catch {
      /* ignore */
    }
    return page;
  }

  async ensurePage(url?: string): Promise<Page> {
    let page = await this.ensurePrimaryPage();
    if (url) {
      const current = this.deps.getCurrentUrl() || page.url();
      if (!current || normalizeUrl(current) !== normalizeUrl(url)) {
        await page.goto(url, { waitUntil: resolveNavigationWaitUntil() });
        await ensurePageRuntime(page);
        this.deps.recordLastKnownUrl(url);
        page = await this.ensurePrimaryPage();
      }
    }
    return page;
  }

  listPages(): { index: number; url: string; active: boolean }[] {
    const ctx = this.deps.ensureContext();
    const pages = ctx.pages().filter((p) => !p.isClosed());
    const active = this.deps.getActivePage();
    return pages.map((p, index) => ({
      index,
      url: p.url(),
      active: active === p,
    }));
  }

  async newPage(url?: string, options: { strictShortcut?: boolean } = {}): Promise<{ index: number; url: string }> {
    const ctx = this.deps.ensureContext();
    const isMac = process.platform === 'darwin';
    const shortcut = isMac ? 'Meta+t' : 'Control+t';
    let page: Page | null = null;

    const opener = this.deps.getActivePage() || ctx.pages()[0];
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
      const waitPage = ctx.waitForEvent('page', { timeout: 8000 }).catch((): any => null);
      const osShortcutOk = this.tryOsNewTabShortcut();
      if (osShortcutOk) {
        page = await waitPage;
      }
      const pagesNow = ctx.pages().filter((p) => !p.isClosed());
      after = pagesNow.length;
      if (!page && after > before) {
        page = pagesNow[pagesNow.length - 1] || null;
      }
    }

    if (!page || after <= before) {
      if (!options?.strictShortcut) {
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
    }

    if (!page || after <= before) {
      throw new Error('new_tab_failed');
    }

    this.deps.setupPageHooks(page);
    this.deps.setActivePage(page);
    try {
      await this.deps.ensurePageViewport(page);
    } catch {
      /* ignore */
    }
    try {
      await this.deps.maybeCenterPage(page, { width: 1920, height: 1080 });
    } catch {
      /* ignore */
    }
    try {
      await page.bringToFront();
    } catch {
      /* ignore */
    }
    if (url) {
      await page.goto(url, { waitUntil: resolveNavigationWaitUntil() });
      await ensurePageRuntime(page);
      this.deps.recordLastKnownUrl(url);
    }
    const pages = ctx.pages().filter((p) => !p.isClosed());
    return { index: Math.max(0, pages.indexOf(page)), url: page.url() };
  }

  async switchPage(index: number): Promise<{ index: number; url: string }> {
    const ctx = this.deps.ensureContext();
    const pages = ctx.pages().filter((p) => !p.isClosed());
    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= pages.length) {
      throw new Error(`invalid_page_index: ${index}`);
    }
    const page = pages[idx];
    this.deps.setActivePage(page);
    try {
      await this.deps.ensurePageViewport(page);
    } catch {
      /* ignore */
    }
    try {
      await page.bringToFront();
    } catch {
      /* ignore */
    }
    await ensurePageRuntime(page, true).catch(() => {});
    this.deps.recordLastKnownUrl(page.url());
    return { index: idx, url: page.url() };
  }

  async closePage(index?: number): Promise<{ closedIndex: number; activeIndex: number; total: number }> {
    const ctx = this.deps.ensureContext();
    const pages = ctx.pages().filter((p) => !p.isClosed());
    if (pages.length === 0) {
      return { closedIndex: -1, activeIndex: -1, total: 0 };
    }
    const active = this.deps.getActivePage();
    const requested = typeof index === 'number' && Number.isFinite(index) ? index : null;
    const closedIndex = requested !== null ? requested : Math.max(0, pages.findIndex((p) => p === active));
    if (closedIndex < 0 || closedIndex >= pages.length) {
      throw new Error(`invalid_page_index: ${index}`);
    }
    const page = pages[closedIndex];
    await page.close().catch(() => {});

    const remaining = ctx.pages().filter((p) => !p.isClosed());
    const nextIndex = remaining.length === 0 ? -1 : Math.min(Math.max(0, closedIndex - 1), remaining.length - 1);
    if (nextIndex >= 0) {
      const nextPage = remaining[nextIndex];
      this.deps.setActivePage(nextPage);
      try {
        await nextPage.bringToFront();
      } catch {
        /* ignore */
      }
      await ensurePageRuntime(nextPage, true).catch(() => {});
      this.deps.recordLastKnownUrl(nextPage.url());
    } else {
      this.deps.setActivePage(undefined);
    }
    return { closedIndex, activeIndex: nextIndex, total: remaining.length };
  }
}
