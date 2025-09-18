/**
 * Weibo Content Extraction Operation
 * 微博内容提取操作子
 */

import { WeiboBaseOperation, WeiboOperationContext, WeiboPost, WeiboComment, WeiboUserProfile } from '../interfaces/IWeiboOperation';
import { OperationContext, OperationResult } from '../interfaces/IWeiboOperation';

/**
 * Weibo Content Extraction Operation for extracting posts, comments, and user profiles
 * 微博内容提取操作子，用于提取帖子、评论和用户资料
 */
export class WeiboContentExtractionOperation extends WeiboBaseOperation {
  name = 'weibo-content-extraction';
  description = 'Extract weibo content (posts, comments, user profiles)';
  version = '1.0.0';
  abstractCategories = ['weibo', 'content-extraction', 'social-media'];
  supportedContainers = ['browser', 'social-media'];
  capabilities = ['post-extraction', 'comment-extraction', 'profile-extraction', 'data-scraping'];

  constructor() {
    super();
    this.requiredParameters = ['contentType'];
    this.optionalParameters = {
      maxItems: 50,
      includeImages: true,
      includeVideos: true,
      includeMetadata: true,
      scrollToLoad: true,
      timeout: 30000
    };
  }

  /**
   * Execute weibo content extraction operation
   * 执行微博内容提取操作
   */
  protected async executeOperation(
    context: OperationContext,
    params?: any
  ): Promise<OperationResult> {
    const weiboContext = context as WeiboOperationContext;

    if (!this.validateWeiboContext(weiboContext)) {
      return {
        success: false,
        error: 'Invalid weibo context - browser page required'
      };
    }

    const {
      contentType,
      maxItems = 50,
      includeImages = true,
      includeVideos = true,
      includeMetadata = true,
      scrollToLoad = true,
      timeout = 30000
    } = params || {};

    try {
      this.logger.info('Starting weibo content extraction', {
        contentType,
        maxItems,
        includeImages,
        includeVideos
      });

      const startTime = Date.now();

      switch (contentType) {
        case 'posts':
          return await this.extractPosts(weiboContext, { maxItems, includeImages, includeVideos, includeMetadata, scrollToLoad, timeout });
        case 'comments':
          if (!params.postId) {
            return {
              success: false,
              error: 'Post ID is required for comment extraction'
            };
          }
          return await this.extractComments(weiboContext, { postId: params.postId, maxItems, includeMetadata, timeout });
        case 'profile':
          return await this.extractUserProfile(weiboContext, { userId: params.userId, timeout });
        default:
          return {
            success: false,
            error: `Unknown content type: ${contentType}`
          };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Weibo content extraction failed', {
        contentType,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - (weiboContext.startTime || Date.now())
      };
    }
  }

