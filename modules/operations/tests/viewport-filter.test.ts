import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import { createViewportFilter } from '../src/utils/visibility.js';

function installDom(html: string, viewport: { width: number; height: number } = { width: 800, height: 600 }) {
  const { window, document } = parseHTML(html);

  (globalThis as any).window = window;
  (globalThis as any).document = document;
  (globalThis as any).Element = window.Element;
  (globalThis as any).HTMLElement = window.HTMLElement;

  Object.defineProperty(window, 'innerWidth', { value: viewport.width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: viewport.height, configurable: true });

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
    toJSON() {
      return this;
    },
  });
}

test('fully visible element passes fullyVisible check', async () => {
  const { document } = installDom(`<div id="a">A</div>`);

  // Fully inside viewport
  setRect(document.getElementById('a')!, { left: 10, top: 10, right: 100, bottom: 100 });

  const filter = createViewportFilter();
  const result = filter({
    selector: '#a',
    index: 0,
    visibleOnly: false,
    fullyVisible: true,
    anchor: null,
  });

  assert.equal(result.fullyVisible, true);
  assert.equal(result.partiallyVisible, true);
  assert.notEqual(result.clickPoint, null);
});

test('partially visible element fails fullyVisible but passes partiallyVisible', async () => {
  const { document } = installDom(`<div id="b">B</div>`);

  // Partially outside bottom
  setRect(document.getElementById('b')!, { left: 10, top: 500, right: 100, bottom: 700 });

  const filter = createViewportFilter();
  const result = filter({
    selector: '#b',
    index: 0,
    visibleOnly: false,
    fullyVisible: true,
    anchor: null,
  });

  assert.equal(result.fullyVisible, false);
  assert.equal(result.partiallyVisible, true);
  assert.equal(result.clickPoint, null);
});

test('off-screen element fails both checks', async () => {
  const { document } = installDom(`<div id="c">C</div>`);

  // Completely outside viewport
  setRect(document.getElementById('c')!, { left: 1000, top: 2000, right: 1100, bottom: 2100 });

  const filter = createViewportFilter();
  const result = filter({
    selector: '#c',
    index: 0,
    visibleOnly: false,
    fullyVisible: true,
    anchor: null,
  });

  assert.equal(result.fullyVisible, false);
  assert.equal(result.partiallyVisible, false);
  assert.equal(result.element, null);
  assert.equal(result.clickPoint, null);
});

test('anchor verification passes when hit matches element', async () => {
  const { document } = installDom(`<div id="d">D</div>`);

  setRect(document.getElementById('d')!, { left: 10, top: 10, right: 100, bottom: 100 });

  (document as any).elementFromPoint = () => document.getElementById('d');

  const filter = createViewportFilter();
  const result = filter({
    selector: '#d',
    index: 0,
    visibleOnly: false,
    fullyVisible: true,
    anchor: { x: 50, y: 50 },
  });

  assert.equal(result.anchorMatch, true);
  assert.notEqual(result.clickPoint, null);
});

test('anchor verification fails when hit does not match element', async () => {
  const { document } = installDom(`<div id="e">E</div><div id="f">F</div>`);

  setRect(document.getElementById('e')!, { left: 10, top: 10, right: 100, bottom: 100 });
  setRect(document.getElementById('f')!, { left: 200, top: 200, right: 300, bottom: 300 });

  // elementFromPoint returns f instead of e
  (document as any).elementFromPoint = () => document.getElementById('f');

  const filter = createViewportFilter();
  const result = filter({
    selector: '#e',
    index: 0,
    visibleOnly: false,
    fullyVisible: true,
    anchor: { x: 50, y: 50 },
  });

  assert.equal(result.anchorMatch, false);
  assert.equal(result.clickPoint?.x, 55);
  assert.equal(result.clickPoint?.y, 55);
});

test('zero size element fails visibility check', async () => {
  const { document } = installDom(`<div id="g">G</div>`);

  // Zero size
  setRect(document.getElementById('g')!, { left: 10, top: 10, right: 10, bottom: 10 });

  const filter = createViewportFilter();
  const result = filter({
    selector: '#g',
    index: 0,
    visibleOnly: false,
    fullyVisible: true,
    anchor: null,
  });

  assert.equal(result.fullyVisible, false);
  assert.equal(result.partiallyVisible, false);
});
