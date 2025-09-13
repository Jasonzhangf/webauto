/**
 * 简化的页面操作中心
 * 提供基本的页面交互功能
 */

import { Page, ElementHandle } from 'playwright';

export interface ClickOptions {
  timeout?: number;
  force?: boolean;
  position?: { x: number; y: number };
}

export interface TypeOptions {
  delay?: number;
  timeout?: number;
}

export interface ScrollOptions {
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  smooth?: boolean;
}

export interface ExtractOptions {
  includeLinks?: boolean;
  includeImages?: boolean;
  includeText?: boolean;
  maxDepth?: number;
}

export interface ExtractedContent {
  text: string;
  links: Array<{ text: string; url: string }>;
  images: Array<{ src: string; alt?: string }>;
  metadata: {
    title: string;
    url: string;
    timestamp: string;
  };
}

/**
 * 页面操作中心
 * 提供统一的页面交互接口
 */
export class PageOperationCenter {
  /**
   * 点击元素
   */
  async click(
    page: Page,
    selector: string | ElementHandle,
    options: ClickOptions = {}
  ): Promise<void> {
    try {
      const { timeout = 10000, force = false, position } = options;
      
      if (typeof selector === 'string') {
        await page.click(selector, { timeout, force, position });
      } else {
        if (selector) {
          await selector.click({ timeout, force, position });
        }
      }
      
      console.log(`[PageOperationCenter] Clicked element: ${typeof selector === 'string' ? selector : 'element'}`);
    } catch (error) {
      console.error(`[PageOperationCenter] Click failed:`, error);
      throw error;
    }
  }

  /**
   * 输入文本
   */
  async type(
    page: Page,
    selector: string | ElementHandle,
    text: string,
    options: TypeOptions = {}
  ): Promise<void> {
    try {
      const { delay = 100, timeout = 10000 } = options;
      
      if (typeof selector === 'string') {
        await page.type(selector, text, { delay, timeout });
      } else {
        if (selector) {
          await selector.type(text, { delay, timeout });
        }
      }
      
      console.log(`[PageOperationCenter] Typed text in element: ${text.substring(0, 50)}...`);
    } catch (error) {
      console.error(`[PageOperationCenter] Type failed:`, error);
      throw error;
    }
  }

  /**
   * 滚动页面
   */
  async scroll(page: Page, options: ScrollOptions): Promise<void> {
    try {
      const { direction, amount = 500, smooth = true } = options;
      
      let script: string;
      switch (direction) {
        case 'up':
          script = `window.scrollBy(0, ${-amount})`;
          break;
        case 'down':
          script = `window.scrollBy(0, ${amount})`;
          break;
        case 'left':
          script = `window.scrollBy(${-amount}, 0)`;
          break;
        case 'right':
          script = `window.scrollBy(${amount}, 0)`;
          break;
      }
      
      if (smooth) {
        script = `window.scrollTo({ top: window.scrollY + ${direction === 'up' || direction === 'down' ? (direction === 'down' ? amount : -amount) : 0}, left: window.scrollX + ${direction === 'left' || direction === 'right' ? (direction === 'right' ? amount : -amount) : 0}, behavior: 'smooth' })`;
      }
      
      await page.evaluate(script);
      
      console.log(`[PageOperationCenter] Scrolled ${direction} by ${amount}px`);
    } catch (error) {
      console.error(`[PageOperationCenter] Scroll failed:`, error);
      throw error;
    }
  }

  /**
   * 提取页面内容
   */
  async extractContent(page: Page, options: ExtractOptions = {}): Promise<ExtractedContent> {
    try {
      const {
        includeLinks = true,
        includeImages = true,
        includeText = true,
        maxDepth = 3
      } = options;

      const result: ExtractedContent = {
        text: '',
        links: [],
        images: [],
        metadata: {
          title: await page.title(),
          url: page.url(),
          timestamp: new Date().toISOString()
        }
      };

      // 提取文本内容
      if (includeText) {
        result.text = await page.evaluate(() => {
          return document.body?.innerText || '';
        });
      }

      // 提取链接
      if (includeLinks) {
        result.links = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          return links.map(link => ({
            text: link.textContent?.trim() || '',
            url: link.getAttribute('href') || ''
          })).filter(link => link.url && !link.url.startsWith('#'));
        });
      }

      // 提取图片
      if (includeImages) {
        result.images = await page.evaluate(() => {
          const images = Array.from(document.querySelectorAll('img[src]'));
          return images.map(img => ({
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || undefined
          })).filter(img => img.src);
        });
      }

      console.log(`[PageOperationCenter] Extracted content: ${result.links.length} links, ${result.images.length} images`);
      return result;
    } catch (error) {
      console.error(`[PageOperationCenter] Content extraction failed:`, error);
      throw error;
    }
  }

  /**
   * 等待元素
   */
  async waitFor(
    page: Page,
    selector: string,
    options: {
      timeout?: number;
      state?: 'attached' | 'detached' | 'visible' | 'hidden';
    } = {}
  ): Promise<void> {
    try {
      const { timeout = 10000, state = 'attached' } = options;
      await page.waitForSelector(selector, { timeout, state });
      console.log(`[PageOperationCenter] Waited for element: ${selector}`);
    } catch (error) {
      console.error(`[PageOperationCenter] Wait failed for selector ${selector}:`, error);
      throw error;
    }
  }

  /**
   * 截图
   */
  async screenshot(
    page: Page,
    options: {
      fullPage?: boolean;
      path?: string;
      quality?: number;
    } = {}
  ): Promise<Buffer> {
    try {
      const screenshot = await page.screenshot(options);
      console.log(`[PageOperationCenter] Screenshot captured (${screenshot.length} bytes)`);
      return screenshot;
    } catch (error) {
      console.error(`[PageOperationCenter] Screenshot failed:`, error);
      throw error;
    }
  }

  /**
   * 导航到URL
   */
  async navigate(
    page: Page,
    url: string,
    options: {
      timeout?: number;
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    } = {}
  ): Promise<void> {
    try {
      const { timeout = 30000, waitUntil = 'domcontentloaded' } = options;
      await page.goto(url, { timeout, waitUntil });
      console.log(`[PageOperationCenter] Navigated to: ${url}`);
    } catch (error) {
      console.error(`[PageOperationCenter] Navigation failed:`, error);
      throw error;
    }
  }
}