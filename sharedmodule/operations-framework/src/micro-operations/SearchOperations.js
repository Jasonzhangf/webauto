/**
 * Search Operations - Micro-operations for search functionality
 */

import { BaseOperation } from '../core/BaseOperation.js';

/**
 * Weibo Search Operation - Specialized for Weibo platform search
 */
export class WeiboSearchOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'WeiboSearchOperation';
    this.description = 'Search Weibo platform for keywords with advanced filtering';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['search-keyword', 'social-media-search'];
    this.supportedContainers = ['weibo-search-page', 'weibo-container', 'any'];
    this.capabilities = ['search', 'web-navigation', 'social-media', 'content-filtering'];
    
    this.preferredContainers = ['weibo-search-page'];
    
    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.9,
      memoryUsage: 'low'
    };
    
    this.requiredParameters = ['keyword'];
    this.optionalParameters = {
      count: 20,
      timeframe: 'all', // all, today, week, month
      contentType: 'all', // all, text, image, video
      sortBy: 'hot', // hot, time, relevance
      filters: {}, // Additional filters
      usePagination: true,
      maxPages: 5
    };
  }
  
  async execute(context, params = {}) {
    const startTime = Date.now();
    const validation = this.validateParameters(params);
    
    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }
    
    const finalParams = validation.finalParams;
    this.log('info', 'Starting Weibo search', { keyword: finalParams.keyword, params: finalParams });
    
    try {
      // Initialize browser if not available
      if (!context.browser) {
        throw new Error('Browser context not available');
      }
      
      const page = context.page || await context.browser.newPage();
      
      // Navigate to Weibo search page
      const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(finalParams.keyword)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

      // Wait for results to load
      await page.waitForSelector('.card-wrap[action-type="feed_list_item"], .card-feed, .wbs-feed', { timeout: 10000 });
      
      // Apply filters if specified
      if (finalParams.contentType !== 'all') {
        await this.applyContentTypeFilter(page, finalParams.contentType);
      }
      
      if (finalParams.timeframe !== 'all') {
        await this.applyTimeframeFilter(page, finalParams.timeframe);
      }
      
      // Collect results
      const results = await this.collectSearchResults(page, finalParams);
      
      // Apply sorting if specified
      if (finalParams.sortBy !== 'hot') {
        await this.applySorting(page, finalParams.sortBy);
      }
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Weibo search completed', { 
        resultsCount: results.length, 
        executionTime 
      });
      
      return {
        success: true,
        results,
        metadata: {
          keyword: finalParams.keyword,
          totalResults: results.length,
          executionTime,
          filters: finalParams.filters,
          searchType: 'weibo'
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Weibo search failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          keyword: finalParams.keyword,
          executionTime,
          searchType: 'weibo'
        }
      };
    }
  }
  
  async applyContentTypeFilter(page, contentType) {
    this.log('info', 'Applying content type filter', { contentType });

    // Look for Weibo's filter buttons
    const filterButtons = await page.locator('button, a, [class*="filter"]').filter(async btn => {
      const text = await btn.textContent();
      return text.includes('筛选') || text.includes('过滤') || text.includes('filter');
    });

    if (await filterButtons.count() > 0) {
      // Click filter button to open filter options
      await filterButtons.first().click();

      // Select content type based on Weibo's UI
      const contentTypeMap = {
        'text': '文字',
        'image': '图片',
        'video': '视频'
      };

      const targetText = contentTypeMap[contentType];
      if (targetText) {
        const contentTypeOption = await page.locator('label, span, div, [class*="option"]').filter(async opt => {
          const text = await opt.textContent();
          return text.includes(targetText);
        });

        if (await contentTypeOption.count() > 0) {
          await contentTypeOption.first().click();
        }
      }

      // Close filter panel or apply filters
      const applyButton = await page.locator('button, a').filter(async btn => {
        const text = await btn.textContent();
        return text.includes('确定') || text.includes('应用') || text.includes('apply');
      });

      if (await applyButton.count() > 0) {
        await applyButton.first().click();
      } else {
        // Click the filter button again to close
        await filterButtons.first().click();
      }
    }
  }
  
  async applyTimeframeFilter(page, timeframe) {
    this.log('info', 'Applying timeframe filter', { timeframe });
    
    const timeframeMap = {
      'today': '今天',
      'week': '一周',
      'month': '一月'
    };
    
    const targetText = timeframeMap[timeframe];
    if (targetText) {
      const timeframeOption = await page.locator('button, a, span').filter(async opt => {
        const text = await opt.textContent();
        return text.includes(targetText);
      });
      
      await timeframeOption.click();
    }
  }
  
  async applySorting(page, sortBy) {
    this.log('info', 'Applying sorting', { sortBy });
    
    const sortMap = {
      'time': '时间',
      'relevance': '相关'
    };
    
    const targetText = sortMap[sortBy];
    if (targetText) {
      const sortOption = await page.locator('button, a, span').filter(async opt => {
        const text = await opt.textContent();
        return text.includes(targetText);
      });
      
      await sortOption.click();
    }
  }
  
  async collectSearchResults(page, params) {
    const results = [];
    let currentPage = 1;
    let hasMoreResults = true;

    while (hasMoreResults && currentPage <= params.maxPages && results.length < params.count) {
      this.log('info', `Collecting results from page ${currentPage}`);

      // Wait for results to load
      await page.waitForSelector('.card-wrap[action-type="feed_list_item"], .card-feed', { timeout: 5000 });

      // Extract current page results
      const pageResults = await page.evaluate(() => {
        const items = document.querySelectorAll('.card-wrap[action-type="feed_list_item"], .card-feed');
        return Array.from(items).map(item => {
          // User information
          const userElement = item.querySelector('.name');
          const username = userElement ? userElement.textContent.trim() : '';

          // Content extraction - main content is in p tags
          const contentElement = item.querySelector('.content p');
          const content = contentElement ? contentElement.textContent.trim() : '';

          // Time information
          const timeElement = item.querySelector('.time');
          const time = timeElement ? timeElement.textContent.trim() : '';

          // Image extraction - filter out logos, avatars, and system images
          const imageElements = item.querySelectorAll('img');
          const images = Array.from(imageElements)
            .filter(img => {
              const src = img.src.toLowerCase();
              const alt = (img.alt || '').toLowerCase();
              const className = (img.className || '').toLowerCase();
              const parentClass = img.parentElement ? (img.parentElement.className || '').toLowerCase() : '';

              // Filter out common non-content images
              const isAvatar = src.includes('avatar') ||
                               src.includes('head') ||
                               src.includes('profile') ||
                               className.includes('avatar') ||
                               className.includes('head') ||
                               parentClass.includes('avatar');

              const isLogo = src.includes('logo') ||
                           src.includes('icon') ||
                           src.includes('vip') ||
                           src.includes('svvip') ||
                           className.includes('logo') ||
                           className.includes('icon') ||
                           alt.includes('logo') ||
                           alt.includes('vip');

              const isSystemImage = src.includes('s.weibo.com') &&
                                   (src.includes('upload') || src.includes('default')) ||
                                   src.includes('weibo.com/img') ||
                                   className.includes('default') ||
                                   className.includes('system');

              const isSmallIcon = img.naturalWidth && img.naturalWidth < 50;

              // Filter out thumbnails and low-quality images
              const isThumbnail = src.includes('thumb') ||
                                 src.includes('thumbnail') ||
                                 src.includes('/thumb') ||
                                 src.includes('orj') ||  // 新浪缩略图标识
                                 src.includes('crop') ||
                                 src.includes('square') ||
                                 src.includes('small') ||
                                 src.includes('mini');

              // Filter out images with size indicators in URL
              const hasSizeIndicator = src.match(/\/\d+x\d+/) ||
                                      src.match(/_\d+x\d+/) ||
                                      src.match(/\/\d+/) && !src.match(/\/\d{4}/);

              // Filter out emoji and expression images
              const isEmoji = src.includes('expression') ||
                            src.includes('emoji') ||
                            src.includes('sinajs.cn/t4/appstyle') ||
                            src.includes('face.t.sinajs.cn') ||
                            className.includes('emoji') ||
                            className.includes('expression') ||
                            className.includes('face');

              // Filter out images with emoji-related dimensions
              const isEmojiSize = src.includes('20x20') ||
                                 src.includes('24x24') ||
                                 src.includes('32x32') ||
                                 src.includes('64x64');

              // Filter out images that are likely not user content
              return !isAvatar && !isLogo && !isSystemImage && !isSmallIcon && !isThumbnail && !hasSizeIndicator && !isEmoji && !isEmojiSize;
            })
            .map(img => img.src)
            .filter(src => src && src.startsWith('http'))
            .map(src => {
              // Clean up URL parameters that indicate thumbnails
              return src.replace(/&size=\w+/, '').replace(/\?.*size=\w+/, '');
            });

          // Link to the post
          const linkElement = item.querySelector('a[href*="/"]');
          const url = linkElement ? linkElement.href : '';

          // Interaction data (likes, comments, reposts)
          const interactionButtons = item.querySelectorAll('.card-act .woo-font');
          let stats = {};
          interactionButtons.forEach(btn => {
            const text = btn.textContent.trim();
            if (text.includes('赞') || text.includes('like')) {
              stats.likes = text;
            } else if (text.includes('评论') || text.includes('comment')) {
              stats.comments = text;
            } else if (text.includes('转发') || text.includes('repost')) {
              stats.reposts = text;
            }
          });

          // Extract post ID
          const postId = item.getAttribute('mid') ||
                        item.getAttribute('data-id') ||
                        `post_${Date.now()}_${Math.random()}`;

          return {
            id: postId,
            username: username,
            content: content,
            time: time,
            images: images.slice(0, 5),
            url: url,
            stats: stats,
            type: images.length > 0 ? 'image' : 'text',
            html: item.outerHTML
          };
        });
      });

      results.push(...pageResults);

      // Check if we have enough results
      if (results.length >= params.count) {
        break;
      }

      // Try to load next page
      if (params.usePagination) {
        hasMoreResults = await this.loadNextPage(page);
        currentPage++;
      } else {
        break;
      }
    }

    return results.slice(0, params.count);
  }
  
  async loadNextPage(page) {
    try {
      // Look for Weibo's next page or load more buttons
      const nextButton = await page.locator('button, a, [class*="next"], [class*="more"]').filter(async btn => {
        const text = await btn.textContent();
        return text.includes('下一页') || text.includes('加载更多') || text.includes('next') || text.includes('more') || text.includes('查看更多');
      });

      if (await nextButton.count() > 0) {
        await nextButton.first().click();
        await page.waitForTimeout(2000); // Wait for new content to load
        return true;
      }

      // Alternative: scroll to load more (infinite scroll)
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);

      return false; // Assume no more pages for Weibo's infinite scroll
    } catch (error) {
      this.log('warn', 'Failed to load next page', { error: error.message });
      return false;
    }
  }
  
  calculateContextMatchScore(context) {
    let score = 0.5;
    
    // Bonus for Weibo-specific context
    if (context.platform === 'weibo') {
      score += 0.3;
    }
    
    // Bonus for Chinese content
    if (context.language === 'zh' || context.language === 'chinese') {
      score += 0.2;
    }
    
    // Bonus for social media context
    if (context.domain === 'social-media' || context.domain === 'weibo') {
      score += 0.2;
    }
    
    return Math.min(score, 1);
  }
}

