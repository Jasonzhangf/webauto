import { Page } from 'playwright';
import { resolveNavigationWaitUntil } from './utils.js';

export class BrowserSessionNavigation {
  private lastKnownUrl: string | null = null;

  constructor(private ensurePrimaryPage: () => Promise<Page>) {}

  async goto(url: string): Promise<void> {
    const page = await this.ensurePrimaryPage();
    await page.goto(url, { waitUntil: resolveNavigationWaitUntil() });
    this.lastKnownUrl = url;
  }

  async goBack(): Promise<{ ok: boolean; url: string }> {
    const page = await this.ensurePrimaryPage();
    try {
      await page.goBack({ waitUntil: resolveNavigationWaitUntil() });
      this.lastKnownUrl = page.url();
      return { ok: true, url: this.lastKnownUrl };
    } catch {
      return { ok: false, url: this.lastKnownUrl || '' };
    }
  }

  getCurrentUrl(): string | null {
    const page = this.ensurePrimaryPageSync?.();
    if (page) return page.url() || this.lastKnownUrl;
    return this.lastKnownUrl;
  }

  private ensurePrimaryPageSync?: () => Page | null;

  setEnsurePrimaryPageSync(fn: () => Page | null) {
    this.ensurePrimaryPageSync = fn;
  }

  normalizeUrl(raw: string): string {
    try {
      const url = new URL(raw);
      return `${url.origin}${url.pathname}`;
    } catch {
      return raw;
    }
  }
}
