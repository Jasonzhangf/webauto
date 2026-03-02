import type { Page } from 'playwright';
import { ensurePageRuntime } from '../pageRuntime.js';
import { normalizeUrl, resolveNavigationWaitUntil } from './utils.js';

export interface NavigationDeps {
  ensurePrimaryPage: () => Promise<Page>;
  getActivePage: () => Page | null;
  recordLastKnownUrl: (url: string | null) => void;
  getLastKnownUrl: () => string | null;
}

export class BrowserSessionNavigation {
  constructor(private deps: NavigationDeps) {}

  async goto(url: string): Promise<void> {
    const page = await this.deps.ensurePrimaryPage();
    await page.goto(url, { waitUntil: resolveNavigationWaitUntil() });
    await ensurePageRuntime(page);
    this.deps.recordLastKnownUrl(url);
  }

  async goBack(): Promise<{ ok: boolean; url: string }> {
    const page = await this.deps.ensurePrimaryPage();
    const waitUntil = resolveNavigationWaitUntil();
    try {
      const res = await page.goBack({ waitUntil }).catch((): null => null);
      await ensurePageRuntime(page, true).catch(() => {});
      this.deps.recordLastKnownUrl(page.url());
      return { ok: Boolean(res), url: page.url() };
    } catch {
      await ensurePageRuntime(page, true).catch(() => {});
      this.deps.recordLastKnownUrl(page.url());
      return { ok: false, url: page.url() };
    }
  }

  getCurrentUrl(): string | null {
    const page = this.deps.getActivePage();
    if (page) return page.url() || this.deps.getLastKnownUrl();
    return this.deps.getLastKnownUrl();
  }

  normalizeUrl(raw: string): string {
    return normalizeUrl(raw);
  }
}