/**
 * Generic Search Operation - General purpose web search
 */
export class GenericSearchOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'GenericSearchOperation';
    this.description = 'Generic web search operation that works with most search pages';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['search-keyword', 'web-search'];
    this.supportedContainers = ['search-container', 'any'];
    this.capabilities = ['search', 'web-navigation', 'content-extraction'];
    
    this.performance = {
      speed: 'fast',
      accuracy: 'medium',
      successRate: 0.7,
      memoryUsage: 'low'
    };
    
    this.requiredParameters = ['keyword'];
    this.optionalParameters = {
      searchUrl: '',
      searchSelector: 'input[type="search"], input[placeholder*="search"]',
      buttonSelector: 'button[type="submit"], input[type="submit"]',
      resultSelector: '.search-result, .result, .item',
      count: 10,
      usePagination: false
    };
  }
  
  async execute(context, params = {}) {
    const startTime = Date.now();
    const validation = this.validateParameters(params);
    
    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }
    
    const finalParams = validation.finalParams;
    this.log('info', 'Starting generic search', { keyword: finalParams.keyword, params: finalParams });
    
    try {
      if (!context.browser) {
        throw new Error('Browser context not available');
      }
      
      const page = context.page || await context.browser.newPage();
      
      // Navigate to search URL or use current page
      if (finalParams.searchUrl) {
        await page.goto(finalParams.searchUrl, { waitUntil: 'networkidle' });
      }
      
      // Find and fill search input
      const searchInput = await page.locator(finalParams.searchSelector).first();
      await searchInput.fill(finalParams.keyword);
      
      // Find and click search button
      const searchButton = await page.locator(finalParams.buttonSelector).first();
      await searchButton.click();
      
      // Wait for results
      await page.waitForSelector(finalParams.resultSelector, { timeout: 10000 });
      
      // Collect results
      const results = await this.collectResults(page, finalParams);
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Generic search completed', { 
        resultsCount: results.length, 
        executionTime 
      });
      
      return {
        success: true,
        results,
        metadata: {
          keyword: finalParams.keyword,
          totalResults: results.length,
          executionTime,
          searchType: 'generic'
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Generic search failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          keyword: finalParams.keyword,
          executionTime,
          searchType: 'generic'
        }
      };
    }
  }
  
  async collectResults(page, params) {
    return await page.evaluate((selector) => {
      const items = document.querySelectorAll(selector);
      return Array.from(items).map(item => {
        const titleElement = item.querySelector('a, h3, .title');
        const contentElement = item.querySelector('.content, .text, .desc');
        const linkElement = item.querySelector('a');
        
        return {
          title: titleElement ? titleElement.textContent.trim() : '',
          content: contentElement ? contentElement.textContent.trim() : '',
          url: linkElement ? linkElement.href : '',
          html: item.outerHTML
        };
      });
    }, params.resultSelector);
  }
}

