/**
 * Collection Data Manager
 * 
 * Unified data management for all platforms and collection types.
 * Handles:
 * - Deduplication via Bloom Filter
 * - Fresh/Incremental modes
 * - File storage with human-readable paths
 * - Stats and persistence
 */

import * as os from 'os';
import * as path from 'path';
import { BloomFilter } from './bloom-filter';
import { CollectionStorage } from './storage';
import { getCurrentTimestamp, parsePlatformDate } from './date-utils';
import type { 
  Platform, 
  CollectionSource, 
  CollectionMode, 
  CollectionMeta,
  CollectionIdSpec,
  PostRecord,
  CommentRecord 
} from './types';
import { buildCollectionId, parseCollectionId } from './types';

export interface CollectionManagerOptions {
  platform: Platform;
  env: string;
  spec: CollectionIdSpec;
  mode?: CollectionMode;
  baseDir?: string;
}

export interface CollectionStats {
  totalPosts: number;
  totalComments: number;
  newPosts: number;
  newComments: number;
  duplicatesSkipped: number;
}

export class CollectionDataManager {
  private platform: Platform;
  private env: string;
  private spec: CollectionIdSpec;
  private mode: CollectionMode;
  private collectionId: string;
  private storage: CollectionStorage;
  private bloomFilter: BloomFilter;
  private meta: CollectionMeta | null = null;
  private stats: CollectionStats = {
    totalPosts: 0,
    totalComments: 0,
    newPosts: 0,
    newComments: 0,
    duplicatesSkipped: 0
  };

  constructor(options: CollectionManagerOptions) {
    this.platform = options.platform;
    this.env = options.env;
    this.spec = options.spec;
    this.mode = options.mode || 'incremental';
    
    // Build human-readable collection ID
    this.collectionId = buildCollectionId(options.spec);
    
    // Default base directory
    const baseDir = options.baseDir || path.join(os.homedir(), '.webauto', 'download');
    
    this.storage = new CollectionStorage(baseDir, this.platform, this.env, this.collectionId);
    this.bloomFilter = new BloomFilter(500000, 0.001); // 500k items, 0.1% false positive
  }

  /**
   * Initialize collection manager
   * - Load existing meta if available
   * - Load existing bloom filter for incremental mode
   * - Clear data for fresh mode
   */
  async init(): Promise<void> {
    await this.storage.init();
    
    const existingMeta = await this.storage.readMeta();
    
    if (this.mode === 'fresh') {
      // Clear all existing data
      await this.storage.clear();
      this.meta = this.createMeta();
      await this.storage.writeMeta(this.meta);
    } else if (existingMeta) {
      // Incremental mode with existing data
      this.meta = existingMeta;
      this.meta.updatedAt = new Date().toISOString();
      
      // Load existing posts into bloom filter
      const posts = await this.storage.readPosts();
      for (const post of posts) {
        this.bloomFilter.add(post.id);
      }
      
      // Load existing bloom filter state if available
      if (existingMeta.bloomFilter) {
        try {
          this.bloomFilter = BloomFilter.import(existingMeta.bloomFilter, 500000);
        } catch {
          // Ignore if bloom filter is corrupted
        }
      }
      
      await this.storage.writeMeta(this.meta);
    } else {
      // Incremental mode, but no existing data
      this.meta = this.createMeta();
      await this.storage.writeMeta(this.meta);
    }
    
    // Initialize stats from existing data
    const storageStats = await this.storage.getStats();
    this.stats.totalPosts = storageStats.postCount;
    this.stats.totalComments = storageStats.commentCount;
  }

  private createMeta(): CollectionMeta {
    return {
      platform: this.platform,
      env: this.env,
      collectionId: this.collectionId,
      source: this.spec.source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalPosts: 0,
      totalComments: 0,
      mode: this.mode,
      ...(this.spec.source === 'search' && { keyword: (this.spec as { keyword: string }).keyword }),
      ...(this.spec.source === 'user' && { 
        userId: (this.spec as { userId: string }).userId,
        userName: (this.spec as { userName?: string }).userName 
      })
    };
  }

  /**
   * Check if post ID already exists (via bloom filter)
   */
  hasPost(postId: string): boolean {
    return this.bloomFilter.mightContain(postId);
  }

