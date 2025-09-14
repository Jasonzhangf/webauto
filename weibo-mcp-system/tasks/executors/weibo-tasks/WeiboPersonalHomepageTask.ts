import { WeiboTaskExecutor, WeiboTaskConfig, WeiboTaskResult } from './WeiboTaskExecutor';
import { CapturedContent, ExtractedLink, AnalysisResult } from '@webauto/content-capturer';
import { ExtractionContext } from '@webauto/link-extractor';

/**
 * Configuration specific to personal homepage tasks
 */
export interface WeiboPersonalHomepageConfig extends WeiboTaskConfig {
  feedType?: 'timeline' | 'mentions' | 'comments' | 'likes' | 'groups';
  maxPosts?: number;
  scrollPages?: number;
  captureComments?: boolean;
  captureImages?: boolean;
  captureVideos?: boolean;
  expandComments?: boolean;
  realTimeRefresh?: boolean;
  refreshInterval?: number;
  postFilters?: {
    minDate?: Date;
    maxDate?: Date;
    keywords?: string[];
    excludeKeywords?: string[];
    minReposts?: number;
    minComments?: number;
    minLikes?: number;
    userWhitelist?: string[];
    userBlacklist?: string[];
  };
}

/**
 * Result specific to personal homepage tasks
 */
export interface WeiboPersonalHomepageResult extends WeiboTaskResult {
  feedType: string;
  postsFound: number;
  postsCaptured: number;
  feedMetadata: {
    lastRefresh?: Date;
    refreshCount?: number;
    unreadCount?: number;
    currentSession?: {
      loginTime: Date;
      sessionId: string;
      userName?: string;
    };
  };
}

/**
 * Weibo Personal Homepage Task
 * 
 * Captures posts from the logged-in user's personal feed
 * Supports different feed types: timeline, mentions, comments, likes, groups
 * Uses intelligent link extraction and handles real-time feed updates
 */
export class WeiboPersonalHomepageTask extends WeiboTaskExecutor {
  protected config: WeiboPersonalHomepageConfig;
  private homepageUrl = 'https://weibo.com/';
  private capturedPosts: CapturedContent[] = [];
  private refreshCount = 0;

  constructor(config: WeiboPersonalHomepageConfig) {
    super({
      ...config,
      name: config.name || `Weibo Personal Homepage - ${config.feedType || 'timeline'}`,
      description: config.description || `Capture posts from ${config.feedType || 'timeline'} feed`,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000,
      timeout: config.timeout || 600000, // 10 minutes for personal feed
      enabled: config.enabled !== false
    });

    this.config = config;
  }

