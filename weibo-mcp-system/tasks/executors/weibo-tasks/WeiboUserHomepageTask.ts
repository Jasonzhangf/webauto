import { WeiboTaskExecutor, WeiboTaskConfig, WeiboTaskResult } from './WeiboTaskExecutor';
import { CapturedContent, ExtractedLink, AnalysisResult } from '@webauto/content-capturer';
import { ExtractionContext } from '@webauto/link-extractor';

/**
 * Configuration specific to user homepage tasks
 */
export interface WeiboUserHomepageConfig extends WeiboTaskConfig {
  userId: string;
  username?: string;
  maxPosts?: number;
  scrollPages?: number;
  captureComments?: boolean;
  captureImages?: boolean;
  captureVideos?: boolean;
  expandComments?: boolean;
  followRedirects?: boolean;
  postFilters?: {
    minDate?: Date;
    maxDate?: Date;
    keywords?: string[];
    excludeKeywords?: string[];
    minReposts?: number;
    minComments?: number;
    minLikes?: number;
  };
}

/**
 * Result specific to user homepage tasks
 */
export interface WeiboUserHomepageResult extends WeiboTaskResult {
  userId: string;
  username?: string;
  postsFound: number;
  postsCaptured: number;
  userMetadata: {
    displayName?: string;
    followerCount?: number;
    followingCount?: number;
    postCount?: number;
    verified?: boolean;
    description?: string;
    location?: string;
  };
}

/**
 * Weibo User Homepage Task
 * 
 * Captures posts from a specific user's homepage (e.g., https://weibo.com/u/2107014571)
 * Uses intelligent link extraction to get post links, then captures detailed content
 * including text, images, and comments for each post.
 */
export class WeiboUserHomepageTask extends WeiboTaskExecutor {
  protected config: WeiboUserHomepageConfig;
  private userHomepageUrl: string;
  private capturedPosts: CapturedContent[] = [];

  constructor(config: WeiboUserHomepageConfig) {
    super({
      ...config,
      name: config.name || `Weibo User Homepage - ${config.userId}`,
      description: config.description || `Capture posts from user ${config.userId} homepage`,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000,
      timeout: config.timeout || 300000, // 5 minutes
      enabled: config.enabled !== false
    });

    this.config = config;
    this.userHomepageUrl = `https://weibo.com/u/${config.userId}`;
  }