  /**
   * Add a post if not duplicate
   * Returns true if added, false if duplicate
   */
  async addPost(post: PostRecord): Promise<boolean> {
    // Check bloom filter
    if (this.bloomFilter.mightContain(post.id)) {
      this.stats.duplicatesSkipped++;
      return false;
    }
    
    // Auto-fill collectedAt fields if not provided
    if (!post.collectedAt) {
      const ts = getCurrentTimestamp();
      post.collectedAt = ts.collectedAt;
      post.collectedAtLocal = ts.collectedAtLocal;
      post.collectedDate = ts.collectedDate;
    }
    
    // Add to bloom filter and storage
    this.bloomFilter.add(post.id);
    await this.storage.appendPost(post);
    
    this.stats.totalPosts++;
    this.stats.newPosts++;
    
    return true;
  }

  /**
   * Add a comment (no deduplication for comments within same post)
   * But we use postId:commentId as the key to dedupe
   */
  async addComment(comment: CommentRecord): Promise<boolean> {
    const commentKey = `${comment.postId}:${comment.id}`;
    
    if (this.bloomFilter.mightContain(commentKey)) {
      return false;
    }
    
    this.bloomFilter.add(commentKey);
    await this.storage.appendComment(comment);
    
    this.stats.totalComments++;
    this.stats.newComments++;
    
    return true;
  }

  /**
   * Persist metadata and bloom filter state
   */
  async persist(): Promise<void> {
    if (!this.meta) return;
    
    this.meta.updatedAt = new Date().toISOString();
    this.meta.totalPosts = this.stats.totalPosts;
    this.meta.totalComments = this.stats.totalComments;
    this.meta.bloomFilter = this.bloomFilter.export();
    
    await this.storage.writeMeta(this.meta);
  }

  /**
   * Get current stats
   */
  getStats(): CollectionStats {
    return { ...this.stats };
  }

  /**
   * Get collection metadata
   */
  getMeta(): CollectionMeta | null {
    return this.meta;
  }

  /**
   * Get collection ID
   */
  getCollectionId(): string {
    return this.collectionId;
  }

  /**
   * Get storage paths for external use (e.g., logging)
   */
  getPaths(): {
    collectionDir: string;
    postsPath: string;
    commentsPath: string;
    linksPath: string;
    runLogPath: string;
  } {
    return {
      collectionDir: (this.storage as any).collectionDir,
      postsPath: this.storage.getPostsPath(),
      commentsPath: this.storage.getCommentsPath(),
      linksPath: this.storage.getLinksPath(),
      runLogPath: this.storage.getRunLogPath()
    };
  }

  /**
   * List all collections for this platform
   */
  static async listCollections(
    platform: Platform, 
    env: string, 
    baseDir?: string
  ): Promise<Array<{ collectionId: string; spec: CollectionIdSpec | null }>> {
    const dir = baseDir || path.join(os.homedir(), '.webauto', 'download');
    const ids = await CollectionStorage.listCollections(dir, platform, env);
    
    return ids.map(id => ({
      collectionId: id,
      spec: parseCollectionId(id)
    }));
  }

  /**
   * Merge multiple collections into one
   * Useful for combining timeline data from multiple dates
   */
  static async mergeCollections(
    sourceIds: string[],
    targetId: string,
    platform: Platform,
    env: string,
    baseDir?: string
  ): Promise<void> {
    const dir = baseDir || path.join(os.homedir(), '.webauto', 'download');
    const targetStorage = new CollectionStorage(dir, platform, env, targetId);
    await targetStorage.init();
    
    const seenPostIds = new Set<string>();
    
    for (const sourceId of sourceIds) {
      const sourceStorage = new CollectionStorage(dir, platform, env, sourceId);
      const posts = await sourceStorage.readPosts();
      
      for (const post of posts) {
        if (!seenPostIds.has(post.id)) {
          seenPostIds.add(post.id);
          await targetStorage.appendPost(post);
        }
      }
    }
  }
}

export { buildCollectionId, parseCollectionId };
export type { CollectionIdSpec, CollectionMeta, PostRecord, CommentRecord };

export { getCurrentTimestamp, parsePlatformDate, extractWeiboPostDate } from "./date-utils.js";
