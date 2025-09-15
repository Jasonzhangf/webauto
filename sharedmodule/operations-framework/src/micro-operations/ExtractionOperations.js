/**
 * Extraction Operations - Micro-operations for data extraction functionality
 */

import { BaseOperation } from '../core/BaseOperation.js';

/**
 * Link Extractor Operation - Extract links from web pages
 */
export class LinkExtractorOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'LinkExtractorOperation';
    this.description = 'Extract links from web pages with filtering and validation';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['extract-links', 'data-extraction'];
    this.supportedContainers = ['web-page', 'search-results', 'content-container', 'any'];
    this.capabilities = ['link-extraction', 'content-extraction', 'data-filtering'];
    
    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'low'
    };
    
    this.requiredParameters = [];
    this.optionalParameters = {
      urlFilters: [], // URL patterns to include
      excludePatterns: [], // URL patterns to exclude
      domainFilter: '', // Filter by domain
      linkTypes: ['all'], // all, internal, external, same-domain
      maxLinks: 100,
      includeMetadata: true,
      validateLinks: true,
      extractText: false,
      selector: 'a' // CSS selector for links
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
    this.log('info', 'Starting link extraction', { params: finalParams });
    
    try {
      if (!context.page) {
        throw new Error('Page context not available');
      }
      
      const page = context.page;
      
      // Extract links from the page
      const rawLinks = await page.evaluate((selector) => {
        const links = document.querySelectorAll(selector);
        return Array.from(links).map(link => {
          return {
            href: link.href,
            text: link.textContent.trim(),
            title: link.title || '',
            target: link.target || '_self',
            rel: link.rel || '',
            className: link.className || '',
            id: link.id || '',
            innerHTML: link.innerHTML,
            domain: link.hostname || '',
            isInternal: link.hostname === window.location.hostname,
            isExternal: link.hostname !== window.location.hostname,
            isValid: link.href && link.href.startsWith('http')
          };
        });
      }, finalParams.selector);
      
      // Filter and process links
      const filteredLinks = this.filterLinks(rawLinks, finalParams);
      
      // Sort links by relevance
      const sortedLinks = this.sortLinks(filteredLinks, finalParams);
      
      // Limit results
      const limitedLinks = sortedLinks.slice(0, finalParams.maxLinks);
      
      // Extract additional metadata if requested
      if (finalParams.includeMetadata) {
        await this.enrichLinkMetadata(limitedLinks, page);
      }
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Link extraction completed', { 
        extractedCount: rawLinks.length,
        filteredCount: filteredLinks.length,
        finalCount: limitedLinks.length,
        executionTime 
      });
      
      return {
        success: true,
        links: limitedLinks,
        metadata: {
          totalExtracted: rawLinks.length,
          totalFiltered: filteredLinks.length,
          totalValid: limitedLinks.filter(link => link.isValid).length,
          internalLinks: limitedLinks.filter(link => link.isInternal).length,
          externalLinks: limitedLinks.filter(link => link.isExternal).length,
          executionTime,
          filters: finalParams
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Link extraction failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          executionTime,
          filters: finalParams
        }
      };
    }
  }
  
  filterLinks(links, params) {
    return links.filter(link => {
      // Basic validity check
      if (!link.href || !link.href.startsWith('http')) {
        return false;
      }
      
      // Domain filter
      if (params.domainFilter && !link.domain.includes(params.domainFilter)) {
        return false;
      }
      
      // URL filters
      if (params.urlFilters.length > 0) {
        const matchesFilter = params.urlFilters.some(pattern => {
          const regex = new RegExp(pattern);
          return regex.test(link.href);
        });
        if (!matchesFilter) {
          return false;
        }
      }
      
      // Exclude patterns
      if (params.excludePatterns.length > 0) {
        const matchesExclude = params.excludePatterns.some(pattern => {
          const regex = new RegExp(pattern);
          return regex.test(link.href);
        });
        if (matchesExclude) {
          return false;
        }
      }
      
      // Link type filter
      if (params.linkTypes.length > 0 && !params.linkTypes.includes('all')) {
        if (params.linkTypes.includes('internal') && !link.isInternal) {
          return false;
        }
        if (params.linkTypes.includes('external') && !link.isExternal) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  sortLinks(links, params) {
    return links.sort((a, b) => {
      // Sort by relevance score
      const scoreA = this.calculateLinkRelevance(a);
      const scoreB = this.calculateLinkRelevance(b);
      
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      
      // Then sort by text length (longer text often more descriptive)
      if (b.text.length !== a.text.length) {
        return b.text.length - a.text.length;
      }
      
      // Finally sort by URL
      return a.href.localeCompare(b.href);
    });
  }
  
  calculateLinkRelevance(link) {
    let score = 0;
    
    // Points for having text
    if (link.text.length > 0) {
      score += 2;
    }
    
    // Points for descriptive text
    if (link.text.length > 10) {
      score += 1;
    }
    
    // Points for having title
    if (link.title.length > 0) {
      score += 1;
    }
    
    // Points for common link patterns
    if (link.href.includes('article') || link.href.includes('post') || link.href.includes('content')) {
      score += 1;
    }
    
    // Deduct points for navigation links
    if (link.href.includes('#') || link.href.includes('javascript:')) {
      score -= 2;
    }
    
    // Deduct points for common non-content links
    if (link.text.toLowerCase().includes('login') || 
        link.text.toLowerCase().includes('register') ||
        link.text.toLowerCase().includes('contact')) {
      score -= 1;
    }
    
    return score;
  }
  
  async enrichLinkMetadata(links, page) {
    // This could include checking link status, extracting content previews, etc.
    // For now, we'll add some basic metadata
    for (const link of links) {
      link.enrichmentTimestamp = new Date().toISOString();
      link.relevanceScore = this.calculateLinkRelevance(link);
    }
  }
}

/**
 * Text Extractor Operation - Extract text content from web pages
 */
export class TextExtractorOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'TextExtractorOperation';
    this.description = 'Extract text content from web pages with structure preservation';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['extract-text', 'data-extraction', 'content-extraction'];
    this.supportedContainers = ['web-page', 'article', 'content-container', 'any'];
    this.capabilities = ['text-extraction', 'content-extraction', 'structure-analysis'];
    
    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'low'
    };
    
    this.requiredParameters = [];
    this.optionalParameters = {
      selector: 'body', // CSS selector for content extraction
      excludeSelectors: ['script', 'style', 'noscript', 'nav', 'footer', 'header'],
      preserveFormatting: true,
      includeMetadata: true,
      extractHeadings: true,
      extractLists: true,
      extractTables: true,
      extractImages: true,
      maxContentLength: 50000,
      cleanHtml: true,
      languageDetection: true
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
    this.log('info', 'Starting text extraction', { params: finalParams });
    
    try {
      if (!context.page) {
        throw new Error('Page context not available');
      }
      
      const page = context.page;
      
      // Extract structured content
      const content = await page.evaluate((params) => {
        const container = document.querySelector(params.selector) || document.body;
        
        // Remove excluded elements
        params.excludeSelectors.forEach(selector => {
          container.querySelectorAll(selector).forEach(el => el.remove());
        });
        
        const result = {
          title: document.title,
          mainText: '',
          headings: [],
          paragraphs: [],
          lists: [],
          tables: [],
          images: [],
          metadata: {
            url: window.location.href,
            domain: window.location.hostname,
            language: document.documentElement.lang || 'unknown'
          }
        };
        
        // Extract main text
        result.mainText = container.textContent || container.innerText || '';
        
        // Extract headings
        if (params.extractHeadings) {
          const headingElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
          result.headings = Array.from(headingElements).map(h => ({
            level: parseInt(h.tagName.charAt(1)),
            text: h.textContent.trim(),
            id: h.id || ''
          }));
        }
        
        // Extract paragraphs
        const paragraphs = container.querySelectorAll('p');
        result.paragraphs = Array.from(paragraphs).map(p => p.textContent.trim())
          .filter(text => text.length > 0);
        
        // Extract lists
        if (params.extractLists) {
          const lists = container.querySelectorAll('ul, ol');
          result.lists = Array.from(lists).map(list => ({
            type: list.tagName.toLowerCase(),
            items: Array.from(list.querySelectorAll('li')).map(li => li.textContent.trim())
          }));
        }
        
        // Extract tables
        if (params.extractTables) {
          const tables = container.querySelectorAll('table');
          result.tables = Array.from(tables).map(table => {
            const rows = Array.from(table.querySelectorAll('tr'));
            return {
              headers: rows.length > 0 ? 
                Array.from(rows[0].querySelectorAll('th, td')).map(h => h.textContent.trim()) : [],
              data: rows.slice(1).map(row => 
                Array.from(row.querySelectorAll('td')).map(cell => cell.textContent.trim())
              )
            };
          });
        }
        
        // Extract images
        if (params.extractImages) {
          const images = container.querySelectorAll('img');
          result.images = Array.from(images).map(img => ({
            src: img.src,
            alt: img.alt || '',
            title: img.title || '',
            width: img.naturalWidth,
            height: img.naturalHeight
          }));
        }
        
        return result;
      }, finalParams);
      
      // Clean and process content
      if (finalParams.cleanHtml) {
        content.mainText = this.cleanText(content.mainText);
      }
      
      // Limit content length
      if (content.mainText.length > finalParams.maxContentLength) {
        content.mainText = content.mainText.substring(0, finalParams.maxContentLength) + '...';
      }
      
      // Detect language if requested
      if (finalParams.languageDetection) {
        content.detectedLanguage = this.detectLanguage(content.mainText);
      }
      
      // Add processing metadata
      content.processingTimestamp = new Date().toISOString();
      content.characterCount = content.mainText.length;
      content.wordCount = content.mainText.split(/\s+/).length;
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Text extraction completed', { 
        contentLength: content.mainText.length,
        executionTime 
      });
      
      return {
        success: true,
        content,
        metadata: {
          characterCount: content.mainText.length,
          wordCount: content.wordCount,
          headingsCount: content.headings.length,
          paragraphsCount: content.paragraphs.length,
          listsCount: content.lists.length,
          tablesCount: content.tables.length,
          imagesCount: content.images.length,
          executionTime,
          language: content.detectedLanguage || content.metadata.language
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Text extraction failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          executionTime
        }
      };
    }
  }
  
  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')  // Multiple spaces to single space
      .replace(/\n\s*\n/g, '\n\n')  // Multiple newlines to double newline
      .replace(/^\s+|\s+$/g, '')  // Trim whitespace
      .replace(/[^\w\s\u4e00-\u9fff.,;:!?'"-]/g, '');  // Keep basic punctuation and Chinese characters
  }
  
  detectLanguage(text) {
    // Simple language detection based on character analysis
    const chineseRegex = /[\u4e00-\u9fff]/;
    const englishRegex = /[a-zA-Z]/;
    
    const chineseChars = (text.match(chineseRegex) || []).length;
    const englishChars = (text.match(englishRegex) || []).length;
    const totalChars = text.length;
    
    if (chineseChars > totalChars * 0.3) {
      return 'zh';
    } else if (englishChars > totalChars * 0.5) {
      return 'en';
    } else {
      return 'unknown';
    }
  }
}

