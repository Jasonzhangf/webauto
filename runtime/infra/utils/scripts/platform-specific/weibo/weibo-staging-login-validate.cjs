#!/usr/bin/env node
/**
 * Open Playwright Chromium, load cookies, navigate to weibo.com (or target url),
 * inject staging index into window.__containerIndex, pause for manual login confirmation,
 * then run minimal validation checks.
 *
 * Usage:
 *   node scripts/weibo-staging-login-validate.cjs [--cookies path] [--url https://weibo.com] [--site weibo.com]
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { url: 'https://weibo.com', site: 'weibo.com' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--cookies') opts.cookies = args[++i];
    else if (a === '--url') opts.url = args[++i];
    else if (a === '--site') opts.site = args[++i];
  }
  if (!opts.cookies) {
    const home = process.env.HOME || process.env.USERPROFILE || process.cwd();
    const defaultPath = path.join(home, '.webauto', 'weibo-cookies.json');
    opts.cookies = defaultPath;
  }
  return opts;
}

function readCookies(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(txt);
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.cookies)) return json.cookies;
    return [];
  } catch (e) {
    console.warn('cookie file not readable:', file, e.message);
    return [];
  }
}

function normalizePlaywrightCookies(arr, site) {
  const out = [];
  for (const c of arr) {
    if (c && c.name && c.value) {
      out.push({
        name: c.name,
        value: c.value,
        domain: c.domain || (site.startsWith('.') ? site : '.' + site),
        path: c.path || '/',
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: c.sameSite || 'Lax',
        expires: typeof c.expires === 'number' ? c.expires : undefined
      });
    }
  }
  return out;
}

async function pauseForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, ans => { rl.close(); resolve(ans); }));
}

function loadStagingIndex(site) {
  const stagingPath = path.join(process.cwd(), 'containers', 'staging', site, 'index.json');
  try {
    const txt = fs.readFileSync(stagingPath, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.warn('staging index not found:', stagingPath, e.message);
    return null;
  }
}

async function main() {
  const opts = parseArgs();
  console.log('opts:', opts);
  const rawCookies = readCookies(opts.cookies);
  const cookies = normalizePlaywrightCookies(rawCookies, opts.site);
  console.log('cookies loaded:', rawCookies.length, 'normalized:', cookies.length);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  if (cookies.length) {
    try { await context.addCookies(cookies); console.log('cookies added to context'); } catch (e) { console.warn('addCookies failed:', e.message); }
  }
  const page = await context.newPage();
  const index = loadStagingIndex(opts.site);
  if (index) {
    await page.addInitScript(idx => { window.__containerIndex = idx; }, index);
    console.log('staging index injected into page context');
  }

  console.log('navigating to', opts.url);
  await page.goto(opts.url, { waitUntil: 'domcontentloaded' }).catch(e => console.warn('goto warning:', e.message));
  await page.waitForTimeout(2000).catch(()=>{});

  // Pause for manual confirmation
  await pauseForEnter('\nPlease manually verify login status in the opened browser. Press Enter to continue validation...');

  // Minimal validation
  try {
    const cookieSummary = await page.context().cookies();
    const hasWeiboCookie = cookieSummary.some(c => (c.domain || '').includes('weibo'));
    console.log('validation: cookies in context =', cookieSummary.length, 'hasWeiboCookie =', hasWeiboCookie);
  } catch (e) {
    console.warn('cookie validation failed:', e.message);
  }

  console.log('Done. Close the browser when finished.');
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

