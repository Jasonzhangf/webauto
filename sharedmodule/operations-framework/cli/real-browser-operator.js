/**
 * Real Browser Operator using Playwright
 * This replaces the mock browser operator with real browser functionality
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import UniversalCookieManager from '../universal-cookie-manager.js';

class RealBrowserOperator {
  constructor() {
    this.config = {
      id: 'browser',
      name: 'Real Browser Operator',
      type: 'browser',
      description: 'Real browser instances using Playwright for web automation',
      version: '1.0.0'
    };
    this._browser = null;
    this._context = null;
    this._page = null;
    this._isInitialized = false;
  }

  async execute(params) {
    const startTime = Date.now();

    try {
      switch (params.action) {
        case 'start':
          return await this.startBrowser(params);
        case 'stop':
          return await this.stopBrowser();
        case 'restart':
          return await this.restartBrowser(params);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  validate(params) {
    if (!params.action || !['start', 'stop', 'restart'].includes(params.action)) {
      return false;
    }
    return true;
  }

  getCapabilities() {
    return ['browser-management', 'viewport-control', 'user-agent-control', 'cookie-management'];
  }

  async startBrowser(params) {
    const startTime = Date.now();

    if (this._isInitialized && this._browser) {
      return {
        success: true,
        data: {
          message: 'Browser already started',
          browserId: 'already-started',
          config: this.config
        },
        duration: 0,
        timestamp: Date.now()
      };
    }

    try {
      const headless = params.headless === false || params.headless === 'false' ? false : true;
      console.log(`🚀 Starting browser with headless: ${headless}`);

      // Process viewport parameters
      const viewport = params.viewport || { width: 1920, height: 1080 };
      const processedViewport = {
        width: typeof viewport.width === 'string' ? parseInt(viewport.width) : viewport.width,
        height: typeof viewport.height === 'string' ? parseInt(viewport.height) : viewport.height
      };

      // Handle NaN values
      if (isNaN(processedViewport.width)) processedViewport.width = 1920;
      if (isNaN(processedViewport.height)) processedViewport.height = 1080;

      // Launch real browser
      this._browser = await chromium.launch({
        headless: headless,
        viewport: processedViewport,
        userAgent: params.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-background-mode',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });

      // Create browser context
      this._context = await this._browser.newContext({
        viewport: processedViewport,
        userAgent: params.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      });

      // Create page
      this._page = await this._context.newPage();

      // Set default timeout
      const timeout = params.timeout ? parseInt(params.timeout) : 30000;
      this._page.setDefaultTimeout(timeout);

      this._isInitialized = true;

      console.log(`✅ Browser started successfully (headless: ${headless})`);

      return {
        success: true,
        data: {
          message: 'Browser started successfully',
          browserId: 'browser-' + Date.now(),
          pageId: 'page-' + Date.now(),
          config: {
            headless: headless,
            viewport: processedViewport,
            userAgent: params.userAgent,
            timeout: timeout
          }
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Failed to start browser: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async stopBrowser() {
    const startTime = Date.now();

    if (!this._isInitialized || !this._browser) {
      return {
        success: true,
        data: {
          message: 'Browser not running'
        },
        duration: 0,
        timestamp: Date.now()
      };
    }

    try {
      console.log('🛑 Stopping browser...');

      if (this._page) {
        await this._page.close();
        this._page = null;
      }

      if (this._context) {
        await this._context.close();
        this._context = null;
      }

      if (this._browser) {
        await this._browser.close();
        this._browser = null;
      }

      this._isInitialized = false;

      console.log('✅ Browser stopped successfully');

      return {
        success: true,
        data: {
          message: 'Browser stopped successfully'
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Failed to stop browser: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async restartBrowser(params) {
    const startTime = Date.now();
    await this.stopBrowser();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.startBrowser(params);
  }

  // Helper methods for other operators to use
  getPage() {
    return this._page;
  }

  getContext() {
    return this._context;
  }

  getBrowser() {
    return this._browser;
  }

  isInitialized() {
    return this._isInitialized;
  }
}

// Real Cookie Operator that works with real browser
class RealCookieOperator {
  constructor() {
    this.config = {
      id: 'cookie',
      name: 'Real Cookie Operator',
      type: 'cookie',
      description: 'Real cookie management for browser sessions with configurable paths',
      version: '1.0.0'
    };
    this._browserOperator = null;
    this._cookieManager = new UniversalCookieManager({
      basePath: path.join(os.homedir(), '.webauto')
    });
  }

  setBrowserOperator(browserOperator) {
    this._browserOperator = browserOperator;
  }

  async execute(params) {
    const startTime = Date.now();

    try {
      switch (params.action) {
        case 'load':
          return await this.loadCookies(params);
        case 'save':
          return await this.saveCookies(params);
        case 'clear':
          return await this.clearCookies(params);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async loadCookies(params) {
    const startTime = Date.now();

    if (!this._browserOperator || !this._browserOperator.getContext()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      const cookiePath = params.path || params.cookiePath;
      const domain = params.domain || 'weibo.com';

      console.log(`🍪 Loading cookies for ${domain} from ${cookiePath || 'default location'}...`);

      // Load cookies using universal manager
      const cookies = await this._cookieManager.loadCookies(domain, {
        customPath: cookiePath,
        useCache: params.useCache !== false
      });

      if (cookies.length === 0) {
        console.warn(`⚠️ No cookies found for ${domain}`);
        return {
          success: true,
          data: {
            message: `No cookies found for ${domain}`,
            count: 0
          },
          duration: Date.now() - startTime,
          timestamp: Date.now()
        };
      }

      const context = this._browserOperator.getContext();
      const formattedCookies = this._cookieManager.formatCookiesForBrowser(cookies);

      // Add cookies to browser context
      let successCount = 0;
      for (const cookie of formattedCookies) {
        try {
          await context.addCookies([cookie]);
          successCount++;
        } catch (cookieError) {
          console.warn(`⚠️ Failed to add cookie ${cookie.name}: ${cookieError.message}`);
        }
      }

      console.log(`✅ Successfully loaded ${successCount}/${cookies.length} cookies for ${domain}`);

      return {
        success: true,
        data: {
          message: `Cookies loaded for ${domain}`,
          count: successCount,
          total: cookies.length,
          domain: domain
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Failed to load cookies: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async saveCookies(params) {
    const startTime = Date.now();

    if (!this._browserOperator || !this._browserOperator.getContext()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      const cookiePath = params.path || params.cookiePath;
      const domain = params.domain || 'weibo.com';

      console.log(`💾 Saving cookies for ${domain} to ${cookiePath || 'default location'}...`);

      const context = this._browserOperator.getContext();
      const cookies = await context.cookies();

      // Save cookies using universal manager
      const success = await this._cookieManager.saveCookies(cookies, domain, {
        customPath: cookiePath
      });

      if (success) {
        return {
          success: true,
          data: {
            message: `Cookies saved for ${domain}`,
            count: cookies.length,
            path: cookiePath || this._cookieManager.getCookiePath(domain)
          },
          duration: Date.now() - startTime,
          timestamp: Date.now()
        };
      } else {
        throw new Error('Failed to save cookies');
      }

    } catch (error) {
      console.error(`❌ Failed to save cookies: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async clearCookies(params) {
    const startTime = Date.now();

    if (!this._browserOperator || !this._browserOperator.getContext()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      const domain = params.domain || 'weibo.com';
      const clearFile = params.clearFile !== false;

      console.log(`🧹 Clearing cookies for ${domain}...`);

      // Clear browser context cookies
      const context = this._browserOperator.getContext();
      await context.clearCookies();

      // Clear cookie file if requested
      if (clearFile) {
        await this._cookieManager.clearCookies(domain);
      }

      console.log('✅ Cookies cleared successfully');

      return {
        success: true,
        data: {
          message: `Cookies cleared for ${domain}`,
          domain: domain,
          fileCleared: clearFile
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Failed to clear cookies: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }
}

// Real Navigation Operator
class RealNavigationOperator {
  constructor() {
    this.config = {
      id: 'navigation',
      name: 'Real Navigation Operator',
      type: 'navigation',
      description: 'Real page navigation and interaction',
      version: '1.0.0'
    };
    this._browserOperator = null;
  }

  setBrowserOperator(browserOperator) {
    this._browserOperator = browserOperator;
  }

  async execute(params) {
    const startTime = Date.now();

    try {
      switch (params.action) {
        case 'navigate':
          return await this.navigateTo(params.url, params);
        case 'back':
          return await this.goBack();
        case 'forward':
          return await this.goForward();
        case 'refresh':
          return await this.refresh();
        case 'wait':
          return await this.waitForLoad(params.timeout, params.duration);
        case 'screenshot':
          return await this.takeScreenshot(params.path);
        case 'getInfo':
          return await this.getPageInfo();
        case 'analyzeStructure':
          return await this.analyzeStructure(params.outputFile);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async navigateTo(url, params = {}) {
    const startTime = Date.now();

    if (!this._browserOperator || !this._browserOperator.getPage()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      console.log(`🌐 Navigating to ${url}...`);

      const page = this._browserOperator.getPage();
      const timeout = params.timeout || 30000;

      await page.goto(url, {
        waitUntil: params.waitUntil || 'domcontentloaded',
        timeout: timeout
      });

      console.log(`✅ Navigated to ${url}`);

      return {
        success: true,
        data: {
          message: `Navigated to ${url}`,
          pageInfo: {
            url: page.url(),
            title: await page.title(),
            loadTime: Date.now() - startTime,
            status: 'loaded'
          }
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Failed to navigate to ${url}: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async waitForLoad(timeout = 30000, duration = null) {
    const startTime = Date.now();

    if (!this._browserOperator || !this._browserOperator.getPage()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      const waitTime = duration || timeout;
      console.log(`⏳ Waiting for ${waitTime}ms...`);

      const page = this._browserOperator.getPage();

      if (duration) {
        // Simple duration-based wait
        await new Promise(resolve => setTimeout(resolve, duration));
        console.log(`✅ Wait completed for ${duration}ms`);
      } else {
        // Load state-based wait
        await page.waitForLoadState('networkidle', { timeout });
        console.log(`✅ Page loaded successfully`);
      }

      return {
        success: true,
        data: {
          message: `Waited for ${waitTime}ms`
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Failed to wait: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async takeScreenshot(screenshotPath = './screenshots/screenshot.png') {
    if (!this._browserOperator || !this._browserOperator.getPage()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      console.log(`📸 Taking screenshot...`);

      const page = this._browserOperator.getPage();

      // Ensure directory exists
      const dir = path.dirname(screenshotPath);
      await fs.mkdir(dir, { recursive: true });

      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });

      console.log(`✅ Screenshot saved to ${screenshotPath}`);

      return {
        success: true,
        data: {
          message: 'Screenshot captured',
          screenshotPath: screenshotPath
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Failed to take screenshot: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async getPageInfo() {
    if (!this._browserOperator || !this._browserOperator.getPage()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      const page = this._browserOperator.getPage();

      return {
        success: true,
        data: {
          message: `Navigated to ${page.url()}`,
          pageInfo: {
            url: page.url(),
            title: await page.title(),
            loadTime: Date.now() - startTime,
            status: 'loaded',
            statusCode: 200
          }
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async goBack() {
    if (!this._browserOperator || !this._browserOperator.getPage()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      const page = this._browserOperator.getPage();
      await page.goBack();

      return {
        success: true,
        data: {
          message: 'Navigated back',
          pageInfo: {
            url: page.url(),
            title: await page.title()
          }
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async goForward() {
    if (!this._browserOperator || !this._browserOperator.getPage()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      const page = this._browserOperator.getPage();
      await page.goForward();

      return {
        success: true,
        data: {
          message: 'Navigated forward',
          pageInfo: {
            url: page.url(),
            title: await page.title()
          }
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async refresh() {
    if (!this._browserOperator || !this._browserOperator.getPage()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      const page = this._browserOperator.getPage();
      await page.reload();

      return {
        success: true,
        data: {
          message: 'Page refreshed',
          pageInfo: {
            url: page.url(),
            title: await page.title()
          }
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  async analyzeStructure(outputFile = './structure-analysis.json') {
    const startTime = Date.now();
    
    if (!this._browserOperator || !this._browserOperator.getPage()) {
      throw new Error('Browser not initialized. Please start browser first.');
    }

    try {
      console.log('🔍 Analyzing page structure...');
      const page = this._browserOperator.getPage();

      const analysis = await page.evaluate(() => {
        const containers = [];
        const posts = [];
        const links = [];

        // Analyze feed containers
        const feedSelectors = [
          '[class*="Feed"]',
          '[class*="feed"]',
          '[class*="Weibo"]',
          '[class*="weibo"]',
          '[class*="Card"]',
          '[class*="card"]',
          '[id*="feed"]',
          '[id*="Feed"]',
          '.main-content',
          '.content-wrap',
          '.Feed_body',
          '.Feed_body_3O0gD'
        ];

        feedSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            containers.push({
              selector,
              count: elements.length,
              visible: Array.from(elements).filter(el => el.offsetParent !== null).length,
              sample: Array.from(elements).slice(0, 3).map(el => ({
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                text: el.textContent?.substring(0, 100),
                children: el.children.length
              }))
            });
          }
        });

        // Analyze post items
        const postSelectors = [
          '[class*="Feed_body"] [class*="Item"]',
          '[class*="feed-item"]',
          '[class*="weibo-item"]',
          '[class*="card-item"]',
          '[class*="Feed_item"]',
          '[class*="FeedItem"]',
          'article',
          '[role="article"]'
        ];

        postSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            posts.push({
              selector,
              count: elements.length,
              visible: Array.from(elements).filter(el => el.offsetParent !== null).length,
              sample: Array.from(elements).slice(0, 3).map(el => ({
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                hasLinks: el.querySelectorAll('a').length,
                linkSample: Array.from(el.querySelectorAll('a')).slice(0, 3).map(a => ({
                  href: a.href,
                  text: a.textContent?.substring(0, 50)
                }))
              }))
            });
          }
        });

        // Analyze links
        const linkSelectors = [
          'a[href*="/detail/"]',
          'a[href*="/status/"]',
          'a[href*="weibo.com/"]',
          '[class*="title"] a',
          '[class*="content"] a',
          '.Feed_body_3O0gD a'
        ];

        linkSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            const uniqueLinks = new Set();
            const linkDetails = Array.from(elements)
              .filter(el => el.offsetParent !== null)
              .map(el => {
                const href = el.href;
                if (href && !uniqueLinks.has(href)) {
                  uniqueLinks.add(href);
                  return {
                    href,
                    text: el.textContent?.trim(),
                    className: el.className,
                    isPostLink: href.includes('/detail/') || href.includes('/status/')
                  };
                }
                return null;
              })
              .filter(Boolean);

            links.push({
              selector,
              total: elements.length,
              unique: linkDetails.length,
              postLinks: linkDetails.filter(l => l.isPostLink),
              sample: linkDetails.slice(0, 10)
            });
          }
        });

        return {
          url: window.location.href,
          title: document.title,
          timestamp: new Date().toISOString(),
          containers: { feed: containers, posts: posts },
          elements: { links: links },
          topSelectors: [
            ...containers.map(c => ({ selector: c.selector, type: 'container', confidence: c.visible >= 3 ? 'high' : 'medium' })),
            ...posts.map(p => ({ selector: p.selector, type: 'post', confidence: p.visible >= 5 ? 'high' : 'medium' })),
            ...links.map(l => ({ selector: l.selector, type: 'link', confidence: l.postLinks.length > 0 ? 'high' : 'medium' }))
          ].sort((a, b) => {
            const order = { high: 3, medium: 2, low: 1 };
            return order[b.confidence] - order[a.confidence];
          })
        };
      });

      // Save analysis to file
      await fs.writeFile(outputFile, JSON.stringify(analysis, null, 2));

      console.log(`✅ Structure analysis complete`);
      console.log(`📊 Found: ${analysis.containers.feed.length} feed containers, ${analysis.containers.posts.length} post selectors`);
      console.log(`🔗 Found: ${analysis.elements.links.filter(g => g.postLinks.length > 0).length} groups with post links`);
      console.log(`💾 Analysis saved to: ${outputFile}`);

      return {
        success: true,
        data: {
          message: 'Structure analysis completed',
          analysis: {
            containers: analysis.containers.feed.length,
            posts: analysis.containers.posts.length,
            linkGroups: analysis.elements.links.length,
            topSelectors: analysis.topSelectors.slice(0, 5)
          },
          outputFile
        },
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Structure analysis failed: ${error.message}`);
      return {
        success: false,
        data: null,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }
}

export {
  RealBrowserOperator,
  RealCookieOperator,
  RealNavigationOperator
};