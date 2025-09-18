/**
 * Browser Operations - Additional micro-operations for browser functionality
 */

import BaseOperation from '../core/BaseOperation';
import {
  OperationConfig,
  OperationResult,
  OperationContext
} from '../types';

/**
 * Screenshot Operation - Capture screenshots of web pages
 */
export class ScreenshotOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'ScreenshotOperation';
    this.description = 'Capture screenshots of web pages with various options';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['capture-screenshot', 'visual-capture'];
    this.supportedContainers = ['web-page', 'browser', 'any'];
    this.capabilities = ['screenshot-capture', 'image-generation', 'visual-analysis'];

    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'medium'
    };

    this.requiredParameters = [];
    this.optionalParameters = {
      path: './screenshots/',
      filename: `screenshot-${Date.now()}.png`,
      type: 'png',
      quality: 80,
      fullPage: false,
      clip: null,
      omitBackground: false,
      encoding: 'binary',
      captureBeyondViewport: false,
      selector: '',
      element: null,
      waitForSelector: '',
      waitForTimeout: 5000
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting screenshot capture', { params: finalParams });

    try {
      if (!context.page) {
        throw new Error('Page context not available');
      }

      const page = context.page;

      // Wait for selector if specified
      if (finalParams.waitForSelector) {
        await page.waitForSelector(finalParams.waitForSelector, {
          timeout: finalParams.waitForTimeout
        });
      }

      // Generate screenshot path
      const screenshotPath = finalParams.path.endsWith('/')
        ? `${finalParams.path}${finalParams.filename}`
        : `${finalParams.path}/${finalParams.filename}`;

      // Create directory if it doesn't exist
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(screenshotPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let screenshotOptions: any = {
        type: finalParams.type,
        quality: finalParams.quality,
        fullPage: finalParams.fullPage,
        omitBackground: finalParams.omitBackground,
        encoding: finalParams.encoding
      };

      // Handle element-specific screenshot
      if (finalParams.selector || finalParams.element) {
        const element = finalParams.selector
          ? await page.locator(finalParams.selector).first()
          : finalParams.element;

        if (await element.count() === 0) {
          throw new Error(`Element not found for screenshot: ${finalParams.selector || 'element provided'}`);
        }

        const boundingBox = await element.boundingBox();
        if (!boundingBox) {
          throw new Error('Element has no bounding box for screenshot');
        }

        screenshotOptions.clip = {
          x: boundingBox.x,
          y: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height
        };
      } else if (finalParams.clip) {
        screenshotOptions.clip = finalParams.clip;
      }

      // Capture screenshot
      const screenshot = await page.screenshot(screenshotOptions);

      // Save screenshot if binary encoding
      let resultData: any = {
        path: screenshotPath,
        size: screenshot.length,
        type: finalParams.type,
        timestamp: Date.now()
      };

      if (finalParams.encoding === 'binary') {
        fs.writeFileSync(screenshotPath, screenshot);
        resultData.saved = true;
        resultData.localPath = screenshotPath;
      } else {
        resultData.data = screenshot.toString('base64');
        resultData.encoding = 'base64';
      }

      // Get page info for context
      const pageInfo = {
        url: page.url(),
        title: await page.title(),
        viewport: page.viewportSize()
      };

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'Screenshot captured successfully', {
        path: screenshotPath,
        size: screenshot.length,
        executionTime
      });

      return {
        success: true,
        result: {
          screenshot: resultData,
          pageInfo
        },
        metadata: {
          path: screenshotPath,
          size: screenshot.length,
          executionTime,
          options: screenshotOptions
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'Screenshot capture failed', {
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          executionTime
        }
      };
    }
  }
}

/**
 * Scroll Operation - Scroll pages with various strategies
 */
