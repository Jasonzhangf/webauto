import { Page } from 'playwright';
import { resolveInputActionMaxAttempts, resolveInputActionTimeoutMs, resolveInputRecoveryBringToFrontTimeoutMs, resolveInputRecoveryDelayMs, resolveInputReadySettleMs } from './utils.js';
import { ensurePageRuntime } from '../pageRuntime.js';

export class BrowserInputPipeline {
  constructor(
    private ensurePrimaryPage: () => Promise<Page>,
    private isHeadless: () => boolean,
  ) {}

  private inputActionTail: Promise<void> = Promise.resolve();

  async ensureInputReady(page: Page): Promise<void> {
    if (this.isHeadless()) return;
    const bringToFrontTimeoutMs = resolveInputRecoveryBringToFrontTimeoutMs();
    let bringToFrontTimer: NodeJS.Timeout | null = null;
    try {
      await Promise.race<void>([
        page.bringToFront(),
        new Promise<void>((_resolve, reject) => {
          bringToFrontTimer = setTimeout(() => {
            reject(new Error(`input ready bringToFront timed out after ${bringToFrontTimeoutMs}ms`));
          }, bringToFrontTimeoutMs);
        }),
      ]);
    } catch {
      // Best-effort only
    } finally {
      if (bringToFrontTimer) clearTimeout(bringToFrontTimer);
    }
    const settleMs = resolveInputReadySettleMs();
    if (settleMs > 0) {
      await page.waitForTimeout(settleMs).catch(() => {});
    }
  }

  async resolveInputPage(preferredPage: Page): Promise<Page> {
    try {
      const page = await this.ensurePrimaryPage();
      if (page && !page.isClosed()) return page;
    } catch {}
    if (preferredPage && !preferredPage.isClosed()) return preferredPage;
    return this.ensurePrimaryPage();
  }

  async withInputActionTimeout<T>(label: string, run: () => Promise<T>, timeoutOverrideMs?: number): Promise<T> {
    const resolvedOverride = Number(timeoutOverrideMs);
    const timeoutMs = Number.isFinite(resolvedOverride) && resolvedOverride > 0
      ? Math.floor(resolvedOverride)
      : resolveInputActionTimeoutMs();
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race<T>([
        run(),
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async recoverInputPipeline(page: Page): Promise<Page> {
    const activePage = await this.resolveInputPage(page).catch(() => page);
    const bringToFrontTimeoutMs = resolveInputRecoveryBringToFrontTimeoutMs();
    let bringToFrontTimer: NodeJS.Timeout | null = null;
    try {
      await Promise.race<void>([
        activePage.bringToFront(),
        new Promise<void>((_resolve, reject) => {
          bringToFrontTimer = setTimeout(() => {
            reject(new Error(`input recovery bringToFront timed out after ${bringToFrontTimeoutMs}ms`));
          }, bringToFrontTimeoutMs);
        }),
      ]);
    } catch {
      // Best-effort recovery only.
    } finally {
      if (bringToFrontTimer) clearTimeout(bringToFrontTimer);
    }
    const delayMs = resolveInputRecoveryDelayMs();
    if (delayMs > 0) {
      try { await activePage.waitForTimeout(delayMs); } catch {}
    }
    await ensurePageRuntime(activePage, true).catch(() => {});
    return this.resolveInputPage(activePage).catch(() => activePage);
  }

  async runInputAction<T>(page: Page, label: string, run: (activePage: Page) => Promise<T>): Promise<T> {
    const maxAttempts = resolveInputActionMaxAttempts();
    let lastError: unknown = null;
    let activePage = page;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      activePage = await this.resolveInputPage(activePage).catch(() => activePage);
      try {
        return await this.withInputActionTimeout(`${label} (attempt ${attempt}/${maxAttempts})`, () => run(activePage));
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) break;
        activePage = await this.recoverInputPipeline(activePage);
      }
    }
    if (lastError instanceof Error) throw lastError;
    throw new Error(`${label} failed`);
  }

  async withInputActionLock<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.inputActionTail;
    let release: (() => void) | null = null;
    this.inputActionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous.catch(() => {});
    try {
      return await run();
    } finally {
      if (release) release();
    }
  }
}
