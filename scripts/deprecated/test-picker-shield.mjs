#!/usr/bin/env node

/**
 * Automated picker shield test.
 * Bundles src/modules/executable-container/inpage/picker.ts and injects it into a Playwright page.
 * Verifies that hover/click events are intercepted, selectors are generated, and frame-blocked events emit.
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pickerEntry = path.join(repoRoot, 'src/modules/executable-container/inpage/picker.ts');

async function bundlePicker() {
  const result = await build({
    entryPoints: [pickerEntry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    sourcemap: false,
    write: false,
    target: ['es2022'],
    footer: { js: '/* picker bundle end */' },
  });
  return result.outputFiles[0].text;
}

function buildTestHtml() {
  const iframeDoc = String.raw`<!doctype html><html><body style="margin:0;font-family:sans-serif;">
    <div id="inner" style="width:150px;height:150px;background:#f9c;font-size:16px;display:flex;align-items:center;justify-content:center;">
      Inner Target
    </div>
    <script>
      window.__innerClicks = 0;
      document.getElementById('inner').addEventListener('click', () => {
        window.__innerClicks += 1;
        if (parent && parent !== window && typeof parent.__onIframeClick === 'function') {
          parent.__onIframeClick();
        }
      });
    </script>
  </body></html>`;
  const escapedIframeDoc = iframeDoc.replace(/"/g, '&quot;');
  return String.raw`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Picker Shield Test</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      .box { width: 200px; height: 200px; margin: 60px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
      #target { background: #b3d4fc; }
    </style>
  </head>
  <body>
    <div id="target" class="box">Main Target</div>
    <iframe id="child-frame" srcdoc="${escapedIframeDoc}" style="width:220px;height:220px;border:2px solid #444;margin:40px;"></iframe>
    <iframe id="blocked-frame" src="https://example.com" style="width:1px;height:1px;border:0;"></iframe>
    <script>
      window.__clicks = 0;
      window.__iframeClicks = 0;
      document.getElementById('target').addEventListener('click', () => { window.__clicks += 1; });
      window.__onIframeClick = () => { window.__iframeClicks += 1; };
    </script>
  </body>
</html>`;
}

async function setupPage(page, pickerBundle) {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.setContent(buildTestHtml(), { waitUntil: 'load' });
  await page.evaluate(() => {
    window.__pickerEvents = [];
    window.webauto_dispatch = (evt) => {
      window.__pickerEvents.push(evt);
    };
  });
  await page.addScriptTag({ content: pickerBundle });
  await page.waitForFunction(() => Boolean(window.__webautoPicker?.start));
  const dispatchType = await page.evaluate(() => typeof window.webauto_dispatch);
  console.log('[picker-test] typeof window.webauto_dispatch =', dispatchType);
  await page.evaluate(() => {
    window.__webautoPicker?.start({ longPressMs: 80, showContainerTree: true });
  });
  const initialEvents = await page.evaluate(() => window.__pickerEvents || []);
  console.log('[picker-test] initial events:', initialEvents.map((evt) => evt.type));
  await page.waitForTimeout(200);
  await page.waitForFunction(() => {
    const frame = document.getElementById('child-frame');
    return frame?.dataset?.__webautoPickerAttached === 'true';
  }, { timeout: 2000 }).catch(() => {
    console.warn('[picker-test] child-frame shield attach timeout');
  });
  const attachState = await page.evaluate(() => document.getElementById('child-frame')?.dataset?.__webautoPickerAttached || null);
  console.log('[picker-test] child-frame attach state:', attachState);
}

async function performPointerSequence(page, selector) {
  console.log(`[picker-test] performPointerSequence -> ${selector}`);
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Failed to resolve bounding box for ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.waitForTimeout(80);
  console.log('[picker-test] mouse.down');
  await page.mouse.down();
  await page.waitForTimeout(120);
  console.log('[picker-test] mouse.up');
  await page.mouse.up();
  await page.waitForTimeout(150);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function collectResults(page) {
  return page.evaluate(() => ({
    events: window.__pickerEvents || [],
    clicks: window.__clicks || 0,
    iframeClicks: window.__iframeClicks || 0,
  }));
}

function analyze(events) {
  const shieldEvents = events.filter((evt) => evt?.type === 'picker:shield');
  const hover = shieldEvents.find((evt) => evt?.data?.action === 'hover');
  const blockedClick = shieldEvents.find((evt) => evt?.data?.action === 'blocked-click');
  const iframePointer = shieldEvents.find((evt) => evt?.data?.action === 'pointerdown' && evt?.data?.frame?.type === 'iframe');
  const frameBlocked = shieldEvents.find((evt) => evt?.data?.action === 'frame-blocked');
  const containerCreated = events.find((evt) => evt?.type === 'container:created');
  return { shieldEvents, hover, blockedClick, iframePointer, frameBlocked, containerCreated };
}

async function run() {
  console.log('[picker-test] bundling picker...');
  const bundle = await bundlePicker();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.log('[browser:pageerror]', err.message);
  });
  try {
    await setupPage(page, bundle);
    await performPointerSequence(page, '#target');
    await performPointerSequence(page, '#child-frame');
    await page.waitForTimeout(500);
    const result = await collectResults(page);
    console.log('[picker-test] events observed:', result.events.map((evt) => `${evt.type}:${evt.data?.action || ''}`));
    const { hover, blockedClick, iframePointer, frameBlocked, containerCreated, shieldEvents } = analyze(result.events);
    if (!iframePointer) {
      const pointerSamples = shieldEvents.filter((evt) => evt?.data?.action === 'pointerdown');
      console.log('[picker-test] pointerdown samples:', JSON.stringify(pointerSamples, null, 2));
      const pointerUpSamples = shieldEvents.filter((evt) => evt?.data?.action === 'pointerup');
      console.log('[picker-test] pointerup samples:', JSON.stringify(pointerUpSamples, null, 2));
      const pointerMisses = shieldEvents.filter((evt) => evt?.data?.action === 'pointerdown-miss');
      if (pointerMisses.length) {
        console.log('[picker-test] pointerdown-miss samples:', JSON.stringify(pointerMisses, null, 2));
      }
    }
    assert(result.clicks === 0, `Expected 0 clicks on main target, got ${result.clicks}`);
    assert(result.iframeClicks === 0, `Expected 0 clicks in iframe, got ${result.iframeClicks}`);
    assert(hover, 'Missing hover event on main document');
    assert(blockedClick, 'Missing blocked-click event');
    assert(iframePointer, 'Missing pointerdown event inside iframe');
    assert(frameBlocked, 'Missing frame-blocked event for cross-origin iframe');
    assert(containerCreated, 'Missing container:created event after long press');
    const treeInfo = await page.evaluate(() => {
      const root = document.querySelector('.webauto-container-tree-items');
      if (!root) return { visible: false, count: 0, labels: [] };
      const labels = Array.from(root.querySelectorAll('.webauto-container-name')).map((el) => el.textContent || '');
      return {
        visible: getComputedStyle(document.querySelector('.webauto-container-tree') || document.body).display !== 'none',
        count: root.children.length,
        labels,
      };
    });
    assert(treeInfo.visible, 'Container tree overlay is not visible');
    assert(treeInfo.count > 0, 'Container tree did not render any items');
    assert(treeInfo.labels.some((text) => text.includes('Main Target') || text.includes('interactive')), 'Container tree missing picked node label');
    console.log('[picker-test] ✅ all assertions passed');
    await page.evaluate(() => window.__webautoPicker?.stop());
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('[picker-test] ❌ test failed:', err);
    await page.screenshot({ path: path.join(process.cwd(), 'picker-test-failure.png') }).catch(() => {});
    await browser.close();
    process.exit(1);
  }
}

run();
