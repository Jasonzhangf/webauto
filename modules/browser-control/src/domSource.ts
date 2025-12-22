import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';

export interface DomFetchOptions {
  url: string;
  profileDir?: string;
  headless?: boolean;
  waitFor?: number;
  fixture?: string;
}

function resolveProfileDirectory(profileInput?: string) {
  const profilesRoot = path.join(os.homedir(), '.webauto', 'profiles');
  if (!profileInput) {
    fs.mkdirSync(path.join(profilesRoot, 'default'), { recursive: true });
    return path.join(profilesRoot, 'default');
  }
  const candidate = path.isAbsolute(profileInput)
    ? profileInput
    : path.join(profilesRoot, profileInput);
  fs.mkdirSync(candidate, { recursive: true });
  return candidate;
}

function resolveCookieCandidates(profileDir: string) {
  const cookieDir = path.join(os.homedir(), '.webauto', 'cookies');
  const profileName = path.basename(profileDir);
  const variants = [profileName, profileName.replace(/-/g, '_'), profileName.replace(/_/g, '-')]
    .filter((name, idx, arr) => arr.indexOf(name) === idx);
  const candidates: string[] = [];
  for (const variant of variants) {
    candidates.push(path.join(cookieDir, `${variant}.json`));
    candidates.push(path.join(cookieDir, `${variant}_cookies.json`));
    candidates.push(path.join(cookieDir, `${variant}-cookies.json`));
  }
  candidates.push(path.join(cookieDir, 'weibo.com-latest.json'));
  candidates.push(path.join(cookieDir, 'default-latest.json'));
  return candidates;
}

async function loadCookiesFromFile(filePath: string) {
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.cookies)) return raw.cookies;
  return [];
}

async function syncCookies(context: import('playwright').BrowserContext, profileDir: string) {
  const candidates = resolveCookieCandidates(profileDir);
  for (const candidate of candidates) {
    const cookies = await loadCookiesFromFile(candidate);
    if (cookies.length) {
      await context.addCookies(cookies);
      return;
    }
  }
}

export async function fetchDomHtml(options: DomFetchOptions): Promise<string> {
  if (options.fixture) {
    const resolved = path.resolve(options.fixture);
    return fs.readFileSync(resolved, 'utf-8');
  }
  const profileDir = resolveProfileDirectory(options.profileDir);
  const headless = options.headless ?? true;
  const waitFor = options.waitFor ?? 8000;

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1280, height: 800 },
  });
  try {
    await syncCookies(context, profileDir);
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: waitFor });
    await page.waitForLoadState('networkidle', { timeout: waitFor }).catch(() => {});
    const html = await page.content();
    return html;
  } finally {
    await context.close();
  }
}
