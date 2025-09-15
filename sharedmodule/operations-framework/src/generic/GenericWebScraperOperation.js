/**
 * 通用Web抓取操作
 * 支持通过配置文件驱动的网页抓取、数据提取和内容处理
 */

import BaseOperation from "../BaseOperation.js";

export class GenericWebScraperOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'GenericWebScraperOperation';
    this.description = '通用Web抓取操作，支持配置驱动的网页数据提取';
    this.version = '1.0.0';
    
    // 内置的提取器
    this.extractors = {
      text: this.extractText.bind(this),
      html: this.extractHTML.bind(this),
      attribute: this.extractAttribute.bind(this),
      href: this.extractHref.bind(this),
      src: this.extractSrc.bind(this),
      table: this.extractTable.bind(this),
      list: this.extractList.bind(this),
      form: this.extractForm.bind(this),
      image: this.extractImage.bind(this),
      metadata: this.extractMetadata.bind(this)
    };
    
    // 内置的导航器
    this.navigators = {
      click: this.navigateClick.bind(this),
      fill: this.navigateFill.bind(this),
      select: this.navigateSelect.bind(this),
      hover: this.navigateHover.bind(this),
      scroll: this.navigateScroll.bind(this),
      wait: this.navigateWait.bind(this),
      screenshot: this.navigateScreenshot.bind(this)
    };
  }

  /**
   * 执行Web抓取操作
   */
  async execute(context, params = {}) {
    const { 
      operation = 'scrape', 
      scraperType = 'single', // 'single', 'batch', 'pagination', 'search'
      ...scraperParams 
    } = params;

    try {
      this.logger.info('Starting web scraper operation', { 
        operation, 
        scraperType,
        scraperParams 
      });

      switch (operation) {
        case 'scrape':
          return await this.executeScrape(context, scraperParams);
        case 'navigate':
          return await this.executeNavigate(context, scraperParams);
        case 'extract':
          return await this.executeExtract(context, scraperParams);
        case 'batch':
          return await this.executeBatch(context, scraperParams);
        case 'search':
          return await this.executeSearch(context, scraperParams);
        case 'pagination':
          return await this.executePagination(context, scraperParams);
        default:
          throw new Error(`Unknown web scraper operation: ${operation}`);
      }
    } catch (error) {
      this.logger.error('Web scraper operation failed', { 
        operation, 
        scraperType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 执行单页面抓取
   */
  async executeScrape(context, params = {}) {
    const {
      url,
      selectors,
      outputFormat = 'json',
      outputDir = './output',
      fileName,
      browserConfig = {},
      pageConfig = {}
    } = params;

    if (!url) {
      throw new Error('URL is required for scrape operation');
    }

    if (!selectors || !Array.isArray(selectors)) {
      throw new Error('Selectors are required and must be an array');
    }

    this.logger.info('Scraping single page', { 
      url,
      selectorCount: selectors.length,
      outputFormat 
    });

    // 获取或创建浏览器实例
    const browser = await this.getOrCreateBrowser(context, browserConfig);
    
    // 创建新页面
    const page = await browser.newPage();
    
    try {
      // 配置页面
      await this.configurePage(page, pageConfig);
      
      // 导航到URL
      await this.navigateTo(page, url);
      
      // 等待页面加载
      await this.waitForPageReady(page);
      
      // 提取数据
      const extractedData = await this.extractData(page, selectors);
      
      // 保存结果
      const result = await this.saveResults(extractedData, {
        outputFormat,
        outputDir,
        fileName: fileName || `scrape_${Date.now()}`,
        url
      });

      return {
        success: true,
        operation: 'scrape',
        url,
        selectorCount: selectors.length,
        dataCount: extractedData.length,
        result,
        metadata: {
          timestamp: new Date().toISOString(),
          outputFormat,
          outputFile: result.filePath
        }
      };

    } finally {
      // 关闭页面
      await page.close();
    }
  }

  /**
   * 执行导航操作
   */
  async executeNavigate(context, params = {}) {
    const {
      url,
      actions = [],
      waitForNavigation = true,
      browserConfig = {},
      pageConfig = {}
    } = params;

    if (!url) {
      throw new Error('URL is required for navigate operation');
    }

    if (!actions || actions.length === 0) {
      throw new Error('Actions are required for navigate operation');
    }

    this.logger.info('Navigating with actions', { 
      url,
      actionCount: actions.length 
    });

    // 获取或创建浏览器实例
    const browser = await this.getOrCreateBrowser(context, browserConfig);
    
    // 创建新页面
    const page = await browser.newPage();
    
    try {
      // 配置页面
      await this.configurePage(page, pageConfig);
      
      // 导航到URL
      await this.navigateTo(page, url);
      
      // 执行导航动作
      const actionResults = [];
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const result = await this.executeNavigationAction(page, action);
        actionResults.push({
          index: i,
          action: action.type,
          result
        });
      }

      // 获取最终状态
      const finalState = await this.getPageState(page);

      return {
        success: true,
        operation: 'navigate',
        url,
        actionsExecuted: actionResults.length,
        actionResults,
        finalState,
        metadata: {
          timestamp: new Date().toISOString(),
          finalUrl: finalState.url
        }
      };

    } finally {
      // 关闭页面
      await page.close();
    }
  }

  /**
   * 执行数据提取操作
   */
  async executeExtract(context, params = {}) {
    const {
      url,
      extractionRules = [],
      outputFormat = 'json',
      outputDir = './output',
      browserConfig = {},
      pageConfig = {}
    } = params;

    if (!url) {
      throw new Error('URL is required for extract operation');
    }

    if (!extractionRules || extractionRules.length === 0) {
      throw new Error('Extraction rules are required for extract operation');
    }

    this.logger.info('Extracting data with rules', { 
      url,
      ruleCount: extractionRules.length,
      outputFormat 
    });

    // 获取或创建浏览器实例
    const browser = await this.getOrCreateBrowser(context, browserConfig);
    
    // 创建新页面
    const page = await browser.newPage();
    
    try {
      // 配置页面
      await this.configurePage(page, pageConfig);
      
      // 导航到URL
      await this.navigateTo(page, url);
      
      // 等待页面加载
      await this.waitForPageReady(page);
      
      // 应用提取规则
      const extractedData = await this.applyExtractionRules(page, extractionRules);
      
      // 保存结果
      const result = await this.saveResults(extractedData, {
        outputFormat,
        outputDir,
        fileName: `extract_${Date.now()}`,
        url
      });

      return {
        success: true,
        operation: 'extract',
        url,
        ruleCount: extractionRules.length,
        dataCount: extractedData.length,
        result,
        metadata: {
          timestamp: new Date().toISOString(),
          outputFormat,
          outputFile: result.filePath
        }
      };

    } finally {
      // 关闭页面
      await page.close();
    }
  }

  /**
   * 执行批量抓取
   */
  async executeBatch(context, params = {}) {
    const {
      urls,
      selectors,
      outputFormat = 'json',
      outputDir = './output',
      maxConcurrency = 3,
      delayBetweenRequests = 1000,
      browserConfig = {},
      pageConfig = {}
    } = params;

    if (!urls || !Array.isArray(urls)) {
      throw new Error('URLs are required and must be an array');
    }

    if (!selectors || !Array.isArray(selectors)) {
      throw new Error('Selectors are required and must be an array');
    }

    this.logger.info('Starting batch scraping', { 
      urlCount: urls.length,
      selectorCount: selectors.length,
      maxConcurrency,
      delayBetweenRequests 
    });

    // 获取或创建浏览器实例
    const browser = await this.getOrCreateBrowser(context, browserConfig);
    
    // 批量处理
    const results = [];
    const errors = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      try {
        this.logger.info(`Processing URL ${i + 1}/${urls.length}`, { url });
        
        // 创建新页面
        const page = await browser.newPage();
        
        try {
          // 配置页面
          await this.configurePage(page, pageConfig);
          
          // 导航到URL
          await this.navigateTo(page, url);
          
          // 等待页面加载
          await this.waitForPageReady(page);
          
          // 提取数据
          const extractedData = await this.extractData(page, selectors);
          
          // 保存结果
          const result = await this.saveResults(extractedData, {
            outputFormat,
            outputDir,
            fileName: `batch_${i}_${Date.now()}`,
            url
          });
          
          results.push({
            index: i,
            url,
            success: true,
            dataCount: extractedData.length,
            result,
            filePath: result.filePath
          });
          
          // 延迟
          if (delayBetweenRequests > 0 && i < urls.length - 1) {
            await this.sleep(delayBetweenRequests);
          }
          
        } finally {
          // 关闭页面
          await page.close();
        }
        
      } catch (error) {
        this.logger.error(`Failed to process URL ${i + 1}`, { 
          url, 
          error: error.message 
        });
        errors.push({
          index: i,
          url,
          error: error.message
        });
      }
    }

    // 合并结果
    const mergedResult = await this.mergeBatchResults(results, {
      outputFormat,
      outputDir
    });

    return {
      success: true,
      operation: 'batch',
      totalUrls: urls.length,
      successfulUrls: results.length,
      failedUrls: errors.length,
      results,
      errors,
      mergedResult,
      metadata: {
        timestamp: new Date().toISOString(),
        outputFormat,
        outputFile: mergedResult.filePath
      }
    };
  }

  /**
   * 执行搜索抓取
   */
  async executeSearch(context, params = {}) {
    const {
      searchEngine = 'google',
      query,
      resultCount = 10,
      selectors,
      outputFormat = 'json',
      outputDir = './output',
      browserConfig = {},
      pageConfig = {}
    } = params;

    if (!query) {
      throw new Error('Query is required for search operation');
    }

    // 构建搜索URL
    const searchUrl = this.buildSearchUrl(searchEngine, query, resultCount);
    
    this.logger.info('Executing search', { 
      searchEngine,
      query,
      resultCount,
      searchUrl 
    });

    // 获取或创建浏览器实例
    const browser = await this.getOrCreateBrowser(context, browserConfig);
    
    // 创建新页面
    const page = await browser.newPage();
    
    try {
      // 配置页面
      await this.configurePage(page, pageConfig);
      
      // 导航到搜索URL
      await this.navigateTo(page, searchUrl);
      
      // 等待页面加载
      await this.waitForPageReady(page);
      
      // 提取搜索结果
      const searchResults = await this.extractSearchResults(page, selectors);
      
      // 保存结果
      const result = await this.saveResults(searchResults, {
        outputFormat,
        outputDir,
        fileName: `search_${Date.now()}`,
        query,
        searchEngine
      });

      return {
        success: true,
        operation: 'search',
        searchEngine,
        query,
        resultCount: searchResults.length,
        result,
        metadata: {
          timestamp: new Date().toISOString(),
          outputFormat,
          outputFile: result.filePath
        }
      };

    } finally {
      // 关闭页面
      await page.close();
    }
  }

  /**
   * 执行分页抓取
   */
  async executePagination(context, params = {}) {
    const {
      baseUrl,
      selectors,
      paginationSelector,
      maxPages = 10,
      outputFormat = 'json',
      outputDir = './output',
      browserConfig = {},
      pageConfig = {}
    } = params;

    if (!baseUrl) {
      throw new Error('Base URL is required for pagination operation');
    }

    if (!paginationSelector) {
      throw new Error('Pagination selector is required for pagination operation');
    }

    this.logger.info('Starting pagination scraping', { 
      baseUrl,
      maxPages,
      paginationSelector 
    });

    // 获取或创建浏览器实例
    const browser = await this.getOrCreateBrowser(context, browserConfig);
    
    // 创建新页面
    const page = await browser.newPage();
    
    try {
      // 配置页面
      await this.configurePage(page, pageConfig);
      
      // 导航到基础URL
      await this.navigateTo(page, baseUrl);
      
      // 等待页面加载
      await this.waitForPageReady(page);
      
      // 分页抓取
      const allResults = [];
      let currentPage = 1;
      let hasNextPage = true;

      while (hasNextPage && currentPage <= maxPages) {
        this.logger.info(`Processing page ${currentPage}`, { 
          url: page.url(),
          currentPage 
        });
        
        // 提取当前页数据
        const pageData = await this.extractData(page, selectors);
        allResults.push(...pageData);
        
        // 检查是否有下一页
        hasNextPage = await this.hasNextPage(page, paginationSelector);
        
        if (hasNextPage && currentPage < maxPages) {
          // 导航到下一页
          await this.goToNextPage(page, paginationSelector);
          currentPage++;
          
          // 等待页面加载
          await this.waitForPageReady(page);
        }
      }

      // 保存结果
      const result = await this.saveResults(allResults, {
        outputFormat,
        outputDir,
        fileName: `pagination_${Date.now()}`,
        baseUrl,
        pagesScraped: currentPage
      });

      return {
        success: true,
        operation: 'pagination',
        baseUrl,
        pagesScraped: currentPage,
        totalResults: allResults.length,
        result,
        metadata: {
          timestamp: new Date().toISOString(),
          outputFormat,
          outputFile: result.filePath
        }
      };

    } finally {
      // 关闭页面
      await page.close();
    }
  }

  /**
   * 获取或创建浏览器实例
   */
  async getOrCreateBrowser(context, browserConfig) {
    // 尝试从上下文获取浏览器实例
    let browser = await context.getBrowser();
    
    if (!browser) {
      // 创建新的浏览器实例
      browser = await this.createBrowser(browserConfig);
      await context.setBrowser(browser);
    }
    
    return browser;
  }

  /**
   * 创建浏览器实例
   */
  async createBrowser(config = {}) {
    // 这里应该根据实际的浏览器库（如 Playwright、Puppeteer）来创建
    // 这是一个示例实现
    this.logger.info('Creating browser instance', config);
    
    // 实际实现会使用 Playwright 或其他浏览器自动化库
    // 这里返回一个模拟的浏览器对象
    return {
      newPage: async () => {
        return this.createMockPage();
      },
      close: async () => {
        this.logger.info('Browser closed');
      }
    };
  }

  /**
   * 创建模拟页面
   */
  async createMockPage() {
    return {
      goto: async (url) => {
        this.logger.info('Navigating to', { url });
      },
      waitForSelector: async (selector) => {
        this.logger.info('Waiting for selector', { selector });
      },
      click: async (selector) => {
        this.logger.info('Clicking', { selector });
      },
      fill: async (selector, value) => {
        this.logger.info('Filling', { selector, value });
      },
      select: async (selector, value) => {
        this.logger.info('Selecting', { selector, value });
      },
      hover: async (selector) => {
        this.logger.info('Hovering', { selector });
      },
      evaluate: async (fn) => {
        return fn();
      },
      screenshot: async (options) => {
        this.logger.info('Taking screenshot', options);
        return Buffer.from('screenshot-data');
      },
      close: async () => {
        this.logger.info('Page closed');
      },
      url: () => 'https://example.com',
      title: () => 'Example Page'
    };
  }

  /**
   * 配置页面
   */
  async configurePage(page, config = {}) {
    const {
      viewport = { width: 1920, height: 1080 },
      userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      timeout = 30000,
      waitForNetworkIdle = true
    } = config;

    this.logger.info('Configuring page', config);

    // 实际实现会设置页面配置
    // 这里只是记录配置
  }

  /**
   * 导航到URL
   */
  async navigateTo(page, url) {
    this.logger.info('Navigating to URL', { url });
    await page.goto(url, { waitUntil: 'networkidle2' });
  }

  /**
   * 等待页面就绪
   */
  async waitForPageReady(page) {
    this.logger.info('Waiting for page ready');
    await page.waitForTimeout(2000); // 等待页面基本加载
  }

  /**
   * 提取数据
   */
  async extractData(page, selectors) {
    const results = [];

    for (const selector of selectors) {
      try {
        const extractor = this.extractors[selector.type];
        if (!extractor) {
          this.logger.warn('Unknown extractor type', { type: selector.type });
          continue;
        }

        const data = await extractor(page, selector);
        results.push({
          selector: selector.name || selector.type,
          type: selector.type,
          data
        });
      } catch (error) {
        this.logger.error('Failed to extract data', { 
          selector: selector.name || selector.type,
          error: error.message 
        });
      }
    }

    return results;
  }

  /**
   * 应用提取规则
   */
  async applyExtractionRules(page, rules) {
    const results = [];

    for (const rule of rules) {
      try {
        const extractor = this.extractors[rule.type];
        if (!extractor) {
          this.logger.warn('Unknown extractor type', { type: rule.type });
          continue;
        }

        const data = await extractor(page, rule);
        results.push({
          rule: rule.name || rule.type,
          type: rule.type,
          data
        });
      } catch (error) {
        this.logger.error('Failed to apply extraction rule', { 
          rule: rule.name || rule.type,
          error: error.message 
        });
      }
    }

    return results;
  }

  /**
   * 提取文本
   */
  async extractText(page, selector) {
    const elements = await page.$$(selector.selector);
    const texts = [];

    for (const element of elements) {
      const text = await element.textContent();
      if (text && text.trim()) {
        texts.push(text.trim());
      }
    }

    return texts;
  }

  /**
   * 提取HTML
   */
  async extractHTML(page, selector) {
    const elements = await page.$$(selector.selector);
    const htmlContents = [];

    for (const element of elements) {
      const html = await element.evaluate(el => el.outerHTML);
      if (html) {
        htmlContents.push(html);
      }
    }

    return htmlContents;
  }

  /**
   * 提取属性
   */
  async extractAttribute(page, selector) {
    const elements = await page.$$(selector.selector);
    const attributes = [];

    for (const element of elements) {
      const attribute = await element.getAttribute(selector.attribute || 'href');
      if (attribute) {
        attributes.push(attribute);
      }
    }

    return attributes;
  }

  /**
   * 提取链接
   */
  async extractHref(page, selector) {
    const elements = await page.$$(selector.selector || 'a');
    const hrefs = [];

    for (const element of elements) {
      const href = await element.getAttribute('href');
      if (href && href.trim()) {
        hrefs.push(href.trim());
      }
    }

    return hrefs;
  }

  /**
   * 提取图片源
   */
  async extractSrc(page, selector) {
    const elements = await page.$$(selector.selector || 'img');
    const srcs = [];

    for (const element of elements) {
      const src = await element.getAttribute('src');
      if (src && src.trim()) {
        srcs.push(src.trim());
      }
    }

    return srcs;
  }

  /**
   * 提取表格
   */
  async extractTable(page, selector) {
    const tables = await page.$$(selector.selector || 'table');
    const tableData = [];

    for (const table of tables) {
      const rows = await table.$$('tr');
      const data = [];

      for (const row of rows) {
        const cells = await row.$$('td, th');
        const rowData = [];

        for (const cell of cells) {
          const text = await cell.textContent();
          rowData.push(text ? text.trim() : '');
        }

        if (rowData.length > 0) {
          data.push(rowData);
        }
      }

      if (data.length > 0) {
        tableData.push(data);
      }
    }

    return tableData;
  }

  /**
   * 提取列表
   */
  async extractList(page, selector) {
    const lists = await page.$$(selector.selector || 'ul, ol');
    const listData = [];

    for (const list of lists) {
      const items = await list.$$('li');
      const itemTexts = [];

      for (const item of items) {
        const text = await item.textContent();
        if (text && text.trim()) {
          itemTexts.push(text.trim());
        }
      }

      if (itemTexts.length > 0) {
        listData.push(itemTexts);
      }
    }

    return listData;
  }

  /**
   * 提取表单
   */
  async extractForm(page, selector) {
    const forms = await page.$$(selector.selector || 'form');
    const formData = [];

    for (const form of forms) {
      const inputs = await form.$$('input, textarea, select');
      const formFields = [];

      for (const input of inputs) {
        const name = await input.getAttribute('name');
        const type = await input.getAttribute('type');
        const value = await input.getAttribute('value') || '';
        const placeholder = await input.getAttribute('placeholder') || '';

        if (name) {
          formFields.push({
            name,
            type: type || 'text',
            value,
            placeholder
          });
        }
      }

      if (formFields.length > 0) {
        formData.push(formFields);
      }
    }

    return formData;
  }

  /**
   * 提取图片
   */
  async extractImage(page, selector) {
    const images = await page.$$(selector.selector || 'img');
    const imageData = [];

    for (const image of images) {
      const src = await image.getAttribute('src');
      const alt = await image.getAttribute('alt') || '';
      const title = await image.getAttribute('title') || '';
      const width = await image.getAttribute('width') || '';
      const height = await image.getAttribute('height') || '';

      if (src && src.trim()) {
        imageData.push({
          src: src.trim(),
          alt,
          title,
          width: width ? parseInt(width) : null,
          height: height ? parseInt(height) : null
        });
      }
    }

    return imageData;
  }

  /**
   * 提取元数据
   */
  async extractMetadata(page, selector) {
    const metadata = {};

    // 提取页面标题
    metadata.title = await page.title();

    // 提取元标签
    const metaTags = await page.$$eval('meta', tags => {
      return tags.map(tag => ({
        name: tag.getAttribute('name') || tag.getAttribute('property'),
        content: tag.getAttribute('content')
      }));
    });

    metadata.metaTags = metaTags.filter(tag => tag.name && tag.content);

    // 提取页面URL
    metadata.url = page.url();

    return metadata;
  }

  /**
   * 执行导航动作
   */
  async executeNavigationAction(page, action) {
    const navigator = this.navigators[action.type];
    if (!navigator) {
      throw new Error(`Unknown navigation action: ${action.type}`);
    }

    return await navigator(page, action);
  }

  /**
   * 导航动作：点击
   */
  async navigateClick(page, action) {
    const { selector, button = 'left', clickCount = 1 } = action;
    await page.click(selector, { button, clickCount });
    return { action: 'click', selector, success: true };
  }

  /**
   * 导航动作：填写
   */
  async navigateFill(page, action) {
    const { selector, value, clear = true } = action;
    if (clear) {
      await page.fill(selector, value);
    } else {
      await page.type(selector, value);
    }
    return { action: 'fill', selector, value, success: true };
  }

  /**
   * 导航动作：选择
   */
  async navigateSelect(page, action) {
    const { selector, value } = action;
    await page.select(selector, value);
    return { action: 'select', selector, value, success: true };
  }

  /**
   * 导航动作：悬停
   */
  async navigateHover(page, action) {
    const { selector } = action;
    await page.hover(selector);
    return { action: 'hover', selector, success: true };
  }

  /**
   * 导航动作：滚动
   */
  async navigateScroll(page, action) {
    const { direction = 'down', amount = 1000 } = action;
    
    if (direction === 'down') {
      await page.evaluate(() => window.scrollBy(0, amount));
    } else if (direction === 'up') {
      await page.evaluate(() => window.scrollBy(0, -amount));
    }
    
    return { action: 'scroll', direction, amount, success: true };
  }

  /**
   * 导航动作：等待
   */
  async navigateWait(page, action) {
    const { duration = 1000, selector } = action;
    
    if (selector) {
      await page.waitForSelector(selector, { timeout: duration });
    } else {
      await page.waitForTimeout(duration);
    }
    
    return { action: 'wait', duration, selector, success: true };
  }

  /**
   * 导航动作：截图
   */
  async navigateScreenshot(page, action) {
    const { path, fullPage = false } = action;
    const screenshot = await page.screenshot({ fullPage });
    
    if (path) {
      // 保存截图到文件
      this.logger.info('Screenshot saved', { path });
    }
    
    return { 
      action: 'screenshot', 
      path, 
      fullPage, 
      success: true,
      size: screenshot.length 
    };
  }

  /**
   * 获取页面状态
   */
  async getPageState(page) {
    return {
      url: page.url(),
      title: await page.title(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 保存结果
   */
  async saveResults(data, options) {
    const { outputFormat, outputDir, fileName, ...metadata } = options;
    
    // 确保输出目录存在
    await this.ensureDirectory(outputDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalFileName = `${fileName}_${timestamp}`;
    let filePath;
    let content;

    switch (outputFormat) {
      case 'json':
        filePath = `${outputDir}/${finalFileName}.json`;
        content = JSON.stringify({
          data,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString(),
            recordCount: Array.isArray(data) ? data.length : 1
          }
        }, null, 2);
        break;
      case 'csv':
        filePath = `${outputDir}/${finalFileName}.csv`;
        content = this.convertToCSV(data);
        break;
      case 'xml':
        filePath = `${outputDir}/${finalFileName}.xml`;
        content = this.convertToXML(data);
        break;
      default:
        throw new Error(`Unsupported output format: ${outputFormat}`);
    }

    // 保存文件
    await this.writeFileContent(filePath, content);
    
    this.logger.info('Results saved', { 
      filePath, 
      format: outputFormat,
      recordCount: Array.isArray(data) ? data.length : 1 
    });

    return { filePath, format: outputFormat, recordCount: Array.isArray(data) ? data.length : 1 };
  }

  /**
   * 合并批量结果
   */
  async mergeBatchResults(results, options) {
    const { outputFormat, outputDir } = options;
    
    // 合并所有数据
    const allData = [];
    for (const result of results) {
      if (result.result && result.result.data) {
        allData.push(...result.result.data);
      }
    }

    // 保存合并后的结果
    return await this.saveResults(allData, {
      outputFormat,
      outputDir,
      fileName: `batch_merged_${Date.now()}`
    });
  }

  /**
   * 构建搜索URL
   */
  buildSearchUrl(searchEngine, query, resultCount) {
    const encodedQuery = encodeURIComponent(query);
    
    switch (searchEngine.toLowerCase()) {
      case 'google':
        return `https://www.google.com/search?q=${encodedQuery}&num=${resultCount}`;
      case 'bing':
        return `https://www.bing.com/search?q=${encodedQuery}&count=${resultCount}`;
      case 'baidu':
        return `https://www.baidu.com/s?wd=${encodedQuery}&rn=${resultCount}`;
      case 'duckduckgo':
        return `https://duckduckgo.com/?q=${encodedQuery}`;
      default:
        return `https://www.google.com/search?q=${encodedQuery}&num=${resultCount}`;
    }
  }

  /**
   * 提取搜索结果
   */
  async extractSearchResults(page, selectors) {
    // 使用默认的选择器或自定义选择器
    const defaultSelectors = selectors || [
      {
        name: 'titles',
        type: 'text',
        selector: 'h3'
      },
      {
        name: 'links',
        type: 'href',
        selector: 'a'
      },
      {
        name: 'snippets',
        type: 'text',
        selector: '.snippet'
      }
    ];

    return await this.extractData(page, defaultSelectors);
  }

  /**
   * 检查是否有下一页
   */
  async hasNextPage(page, paginationSelector) {
    try {
      const nextButton = await page.$(paginationSelector);
      if (!nextButton) return false;
      
      const isDisabled = await nextButton.isDisabled();
      const isVisible = await nextButton.isVisible();
      
      return !isDisabled && isVisible;
    } catch (error) {
      return false;
    }
  }

  /**
   * 导航到下一页
   */
  async goToNextPage(page, paginationSelector) {
    await page.click(paginationSelector);
  }

  /**
   * 转换为CSV
   */
  convertToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    // 简化的CSV转换
    const headers = Object.keys(data[0] || {});
    const rows = data.map(item => headers.map(header => item[header] || ''));
    
    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }

  /**
   * 转换为XML
   */
  convertToXML(data) {
    if (!Array.isArray(data)) {
      return `<item>${this.objectToXML(data)}</item>`;
    }

    return `<items>${data.map(item => `<item>${this.objectToXML(item)}</item>`).join('')}</items>`;
  }

  /**
   * 对象转XML
   */
  objectToXML(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return String(obj);
    }

    return Object.entries(obj).map(([key, value]) => {
      if (Array.isArray(value)) {
        return `<${key}>${value.map(item => `<item>${this.objectToXML(item)}</item>`).join('')}</${key}>`;
      } else if (typeof value === 'object') {
        return `<${key}>${this.objectToXML(value)}</${key}>`;
      } else {
        return `<${key}>${value}</${key}>`;
      }
    }).join('');
  }

  /**
   * 确保目录存在
   */
  async ensureDirectory(dirPath) {
    try {
      await this.writeFileContent(dirPath, '', 'directory');
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 写入文件内容
   */
  async writeFileContent(filePath, content, type = 'file') {
    // 实际实现会使用文件系统操作
    this.logger.info('Writing file content', { 
      filePath, 
      type,
      size: content.length 
    });
  }

  /**
   * 睡眠函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取操作状态
   */
  getStatus() {
    return {
      ...this.getProcessingStats(),
      name: this.name,
      description: this.description,
      version: this.version,
      supportedOperations: ['scrape', 'navigate', 'extract', 'batch', 'search', 'pagination'],
      supportedExtractors: Object.keys(this.extractors),
      supportedNavigators: Object.keys(this.navigators),
      supportedOutputFormats: ['json', 'csv', 'xml']
    };
  }
}

export default GenericWebScraperOperation;