export class ScrollOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'ScrollOperation';
    this.description = 'Scroll pages with various strategies and element targeting';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['scroll-page', 'page-navigation'];
    this.supportedContainers = ['web-page', 'browser', 'any'];
    this.capabilities = ['page-scrolling', 'element-navigation', 'lazy-loading'];

    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.9,
      memoryUsage: 'low'
    };

    this.requiredParameters = [];
    this.optionalParameters = {
      direction: 'down',
      amount: null,
      position: null,
      element: null,
      selector: null,
      behavior: 'smooth',
      waitAfter: 100,
      waitForContent: false,
      maxScrolls: 10,
      scrollDelay: 500,
      forceScroll: false
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting scroll operation', { params: finalParams });

    try {
      if (!context.page) {
        throw new Error('Page context not available');
      }

      const page = context.page;

      let scrollResults: any[] = [];

      if (finalParams.element || finalParams.selector) {
        // Scroll to element
        const element = finalParams.selector
          ? await page.locator(finalParams.selector).first()
          : finalParams.element;

        if (await element.count() === 0) {
          throw new Error(`Element not found for scrolling: ${finalParams.selector || 'element provided'}`);
        }

        await element.scrollIntoViewIfNeeded({ behavior: finalParams.behavior as any });

        scrollResults.push({
          type: 'element',
          selector: finalParams.selector,
          action: 'scrollIntoView'
        });

      } else if (finalParams.position) {
        // Scroll to specific position
        await page.evaluate(({ x, y }) => {
          window.scrollTo(x, y);
        }, finalParams.position);

        scrollResults.push({
          type: 'position',
          position: finalParams.position,
          action: 'scrollTo'
        });

      } else {
        // General page scrolling
        const scrollResultsArray = await this.performPageScrolling(page, finalParams);
        scrollResults = scrollResultsArray;
      }

      // Wait after scrolling if specified
      if (finalParams.waitAfter > 0) {
        await new Promise(resolve => setTimeout(resolve, finalParams.waitAfter));
      }

      // Get current scroll position
      const scrollPosition = await page.evaluate(() => ({
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientHeight: window.innerHeight,
        clientWidth: window.innerWidth
      }));

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'Scroll operation completed', {
        position: scrollPosition,
        scrollCount: scrollResults.length,
        executionTime
      });

      return {
        success: true,
        result: {
          scrollResults,
          scrollPosition,
          pageInfo: {
            url: page.url(),
            title: await page.title()
          }
        },
        metadata: {
          scrollCount: scrollResults.length,
          executionTime,
          finalPosition: scrollPosition
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'Scroll operation failed', {
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          executionTime
        }
      };
    }
  }

  private async performPageScrolling(page: any, params: OperationConfig): Promise<any[]> {
    const results: any[] = [];
    let scrollCount = 0;
    let previousHeight = 0;

    while (scrollCount < params.maxScrolls) {
      scrollCount++;

      // Perform scroll
      if (params.direction === 'down') {
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight);
        });
      } else if (params.direction === 'up') {
        await page.evaluate(() => {
          window.scrollBy(0, -window.innerHeight);
        });
      } else if (params.direction === 'left') {
        await page.evaluate(() => {
          window.scrollBy(-window.innerWidth, 0);
        });
      } else if (params.direction === 'right') {
        await page.evaluate(() => {
          window.scrollBy(window.innerWidth, 0);
        });
      } else if (typeof params.amount === 'number') {
        await page.evaluate(({ amount }) => {
          window.scrollBy(0, amount);
        }, { amount: params.amount });
      }

      // Get scroll info
      const scrollInfo = await page.evaluate(() => ({
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: window.innerHeight,
        atBottom: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 100,
        atTop: window.scrollY === 0
      }));

      results.push({
        scrollNumber: scrollCount,
        direction: params.direction,
        position: { x: scrollInfo.scrollY, y: scrollInfo.scrollY },
        scrollInfo
      });

      // Check if we've reached the end
      if (params.direction === 'down' && scrollInfo.atBottom) {
        break;
      } else if (params.direction === 'up' && scrollInfo.atTop) {
        break;
      }

      // Check for new content (lazy loading)
      if (params.waitForContent) {
        await new Promise(resolve => setTimeout(resolve, params.scrollDelay));

        const newHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        if (newHeight === previousHeight) {
          break; // No new content loaded
        }
        previousHeight = newHeight;
      }

      // Delay between scrolls
      if (params.scrollDelay > 0 && scrollCount < params.maxScrolls) {
        await new Promise(resolve => setTimeout(resolve, params.scrollDelay));
      }
    }

    return results;
  }
}

/**
 * Page Structure Analysis Operation - Analyze page structure and elements
 */
