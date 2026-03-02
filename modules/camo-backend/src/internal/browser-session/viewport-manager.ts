import type { BrowserContext, Page } from 'playwright';
import type { ViewportState } from './viewport.js';
import { ensurePageViewport, refreshViewportFromWindow, setViewportSizeOnPage, maybeCenterWindow } from './viewport.js';

export class BrowserSessionViewportManager {
  private state: ViewportState = { lastViewport: null, followWindowViewport: false };

  constructor(
    private profileId: string,
    private getContext: () => BrowserContext | undefined,
    private getEngine: () => string,
    private isHeadless: () => boolean,
  ) {}

  setInitialViewport(viewport: { width: number; height: number }, followWindowViewport: boolean): void {
    this.state.followWindowViewport = followWindowViewport;
    this.state.lastViewport = followWindowViewport
      ? null
      : { width: viewport.width, height: viewport.height };
  }

  isFollowingWindow(): boolean {
    return this.state.followWindowViewport;
  }

  getLastViewport(): { width: number; height: number } | null {
    return this.state.lastViewport;
  }

  async refreshFromWindow(page: Page): Promise<void> {
    const refreshed = await refreshViewportFromWindow(page).catch((): null => null);
    if (refreshed) {
      this.state.lastViewport = refreshed;
    }
  }

  async ensurePageViewport(page: Page): Promise<void> {
    this.state = await ensurePageViewport(
      page,
      this.state,
      this.getContext(),
      this.getEngine(),
      this.isHeadless(),
    );
  }

  async setViewportSize(page: Page, opts: { width: number; height: number }): Promise<{ width: number; height: number }> {
    const next = await setViewportSizeOnPage(
      page,
      opts,
      this.state,
      this.getContext(),
      this.getEngine(),
      this.isHeadless(),
    );
    this.state.lastViewport = next;
    return next;
  }

  async maybeCenter(page: Page, fallback?: { width: number; height: number }): Promise<void> {
    const target = this.state.lastViewport || fallback;
    if (!target) return;
    await maybeCenterWindow(page, target, this.isHeadless());
  }
}
