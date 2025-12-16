import type { Page } from 'playwright';
import { injectRuntimeBundle } from './runtimeInjector.js';

const injectedPages = new WeakSet<Page>();

export async function ensurePageRuntime(page: Page): Promise<void> {
  if (!page) {
    throw new Error('page is required');
  }
  if (!injectedPages.has(page)) {
    await injectRuntimeBundle({ page });
  }
  await page.waitForFunction(() => Boolean((window as any).__webautoRuntime && (window as any).__webautoRuntime.ready), {
    timeout: 4000,
  });
  injectedPages.add(page);
}

export async function evalPageRuntime<T>(page: Page, fn: (runtime: any) => T | Promise<T>): Promise<T> {
  await ensurePageRuntime(page);
  return page.evaluate(fn);
}
