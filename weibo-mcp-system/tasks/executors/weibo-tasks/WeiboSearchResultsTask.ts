import { WeiboTaskExecutor, WeiboTaskConfig, WeiboTaskResult } from './WeiboTaskExecutor';
import { CapturedContent, ExtractedLink, AnalysisResult } from '@webauto/content-capturer';
import { ExtractionContext } from '@webauto/link-extractor';

/**
 * Configuration specific to search results tasks
 */
export interface WeiboSearchResultsConfig extends WeiboTaskConfig {
  searchQuery: string;
  searchType?: 'posts' | 'users' | 'topics' | 'videos' | 'images';
  timeRange?: {
    start?: Date;
    end?: Date;
  };
  sortBy?: 'time' | 'hot' | 'relevant';
  maxResults?: number;
  searchPages?: number;
  captureComments?: boolean;
  captureImages?: boolean;
  captureVideos?: boolean;
  expandComments?: boolean;
  advancedFilters?: {
    userTypes?: ('verified' | 'ordinary' | 'enterprise')[];
    contentTypes?: ('original' | 'repost' | 'comment')[];
    mediaTypes?: ('text' | 'image' | 'video' | 'article')[];
    locationFilter?: string[];
    languageFilter?: string[];
  };
}

/**
 * Result specific to search results tasks
 */
export interface WeiboSearchResultsResult extends WeiboTaskResult {
  searchQuery: string;
  searchType: string;
  searchResultsFound: number;
  searchResultsCaptured: number;
  searchMetadata: {
    totalResults?: number;
    searchTime?: number;
    filtersApplied?: string[];
    suggestedQueries?: string[];
    trendingTopics?: string[];
  };
}

/**
 * Weibo Search Results Task
 * 
 * Captures posts from Weibo search results
 * Supports different search types: posts, users, topics, videos, images
 * Includes advanced filtering and sorting options
 * Handles pagination and result extraction
 */
export class WeiboSearchResultsTask extends WeiboTaskExecutor {
  protected config: WeiboSearchResultsConfig;
  private searchUrl: string;
  private capturedResults: CapturedContent[] = [];

  constructor(config: WeiboSearchResultsConfig) {
    super({
      ...config,
      name: config.name || `Weibo Search - ${config.searchQuery}`,
      description: config.description || `Search and capture results for: ${config.searchQuery}`,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000,
      timeout: config.timeout || 600000, // 10 minutes for search
      enabled: config.enabled !== false
    });

    this.config = config;
    this.searchUrl = this.buildSearchUrl();
  }

  /**
   * Build search URL based on configuration
   */
  private buildSearchUrl(): string {
    const baseUrl = 'https://s.weibo.com';
    const searchType = this.config.searchType || 'posts';
    const query = encodeURIComponent(this.config.searchQuery);
    
    let searchUrl = `${baseUrl}/${searchType}?q=${query}`;
    
    // Add sorting parameter
    if (this.config.sortBy) {
      const sortMap = {
        'time': 'time',
        'hot': 'hot',
        'relevant': 'relevant'
      };
      searchUrl += `&typeall=1&suball=1&timescope=custom:1970-01-01:${new Date().toISOString().split('T')[0]}&Refer=g`;
    }
    
    // Add time range if specified
    if (this.config.timeRange?.start || this.config.timeRange?.end) {
      const startDate = this.config.timeRange.start?.toISOString().split('T')[0] || '1970-01-01';
      const endDate = this.config.timeRange.end?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
      searchUrl += `&timescope=custom:${startDate}:${endDate}`;
    }
    
    return searchUrl;
  }

