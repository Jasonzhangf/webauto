/**
 * File storage utilities for collection data
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CollectionMeta, PostRecord, CommentRecord } from './types';

export class CollectionStorage {
  private baseDir: string;
  private collectionDir: string;
  private platform: string;
  private env: string;
  private collectionId: string;

  constructor(baseDir: string, platform: string, env: string, collectionId: string) {
    this.baseDir = baseDir;
    this.platform = platform;
    this.env = env;
    this.collectionId = collectionId;
    
    // Directory structure: baseDir/platform/env/collectionId/
    this.collectionDir = path.join(baseDir, platform, env, collectionId);
  }

  /**
   * Initialize storage directories
   */
  async init(): Promise<void> {
    await fs.promises.mkdir(this.collectionDir, { recursive: true });
  }

  /**
   * Get paths for different files
   */
  getMetaPath(): string {
    return path.join(this.collectionDir, 'collection-meta.json');
  }

  getPostsPath(): string {
    return path.join(this.collectionDir, 'posts.jsonl');
  }

  getCommentsPath(): string {
    return path.join(this.collectionDir, 'comments.jsonl');
  }

  getLinksPath(): string {
    return path.join(this.collectionDir, 'links.jsonl');
  }

  getRunLogPath(): string {
    return path.join(this.collectionDir, 'run.log');
  }

  getEventsPath(): string {
    return path.join(this.collectionDir, 'run-events.jsonl');
  }

  /**
   * Read/write meta
   */
  async readMeta(): Promise<CollectionMeta | null> {
    const metaPath = this.getMetaPath();
    try {
      const data = await fs.promises.readFile(metaPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async writeMeta(meta: CollectionMeta): Promise<void> {
    const metaPath = this.getMetaPath();
    await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  /**
   * Append post to JSONL
   */
  async appendPost(post: PostRecord): Promise<void> {
    const line = JSON.stringify(post) + '\n';
    await fs.promises.appendFile(this.getPostsPath(), line, 'utf-8');
  }

  /**
   * Append comment to JSONL
   */
  async appendComment(comment: CommentRecord): Promise<void> {
    const line = JSON.stringify(comment) + '\n';
    await fs.promises.appendFile(this.getCommentsPath(), line, 'utf-8');
  }

  /**
   * Read all posts
   */
  async readPosts(): Promise<PostRecord[]> {
    try {
      const data = await fs.promises.readFile(this.getPostsPath(), 'utf-8');
      return data.trim().split('\n').map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  /**
   * Read all comments
   */
  async readComments(): Promise<CommentRecord[]> {
    try {
      const data = await fs.promises.readFile(this.getCommentsPath(), 'utf-8');
      return data.trim().split('\n').map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  /**
   * Count lines in JSONL file
   */
  async countLines(filePath: string): Promise<number> {
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return data.trim().split('\n').filter(line => line.length > 0).length;
    } catch {
      return 0;
    }
  }

  /**
   * Get collection stats
   */
  async getStats(): Promise<{ postCount: number; commentCount: number }> {
    return {
      postCount: await this.countLines(this.getPostsPath()),
      commentCount: await this.countLines(this.getCommentsPath())
    };
  }

  /**
   * Clear all collection data (for fresh mode)
   */
  async clear(): Promise<void> {
    const files = [
      this.getPostsPath(),
      this.getCommentsPath(),
      this.getLinksPath(),
      this.getEventsPath()
    ];
    
    for (const file of files) {
      try {
        await fs.promises.unlink(file);
      } catch {
        // File might not exist
      }
    }
  }

  /**
   * List all collections for a platform/env
   */
  static async listCollections(baseDir: string, platform: string, env: string): Promise<string[]> {
    const dir = path.join(baseDir, platform, env);
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      return [];
    }
  }
}
