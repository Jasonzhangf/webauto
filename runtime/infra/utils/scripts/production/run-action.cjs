#!/usr/bin/env node
/**
 * Run a single action/event on a page for independent testing.
 * Usage examples:
 *   node scripts/run-action.cjs --type operation --key highlight-green --url https://weibo.com --selector body --site weibo.com
 *   node scripts/run-action.cjs --type event --key action:click --url https://weibo.com --selector .expand --site weibo.com
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { executeEvent, executeOperation } = require('../src/modules/executable-container/node/action-executor.cjs');

function arg(name, dflt){ const a = process.argv.indexOf(name); return a>=0 && process.argv[a+1] ? process.argv[a+1] : dflt; }

async function ensureHighlight(context){
  try {
    let hs = fs.readFileSync(path.join(process.cwd(), 'src', 'modules', 'highlight', 'highlight-service.js'), 'utf8');
    hs = hs.replace(/export\s+class\s+HighlightService/,'class HighlightService');
    hs = hs.replace(/\n\/\/ 导出服务[\s\S]*$/,'');
    await context.addInitScript(hs);
  } catch (e) { console.warn('highlight inject warn:', e.message); }
}

async function main(){
  const type = arg('--type', 'operation'); // event|operation
  const key = arg('--key');
  const url = arg('--url', 'https://weibo.com');
  const selector = arg('--selector', 'body');
  const site = arg('--site', 'weibo.com');
  const value = arg('--value');
  const cookiesPath = arg('--cookies', path.join(process.env.HOME||'.', '.webauto', 'cookies', `${site}-latest.json`));
  const headless = arg('--headless', 'false') === 'true';
  if (!key) { console.error('missing --key'); process.exit(2); }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // cookies
  try {
    if (fs.existsSync(cookiesPath)){
      const raw = JSON.parse(fs.readFileSync(cookiesPath,'utf8'));
      const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.cookies) ? raw.cookies : []);
      if (arr.length){ await context.addCookies(arr); console.log('cookies loaded:', arr.length); }
    }
  } catch (e) { console.warn('cookie warn:', e.message); }

  await ensureHighlight(context);

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e=>console.warn('goto warn:', e.message));

  // optional value for input/extract attr
  if (typeof value !== 'undefined') {
    try { await page.evaluate(v => { window.__webautoTmpValue = v; }, value); } catch {}
  }

  let res;
  try {
    if (type === 'event') {
      res = await executeEvent(page, null, site, key, selector);
    } else {
      res = await executeOperation(page, null, site, key, selector);
    }
    console.log(JSON.stringify({ ok: true, type, key, selector, res }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message || String(e) }, null, 2));
  }

  // keep open headful until closed
  if (!headless) {
    console.log('Headful mode: close browser window to exit.');
    await new Promise(resolve => browser.on('disconnected', resolve));
  } else {
    await browser.close();
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
