/**
 * Browser Discovery Adapter
 * Connects TreeDiscoveryEngine to Browser Service
 */

import { DiscoveryDeps } from '../engine/TreeDiscoveryEngine.js';
import { SelectorByClass, PageContext } from '../engine/types.js';

export class BrowserDiscoveryAdapter implements DiscoveryDeps {
  private sessionManager: any;
  private sessionId: string;

  constructor(sessionManager: any, sessionId: string) {
    this.sessionManager = sessionManager;
    this.sessionId = sessionId;
  }

  async queryByClasses(scopeHandle: any, selector: SelectorByClass): Promise<any[]> {
    const session = this.sessionManager.getSession(this.sessionId);
    if (!session) return [];

    // Convert classes to CSS selector
    const cssSelector = selector.classes.map(c => `.${c}`).join('');
    if (!cssSelector) return [];

    // Use browser service to query elements
    // Note: We need to handle scopeHandle if it's a specific element context
    // For now we'll assume global scope if scopeHandle is 'root' or undefined
    
    try {
      // Execute script in browser to find elements
      // We return 'handles' which are actually just identifying info for now
      // In a real implementation, these would be CDP object handles or similar
      const result = await session.executeScript(`
        const elements = document.querySelectorAll('${cssSelector}');
        const handles = [];
        elements.forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          handles.push({
            index,
            selector: '${cssSelector}',
            visible: rect.width > 0 && rect.height > 0,
            bbox: { x1: rect.left, y1: rect.top, x2: rect.right, y2: rect.bottom }
          });
        });
        return handles;
      `);

      return result || [];
    } catch (error) {
      console.error('[BrowserDiscoveryAdapter] Query failed:', error);
      return [];
    }
  }

  async visible(handle: any): Promise<boolean> {
    // Check if element is visible
    // The handle from queryByClasses already contains visibility info
    return handle?.visible || false;
  }

  async bboxOf(handle: any): Promise<{ x1: number; y1: number; x2: number; y2: number } | undefined> {
    // Get element bounding box
    // The handle from queryByClasses already contains bbox info
    return handle?.bbox;
  }

  async pageContext(): Promise<PageContext> {
    const session = this.sessionManager.getSession(this.sessionId);
    if (!session) {
      return { url: '' };
    }

    try {
      const info = await session.executeScript(`
        return {
          url: window.location.href,
          title: document.title,
          userAgent: navigator.userAgent
        };
      `);
      return info || { url: '' };
    } catch (error) {
      console.error('[BrowserDiscoveryAdapter] Page context failed:', error);
      return { url: '' };
    }
  }
}
