import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import type { AutomationSession } from './index.js';

class HtmlFixtureElementHandle {
  constructor(private element: Element, private page: HtmlFixturePage) {}

  async evaluate(fn: any, arg?: any) {
    return this.page.evaluateOnElement(fn, this.element, arg);
  }

  async dispose() {
    // no-op for fixture handles
  }
}

class HtmlFixturePage {
  private document: Document;
  private window: Window & typeof globalThis;

  constructor(private html: string, private currentUrl: string) {
    const { document, window } = parseHTML(html);
    this.document = document;
    this.window = window as typeof window & typeof globalThis;
  }

  url() {
    return this.currentUrl;
  }

  async waitForTimeout(ms: number) {
    const duration = Math.min(ms, 5);
    await new Promise((resolve) => setTimeout(resolve, duration));
  }

  async waitForLoadState(_state?: any) {
    return;
  }

  async waitForFunction(fn: any) {
    return this.evaluate(fn);
  }

  async $$(selector: string) {
    try {
      const nodes = this.document.querySelectorAll(selector);
      return Array.from(nodes).map((node) => new HtmlFixtureElementHandle(node, this));
    } catch {
      return [];
    }
  }

  async evaluate(fn: any, arg?: any) {
    return this.runWithDocument(fn, undefined, arg);
  }

  async evaluateOnElement(fn: any, element: Element, arg?: any) {
    return this.runWithDocument(fn, element, arg);
  }

  private async runWithDocument(fn: any, element?: Element, arg?: any) {
    const previousDocument = (globalThis as any).document;
    const previousWindow = (globalThis as any).window;
    try {
      (globalThis as any).document = this.document;
      (globalThis as any).window = this.window;
      if (element !== undefined) {
        return await fn(element, arg);
      }
      return await fn(arg);
    } finally {
      (globalThis as any).document = previousDocument;
      (globalThis as any).window = previousWindow;
    }
  }
}

class HtmlFixtureSession implements AutomationSession {
  private page: HtmlFixturePage | null = null;

  constructor(private fixtureHtml: string, private url: string) {}

  async ensurePage(_url?: string) {
    if (!this.page) {
      this.page = new HtmlFixturePage(this.fixtureHtml, this.url);
    }
    return this.page;
  }
}

export function createFixtureSessionFromFile(fixturePath: string, url: string): AutomationSession {
  const html = readFileSync(fixturePath, 'utf-8');
  return new HtmlFixtureSession(html, url);
}
