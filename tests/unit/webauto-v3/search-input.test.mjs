// AGENTS.md requires search keywords to be entered in the page search input,
// not by constructing a search URL, and requires text entry to use the native
// value setter because a CJK IME can swallow direct key events. This gate owns
// that contract so a regression cannot pass on the pagination assertions that
// do not look at how the keyword was submitted.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { collectSearch } from '../../../apps/webauto/weibo-v3/search.mjs';
import { createWeiboRuntime } from '../../../apps/webauto/weibo-v3/runtime.mjs';

function makeRuntime() {
  const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-v3-search-events-'));
  return createWeiboRuntime({
    runId: `search_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    eventDir,
  });
}

test('search enters the keyword in the page input and never navigates a query URL', async () => {
  const runtime = makeRuntime();
  const gotos = [];
  const filled = [];
  const clicked = [];
  const browser = {
    async setViewport() {},
    async goto(url) { gotos.push(String(url)); },
    async fillInput(selector, value) { filled.push({ selector, value }); },
    async type() { throw new Error('search must not type key events for keywords'); },
    async pressKey(key) { clicked.push(`key:${key}`); },
    async click(selector) { clicked.push(`click:${selector}`); },
    async pageInfo() {
      return {
        url: 'https://s.weibo.com/weibo',
        title: '微博搜索',
        viewport: { width: 1440, height: 900 },
        scroll: { x: 0, y: 0 },
        textDigest: 'fixture',
      };
    },
    async observeAnchors() {
      return { 'result.list': { selector: '.card-wrap', count: 1, visible: true } };
    },
    async evaluate() {
      return {
        url: 'https://s.weibo.com/weibo',
        posts: [{ mid: 'AbC123', url: 'https://weibo.com/1/AbC123', text: 'fixture' }],
        pages: [1],
      };
    },
  };

  await collectSearch({ runtime, browser, topic: 'AI眼镜', maxPages: 1, limit: 10 });

  assert.deepEqual(filled.length, 1, 'keyword must be submitted through the page input');
  assert.equal(filled[0].value, 'AI眼镜');
  assert.deepEqual(
    gotos.filter((url) => url.includes('?') || url.includes('q=')),
    [],
    'search must not navigate a constructed query URL',
  );
  assert.deepEqual(clicked, ['key:Enter'], 'search submits with Enter from the keyboard');
});

test('a search URL built from the keyword is not used even for later pages', async () => {
  const runtime = makeRuntime();
  const gotos = [];
  let pageReads = 0;
  const browser = {
    async setViewport() {},
    async goto(url) { gotos.push(String(url)); },
    async fillInput() {},
    async pressKey() {},
    async click() {},
    async pageInfo() {
      return {
        url: 'https://s.weibo.com/weibo',
        title: '微博搜索',
        viewport: { width: 1440, height: 900 },
        scroll: { x: 0, y: 0 },
        textDigest: 'fixture',
      };
    },
    async observeAnchors() {
      return { 'result.list': { selector: '.card-wrap', count: 1, visible: true } };
    },
    async evaluate() {
      pageReads++;
      return {
        url: 'https://s.weibo.com/weibo',
        posts: [{ mid: pageReads === 1 ? 'AbC123' : 'DeF456', url: `https://weibo.com/1/${pageReads === 1 ? 'AbC123' : 'DeF456'}`, text: 'fixture' }],
        pages: [1, 2],
      };
    },
  };

  await collectSearch({ runtime, browser, topic: 'AI眼镜', maxPages: 2, limit: 10 });

  for (const url of gotos) {
    assert.ok(!url.includes('AI'), `keyword must not appear in a navigated URL: ${url}`);
  }
});

test('a later page is only read after the pager transition is observable', async () => {
  const runtime = makeRuntime();
  const reads = [];
  let signature = 'first';
  const browser = {
    async setViewport() {},
    async goto() {},
    async fillInput() {},
    async pressKey() {},
    async click() {},
    async pageInfo() {
      return {
        url: 'https://s.weibo.com/weibo',
        title: '微博搜索',
        viewport: { width: 1440, height: 900 },
        scroll: { x: 0, y: 0 },
        textDigest: 'fixture',
      };
    },
    async observeAnchors() {
      return { 'result.list': { selector: '.card-wrap', count: 1, visible: true } };
    },
    async evaluate() {
      reads.push(signature);
      return {
        url: 'https://s.weibo.com/weibo',
        posts: [{ mid: signature, url: `https://weibo.com/1/${signature}`, text: 'fixture' }],
        pages: [1, 2],
      };
    },
  };

  // Simulate the page content changing only on the second poll after the
  // click: the extractor must not read the stale first page in between.
  browser.click = async () => {
    setTimeout(() => { signature = 'second'; }, 300);
  };

  const result = await collectSearch({ runtime, browser, topic: 'AI眼镜', maxPages: 2, limit: 10 });
  // Page 1 is read before any click. After the click the extractor polls until
  // the first result changes, and only then reads page 2.
  assert.deepEqual(reads.slice(0, 2), ['first', 'first']);
  assert.equal(reads[reads.length - 1], 'second');
  assert.equal(reads.includes('first') && reads.indexOf('second') > reads.indexOf('first'), true);
  assert.deepEqual(result.posts.map((post) => post.mid), ['first', 'second']);
});

test('a stalled pager fails explicitly instead of re-reading the same page', async () => {
  const runtime = makeRuntime();
  const browser = {
    async setViewport() {},
    async goto() {},
    async fillInput() {},
    async pressKey() {},
    async click() {},
    async pageInfo() {
      return {
        url: 'https://s.weibo.com/weibo',
        title: '微博搜索',
        viewport: { width: 1440, height: 900 },
        scroll: { x: 0, y: 0 },
        textDigest: 'fixture',
      };
    },
    async observeAnchors() {
      return { 'result.list': { selector: '.card-wrap', count: 1, visible: true } };
    },
    async evaluate() {
      // The list never changes, so the pager transition is never observable.
      return {
        url: 'https://s.weibo.com/weibo',
        posts: [{ mid: 'stuck', url: 'https://weibo.com/1/stuck', text: 'fixture' }],
        pages: [1, 2, 3],
      };
    },
  };

  await assert.rejects(
    () => collectSearch({ runtime, browser, topic: 'AI眼镜', maxPages: 2, limit: 10 }),
    /pager did not advance/,
  );
});
