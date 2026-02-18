import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

export type DomHarness = {
  window: Window & typeof globalThis;
  document: Document;
  cleanup: () => void;
};

export function setupDom(html = '<!doctype html><html><body></body></html>'): DomHarness {
  const dom = new JSDOM(html, { url: 'https://webauto.local/' });
  const win = dom.window as unknown as Window & typeof globalThis;
  const doc = dom.window.document;

  const prev = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    HTMLElement: (globalThis as any).HTMLElement,
    HTMLInputElement: (globalThis as any).HTMLInputElement,
    HTMLSelectElement: (globalThis as any).HTMLSelectElement,
    HTMLTextAreaElement: (globalThis as any).HTMLTextAreaElement,
    HTMLDataListElement: (globalThis as any).HTMLDataListElement,
    Event: (globalThis as any).Event,
    KeyboardEvent: (globalThis as any).KeyboardEvent,
    localStorage: (globalThis as any).localStorage,
  };

  (globalThis as any).window = win;
  (globalThis as any).document = doc;
  (globalThis as any).HTMLElement = dom.window.HTMLElement;
  (globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
  (globalThis as any).HTMLSelectElement = dom.window.HTMLSelectElement;
  (globalThis as any).HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  (globalThis as any).HTMLDataListElement = dom.window.HTMLDataListElement;
  (globalThis as any).Event = dom.window.Event;
  (globalThis as any).KeyboardEvent = dom.window.KeyboardEvent;
  (globalThis as any).localStorage = dom.window.localStorage;

  return {
    window: win,
    document: doc,
    cleanup: () => {
      (globalThis as any).window = prev.window;
      (globalThis as any).document = prev.document;
      (globalThis as any).HTMLElement = prev.HTMLElement;
      (globalThis as any).HTMLInputElement = prev.HTMLInputElement;
      (globalThis as any).HTMLSelectElement = prev.HTMLSelectElement;
      (globalThis as any).HTMLTextAreaElement = prev.HTMLTextAreaElement;
      (globalThis as any).HTMLDataListElement = prev.HTMLDataListElement;
      (globalThis as any).Event = prev.Event;
      (globalThis as any).KeyboardEvent = prev.KeyboardEvent;
      (globalThis as any).localStorage = prev.localStorage;
      dom.window.close();
    },
  };
}
