import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSessionPageManagement } from './page-management.js';

function createPage(label: string) {
  const page: any = {
    label,
    closed: false,
    bringToFrontCalls: 0,
    gotoCalls: [] as string[],
    waitCalls: [] as number[],
    keyboard: {
      presses: [] as string[],
      press: async (shortcut: string) => {
        page.keyboard.presses.push(shortcut);
      },
    },
    url: () => `https://example.com/${label}`,
    isClosed() {
      return this.closed;
    },
    async bringToFront() {
      this.bringToFrontCalls += 1;
    },
    async waitForLoadState(_state: string, opts?: { timeout?: number }) {
      this.waitCalls.push(Number(opts?.timeout || 0));
    },
    async goto(url: string) {
      this.gotoCalls.push(url);
    },
  };
  return page;
}

function createManagement({
  pages,
  activePage,
  ctxNewPage,
  waitForEvent,
}: {
  pages: any[];
  activePage: any;
  ctxNewPage: () => Promise<any>;
  waitForEvent?: () => Promise<any>;
}) {
  let currentActive = activePage;
  const ctx = {
    pages: () => pages,
    newPage: ctxNewPage,
    waitForEvent: waitForEvent || (async () => null),
  } as any;

  const management = new BrowserSessionPageManagement({
    ensureContext: () => ctx,
    getActivePage: () => currentActive,
    getCurrentUrl: () => currentActive?.url?.() || null,
    setActivePage: (page) => {
      currentActive = page ?? null;
    },
    setupPageHooks: () => {},
    ensurePageViewport: async () => {},
    maybeCenterPage: async () => {},
    recordLastKnownUrl: () => {},
    isHeadless: () => false,
  });

  return { management, getActivePage: () => currentActive };
}

test('newPage prefers direct context creation before shortcut retries', async () => {
  const opener = createPage('opener');
  const created = createPage('created');
  const pages = [opener];
  let ctxNewPageCalls = 0;

  const { management, getActivePage } = createManagement({
    pages,
    activePage: opener,
    ctxNewPage: async () => {
      ctxNewPageCalls += 1;
      pages.push(created);
      return created;
    },
    waitForEvent: async () => {
      throw new Error('shortcut path should not run');
    },
  });

  const result = await management.newPage();
  assert.equal(ctxNewPageCalls, 1);
  assert.equal(opener.keyboard.presses.length, 0);
  assert.equal(result.index, 1);
  assert.equal(result.url, 'https://example.com/created');
  assert.equal(getActivePage(), created);
});

test('newPage falls back to shortcut path in strictShortcut mode', async () => {
  const opener = createPage('opener');
  const created = createPage('created');
  const pages = [opener];
  let ctxNewPageCalls = 0;

  const { management, getActivePage } = createManagement({
    pages,
    activePage: opener,
    ctxNewPage: async () => {
      ctxNewPageCalls += 1;
      return created;
    },
    waitForEvent: async () => {
      pages.push(created);
      return created;
    },
  });

  const result = await management.newPage(undefined, { strictShortcut: true });
  assert.equal(ctxNewPageCalls, 0);
  assert.ok(opener.keyboard.presses.length >= 1);
  assert.equal(result.index, 1);
  assert.equal(getActivePage(), created);
});
