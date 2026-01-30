import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import { highlightOperation } from '../src/operations/highlight.js';
import { extractOperation } from '../src/operations/extract.js';
import { clickOperation } from '../src/operations/click.js';
import { scrollOperation } from '../src/operations/scroll.js';

function installDom(html: string) {
  const { window, document } = parseHTML(html);

  (globalThis as any).window = window;
  (globalThis as any).document = document;
  (globalThis as any).Element = window.Element;
  (globalThis as any).HTMLElement = window.HTMLElement;
  (globalThis as any).HTMLAnchorElement = window.HTMLAnchorElement;
  (globalThis as any).HTMLImageElement = window.HTMLImageElement;

  Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });

  if (typeof (document as any).elementFromPoint !== 'function') {
    (document as any).elementFromPoint = (): Element | null => null;
  }

  return { window, document };
}

function setRect(el: Element, rect: { left: number; top: number; right: number; bottom: number }) {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  (el as any).getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    width,
    height,
  });
}

test('highlight supports visibleOnly filtering (overlay mode)', async () => {
  const { window, document } = installDom(`
    <div class="x" id="a">A</div>
    <div class="x" id="b">B</div>
  `);

  setRect(document.getElementById('a')!, { left: 10, top: 10, right: 110, bottom: 60 });
  setRect(document.getElementById('b')!, { left: 10, top: 2000, right: 110, bottom: 2050 });

  let highlightCount = 0;
  (window as any).__webautoRuntime = {
    highlight: {
      highlightElements: (els: any[]) => {
        highlightCount = Array.isArray(els) ? els.length : 0;
      },
    },
  };

  const res = await highlightOperation.run(
    {
      page: {
        evaluate: async (fn: any, arg: any) => fn(arg),
      },
    },
    { selector: '.x', visibleOnly: true, channel: 'test', duration: 1000 },
  );

  assert.equal(res.success, true);
  assert.equal(res.mode, 'overlay');
  assert.equal(res.count, 1);
  assert.equal(highlightCount, 1);
});

test('extract supports visibleOnly filtering', async () => {
  const { document } = installDom(`
    <div class="item" id="a">A</div>
    <div class="item" id="b">B</div>
  `);

  setRect(document.getElementById('a')!, { left: 10, top: 10, right: 110, bottom: 60 });
  setRect(document.getElementById('b')!, { left: 10, top: 2000, right: 110, bottom: 2050 });

  const res = await extractOperation.run(
    {
      page: {
        evaluate: async (fn: any, arg: any) => fn(arg),
      },
    },
    { selector: '.item', include_text: true, max_items: 10, visibleOnly: true },
  );

  assert.equal(res.success, true);
  assert.equal(res.count, 1);
  assert.equal(res.extracted?.[0]?.text, 'A');
});

test('click supports visibleOnly filtering and uses system mouse', async () => {
  const { document } = installDom(`
    <div class="btn" id="a"><span class="inner">A</span></div>
    <div class="btn" id="b"><span class="inner">B</span></div>
  `);

  const a = document.getElementById('a')!;
  const b = document.getElementById('b')!;
  const aInner = a.querySelector('.inner') as Element;
  const bInner = b.querySelector('.inner') as Element;
  setRect(a, { left: 100, top: 100, right: 300, bottom: 200 });
  setRect(aInner, { left: 100, top: 100, right: 300, bottom: 200 });
  setRect(b, { left: 100, top: 2000, right: 300, bottom: 2100 });
  setRect(bInner, { left: 100, top: 2000, right: 300, bottom: 2100 });

  // Make elementFromPoint always hit within the visible element.
  (document as any).elementFromPoint = () => aInner;

  let clicked: { x: number; y: number } | null = null;
  const res = await clickOperation.run(
    {
      page: {
        evaluate: async (fn: any, arg: any) => fn(arg),
      },
      systemInput: {
        mouseClick: async (x: number, y: number) => {
          clicked = { x, y };
          return { success: true };
        },
        mouseMove: async () => ({ success: true }),
      },
    },
    { selector: '.btn', index: 0, target: '.inner', useSystemMouse: true, visibleOnly: true },
  );

  assert.equal(res.success, true);
  assert.deepEqual(clicked, { x: 200, y: 150 });
});

test('scroll moves mouse into selector before wheel', async () => {
  const { document } = installDom(`
    <div class="scroller" id="s"><div id="child"></div></div>
  `);

  const s = document.getElementById('s')!;
  const child = document.getElementById('child')!;
  setRect(s, { left: 100, top: 100, right: 500, bottom: 500 });
  setRect(child, { left: 120, top: 120, right: 140, bottom: 140 });

  (document as any).elementFromPoint = () => child;

  let moved: { x: number; y: number } | null = null;
  let wheel: { dx: number; dy: number } | null = null;

  const res = await scrollOperation.run(
    {
      page: {
        evaluate: async (fn: any, arg: any) => fn(arg),
        keyboard: undefined,
      },
      systemInput: {
        mouseMove: async (x: number, y: number) => {
          moved = { x, y };
          return { success: true };
        },
        mouseWheel: async (dx: number, dy: number) => {
          wheel = { dx, dy };
          return { success: true };
        },
        mouseClick: async () => ({ success: true }),
      },
    },
    { selector: '.scroller', direction: 'down', distance: 600 },
  );

  assert.equal(res.success, true);
  // We should move near the top-middle (top + pad=24), not the center.
  assert.deepEqual(moved, { x: 300, y: 124 });
  assert.deepEqual(wheel, { dx: 0, dy: 600 });
});
