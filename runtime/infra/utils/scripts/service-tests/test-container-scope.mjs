#!/usr/bin/env node
// Minimal engine-level tests for container scope composition and selection
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { scopeCompose, selectByIndex } from '../../src/core/workflow/ContainerResolver.js';

function html() {
  return `<!doctype html>
  <meta charset="utf-8"/>
  <style>
    .space-common-offerlist{ padding:8px; }
    .search-offer-item{ margin:8px 0; border:1px solid #ccc; padding:8px; }
  </style>
  <div class="space-common-offerlist" id="list">
    <div class="search-offer-item" id="item0">
      <span class="J_WangWang"><a class="ww-link" href="https://im.1688.com/u0">WW0</a></span>
      <div class="desc-text">Company A</div>
    </div>
    <div class="search-offer-item" id="item1">
      <div><a class="ww-link" href="https://air.1688.com/u1">WW1</a></div>
      <div class="desc-text">Company B</div>
    </div>
    <div class="search-offer-item" id="item2">
      <a class="ww-link" href="https://im.1688.com/u2">WW2</a>
      <div class="desc-text">Company C</div>
    </div>
  </div>`;
}

async function main(){
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent(html());

  // 1) scopeCompose correctness
  const parent = '#item1';
  const child = 'span.J_WangWang a.ww-link, a.ww-link[href*="air.1688.com"], a.ww-link[href*="im.1688.com"]';
  const composed = scopeCompose(parent, child);
  assert.equal(composed, `${parent} span.J_WangWang a.ww-link, ${parent} a.ww-link[href*="air.1688.com"], ${parent} a.ww-link[href*="im.1688.com"]`);

  // naive composition would be `${parent} ${child}` → leaks second/third clauses to global
  const naive = `${parent} ${child}`;
  const naiveHit = await page.evaluate((sel)=>{
    const el = document.querySelector(sel);
    return el ? el.closest('.search-offer-item')?.id : null;
  }, naive);
  // Because part 2 matches item1, this may pass, but if order flips, naive can leak.
  // We just assert composed resolves exactly to item1.

  const composedHit = await page.evaluate((sel)=>{
    const el = document.querySelector(sel);
    return el ? el.closest('.search-offer-item')?.id : null;
  }, composed);
  assert.equal(composedHit, 'item1');

  // 2) selectByIndex should return a stable scope for item1
  const out = await selectByIndex(page, { selector: '.search-offer-item', scopeSelector: '.space-common-offerlist', index: 1 });
  assert.ok(out && out.newScopeSelector, 'selectByIndex must return newScopeSelector');
  const sel1 = out.newScopeSelector;
  const belongs = await page.evaluate((s)=>{ const el=document.querySelector(s); return el && el.id.startsWith('wa-child') || el && el.hasAttribute('data-wa-scope'); }, sel1);
  assert.ok(belongs, 'new scope should be a tagged element');

  // 3) Using composed selector from stable scope, we must resolve WW1 (air)
  const wwSel = 'span.J_WangWang a.ww-link, a.ww-link[href*="air.1688.com"], a.ww-link[href*="im.1688.com"]';
  const wwComposed = scopeCompose(sel1, wwSel);
  const wwText = await page.evaluate((s)=>{ const el=document.querySelector(s); return el?el.textContent.trim():null; }, wwComposed);
  assert.equal(wwText, 'WW1', 'scoped ww should resolve within item1');

  await browser.close();
  console.log('OK: container scope composition and selection work as expected');
}

main().catch(e=>{ console.error('TEST FAILED:', e?.message||e); process.exit(1); });