export class PageStructureOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'PageStructureOperation';
    this.description = 'Analyze page structure and extract element information';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['analyze-page', 'structure-analysis'];
    this.supportedContainers = ['web-page', 'browser', 'any'];
    this.capabilities = ['page-analysis', 'structure-extraction', 'element-classification'];

    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'medium'
    };

    this.requiredParameters = [];
    this.optionalParameters = {
      includeElements: true,
      includeForms: true,
      includeLinks: true,
      includeImages: true,
      includeHeadings: true,
      includeTables: true,
      includeLists: true,
      maxElements: 1000,
      elementTypes: ['a', 'button', 'input', 'select', 'textarea', 'img'],
      analyzeInteractivity: true,
      extractText: false,
      maxTextLength: 1000
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting page structure analysis', { params: finalParams });

    try {
      if (!context.page) {
        throw new Error('Page context not available');
      }

      const page = context.page;

      // Get basic page information
      const pageInfo = await page.evaluate(() => ({
        title: document.title,
        url: window.location.href,
        domain: window.location.hostname,
        charset: document.characterSet,
        language: document.documentElement.lang,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        documentSize: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight
        }
      }));

      // Analyze page structure
      const structureAnalysis = await this.analyzePageStructure(page, finalParams);

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'Page structure analysis completed', {
        elementsCount: structureAnalysis.totalElements,
        executionTime
      });

      return {
        success: true,
        result: {
          pageInfo,
          structure: structureAnalysis
        },
        metadata: {
          totalElements: structureAnalysis.totalElements,
          executionTime,
          analysisOptions: finalParams
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'Page structure analysis failed', {
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          executionTime
        }
      };
    }
  }

  private async analyzePageStructure(page: any, params: OperationConfig): Promise<any> {
    const analysis: any = {
      totalElements: 0,
      elements: {},
      sections: {},
      interactiveElements: [],
      forms: [],
      links: [],
      images: [],
      headings: [],
      tables: [],
      lists: []
    };

    // Analyze document structure
    const structureData = await page.evaluate(({ options }) => {
      const result: any = {
        totalElements: 0,
        elements: {},
        sections: {},
        interactiveElements: [],
        forms: [],
        links: [],
        images: [],
        headings: [],
        tables: [],
        lists: []
      };

      // Count all elements
      const allElements = document.querySelectorAll('*');
      result.totalElements = allElements.length;

      // Count by tag name
      allElements.forEach((element: Element) => {
        const tagName = element.tagName.toLowerCase();
        result.elements[tagName] = (result.elements[tagName] || 0) + 1;
      });

      // Analyze sections
      const sections = document.querySelectorAll('header, footer, nav, main, section, article, aside');
      sections.forEach((section: Element) => {
        const tagName = section.tagName.toLowerCase();
        if (!result.sections[tagName]) {
          result.sections[tagName] = [];
        }

        const sectionInfo: any = {
          tagName,
          id: section.id || '',
          classes: Array.from(section.classList),
          elementCount: section.querySelectorAll('*').length
        };

        if (options.extractText) {
          sectionInfo.textContent = section.textContent?.substring(0, options.maxTextLength) || '';
        }

        result.sections[tagName].push(sectionInfo);
      });

      // Interactive elements
      if (options.analyzeInteractivity) {
        const interactiveElements = document.querySelectorAll('button, [onclick], [href], [role="button"], [role="link"]');
        interactiveElements.forEach((element: Element) => {
          const info = this.getElementInfo(element, options);
          result.interactiveElements.push(info);
        });
      }

      // Forms
      if (options.includeForms) {
        const forms = document.querySelectorAll('form');
        forms.forEach((form: HTMLFormElement) => {
          const formInfo: any = {
            action: form.action,
            method: form.method,
            id: form.id,
            name: form.name,
            fields: []
          };

          const fields = form.querySelectorAll('input, select, textarea');
          fields.forEach((field: Element) => {
            formInfo.fields.push(this.getElementInfo(field, options));
          });

          result.forms.push(formInfo);
        });
      }

      // Links
      if (options.includeLinks) {
        const links = document.querySelectorAll('a[href]');
        links.forEach((link: HTMLAnchorElement) => {
          result.links.push({
            href: link.href,
            text: link.textContent?.trim() || '',
            title: link.title,
            target: link.target,
            rel: link.rel
          });
        });
      }

      // Images
      if (options.includeImages) {
        const images = document.querySelectorAll('img');
        images.forEach((img: HTMLImageElement) => {
          result.images.push({
            src: img.src,
            alt: img.alt,
            title: img.title,
            width: img.naturalWidth,
            height: img.naturalHeight,
            loading: img.loading
          });
        });
      }

      // Headings
      if (options.includeHeadings) {
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach((heading: HTMLHeadingElement) => {
          result.headings.push({
            level: heading.tagName.toLowerCase(),
            text: heading.textContent?.trim() || '',
            id: heading.id
          });
        });
      }

      // Tables
      if (options.includeTables) {
        const tables = document.querySelectorAll('table');
        tables.forEach((table: HTMLTableElement) => {
          const tableInfo: any = {
            rows: table.rows.length,
            columns: table.rows[0]?.cells.length || 0,
            id: table.id,
            caption: table.caption?.textContent || ''
          };

          if (options.extractText) {
            tableInfo.textContent = table.textContent?.substring(0, options.maxTextLength) || '';
          }

          result.tables.push(tableInfo);
        });
      }

      // Lists
      if (options.includeLists) {
        const lists = document.querySelectorAll('ul, ol, dl');
        lists.forEach((list: Element) => {
          const listInfo: any = {
            type: list.tagName.toLowerCase(),
            items: list.children.length,
            id: list.id
          };

          if (options.extractText) {
            listInfo.textContent = list.textContent?.substring(0, options.maxTextLength) || '';
          }

          result.lists.push(listInfo);
        });
      }

      return result;
    }, { options: params });

    return structureData;
  }

  private getElementInfo(element: Element, options: OperationConfig): any {
    const info: any = {
      tagName: element.tagName.toLowerCase(),
      id: element.id || '',
      classes: Array.from(element.classList),
      type: (element as HTMLInputElement).type || '',
      name: (element as HTMLInputElement).name || '',
      value: (element as HTMLInputElement).value || '',
      placeholder: (element as HTMLInputElement).placeholder || '',
      required: (element as HTMLInputElement).required || false,
      disabled: (element as HTMLInputElement).disabled || false,
      visible: element.offsetParent !== null
    };

    if (options.extractText) {
      info.textContent = element.textContent?.substring(0, options.maxTextLength) || '';
    }

    return info;
  }
}