  /**
   * Core execution logic for personal homepage task
   */
  protected async executeCore(): Promise<WeiboPersonalHomepageResult> {
    const startTime = Date.now();
    const result: WeiboPersonalHomepageResult = {
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
      feedType: this.config.feedType || 'timeline',
      postsFound: 0,
      postsCaptured: 0,
      feedMetadata: {
        lastRefresh: new Date(),
        refreshCount: 0,
        currentSession: {
          loginTime: new Date(),
          sessionId: this.config.id
        }
      }
    };

    try {
      this.emit('personal_homepage_task_started', { 
        taskId: this.config.id,
        feedType: this.config.feedType
      });

      // Step 1: Verify login status and navigate to homepage
      const loginStatus = await this.verifyLoginAndNavigate();
      if (!loginStatus.isLoggedIn) {
        throw new Error('User not logged in. Please login first.');
      }

      // Step 2: Navigate to specific feed type
      const feedUrl = await this.navigateToFeedType();
      
      // Step 3: Extract session information
      const sessionInfo = await this.extractSessionInfo();
      result.feedMetadata.currentSession = { ...result.feedMetadata.currentSession, ...sessionInfo };

      // Step 4: Extract post links with real-time updates
      const postLinks = await this.extractPostLinksWithRealTimeUpdates();
      result.postsFound = postLinks.length;
      result.metrics.linksExtracted = postLinks.length;
      result.extractedLinks = postLinks;

      // Step 5: Filter post links based on criteria
      const filteredLinks = this.filterPostLinks(postLinks);
      if (filteredLinks.length < postLinks.length) {
        result.warnings.push(`Filtered out ${postLinks.length - filteredLinks.length} posts based on criteria`);
      }

      // Step 6: Capture detailed content from each post
      const capturedPosts = await this.capturePosts(filteredLinks);
      result.capturedContent = capturedPosts;
      result.postsCaptured = capturedPosts.length;
      result.metrics.contentCaptured = capturedPosts.length;
      this.capturedPosts = capturedPosts;

      // Step 7: Analyze captured content
      if (this.config.analysisConfig) {
        const analysisResults = await this.analyzeContent(capturedPosts);
        result.analysisResults = analysisResults;
        result.metrics.analysisPerformed = analysisResults.length;
      }

      // Step 8: Store captured content
      await this.storeContent(capturedPosts);
      result.metrics.storageOperations = capturedPosts.length;

      // Update feed metadata
      result.feedMetadata.lastRefresh = new Date();
      result.feedMetadata.refreshCount = this.refreshCount;

      // Calculate final metrics
      result.metrics.executionTime = Date.now() - startTime;
      result.success = true;

      this.emit('personal_homepage_task_completed', { 
        taskId: this.config.id,
        result
      });

      return result;
    } catch (error) {
      result.metrics.executionTime = Date.now() - startTime;
      result.errors.push(error instanceof Error ? error.message : String(error));
      
      this.emit('personal_homepage_task_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });

      return result;
    }
  }

  /**
   * Verify login status and navigate to homepage
   */
  private async verifyLoginAndNavigate(): Promise<{ isLoggedIn: boolean; username?: string }> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.emit('login_verification_started', { 
      taskId: this.config.id
    });

    try {
      // Navigate to homepage
      const navigationResult = await this.navigateToUrl(this.homepageUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Check if user is logged in
      const isLoggedIn = await this.session.page.evaluate(() => {
        // Check for login indicators
        const loginSelectors = [
          '[data-testid="login-button"]',
          '.login_btn',
          '.unlogin',
          '.nologin'
        ];

        const logoutSelectors = [
          '[data-testid="user-dropdown"]',
          '.gn_nav_list .gn_name',
          '.S_bg2 .gn_name',
          '.WB_global_nav .gn_name'
        ];

        // Check if login button exists
        const hasLoginButton = loginSelectors.some(selector => 
          document.querySelector(selector) !== null
        );

        // Check if user info exists
        const hasUserInfo = logoutSelectors.some(selector => {
          const element = document.querySelector(selector);
          return element !== null && element.textContent?.trim().length > 0;
        });

        return !hasLoginButton && hasUserInfo;
      });

      let username: string | undefined;
      
      if (isLoggedIn) {
        // Extract username
        username = await this.session.page.evaluate(() => {
          const usernameSelectors = [
            '.gn_name',
            '[data-testid="user-name"]',
            '.WB_global_nav .gn_name',
            '.S_bg2 .gn_name'
          ];

          for (const selector of usernameSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent?.trim()) {
              return element.textContent.trim();
            }
          }
          return null;
        });

        this.emit('login_verification_completed', { 
          taskId: this.config.id,
          isLoggedIn: true,
          username
        });
      } else {
        this.emit('login_verification_failed', { 
          taskId: this.config.id,
          isLoggedIn: false
        });
      }

      return { isLoggedIn, username };
    } catch (error) {
      this.emit('login_verification_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Navigate to specific feed type
   */
  private async navigateToFeedType(): Promise<string> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    const feedType = this.config.feedType || 'timeline';
    let feedUrl = this.homepageUrl;

    this.emit('feed_navigation_started', { 
      taskId: this.config.id,
      feedType
    });

    try {
      switch (feedType) {
        case 'timeline':
          feedUrl = `${this.homepageUrl}home`;
          break;
        case 'mentions':
          feedUrl = `${this.homepage.com}/at/me`;
          break;
        case 'comments':
          feedUrl = `${this.homepage.com}/comment`;
          break;
        case 'likes':
          feedUrl = `${this.homepage.com}/like`;
          break;
        case 'groups':
          feedUrl = `${this.homepage.com}/groups`;
          break;
        default:
          feedUrl = `${this.homepageUrl}home`;
      }

      // Navigate to feed
      const navigationResult = await this.navigateToUrl(feedUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for feed to load
      await this.session.page.waitForTimeout(2000);

      // Verify feed loaded correctly
      const feedLoaded = await this.session.page.evaluate(() => {
        return document.querySelector('.Feed_body') !== null || 
               document.querySelector('[data-testid="feed"]') !== null ||
               document.querySelector('.WB_feed') !== null;
      });

      if (!feedLoaded) {
        throw new Error(`Failed to load ${feedType} feed`);
      }

      this.emit('feed_navigation_completed', { 
        taskId: this.config.id,
        feedType,
        feedUrl
      });

      return feedUrl;
    } catch (error) {
      this.emit('feed_navigation_failed', { 
        taskId: this.config.id,
        feedType,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Extract session information
   */
  private async extractSessionInfo(): Promise<{ userName?: string; sessionId: string }> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    try {
      const sessionInfo = await this.session.page.evaluate(() => {
        // Extract session cookies or other identifiers
        const cookies = document.cookie.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>);

        return {
          userName: cookies['SUB'] || cookies['SINAGLOBAL'] || 'unknown',
          sessionId: cookies['SUB'] || 'session-' + Date.now()
        };
      });

      return sessionInfo;
    } catch (error) {
      return {
        sessionId: 'session-' + Date.now()
      };
    }
  }

  /**
   * Extract post links with real-time updates
   */
  private async extractPostLinksWithRealTimeUpdates(): Promise<ExtractedLink[]> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.emit('post_links_extraction_started', { 
      taskId: this.config.id,
      realTimeEnabled: this.config.realTimeRefresh || false
    });

    const allLinks: ExtractedLink[] = [];
    let scrollCount = 0;
    const maxScrollPages = this.config.scrollPages || 5;
    const maxPosts = this.config.maxPosts || 100;
    const realTimeEnabled = this.config.realTimeRefresh || false;
    const refreshInterval = this.config.refreshInterval || 30000; // 30 seconds

    try {
      while (scrollCount < maxScrollPages && allLinks.length < maxPosts) {
        // Extract current page links
        const currentHtml = await this.session.page.content();
        const currentLinks = await this.extractPostLinksFromHtml(currentHtml, this.homepageUrl);
        
        // Add new links (avoid duplicates)
        const newLinks = currentLinks.filter(link => 
          !allLinks.some(existing => existing.url === link.url)
        );
        
        allLinks.push(...newLinks);
        
        this.emit('post_links_extraction_progress', { 
          taskId: this.config.id,
          scrollCount: scrollCount + 1,
          linksFound: allLinks.length,
          newLinks: newLinks.length
        });

        // Check if we have enough posts
        if (allLinks.length >= maxPosts) {
          break;
        }

        // Real-time refresh if enabled
        if (realTimeEnabled && scrollCount > 0 && scrollCount % 2 === 0) {
          await this.refreshFeed();
          this.refreshCount++;
        }

        // Scroll down to load more posts
        if (scrollCount < maxScrollPages - 1) {
          await this.scrollToLoadMore();
          await this.session.page.waitForTimeout(2000);
        }

        scrollCount++;
      }

      this.emit('post_links_extraction_completed', { 
        taskId: this.config.id,
        totalLinks: allLinks.length,
        refreshCount: this.refreshCount
      });

      return allLinks.slice(0, maxPosts);
    } catch (error) {
      this.emit('post_links_extraction_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Refresh feed for real-time updates
   */
  private async refreshFeed(): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.emit('feed_refresh_started', { 
      taskId: this.config.id
    });

    try {
      // Look for refresh button
      const refreshButton = await this.session.page.$('text="刷新"');
      if (refreshButton) {
        await refreshButton.click();
        await this.session.page.waitForTimeout(3000);
      } else {
        // Alternative: reload page
        await this.session.page.reload({ waitUntil: 'networkidle' });
        await this.session.page.waitForTimeout(2000);
      }

      this.emit('feed_refresh_completed', { 
        taskId: this.config.id
      });
    } catch (error) {
      this.emit('feed_refresh_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Extract post links from HTML content
   */
  private async extractPostLinksFromHtml(html: string, baseUrl: string): Promise<ExtractedLink[]> {
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
    
    // Filter links to only include post links
    const postLinks = result.links.filter(link => 
      this.isPostLink(link.url) && link.isValid !== false
    );

    return postLinks;
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
   * Scroll to load more posts
   */
  private async scrollToLoadMore(): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    await this.session.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await this.session.page.waitForTimeout(1000);
  }

  /**
   * Filter post links based on configuration criteria
   */
  private filterPostLinks(links: ExtractedLink[]): ExtractedLink[] {
    if (!this.config.postFilters) {
      return links;
    }

    return links.filter(link => {
      const filters = this.config.postFilters!;

      // Keyword filtering
      if (filters.keywords && filters.keywords.length > 0) {
        const hasKeyword = filters.keywords.some(keyword => 
          link.text?.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!hasKeyword) {
          return false;
        }
      }

      // Exclude keywords
      if (filters.excludeKeywords && filters.excludeKeywords.length > 0) {
        const hasExcludedKeyword = filters.excludeKeywords.some(keyword => 
          link.text?.toLowerCase().includes(keyword.toLowerCase())
        );
        if (hasExcludedKeyword) {
          return false;
        }
      }

      // User whitelist
      if (filters.userWhitelist && filters.userWhitelist.length > 0) {
        const userInWhitelist = filters.userWhitelist.some(user => 
          link.url.includes(user)
        );
        if (!userInWhitelist) {
          return false;
        }
      }

      // User blacklist
      if (filters.userBlacklist && filters.userBlacklist.length > 0) {
        const userInBlacklist = filters.userBlacklist.some(user => 
          link.url.includes(user)
        );
        if (userInBlacklist) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Capture detailed content from post links
   */
  private async capturePosts(postLinks: ExtractedLink[]): Promise<CapturedContent[]> {
    this.emit('posts_capture_started', { 
      taskId: this.config.id,
      postCount: postLinks.length
    });

    const capturedPosts: CapturedContent[] = [];
    const captureOptions = {
      fullPage: true,
      captureScreenshots: this.config.captureImages !== false,
      extractText: true,
      captureComments: this.config.captureComments !== false
    };

    for (let i = 0; i < postLinks.length; i++) {
      const link = postLinks[i];
      
      try {
        this.emit('post_capture_started', { 
          taskId: this.config.id,
          postIndex: i,
          postUrl: link.url,
          totalPosts: postLinks.length
        });

        // Navigate to post page
        const navigationResult = await this.navigateToUrl(link.url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        if (!navigationResult.success) {
          throw new Error(`Failed to navigate to post: ${navigationResult.error}`);
        }

        // Expand comments if enabled
        if (this.config.expandComments) {
          await this.expandComments();
        }

        // Capture content
        const result = await this.contentCapturer.captureContent(link.url, captureOptions);
        
        if (result.success && result.content) {
          // Add post-specific metadata
          result.content.metadata.postUrl = link.url;
          result.content.metadata.postTitle = link.text;
          result.content.metadata.postIndex = i;
          result.content.metadata.feedType = this.config.feedType;
          
          capturedPosts.push(result.content);

          this.emit('post_capture_completed', { 
            taskId: this.config.id,
            postIndex: i,
            contentId: result.content.id,
            postUrl: link.url
          });
        }

        // Add delay between captures to avoid detection
        if (i < postLinks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        }
      } catch (error) {
        this.emit('post_capture_failed', { 
          taskId: this.config.id,
          postIndex: i,
          postUrl: link.url,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.emit('posts_capture_completed', { 
      taskId: this.config.id,
      capturedPosts: capturedPosts.length,
      totalPosts: postLinks.length
    });

    return capturedPosts;
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
      await this.scrollToLoadMore();
    } catch (error) {
      // Non-critical error, continue execution
    }
  }

  /**
   * Get captured posts for further processing
   */
  getCapturedPosts(): CapturedContent[] {
    return this.capturedPosts;
  }

  /**
   * Get task-specific configuration
   */
  getConfig(): WeiboPersonalHomepageConfig {
    return this.config;
  }
}