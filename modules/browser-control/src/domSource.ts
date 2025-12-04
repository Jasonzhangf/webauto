import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';

export interface DomFetchOptions {
  url: string;
  profileDir?: string;
  headless?: boolean;
  waitFor?: number;
  fixture?: string;
}

export async function fetchDomHtml(options: DomFetchOptions): Promise<string> {
  if (options.fixture) {
    const resolved = path.resolve(options.fixture);
    return fs.readFileSync(resolved, 'utf-8');
  }
  const profileDir =
    options.profileDir ||
    path.join(process.env.HOME || process.env.USERPROFILE || '.', '.webauto', 'profiles', 'default');
  const headless = options.headless ?? true;
  const waitFor = options.waitFor ?? 8000;

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1280, height: 800 },
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: waitFor });
    await page.waitForLoadState('networkidle', { timeout: waitFor }).catch(() => {});
    const html = await page.content();
    return html;
  } finally {
    await context.close();
  }
}
