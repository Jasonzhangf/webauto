#!/usr/bin/env node
// Weibo loopback test using unified /command endpoint only.
// Flow:
// 1) POST /command {action:'start', args:{profileId, headless:false, url}}
// 2) POST /command {action:'goto', args:{profileId, url}}
// 3) POST /command {action:'evaluate', args:{profileId, script}}
// 4) POST /command {action:'screenshot', args:{profileId}} → base64 → /tmp/loopback_weibo.png

/* eslint-disable no-console */

const fs = require('fs');
const fetch = globalThis.fetch || require('node-fetch');

const PROFILE_ID = process.env.WEBAUTO_UI_TEST_PROFILE || 'default';
const BASE_URL = process.env.WEBAUTO_WEIBO_URL || 'https://weibo.com';
const HIGHLIGHT_SELECTOR = process.env.WEBAUTO_WEIBO_FEED_SELECTOR || '.detail_wbtext_4CRf9';
const HEADLESS =
  typeof process.env.WEBAUTO_HEADLESS === 'string'
    ? !['0', 'false', 'no'].includes(process.env.WEBAUTO_HEADLESS.toLowerCase())
    : true;

const BROWSER_HOST = process.env.WEBAUTO_BROWSER_HOST || '127.0.0.1';
const BROWSER_PORT = Number(process.env.WEBAUTO_BROWSER_PORT || 7704);
const COMMAND_URL = `http://${BROWSER_HOST}:${BROWSER_PORT}/command`;

async function postCommand(body) {
  const res = await fetch(COMMAND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function ensureSession() {
  console.log('[loopback-weibo:/command] start session', PROFILE_ID);
  await postCommand({
    action: 'start',
    args: {
      profileId: PROFILE_ID,
      headless: HEADLESS,
      url: BASE_URL,
    },
  });
}

async function gotoWeibo() {
  console.log('[loopback-weibo:/command] goto', BASE_URL);
  await postCommand({
    action: 'goto',
    args: {
      profileId: PROFILE_ID,
      url: BASE_URL,
    },
  });
}

function buildHighlightScript(selector) {
  return `
    (function() {
      const sel = ${JSON.stringify(selector)};
      console.log('[loopback-weibo] applying inline highlight to', sel);
      const el = document.querySelector(sel);
      if (!el) {
        console.warn('[loopback-weibo] target element not found');
        return { success: false, reason: 'not_found' };
      }
      el.style.outline = '4px solid #FF3B30';
      el.style.backgroundColor = 'rgba(255, 59, 48, 0.25)';
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      return { success: true };
    })();
  `;
}

async function applyHighlight() {
  console.log('[loopback-weibo:/command] evaluate highlight script');
  const script = buildHighlightScript(HIGHLIGHT_SELECTOR);
  await postCommand({
    action: 'evaluate',
    args: {
      profileId: PROFILE_ID,
      script,
    },
  });
}

async function captureScreenshot() {
  console.log('[loopback-weibo:/command] screenshot');
  const data = await postCommand({
    action: 'screenshot',
    args: {
      profileId: PROFILE_ID,
      fullPage: true,
    },
  });
  const b64 = data && data.data;
  if (!b64) throw new Error('screenshot: empty body.data');
  const buf = Buffer.from(b64, 'base64');
  const outPath = '/tmp/loopback_weibo.png';
  fs.writeFileSync(outPath, buf);
  console.log('[loopback-weibo:/command] screenshot written to', outPath);
  return outPath;
}

async function main() {
  try {
    await ensureSession();
    await gotoWeibo();
    // give page some time to stabilize
    await new Promise((r) => setTimeout(r, 5000));
    await applyHighlight();
    await new Promise((r) => setTimeout(r, 2000));
    const out = await captureScreenshot();
    console.log('[loopback-weibo:/command] DONE', { file: out });
    process.exit(0);
  } catch (err) {
    console.error('[loopback-weibo:/command] FAILED', err && err.stack || err);
    process.exit(1);
  }
}

main();
