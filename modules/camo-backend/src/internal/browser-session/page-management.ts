import { Page, BrowserContext } from 'playwright';

export class BrowserSessionPageManagement {
  private pages: Page[] = [];

  constructor(
    private context: BrowserContext,
    private ensurePrimaryPage: () => Promise<Page>,
  ) {}

  listPages(): { index: number; url: string; active: boolean }[] {
    const all = this.context.pages();
    const primary = this.getActivePage();
    return all.map((page, index) => ({
      index,
      url: page.url(),
      active: page === primary,
    }));
  }

  async newPage(url?: string, options: { strictShortcut?: boolean } = {}): Promise<{ index: number; url: string }> {
    const page = await this.context.newPage();
    this.pages.push(page);
    if (url) await page.goto(url);
    return { index: this.pages.length - 1, url: page.url() };
  }

  async switchPage(index: number): Promise<{ index: number; url: string }> {
    const all = this.context.pages();
    if (index < 0 || index >= all.length) {
      throw new Error(`Page index ${index} out of range`);
    }
    const page = all[index];
    await page.bringToFront();
    return { index, url: page.url() };
  }

  async closePage(index?: number): Promise<{ closedIndex: number; activeIndex: number; total: number }> {
    const all = this.context.pages();
    const targetIndex = index ?? all.length - 1;
    if (targetIndex < 0 || targetIndex >= all.length) {
      throw new Error(`Page index ${targetIndex} out of range`);
    }
    const page = all[targetIndex];
    await page.close();
    const newTotal = this.context.pages().length;
    const newActiveIndex = Math.max(0, targetIndex - 1);
    return { closedIndex: targetIndex, activeIndex: newActiveIndex, total: newTotal };
  }

  async ensurePage(url?: string): Promise<Page> {
    const existing = this.context.pages();
    if (existing.length > 0) {
      const page = existing[0];
      if (url) await page.goto(url);
      return page;
    }
    const page = await this.context.newPage();
    if (url) await page.goto(url);
    return page;
  }

  getActivePage(): Page | null {
    const pages = this.context.pages();
    return pages.length > 0 ? pages[0] : null;
  }
}