  /**
   * Core execution logic for search results task
   */
  protected async executeCore(): Promise<WeiboSearchResultsResult> {
    const startTime = Date.now();
    const result: WeiboSearchResultsResult = {
      taskId: this.config.id,
      success: false,
      capturedContent: [],
      extractedLinks: [],
      analysisResults: [],
      errors: [],
      warnings: [],
      metrics: {
        executionTime: 0,
        linksExtracted: 0,
        contentCaptured: 0,
        storageOperations: 0,
        analysisPerformed: 0
      },
      timestamp: new Date(),
      searchQuery: this.config.searchQuery,
      searchType: this.config.searchType || 'posts',
      searchResultsFound: 0,
      searchResultsCaptured: 0,
      searchMetadata: {
        searchTime: 0,
        filtersApplied: []
      }
    };

    try {
      this.emit('search_task_started', { 
        taskId: this.config.id,
        searchQuery: this.config.searchQuery,
        searchType: this.config.searchType,
        searchUrl: this.searchUrl
      });

      // Step 1: Navigate to search results page
      const navigationResult = await this.navigateToSearchResults();
      if (!navigationResult.success) {
        throw new Error(`Failed to navigate to search results: ${navigationResult.error}`);
      }

      // Step 2: Apply advanced filters if configured
      if (this.config.advancedFilters) {
        await this.applyAdvancedFilters();
      }

      // Step 3: Extract search metadata and statistics
      const searchMetadata = await this.extractSearchMetadata();
      result.searchMetadata = { ...result.searchMetadata, ...searchMetadata };

      // Step 4: Extract result links with pagination
      const resultLinks = await this.extractResultLinks();
      result.searchResultsFound = resultLinks.length;
      result.metrics.linksExtracted = resultLinks.length;
      result.extractedLinks = resultLinks;

      // Step 5: Filter result links based on criteria
      const filteredLinks = this.filterResultLinks(resultLinks);
      if (filteredLinks.length < resultLinks.length) {
        result.warnings.push(`Filtered out ${resultLinks.length - filteredLinks.length} results based on criteria`);
      }

      // Step 6: Capture detailed content from each result
      const capturedResults = await this.captureResults(filteredLinks);
      result.capturedContent = capturedResults;
      result.searchResultsCaptured = capturedResults.length;
      result.metrics.contentCaptured = capturedResults.length;
      this.capturedResults = capturedResults;

      // Step 7: Analyze captured content
      if (this.config.analysisConfig) {
        const analysisResults = await this.analyzeContent(capturedResults);
        result.analysisResults = analysisResults;
        result.metrics.analysisPerformed = analysisResults.length;
      }

      // Step 8: Store captured content
      await this.storeContent(capturedResults);
      result.metrics.storageOperations = capturedResults.length;

      // Calculate final metrics
      result.searchMetadata.searchTime = Date.now() - startTime;
      result.metrics.executionTime = Date.now() - startTime;
      result.success = true;

      this.emit('search_task_completed', { 
        taskId: this.config.id,
        result
      });

      return result;
    } catch (error) {
      result.metrics.executionTime = Date.now() - startTime;
      result.errors.push(error instanceof Error ? error.message : String(error));
      
      this.emit('search_task_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });

      return result;
    }
  }

  /**
   * Navigate to search results page
   */
  private async navigateToSearchResults() {
    this.emit('search_navigation_started', { 
      taskId: this.config.id,
      searchUrl: this.searchUrl
    });

    try {
      const result = await this.navigateToUrl(this.searchUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for page to load completely
      if (this.session) {
        await this.session.page.waitForTimeout(3000);
        
        // Check if search results loaded
        const searchResultsLoaded = await this.session.page.evaluate(() => {
          return document.querySelector('.card-wrap') !== null || 
                 document.querySelector('[data-testid="search-results"]') !== null ||
                 document.querySelector('.Feed_body') !== null ||
                 document.querySelector('.search_result') !== null;
        });

        if (!searchResultsLoaded) {
          // Check for error messages
          const hasError = await this.session.page.evaluate(() => {
            const errorSelectors = [
              '.error_msg',
              '.error-tip',
              '.no_result',
              '[data-testid="no-results"]'
            ];
            return errorSelectors.some(selector => document.querySelector(selector) !== null);
          });

          if (hasError) {
            throw new Error('No search results found or search failed');
          } else {
            throw new Error('Search results page did not load properly');
          }
        }

        this.emit('search_navigation_completed', { 
          taskId: this.config.id,
          searchResultsLoaded: true
        });
      }

      return result;
    } catch (error) {
      this.emit('search_navigation_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Apply advanced filters to search results
   */
  private async applyAdvancedFilters(): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.emit('advanced_filters_started', { 
      taskId: this.config.id
    });

    try {
      const filters = this.config.advancedFilters!;
      const appliedFilters: string[] = [];

      // Apply user type filters
      if (filters.userTypes && filters.userTypes.length > 0) {
        await this.applyUserTypeFilters(filters.userTypes);
        appliedFilters.push(`userTypes: ${filters.userTypes.join(', ')}`);
      }

      // Apply content type filters
      if (filters.contentTypes && filters.contentTypes.length > 0) {
        await this.applyContentTypeFilters(filters.contentTypes);
        appliedFilters.push(`contentTypes: ${filters.contentTypes.join(', ')}`);
      }

      // Apply media type filters
      if (filters.mediaTypes && filters.mediaTypes.length > 0) {
        await this.applyMediaTypeFilters(filters.mediaTypes);
        appliedFilters.push(`mediaTypes: ${filters.mediaTypes.join(', ')}`);
      }

      // Apply location filters
      if (filters.locationFilter && filters.locationFilter.length > 0) {
        await this.applyLocationFilters(filters.locationFilter);
        appliedFilters.push(`locationFilter: ${filters.locationFilter.join(', ')}`);
      }

      // Wait for filtered results to load
      await this.session.page.waitForTimeout(2000);

      this.emit('advanced_filters_completed', { 
        taskId: this.config.id,
        appliedFilters
      });

      // Store applied filters in metadata
      if (this.capturedResults.length === 0) {
        this.emit('filters_applied', { 
          taskId: this.config.id,
          appliedFilters
        });
      }
    } catch (error) {
      this.emit('advanced_filters_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue execution even if filters fail
    }
  }

  /**
   * Apply user type filters
   */
  private async applyUserTypeFilters(userTypes: string[]): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    // This would involve clicking filter buttons for user types
    // Implementation depends on Weibo's actual UI structure
    await this.session.page.evaluate((types) => {
      // Find and click user type filter buttons
      const typeMap: Record<string, string> = {
        'verified': 'verified',
        'ordinary': 'ordinary',
        'enterprise': 'enterprise'
      };

      types.forEach(type => {
        const selector = `[data-filter="user-type"][data-value="${typeMap[type]}"]`;
        const button = document.querySelector(selector) as HTMLElement;
        if (button) {
          button.click();
        }
      });
    }, userTypes);
  }

  /**
   * Apply content type filters
   */
  private async applyContentTypeFilters(contentTypes: string[]): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    await this.session.page.evaluate((types) => {
      // Find and click content type filter buttons
      const typeMap: Record<string, string> = {
        'original': 'original',
        'repost': 'repost',
        'comment': 'comment'
      };

      types.forEach(type => {
        const selector = `[data-filter="content-type"][data-value="${typeMap[type]}"]`;
        const button = document.querySelector(selector) as HTMLElement;
        if (button) {
          button.click();
        }
      });
    }, contentTypes);
  }

  /**
   * Apply media type filters
   */
  private async applyMediaTypeFilters(mediaTypes: string[]): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    await this.session.page.evaluate((types) => {
      // Find and click media type filter buttons
      const typeMap: Record<string, string> = {
        'text': 'text',
        'image': 'image',
        'video': 'video',
        'article': 'article'
      };

      types.forEach(type => {
        const selector = `[data-filter="media-type"][data-value="${typeMap[type]}"]`;
        const button = document.querySelector(selector) as HTMLElement;
        if (button) {
          button.click();
        }
      });
    }, mediaTypes);
  }

  /**
   * Apply location filters
   */
  private async applyLocationFilters(locations: string[]): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    // This would involve setting location filter options
    // Implementation depends on Weibo's actual UI structure
    console.log('Location filters applied:', locations);
  }

  /**
   * Extract search metadata and statistics
   */
  private async extractSearchMetadata(): Promise<any> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.emit('search_metadata_extraction_started', { 
      taskId: this.config.id
    });

    try {
      const metadata = await this.session.page.evaluate(() => {
        // Extract search result count
        const resultCountSelectors = [
          '.search_result .info',
          '.result_count',
          '[data-testid="result-count"]',
          '.total_results'
        ];

        let totalResults: number | undefined;
        
        for (const selector of resultCountSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const text = element.textContent || '';
            const match = text.match(/[\d,]+/);
            if (match) {
              totalResults = parseInt(match[0].replace(/,/g, ''));
              break;
            }
          }
        }

        // Extract suggested queries
        const suggestedQueries: string[] = [];
        const suggestionSelectors = [
          '.suggestion_list .suggestion',
          '.related_search a',
          '[data-testid="suggested-query"]'
        ];

        for (const selector of suggestionSelectors) {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent?.trim();
            if (text && !suggestedQueries.includes(text)) {
              suggestedQueries.push(text);
            }
          });
        }

        // Extract trending topics
        const trendingTopics: string[] = [];
        const trendingSelectors = [
          '.trending_topics .topic',
          '.hot_search .topic',
          '[data-testid="trending-topic"]'
        ];

        for (const selector of trendingSelectors) {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent?.trim();
            if (text && !trendingTopics.includes(text)) {
              trendingTopics.push(text);
            }
          });
        }

        return {
          totalResults,
          suggestedQueries: suggestedQueries.slice(0, 5), // Limit to 5
          trendingTopics: trendingTopics.slice(0, 5) // Limit to 5
        };
      });

      this.emit('search_metadata_extraction_completed', { 
        taskId: this.config.id,
        metadata
      });

      return metadata;
    } catch (error) {
      this.emit('search_metadata_extraction_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return {};
    }
  }

  /**
   * Extract result links with pagination
   */
  private async extractResultLinks(): Promise<ExtractedLink[]> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.emit('result_links_extraction_started', { 
      taskId: this.config.id
    });

    const allLinks: ExtractedLink[] = [];
    let pageCount = 0;
    const maxPages = this.config.searchPages || 3;
    const maxResults = this.config.maxResults || 50;

    try {
      while (pageCount < maxPages && allLinks.length < maxResults) {
        // Extract current page links
        const currentHtml = await this.session.page.content();
        const currentLinks = await this.extractResultLinksFromHtml(currentHtml, this.searchUrl);
        
        // Add new links (avoid duplicates)
        const newLinks = currentLinks.filter(link => 
          !allLinks.some(existing => existing.url === link.url)
        );
        
        allLinks.push(...newLinks);
        
        this.emit('result_links_extraction_progress', { 
          taskId: this.config.id,
          pageCount: pageCount + 1,
          linksFound: allLinks.length,
          newLinks: newLinks.length
        });

        // Check if we have enough results
        if (allLinks.length >= maxResults) {
          break;
        }

        // Navigate to next page if available
        if (pageCount < maxPages - 1) {
          const hasNextPage = await this.navigateToNextPage();
          if (!hasNextPage) {
            break;
          }
          await this.session.page.waitForTimeout(2000);
        }

        pageCount++;
      }

      this.emit('result_links_extraction_completed', { 
        taskId: this.config.id,
        totalLinks: allLinks.length
      });

      return allLinks.slice(0, maxResults);
    } catch (error) {
      this.emit('result_links_extraction_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Extract result links from HTML content
   */
  private async extractResultLinksFromHtml(html: string, baseUrl: string): Promise<ExtractedLink[]> {
    const context: ExtractionContext = {
      url: baseUrl,
      startTime: new Date(),
      options: {
        includeExternal: false,
        includeImages: false,
        includeVideos: false,
        maxDepth: 1,
        followRedirects: true
      }
    };

    const result = await this.linkExtractor.extractLinks(html, context);
    
    // Filter links based on search type
    const searchType = this.config.searchType || 'posts';
    let filteredLinks = result.links.filter(link => 
      link.isValid !== false
    );

    switch (searchType) {
      case 'posts':
        filteredLinks = filteredLinks.filter(link => this.isPostLink(link.url));
        break;
      case 'users':
        filteredLinks = filteredLinks.filter(link => this.isUserLink(link.url));
        break;
      case 'topics':
        filteredLinks = filteredLinks.filter(link => this.isTopicLink(link.url));
        break;
      case 'videos':
        filteredLinks = filteredLinks.filter(link => this.isVideoLink(link.url));
        break;
      case 'images':
        filteredLinks = filteredLinks.filter(link => this.isImageLink(link.url));
        break;
    }

    return filteredLinks;
  }

  /**
   * Check if URL is a Weibo post link
   */
  private isPostLink(url: string): boolean {
    const postPatterns = [
      /weibo\.com\/\d+\/[A-Za-z0-9]+/,
      /weibo\.com\/[A-Za-z0-9_]+\/[A-Za-z0-9]+/,
      /weibo\.cn\/\d+\/[A-Za-z0-9]+/,
      /m\.weibo\.cn\/\d+\/[A-Za-z0-9]+/
    ];

    return postPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if URL is a user link
   */
  private isUserLink(url: string): boolean {
    const userPatterns = [
      /weibo\.com\/u\/\d+/,
      /weibo\.com\/[A-Za-z0-9_]+$/,
      /weibo\.cn\/u\/\d+/,
      /m\.weibo\.cn\/u\/\d+/
    ];

    return userPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if URL is a topic link
   */
  private isTopicLink(url: string): boolean {
    const topicPatterns = [
      /weibo\.com\/search\?.*q=.*#/,
      /weibo\.com\/topic\/.+/,
      /weibo\.cn\/search\?.*q=.*/
    ];

    return topicPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if URL is a video link
   */
  private isVideoLink(url: string): boolean {
    return url.includes('video') || url.includes('tv');
  }

  /**
   * Check if URL is an image link
   */
  private isImageLink(url: string): boolean {
    return url.includes('photo') || url.includes('image');
  }

  /**
   * Navigate to next page of results
   */
  private async navigateToNextPage(): Promise<boolean> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    try {
      // Look for next page button
      const nextPageSelectors = [
        'text="下一页"',
        'text="Next"',
        '.next_page',
        '[data-testid="next-page"]',
        '.page_next'
      ];

      for (const selector of nextPageSelectors) {
        const button = await this.session.page.$(selector);
        if (button) {
          await button.click();
          await this.session.page.waitForTimeout(2000);
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Filter result links based on criteria
   */
  private filterResultLinks(links: ExtractedLink[]): ExtractedLink[] {
    if (!this.config.timeRange && !this.config.advancedFilters) {
      return links;
    }

    return links.filter(link => {
      // Additional filtering logic could be implemented here
      // For now, return all links as filtering is done at the UI level
      return true;
    });
  }

  /**
   * Capture detailed content from result links
   */
  private async captureResults(resultLinks: ExtractedLink[]): Promise<CapturedContent[]> {
    this.emit('results_capture_started', { 
      taskId: this.config.id,
      resultCount: resultLinks.length
    });

    const capturedResults: CapturedContent[] = [];
    const captureOptions = {
      fullPage: true,
      captureScreenshots: this.config.captureImages !== false,
      extractText: true,
      captureComments: this.config.captureComments !== false
    };

    for (let i = 0; i < resultLinks.length; i++) {
      const link = resultLinks[i];
      
      try {
        this.emit('result_capture_started', { 
          taskId: this.config.id,
          resultIndex: i,
          resultUrl: link.url,
          totalResults: resultLinks.length
        });

        // Navigate to result page
        const navigationResult = await this.navigateToUrl(link.url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        if (!navigationResult.success) {
          throw new Error(`Failed to navigate to result: ${navigationResult.error}`);
        }

        // Expand comments if enabled
        if (this.config.expandComments) {
          await this.expandComments();
        }

        // Capture content
        const result = await this.contentCapturer.captureContent(link.url, captureOptions);
        
        if (result.success && result.content) {
          // Add result-specific metadata
          result.content.metadata.resultUrl = link.url;
          result.content.metadata.resultTitle = link.text;
          result.content.metadata.resultIndex = i;
          result.content.metadata.searchQuery = this.config.searchQuery;
          result.content.metadata.searchType = this.config.searchType;
          
          capturedResults.push(result.content);

          this.emit('result_capture_completed', { 
            taskId: this.config.id,
            resultIndex: i,
            contentId: result.content.id,
            resultUrl: link.url
          });
        }

        // Add delay between captures to avoid detection
        if (i < resultLinks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        }
      } catch (error) {
        this.emit('result_capture_failed', { 
          taskId: this.config.id,
          resultIndex: i,
          resultUrl: link.url,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.emit('results_capture_completed', { 
      taskId: this.config.id,
      capturedResults: capturedResults.length,
      totalResults: resultLinks.length
    });

    return capturedResults;
  }

  /**
   * Expand comments section for detailed comment capture
   */
  private async expandComments(): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    try {
      // Try to find and click "查看更多评论" (View more comments) buttons
      const expandButtons = await this.session.page.$$('text="查看更多评论"');
      
      for (const button of expandButtons) {
        try {
          await button.click();
          await this.session.page.waitForTimeout(1000);
        } catch (error) {
          // Continue if button click fails
        }
      }

      // Scroll down to ensure all comments are loaded
      await this.session.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await this.session.page.waitForTimeout(1000);
    } catch (error) {
      // Non-critical error, continue execution
    }
  }

  /**
   * Get captured results for further processing
   */
  getCapturedResults(): CapturedContent[] {
    return this.capturedResults;
  }

  /**
   * Get task-specific configuration
   */
  getConfig(): WeiboSearchResultsConfig {
    return this.config;
  }
}