/**
 * Image Extractor Operation - Extract images from web pages
 */
export class ImageExtractorOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'ImageExtractorOperation';
    this.description = 'Extract images from web pages with metadata analysis';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['extract-images', 'data-extraction', 'media-extraction'];
    this.supportedContainers = ['web-page', 'gallery', 'content-container', 'any'];
    this.capabilities = ['image-extraction', 'media-extraction', 'metadata-analysis'];
    
    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.9,
      memoryUsage: 'medium'
    };
    
    this.requiredParameters = [];
    this.optionalParameters = {
      selector: 'img', // CSS selector for images
      minSize: { width: 50, height: 50 }, // Minimum image size
      maxSize: { width: 5000, height: 5000 }, // Maximum image size
      formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'], // Accepted formats
      includeMetadata: true,
      extractDimensions: true,
      extractColors: false,
      analyzeContent: false,
      maxImages: 100,
      downloadImages: false,
      downloadPath: './images/'
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
    this.log('info', 'Starting image extraction', { params: finalParams });
    
    try {
      if (!context.page) {
        throw new Error('Page context not available');
      }
      
      const page = context.page;
      
      // Extract image information
      const images = await page.evaluate((params) => {
        const imageElements = document.querySelectorAll(params.selector);
        return Array.from(imageElements).map(img => {
          const result = {
            src: img.src || img.dataset.src || '',
            alt: img.alt || '',
            title: img.title || '',
            width: img.naturalWidth || img.width || 0,
            height: img.naturalHeight || img.height || 0,
            className: img.className || '',
            id: img.id || '',
            loading: img.loading || 'eager',
            format: img.src.split('.').pop().split('?')[0].toLowerCase(),
            isLazy: img.loading === 'lazy' || img.dataset.loading === 'lazy',
            parentElement: img.parentElement ? img.parentElement.tagName.toLowerCase() : '',
            isVisible: img.offsetParent !== null,
            isDecorative: img.alt === '' && img.title === ''
          };
          
          // Check if image is visible in viewport
          const rect = img.getBoundingClientRect();
          result.isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
          
          return result;
        });
      }, finalParams);
      
      // Filter images based on criteria
      const filteredImages = this.filterImages(images, finalParams);
      
      // Sort images by relevance
      const sortedImages = this.sortImages(filteredImages, finalParams);
      
      // Limit results
      const limitedImages = sortedImages.slice(0, finalParams.maxImages);
      
      // Extract additional metadata if requested
      if (finalParams.includeMetadata) {
        await this.enrichImageMetadata(limitedImages, page);
      }
      
      // Download images if requested
      if (finalParams.downloadImages) {
        await this.downloadImages(limitedImages, finalParams.downloadPath);
      }
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Image extraction completed', { 
        extractedCount: images.length,
        filteredCount: filteredImages.length,
        finalCount: limitedImages.length,
        executionTime 
      });
      
      return {
        success: true,
        images: limitedImages,
        metadata: {
          totalExtracted: images.length,
          totalFiltered: filteredImages.length,
          totalValid: limitedImages.length,
          totalDownloaded: finalParams.downloadImages ? limitedImages.filter(img => img.downloaded).length : 0,
          formats: this.countFormats(limitedImages),
          executionTime,
          filters: finalParams
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Image extraction failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          executionTime,
          filters: finalParams
        }
      };
    }
  }
  
  filterImages(images, params) {
    return images.filter(img => {
      // Check if image has valid source
      if (!img.src || img.src.startsWith('data:') || img.src.startsWith('about:')) {
        return false;
      }
      
      // Check format
      if (params.formats.length > 0 && !params.formats.includes(img.format)) {
        return false;
      }
      
      // Check minimum size
      if (img.width < params.minSize.width || img.height < params.minSize.height) {
        return false;
      }
      
      // Check maximum size
      if (img.width > params.maxSize.width || img.height > params.maxSize.height) {
        return false;
      }
      
      // Prefer visible images
      if (!img.isVisible) {
        return false;
      }
      
      return true;
    });
  }
  
  sortImages(images, params) {
    return images.sort((a, b) => {
      // Sort by image size (larger images often more important)
      const sizeA = a.width * a.height;
      const sizeB = b.width * b.height;
      
      if (sizeB !== sizeA) {
        return sizeB - sizeA;
      }
      
      // Then sort by viewport visibility
      if (a.isInViewport !== b.isInViewport) {
        return a.isInViewport ? -1 : 1;
      }
      
      // Finally sort by alt text presence
      if (a.alt !== b.alt) {
        return a.alt.length > b.alt.length ? -1 : 1;
      }
      
      return 0;
    });
  }
  
  async enrichImageMetadata(images, page) {
    for (const image of images) {
      image.enrichmentTimestamp = new Date().toISOString();
      image.relevanceScore = this.calculateImageRelevance(image);
      
      // Add context information
      if (image.parentElement) {
        image.contextType = image.parentElement;
      }
    }
  }
  
  calculateImageRelevance(image) {
    let score = 0;
    
    // Points for size
    const size = image.width * image.height;
    if (size > 100000) score += 3; // Large image
    else if (size > 50000) score += 2; // Medium image
    else if (size > 10000) score += 1; // Small image
    
    // Points for alt text
    if (image.alt.length > 0) {
      score += 2;
      if (image.alt.length > 20) score += 1;
    }
    
    // Points for being in viewport
    if (image.isInViewport) {
      score += 1;
    }
    
    // Points for parent element context
    if (image.parentElement === 'article' || image.parentElement === 'main') {
      score += 2;
    } else if (image.parentElement === 'figure' || image.parentElement === 'div') {
      score += 1;
    }
    
    // Deduct points for decorative images
    if (image.isDecorative) {
      score -= 1;
    }
    
    return score;
  }
  
  countFormats(images) {
    const formatCount = {};
    images.forEach(img => {
      formatCount[img.format] = (formatCount[img.format] || 0) + 1;
    });
    return formatCount;
  }
  
  async downloadImages(images, downloadPath) {
    // This would require additional file system access
    // For now, we'll just mark them for download
    images.forEach(img => {
      img.downloadPath = downloadPath;
      img.downloaded = false; // Would be true after actual download
    });
  }
}

