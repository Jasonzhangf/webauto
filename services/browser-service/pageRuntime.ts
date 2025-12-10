import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from 'playwright';

const injectedPages = new WeakSet<Page>();
let runtimePath: string | null = null;

function resolveRuntimePath() {
  if (runtimePath) return runtimePath;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), 'runtime/browser/page-runtime/runtime.js'),
    path.join(here, '../../runtime/browser/page-runtime/runtime.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      runtimePath = candidate;
      break;
    }
  }
  if (!runtimePath) {
    throw new Error('page runtime script not found');
  }
  return runtimePath;
}

export async function ensurePageRuntime(page: Page): Promise<void> {
  if (!page) {
    throw new Error('page is required');
  }
  const scriptPath = resolveRuntimePath();
  if (!injectedPages.has(page)) {
    await page.addInitScript({ path: scriptPath });
    injectedPages.add(page);
  }
  await page.waitForFunction(() => Boolean((window as any).__webautoRuntime && (window as any).__webautoRuntime.ready), {
    timeout: 4000,
  });
}

export async function evalPageRuntime<T>(page: Page, fn: (runtime: any) => T | Promise<T>): Promise<T> {
  await ensurePageRuntime(page);
  return page.evaluate(fn);
}