  /**
   * Extract posts from current page
   * 从当前页面提取帖子
   */
  private async extractPosts(
    context: WeiboOperationContext,
    options: {
      maxItems: number;
      includeImages: boolean;
      includeVideos: boolean;
      includeMetadata: boolean;
      scrollToLoad: boolean;
      timeout: number;
    }
  ): Promise<OperationResult<WeiboPost[]>> {
    const page = context.browser?.page!;
    const startTime = Date.now();

    try {
      // Wait for content to load
      await this.waitForWeiboPage(context);

      // Scroll to load more content if needed
      if (options.scrollToLoad) {
        await this.scrollToLoadContent(page, options.maxItems);
      }

      // Extract feed items
      const posts = await page.evaluate((opts) => {
        const feedItems = document.querySelectorAll('.Feed_body, .Card_feed, .weibo-post');
        const posts: any[] = [];

        feedItems.forEach((item, index) => {
          if (index >= opts.maxItems) return;

          try {
            // Extract post content
            const contentElement = item.querySelector('.Feed_body_body, .weibo-post-content, .Feed_body_bodytext');
            const content = contentElement?.textContent?.trim() || '';

            // Extract author info
            const authorElement = item.querySelector('.Feed_body_name, .weibo-author-name, .Feed_body_info_name');
            const authorName = authorElement?.textContent?.trim() || '';
            const authorLink = authorElement?.getAttribute('href') || '';
            const authorId = authorLink.match(/\/u\/(\d+)/)?.[1] || authorLink.match(/\/([^\/]+)$/)?.[1] || '';

            // Extract engagement metrics
            const likesElement = item.querySelector('.Feed_body_like, .weibo-likes-count');
            const commentsElement = item.querySelector('.Feed_body_comment, .weibo-comments-count');
            const repostsElement = item.querySelector('.Feed_body_repost, .weibo-reposts-count');

            const likes = parseInt(likesElement?.textContent?.replace(/[^\d]/g, '') || '0') || 0;
            const comments = parseInt(commentsElement?.textContent?.replace(/[^\d]/g, '') || '0') || 0;
            const reposts = parseInt(repostsElement?.textContent?.replace(/[^\d]/g, '') || '0') || 0;

            // Extract time
            const timeElement = item.querySelector('.Feed_body_from, .weibo-post-time');
            const timeText = timeElement?.textContent?.trim() || '';

            // Extract images
            const images: string[] = [];
            if (opts.includeImages) {
              const imageElements = item.querySelectorAll('img[src*="jpg"], img[src*="jpeg"], img[src*="png"]');
              imageElements.forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.includes('avatar')) {
                  images.push(src.startsWith('//') ? `https:${src}` : src);
                }
              });
            }

            posts.push({
              id: `post-${Date.now()}-${index}`,
              author: {
                id: authorId,
                name: authorName,
                screenName: authorName
              },
              content: {
                text: content,
                images: opts.includeImages ? images : [],
                videos: [],
                links: []
              },
              metadata: {
                publishTime: new Date(),
                likes,
                comments,
                reposts,
                isOriginal: !content.includes('转发'),
                source: timeText
              }
            });
          } catch (error) {
            console.warn('Error extracting post:', error);
          }
        });

        return posts;
      }, options);

      const executionTime = Date.now() - startTime;

      this.logger.info('Posts extraction completed', {
        postCount: posts.length,
        executionTime
      });

      return {
        success: true,
        result: posts,
        executionTime,
        metadata: {
          contentType: 'posts',
          extractedCount: posts.length,
          maxItems: options.maxItems,
          hasImages: posts.some(p => p.content.images && p.content.images.length > 0)
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Extract comments from a post
   * 从帖子提取评论
   */
  private async extractComments(
    context: WeiboOperationContext,
    options: {
      postId: string;
      maxItems: number;
      includeMetadata: boolean;
      timeout: number;
    }
  ): Promise<OperationResult<WeiboComment[]>> {
    const page = context.browser?.page!;
    const startTime = Date.now();

    try {
      // Navigate to post if not already there
      if (!page.url().includes(options.postId)) {
        await context.weibo?.navigation?.navigateToPost(context, options.postId);
      }

      // Wait for comments to load
      await page.waitForSelector('.comment_list, .weibo-comments, .Comment_list', { timeout: options.timeout });

      // Extract comments
      const comments = await page.evaluate((opts) => {
        const commentElements = document.querySelectorAll('.comment_list li, .weibo-comment, .Comment_item');
        const comments: any[] = [];

        commentElements.forEach((item, index) => {
          if (index >= opts.maxItems) return;

          try {
            // Extract comment content
            const contentElement = item.querySelector('.comment_text, .weibo-comment-text, .Comment_text');
            const content = contentElement?.textContent?.trim() || '';

            // Extract author info
            const authorElement = item.querySelector('.comment_name, .weibo-comment-author, .Comment_user');
            const authorName = authorElement?.textContent?.trim() || '';
            const authorLink = authorElement?.getAttribute('href') || '';
            const authorId = authorLink.match(/\/u\/(\d+)/)?.[1] || authorLink.match(/\/([^\/]+)$/)?.[1] || '';

            // Extract likes
            const likesElement = item.querySelector('.comment_like, .weibo-comment-likes, .Comment_like');
            const likes = parseInt(likesElement?.textContent?.replace(/[^\d]/g, '') || '0') || 0;

            // Extract time
            const timeElement = item.querySelector('.comment_time, .weibo-comment-time, .Comment_time');
            const timeText = timeElement?.textContent?.trim() || '';

            comments.push({
              id: `comment-${Date.now()}-${index}`,
              postId: opts.postId,
              author: {
                id: authorId,
                name: authorName,
                verified: authorElement?.querySelector('.verified') !== null
              },
              content,
              metadata: {
                publishTime: new Date(),
                likes,
                replies: 0
              }
            });
          } catch (error) {
            console.warn('Error extracting comment:', error);
          }
        });

        return comments;
      }, options);

      const executionTime = Date.now() - startTime;

      this.logger.info('Comments extraction completed', {
        postId: options.postId,
        commentCount: comments.length,
        executionTime
      });

      return {
        success: true,
        result: comments,
        executionTime,
        metadata: {
          contentType: 'comments',
          extractedCount: comments.length,
          maxItems: options.maxItems,
          postId: options.postId
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Extract user profile
   * 提取用户资料
   */
  private async extractUserProfile(
    context: WeiboOperationContext,
    options: {
      userId: string;
      timeout: number;
    }
  ): Promise<OperationResult<WeiboUserProfile>> {
    const page = context.browser?.page!;
    const startTime = Date.now();

    try {
      // Navigate to profile if not already there
      if (!page.url().includes(options.userId)) {
        await context.weibo?.navigation?.navigateToProfile(context, options.userId);
      }

      // Wait for profile to load
      await page.waitForSelector('.Profile_header, .weibo-profile, .WB_frame', { timeout: options.timeout });

      // Extract profile information
      const profile = await page.evaluate(() => {
        // Extract basic info
        const nameElement = document.querySelector('.Profile_header_name, .weibo-profile-name, .username');
        const screenNameElement = document.querySelector('.Profile_header_screenName, .weibo-profile-screenname');
        const descriptionElement = document.querySelector('.Profile_header_info, .weibo-profile-description');

        // Extract stats
        const followersElement = document.querySelector('.Profile_header_followers, .weibo-followers-count');
        const followingElement = document.querySelector('.Profile_header_following, .weibo-following-count');
        const postsElement = document.querySelector('.Profile_header_posts, .weibo-posts-count');

        const followers = parseInt(followersElement?.textContent?.replace(/[^\d]/g, '') || '0') || 0;
        const following = parseInt(followingElement?.textContent?.replace(/[^\d]/g, '') || '0') || 0;
        const posts = parseInt(postsElement?.textContent?.replace(/[^\d]/g, '') || '0') || 0;

        return {
          id: window.location.pathname.split('/').pop() || 'unknown',
          screenName: screenNameElement?.textContent?.trim() || nameElement?.textContent?.trim() || '',
          name: nameElement?.textContent?.trim() || '',
          description: descriptionElement?.textContent?.trim() || '',
          verified: document.querySelector('.verified, .Profile_header_verified') !== null,
          stats: {
            followers,
            following,
            posts
          }
        };
      });

      const executionTime = Date.now() - startTime;

      this.logger.info('User profile extraction completed', {
        userId: options.userId,
        profileName: profile.name,
        executionTime
      });

      return {
        success: true,
        result: profile,
        executionTime,
        metadata: {
          contentType: 'profile',
          userId: options.userId,
          hasCompleteStats: profile.stats.followers > 0
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Scroll to load more content
   * 滚动加载更多内容
   */
  private async scrollToLoadContent(page: any, maxItems: number): Promise<void> {
    let previousHeight = 0;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const currentHeight = await page.evaluate(() => document.body.scrollHeight);

      if (currentHeight === previousHeight) {
        break;
      }

      previousHeight = currentHeight;
      attempts++;

      // Check if we have enough items
      const currentItems = await page.evaluate(() => {
        return document.querySelectorAll('.Feed_body, .Card_feed, .weibo-post').length;
      });

      if (currentItems >= maxItems) {
        break;
      }
    }
  }
}