/**
 * Content Extractor Operation - Comprehensive content extraction
 */
export class ContentExtractorOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'ContentExtractorOperation';
    this.description = 'Comprehensive content extraction combining text, links, and media';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';
    
    this.abstractCategories = ['extract-content', 'data-extraction', 'content-analysis'];
    this.supportedContainers = ['web-page', 'article', 'content-container', 'any'];
    this.capabilities = ['content-extraction', 'text-extraction', 'link-extraction', 'media-extraction'];
    
    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.9,
      memoryUsage: 'medium'
    };
    
    this.requiredParameters = [];
    this.optionalParameters = {
      extractText: true,
      extractLinks: true,
      extractImages: true,
      extractStructuredData: true,
      mainContentSelector: 'main, article, .content, #content',
      excludeSelectors: ['nav', 'footer', 'header', '.ads', '.sidebar'],
      contentTypes: ['text', 'links', 'images', 'metadata'],
      maxContentLength: 100000,
      analyzeReadability: true,
      extractSchema: true
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
    this.log('info', 'Starting comprehensive content extraction', { params: finalParams });
    
    try {
      if (!context.page) {
        throw new Error('Page context not available');
      }
      
      const page = context.page;
      const result = {
        url: page.url(),
        title: await page.title(),
        extractedAt: new Date().toISOString(),
        content: {}
      };
      
      // Extract main content area
      const mainContent = await this.extractMainContent(page, finalParams);
      
      // Extract different content types
      if (finalParams.extractText) {
        result.content.text = await this.extractTextContent(page, mainContent, finalParams);
      }
      
      if (finalParams.extractLinks) {
        result.content.links = await this.extractLinkContent(page, mainContent, finalParams);
      }
      
      if (finalParams.extractImages) {
        result.content.images = await this.extractImageContent(page, mainContent, finalParams);
      }
      
      if (finalParams.extractStructuredData) {
        result.content.structured = await this.extractStructuredData(page, mainContent, finalParams);
      }
      
      // Analyze content if requested
      if (finalParams.analyzeReadability) {
        result.analysis = this.analyzeContent(result.content);
      }
      
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);
      
      this.log('info', 'Content extraction completed', { 
        contentTypes: Object.keys(result.content),
        executionTime 
      });
      
      return {
        success: true,
        result,
        metadata: {
          contentTypes: Object.keys(result.content),
          executionTime,
          analysis: result.analysis
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);
      
      this.log('error', 'Content extraction failed', { error: error.message, executionTime });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          executionTime
        }
      };
    }
  }
  
  async extractMainContent(page, params) {
    return await page.evaluate((selectors) => {
      // Try to find main content area
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element.outerHTML;
        }
      }
      return document.body.outerHTML;
    }, params.mainContentSelector.split(',').map(s => s.trim()));
  }
  
  async extractTextContent(page, mainContent, params) {
    const textExtractor = new TextExtractorOperation();
    const textResult = await textExtractor.execute({ page }, {
      selector: params.mainContentSelector,
      excludeSelectors: params.excludeSelectors,
      preserveFormatting: true,
      includeMetadata: true,
      extractHeadings: true,
      maxContentLength: params.maxContentLength
    });
    
    return textResult.success ? textResult.content : null;
  }
  
  async extractLinkContent(page, mainContent, params) {
    const linkExtractor = new LinkExtractorOperation();
    const linkResult = await linkExtractor.execute({ page }, {
      selector: `${params.mainContentSelector} a`,
      includeMetadata: true,
      maxLinks: 50,
      extractText: true
    });
    
    return linkResult.success ? linkResult.links : null;
  }
  
  async extractImageContent(page, mainContent, params) {
    const imageExtractor = new ImageExtractorOperation();
    const imageResult = await imageExtractor.execute({ page }, {
      selector: `${params.mainContentSelector} img`,
      includeMetadata: true,
      maxImages: 30,
      extractDimensions: true
    });
    
    return imageResult.success ? imageResult.images : null;
  }
  
  async extractStructuredData(page, mainContent, params) {
    return await page.evaluate(() => {
      const structured = {};
      
      // Extract JSON-LD
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      structured.jsonLd = Array.from(jsonLdScripts).map(script => {
        try {
          return JSON.parse(script.textContent);
        } catch (e) {
          return { error: 'Invalid JSON-LD' };
        }
      });
      
      // Extract microdata
      const microdataElements = document.querySelectorAll('[itemscope]');
      structured.microdata = Array.from(microdataElements).map(element => {
        const item = {
          type: element.getAttribute('itemtype') || '',
          properties: {}
        };
        
        const properties = element.querySelectorAll('[itemprop]');
        properties.forEach(prop => {
          const name = prop.getAttribute('itemprop');
          const value = prop.getAttribute('content') || prop.textContent.trim();
          if (name) {
            item.properties[name] = value;
          }
        });
        
        return item;
      });
      
      // Extract Open Graph
      const ogTags = document.querySelectorAll('meta[property^="og:"]');
      structured.openGraph = {};
      ogTags.forEach(tag => {
        const property = tag.getAttribute('property');
        const content = tag.getAttribute('content');
        if (property && content) {
          structured.openGraph[property.replace('og:', '')] = content;
        }
      });
      
      // Extract meta tags
      const metaTags = document.querySelectorAll('meta[name], meta[http-equiv]');
      structured.meta = {};
      metaTags.forEach(tag => {
        const name = tag.getAttribute('name') || tag.getAttribute('http-equiv');
        const content = tag.getAttribute('content');
        if (name && content) {
          structured.meta[name] = content;
        }
      });
      
      return structured;
    });
  }
  
  analyzeContent(content) {
    const analysis = {
      readability: {},
      contentStats: {},
      recommendations: []
    };
    
    // Analyze text content
    if (content.text) {
      const text = content.text.mainText;
      analysis.contentStats = {
        characterCount: text.length,
        wordCount: text.split(/\s+/).length,
        sentenceCount: text.split(/[.!?]+/).length,
        paragraphCount: content.text.paragraphs ? content.text.paragraphs.length : 0,
        headingCount: content.text.headings ? content.text.headings.length : 0
      };
      
      // Calculate readability score (simplified Flesch Reading Ease)
      const avgSentenceLength = analysis.contentStats.wordCount / analysis.contentStats.sentenceCount;
      const avgSyllables = text.split(/\s+/).reduce((acc, word) => {
        return acc + Math.max(1, word.replace(/[^aeiouAEIOU]/g, '').length);
      }, 0) / analysis.contentStats.wordCount;
      
      analysis.readability.score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllables);
      analysis.readability.level = this.getReadabilityLevel(analysis.readability.score);
      
      // Generate recommendations
      if (analysis.readability.score < 30) {
        analysis.recommendations.push('Content is very difficult to read. Consider simplifying sentences.');
      }
      if (analysis.contentStats.headingCount === 0) {
        analysis.recommendations.push('No headings found. Consider adding heading structure.');
      }
      if (analysis.contentStats.paragraphCount < 3) {
        analysis.recommendations.push('Few paragraphs. Content might be too brief.');
      }
    }
    
    // Analyze link content
    if (content.links) {
      analysis.contentStats.linkCount = content.links.length;
      analysis.contentStats.externalLinks = content.links.filter(link => link.isExternal).length;
      analysis.contentStats.internalLinks = content.links.filter(link => link.isInternal).length;
    }
    
    // Analyze image content
    if (content.images) {
      analysis.contentStats.imageCount = content.images.length;
      analysis.contentStats.imagesWithAlt = content.images.filter(img => img.alt.length > 0).length;
      
      if (analysis.contentStats.imagesWithAlt < analysis.contentStats.imageCount) {
        analysis.recommendations.push('Some images lack alt text. Add descriptions for accessibility.');
      }
    }
    
    return analysis;
  }
  
  getReadabilityLevel(score) {
    if (score >= 90) return 'Very Easy';
    if (score >= 80) return 'Easy';
    if (score >= 70) return 'Fairly Easy';
    if (score >= 60) return 'Standard';
    if (score >= 50) return 'Fairly Difficult';
    if (score >= 30) return 'Difficult';
    return 'Very Difficult';
  }
}