/**
 * Weibo User Posts List Collection Block
 * Collects posts from a specific user's profile page
 * 
 * Collection ID format: user:<userId>:<userName>
 */

import { BaseBlock } from '../base';
import type { BlockContext, BlockResult } from '../types';
import { CollectionDataManager, type CollectionIdSpec } from '../../collection-manager';
import { ProcessRegistry } from '../../process-registry';
import { RateLimiter } from '../../rate-limiter';

interface UserPostsListConfig {
  profile: string;
  userId: string;
  userName?: string;
  target: number;
  mode?: 'fresh' | 'incremental';
}

interface UserPostsListResult extends BlockResult {
  posts: number;
  linksFile: string;
  collectionId: string;
}

export class WeiboCollectUserPostsListBlock extends BaseBlock<UserPostsListConfig, UserPostsListResult> {
  name = 'weibo-collect-user-posts-list';
  description = 'Collect Weibo posts from a specific user profile';

  async execute(
    config: UserPostsListConfig,
    context: BlockContext
  ): Promise<UserPostsListResult> {
    const { profile, userId, userName, target, mode = 'incremental' } = config;
    
    // Build collection spec
    const spec: CollectionIdSpec = {
      source: 'user',
      userId,
      userName
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
      name: `weibo-user-${userId}`,
      platform: 'weibo',
      profile,
      metadata: { collectionId: dataManager.getCollectionId() }
    });
    
    const page = context.page;
    
    if (!page) {
      return {
        success: false,
        error: 'Page not available',
        posts: 0,
        linksFile: paths.linksPath,
        collectionId: dataManager.getCollectionId()
      };
    }
    
    try {
      // Navigate to user profile
      const userUrl = `https://weibo.com/u/${userId}`;
      await page.goto(userUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      
      const collectedPosts: Array<{ id: string; url: string }> = [];
      let noNewPostsCount = 0;
      const maxNoNewPosts = 3;
      
      while (collectedPosts.length < target && noNewPostsCount < maxNoNewPosts) {
        // Check heartbeat
        if (!processRegistry.heartbeat(processId)) {
          break;
        }
        
        // Collect user posts
        const posts = await this.collectVisiblePosts(page);
        let newPostsThisRound = 0;
        
        for (const post of posts) {
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
        
        // Scroll to load more
        if (collectedPosts.length < target) {
          await page.mouse.wheel(0, 800);
          await page.waitForTimeout(1500);
        }
      }
      
      await dataManager.persist();
      
      return {
        success: true,
        posts: collectedPosts.length,
        linksFile: paths.linksPath,
        collectionId: dataManager.getCollectionId()
      };
      
    } finally {
      processRegistry.unregister(processId);
    }
  }

  private async collectVisiblePosts(page: any): Promise<Array<{ id: string; url: string }>> {
    // User profile posts use div[class*='feed'] or article
    const posts = await page.evaluate(() => {
      const elements = document.querySelectorAll('div[class*="feed"], article');
      const results: Array<{ id: string; url: string }> = [];
      
      for (const el of elements) {
        // Find post link
        const link = el.querySelector('a[href*="/status/"]') as HTMLAnchorElement;
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
}

export default WeiboCollectUserPostsListBlock;