  /**
   * Core execution logic for user homepage task
   */
  protected async executeCore(): Promise<WeiboUserHomepageResult> {
    const startTime = Date.now();
    const result: WeiboUserHomepageResult = {
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
      userId: this.config.userId,
      username: this.config.username,
      postsFound: 0,
      postsCaptured: 0,
      userMetadata: {}
    };

    try {
      this.emit('user_homepage_task_started', { 
        taskId: this.config.id,
        userId: this.config.userId,
        url: this.userHomepageUrl
      });

      // Step 1: Navigate to user homepage
      const navigationResult = await this.navigateToUserHomepage();
      if (!navigationResult.success) {
        throw new Error(`Failed to navigate to user homepage: ${navigationResult.error}`);
      }

      // Step 2: Extract user metadata
      const userMetadata = await this.extractUserMetadata();
      result.userMetadata = userMetadata;

      // Step 3: Extract post links with intelligent scrolling
      const postLinks = await this.extractPostLinks();
      result.postsFound = postLinks.length;
      result.metrics.linksExtracted = postLinks.length;
      result.extractedLinks = postLinks;

      // Step 4: Filter post links based on criteria
      const filteredLinks = this.filterPostLinks(postLinks);
      if (filteredLinks.length < postLinks.length) {
        result.warnings.push(`Filtered out ${postLinks.length - filteredLinks.length} posts based on criteria`);
      }

      // Step 5: Capture detailed content from each post
      const capturedPosts = await this.capturePosts(filteredLinks);
      result.capturedContent = capturedPosts;
      result.postsCaptured = capturedPosts.length;
      result.metrics.contentCaptured = capturedPosts.length;
      this.capturedPosts = capturedPosts;

      // Step 6: Analyze captured content
      if (this.config.analysisConfig) {
        const analysisResults = await this.analyzeContent(capturedPosts);
        result.analysisResults = analysisResults;
        result.metrics.analysisPerformed = analysisResults.length;
      }

      // Step 7: Store captured content
      await this.storeContent(capturedPosts);
      result.metrics.storageOperations = capturedPosts.length;

      // Calculate final metrics
      result.metrics.executionTime = Date.now() - startTime;
      result.success = true;

      this.emit('user_homepage_task_completed', { 
        taskId: this.config.id,
        result
      });

      return result;
    } catch (error) {
      result.metrics.executionTime = Date.now() - startTime;
      result.errors.push(error instanceof Error ? error.message : String(error));
      
      this.emit('user_homepage_task_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });

      return result;
    }
  }

  /**
   * Navigate to user homepage with error handling
   */
  private async navigateToUserHomepage() {
    this.emit('navigation_to_user_homepage_started', { 
      taskId: this.config.id,
      url: this.userHomepageUrl
    });

    try {
      const result = await this.navigateToUrl(this.userHomepageUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for page to load completely
      if (this.session) {
        await this.session.page.waitForTimeout(3000);
        
        // Check if page loaded successfully
        const pageTitle = await this.session.page.title();
        if (pageTitle.includes('404') || pageTitle.includes('错误')) {
          throw new Error(`User homepage not found or inaccessible: ${pageTitle}`);
        }

        this.emit('navigation_to_user_homepage_completed', { 
          taskId: this.config.id,
          pageTitle
        });
      }

      return result;
    } catch (error) {
      this.emit('navigation_to_user_homepage_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Extract user metadata from the homepage
   */
  private async extractUserMetadata() {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.emit('user_metadata_extraction_started', { 
      taskId: this.config.id
    });

    try {
      // Extract basic user information
      const userMetadata = await this.session.page.evaluate(() => {
        // Try different selectors for user information
        const selectors = {
          displayName: [
            '.username',
            '.nick_name',
            '.UserInfo_name',
            '[data-testid="user-name"]',
            '.ProfileHeader_name'
          ],
          followerCount: [
            '.follow_count .num',
            '.follower_count',
            '.Follow_count_1',
            '[data-testid="follower-count"]'
          ],
          followingCount: [
            '.follow_count .num',
            '.following_count',
          ],
          postCount: [
            '.status_num',
            '.weibo_count',
            '.WB_cardwrap .S_txt2',
            '[data-testid="post-count"]'
          ],
          verified: [
            '.verify_icon',
            '.icon_approve',
            '.verified'
          ],
          description: [
            '.user_description',
            '.profile_desc',
            '.UserInfo_intro',
            '[data-testid="user-description"]'
          ],
          location: [
            '.user_location',
            '.location',
            '.UserInfo_location',
            '[data-testid="user-location"]'
          ]
        };

        const result: any = {};

        // Extract display name
        for (const selector of selectors.displayName) {
          const element = document.querySelector(selector);
          if (element) {
            result.displayName = element.textContent?.trim();
            break;
          }
        }

        // Extract numeric values
        const extractNumber = (text: string): number => {
          const match = text.match(/[\d,]+/);
          return match ? parseInt(match[0].replace(/,/g, '')) : 0;
        };

        // Extract follower count
        for (const selector of selectors.followerCount) {
          const element = document.querySelector(selector);
          if (element) {
            result.followerCount = extractNumber(element.textContent || '');
            break;
          }
        }

        // Extract following count
        for (const selector of selectors.followingCount) {
          const element = document.querySelector(selector);
          if (element) {
            result.followingCount = extractNumber(element.textContent || '');
            break;
          }
        }

        // Extract post count
        for (const selector of selectors.postCount) {
          const element = document.querySelector(selector);
          if (element) {
            result.postCount = extractNumber(element.textContent || '');
            break;
          }
        }

        // Extract verification status
        for (const selector of selectors.verified) {
          const element = document.querySelector(selector);
          if (element) {
            result.verified = true;
            break;
          }
        }

        // Extract description
        for (const selector of selectors.description) {
          const element = document.querySelector(selector);
          if (element) {
            result.description = element.textContent?.trim();
            break;
          }
        }

        // Extract location
        for (const selector of selectors.location) {
          const element = document.querySelector(selector);
          if (element) {
            result.location = element.textContent?.trim();
            break;
          }
        }

        return result;
      });

      this.emit('user_metadata_extraction_completed', { 
        taskId: this.config.id,
        metadata: userMetadata
      });

      return userMetadata;
    } catch (error) {
      this.emit('user_metadata_extraction_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return {};
    }
  }

  /**
   * Extract post links from the homepage with intelligent scrolling
   */
  private async extractPostLinks(): Promise<ExtractedLink[]> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.emit('post_links_extraction_started', { 
      taskId: this.config.id
    });

    const allLinks: ExtractedLink[] = [];
    let scrollCount = 0;
    const maxScrollPages = this.config.scrollPages || 3;
    const maxPosts = this.config.maxPosts || 50;

    try {
      while (scrollCount < maxScrollPages && allLinks.length < maxPosts) {
        // Extract current page links
        const currentHtml = await this.session.page.content();
        const currentLinks = await this.extractPostLinksFromHtml(currentHtml, this.userHomepageUrl);
        
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

        // Scroll down to load more posts
        if (scrollCount < maxScrollPages - 1) {
          await this.scrollToLoadMore();
          await this.session.page.waitForTimeout(2000); // Wait for new content to load
        }

        scrollCount++;
      }

      this.emit('post_links_extraction_completed', { 
        taskId: this.config.id,
        totalLinks: allLinks.length
      });

      return allLinks.slice(0, maxPosts); // Limit to max posts
    } catch (error) {
      this.emit('post_links_extraction_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
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

      // Date filtering would require extracting post dates from link metadata
      // For now, we'll implement basic filtering

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
  getConfig(): WeiboUserHomepageConfig {
    return this.config;
  }
}