/**
 * Google Search Operation - Specialized for Google search
 */
export class GoogleSearchOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'GoogleSearchOperation';
    this.description = 'Google search operation with advanced features and anti-bot protection';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['search-keyword', 'web-search', 'search-engine'];
    this.supportedContainers = ['google-search-page', 'search-container', 'any'];
    this.capabilities = ['search', 'web-navigation', 'content-extraction', 'anti-bot'];
    
    this.preferredContainers = ['google-search-page'];
    
    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.8,
      memoryUsage: 'medium'
    };
    
    this.requiredParameters = ['keyword'];
    this.optionalParameters = {
      count: 10,
      language: 'en',
      country: 'us',
      timeRange: '', // qdr:d (day), qdr:w (week), qdr:m (month), qdr:y (year)
      safeSearch: 'off', // on, moderate, off
      type: 'search', // search, images, news, videos
      exactMatch: false,
      excludeTerms: '',
      siteFilter: ''
    };
  }
  
  async execute(context, params = {}) {
    const startTime = Date.now();
    const validation = this.validateParameters(params);
    
    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }
    
    const finalParams = validation.finalParams;
    this.log('info', 'Starting Google search', { keyword: finalParams.keyword, params: finalParams });
    
    try {
      if (!context.browser) {
        throw new Error('Browser context not available');
      }
      
      const page = context.page || await context.browser.newPage();
      
      // Build search URL with parameters
      const searchUrl = this.buildSearchUrl(finalParams);
      await page.goto(searchUrl, { waitUntil: 'networkidle' });
      
      // Check for CAPTCHA or bot detection
      await this.handleBotDetection(page);
      
      // Wait for results
      await page.waitForSelector('#search, .g, .search-result', { timeout: 15000 });
      
      // Collect results
      const results = await this.collectGoogleResults(page, finalParams);
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Google search completed', { 
        resultsCount: results.length, 
        executionTime 
      });
      
      return {
        success: true,
        results,
        metadata: {
          keyword: finalParams.keyword,
          totalResults: results.length,
          executionTime,
          searchType: 'google',
          searchUrl
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Google search failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          keyword: finalParams.keyword,
          executionTime,
          searchType: 'google'
        }
      };
    }
  }
  
  buildSearchUrl(params) {
    let url = 'https://www.google.com/search?';
    
    const searchParams = new URLSearchParams();
    searchParams.append('q', params.keyword);
    
    if (params.language) {
      searchParams.append('hl', params.language);
    }
    
    if (params.country) {
      searchParams.append('gl', params.country);
    }
    
    if (params.timeRange) {
      searchParams.append('tbs', params.timeRange);
    }
    
    if (params.safeSearch !== 'off') {
      searchParams.append('safe', params.safeSearch);
    }
    
    if (params.type !== 'search') {
      searchParams.append('tbm', params.type);
    }
    
    if (params.siteFilter) {
      searchParams.append('as_sitesearch', params.siteFilter);
    }
    
    if (params.excludeTerms) {
      searchParams.append('as_eq', params.excludeTerms);
    }
    
    if (params.exactMatch) {
      searchParams.append('q', `"${params.keyword}"`);
    }
    
    url += searchParams.toString();
    return url;
  }
  
  async handleBotDetection(page) {
    // Check for CAPTCHA
    const captchaPresent = await page.locator('#captcha, .captcha').count() > 0;
    if (captchaPresent) {
      this.log('warn', 'CAPTCHA detected, search may fail');
    }
    
    // Check for "unusual traffic" message
    const unusualTraffic = await page.locator('text=unusual traffic').count() > 0;
    if (unusualTraffic) {
      this.log('warn', 'Google detected unusual traffic');
    }
  }
  
  async collectGoogleResults(page, params) {
    const results = [];
    
    try {
      // Standard search results
      const searchResults = await page.locator('#search .g, .search-result .g');
      const count = Math.min(await searchResults.count(), params.count);
      
      for (let i = 0; i < count; i++) {
        const result = searchResults.nth(i);
        const resultData = await result.evaluate(el => {
          const titleElement = el.querySelector('h3, .LC20lb, .DKV0Md');
          const linkElement = el.querySelector('a');
          const snippetElement = el.querySelector('.VwiC3b, .s, .st');
          const dateElement = el.querySelector('.MU4Gjd, .f, .date');
          
          return {
            title: titleElement ? titleElement.textContent.trim() : '',
            url: linkElement ? linkElement.href : '',
            snippet: snippetElement ? snippetElement.textContent.trim() : '',
            date: dateElement ? dateElement.textContent.trim() : '',
            displayedUrl: linkElement ? linkElement.textContent.trim() : ''
          };
        });
        
        results.push(resultData);
      }
      
      // Also check for featured snippets
      const featuredSnippet = await page.locator('.g .kp-wholepage, .featured-snippet').first();
      if (await featuredSnippet.count() > 0) {
        const snippetData = await featuredSnippet.evaluate(el => {
          const titleElement = el.querySelector('h2, h3');
          const contentElement = el.querySelector('.hgKElc, .content');
          const linkElement = el.querySelector('a');
          
          return {
            title: titleElement ? titleElement.textContent.trim() : '',
            content: contentElement ? contentElement.textContent.trim() : '',
            url: linkElement ? linkElement.href : '',
            type: 'featured-snippet'
          };
        });
        
        if (snippetData.title || snippetData.content) {
          results.unshift(snippetData); // Add to beginning
        }
      }
      
      // Related searches
      const relatedSearches = await page.locator('.card-section .BNeawe, .related-search-pair').all();
      const relatedSearchData = await Promise.all(relatedSearches.map(async el => {
        return await el.evaluate(elem => ({
          text: elem.textContent.trim(),
          url: elem.closest('a') ? elem.closest('a').href : ''
        }));
      }));
      
      if (relatedSearchData.length > 0) {
        results.push({
          type: 'related-searches',
          searches: relatedSearchData.filter(item => item.text)
        });
      }
      
    } catch (error) {
      this.log('warn', 'Error collecting Google results', { error: error.message });
    }
    
    return results.slice(0, params.count);
  }
  
  calculateContextMatchScore(context) {
    let score = 0.5;
    
    // Bonus for Google-specific context
    if (context.platform === 'google' || context.searchEngine === 'google') {
      score += 0.4;
    }
    
    // Bonus for English content
    if (context.language === 'en' || context.language === 'english') {
      score += 0.2;
    }
    
    // Bonus for web search context
    if (context.domain === 'web-search' || context.domain === 'search-engine') {
      score += 0.2;
    }
    
    // Bonus for academic or research context
    if (context.purpose === 'research' || context.purpose === 'academic') {
      score += 0.1;
    }
    
    return Math.min(score, 1);
  }
}