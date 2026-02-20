/**
 * Weibo Search Links Collection Block
 * Collects post links from Weibo search results
 * 
 * Collection ID format: search:<keyword>
 * 
 * Modes:
 * - fresh: Clear existing data and recollect
 * - incremental: Keep existing data and add new posts
 */

import { BaseBlock } from '../base';
import type { BlockContext, BlockResult } from '../types';
import { CollectionDataManager, type CollectionIdSpec } from '../../collection-manager';
import { ProcessRegistry } from '../../process-registry';
import { RateLimiter } from '../../rate-limiter';
import type { Page } from 'playwright';

interface SearchLinksConfig {
  profile: string;
  keyword: string;
  target: number;
  mode?: 'fresh' | 'incremental';
  /** Maximum pages to search (0 = unlimited) */
  maxPages?: number;
}

interface SearchLinksResult extends BlockResult {
  posts: number;
  linksFile: string;
  collectionId: string;
  stats: {
    totalPosts: number;
    newPosts: number;
    duplicatesSkipped: number;
  };
}

export class WeiboCollectSearchLinksBlock extends BaseBlock<SearchLinksConfig, SearchLinksResult> {
  name = 'weibo-collect-search-links';
  description = 'Collect Weibo post links from search results';

  async execute(
    config: SearchLinksConfig,
    context: BlockContext
  ): Promise<SearchLinksResult> {
    const { profile, keyword, target, mode = 'incremental', maxPages = 0 } = config;
    
    // Build collection spec
    const spec: CollectionIdSpec = {
      source: 'search',
      keyword
    };
    
    // Initialize data manager
    const dataManager = new CollectionDataManager({
      platform: 'weibo',
      env: context.env || 'debug',
      spec,
      mode
    });
    
    await dataManager.init();
    const paths = dataManager.getPaths();
    
    // Register process
    const processRegistry = ProcessRegistry.getInstance();
    const processId = processRegistry.register({
      name: `weibo-search-${keyword}`,
      platform: 'weibo',
      profile,
      metadata: { collectionId: dataManager.getCollectionId() }
    });
    
    // Get rate limiter
    const rateLimiter = RateLimiter.getInstance();
    const page = context.page;
    
    if (!page) {
      return {
        success: false,
        error: 'Page not available',
        posts: 0,
        linksFile: paths.linksPath,
        collectionId: dataManager.getCollectionId(),
        stats: {
          totalPosts: 0,
          newPosts: 0,
          duplicatesSkipped: 0
        }
      };
    }
    
    try {
      // Request search quota
      const searchQuota = await rateLimiter.requestQuota('search', keyword);
      if (!searchQuota.allowed) {
        return {
          success: false,
          error: `Search quota exceeded: ${searchQuota.reason}`,
          posts: 0,
          linksFile: paths.linksPath,
          collectionId: dataManager.getCollectionId(),
          stats: {
            totalPosts: 0,
            newPosts: 0,
            duplicatesSkipped: 0
          }
        };
      }
      
      // Navigate to Weibo search
      const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      
      // Handle login page if needed
      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('passport')) {
        return {
          success: false,
          error: 'Login required',
          posts: 0,
          linksFile: paths.linksPath,
          collectionId: dataManager.getCollectionId(),
          stats: {
            totalPosts: 0,
            newPosts: 0,
            duplicatesSkipped: 0
          }
        };
      }
      
      let collectedPosts: Array<{ id: string; url: string }> = [];
      let currentPage = 1;
      let noNewPostsCount = 0;
      const maxNoNewPosts = 3;
      
      while (collectedPosts.length < target && noNewPostsCount < maxNoNewPosts) {
        // Check heartbeat
        if (!processRegistry.heartbeat(processId)) {
          break;
        }
        
        // Collect visible posts
        const visiblePosts = await this.collectVisiblePosts(page);
        let newPostsThisRound = 0;
        
        for (const post of visiblePosts) {
          if (!dataManager.hasPost(post.id)) {
            await dataManager.addPost({
              id: post.id,
              url: post.url,
              collectedAt: new Date().toISOString()
            });
            collectedPosts.push(post);
            newPostsThisRound++;
            
            if (collectedPosts.length >= target) break;
          }
        }
        
        // Check if we found new posts
        if (newPostsThisRound === 0) {
          noNewPostsCount++;
        } else {
          noNewPostsCount = 0;
        }
        
        // Check max pages
        if (maxPages > 0 && currentPage >= maxPages) {
          break;
        }
        
        // Try to go to next page
        if (collectedPosts.length < target && noNewPostsCount < maxNoNewPosts) {
          const hasNextPage = await this.goToNextPage(page, currentPage);
          if (!hasNextPage) {
            break;
          }
          currentPage++;
          await page.waitForTimeout(2000);
        }
      }
      
      // Persist data
      await dataManager.persist();
      
      const stats = dataManager.getStats();
      
      return {
        success: true,
        posts: collectedPosts.length,
        linksFile: paths.linksPath,
        collectionId: dataManager.getCollectionId(),
        stats: {
          totalPosts: stats.totalPosts,
          newPosts: stats.newPosts,
          duplicatesSkipped: stats.duplicatesSkipped
        }
      };
      
    } finally {
      processRegistry.unregister(processId);
    }
  }

  private async collectVisiblePosts(page: Page): Promise<Array<{ id: string; url: string }>> {
    // Search results use .card-wrap elements
    const posts = await page.evaluate(() => {
      const cards = document.querySelectorAll('.card-wrap');
      const results: Array<{ id: string; url: string }> = [];
      
      for (const card of cards) {
        // Find post link
        const link = card.querySelector('a[href*="/status/"]') as HTMLAnchorElement;
        if (link) {
          const href = link.href;
          const match = href.match(/status\/(\d+)/);
          if (match) {
            results.push({
              id: match[1],
              url: href
            });
          }
        }
      }
      
      return results;
    });
    
    return posts;
  }

  private async goToNextPage(page: Page, currentPage: number): Promise<boolean> {
    try {
      // Find next page link
      const nextLink = await page.$(`a[href*="page=${currentPage + 1}"]`);
      if (nextLink) {
        await nextLink.click();
        await page.waitForLoadState('networkidle');
        return true;
      }
      
      // Try clicking next button
      const nextBtn = await page.$('.next');
      if (nextBtn) {
        await nextBtn.click();
        await page.waitForLoadState('networkidle');
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }
}

export default WeiboCollectSearchLinksBlock;
