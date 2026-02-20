/** Collection types for unified data management across platforms */

export type Platform = 'xiaohongshu' | 'weibo' | '1688';

export type CollectionSource = 'search' | 'timeline' | 'user' | 'note' | 'product';

export type CollectionMode = 'fresh' | 'incremental';

export interface CollectionMeta {
  platform: Platform;
  env: string;
  /** Human-readable identifier - varies by source type */
  collectionId: string;
  /** Source type */
  source: CollectionSource;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Total posts collected */
  totalPosts: number;
  /** Total comments collected */
  totalComments: number;
  /** Collection mode */
  mode: CollectionMode;
  /** Bloom filter state (base64) */
  bloomFilter?: string;
  /** Optional: search keyword */
  keyword?: string;
  /** Optional: user ID for user monitoring */
  userId?: string;
  /** Optional: user name for display */
  userName?: string;
}

export interface PostRecord {
  /** Unique ID from platform */
  id: string;
  /** Post URL */
  url: string;
  /** Author ID */
  authorId?: string;
  /** Author name */
  authorName?: string;
  /** Post content */
  content?: string;
  /** Collected timestamp */
  collectedAt: string;
  /** Raw data from platform */
  raw?: Record<string, unknown>;
  /** Comments count */
  commentsCount?: number;
  /** Likes count */
  likesCount?: number;
}

export interface CommentRecord {
  /** Unique ID */
  id: string;
  /** Parent post ID */
  postId: string;
  /** Author ID */
  authorId?: string;
  /** Author name */
  authorName?: string;
  /** Comment content */
  content?: string;
  /** Parent comment ID (for nested comments) */
  parentId?: string;
  /** Reply to user name */
  replyToName?: string;
  /** Collected timestamp */
  collectedAt: string;
  /** Raw data */
  raw?: Record<string, unknown>;
}

/**
 * Collection ID naming conventions:
 * 
 * search: "search:<keyword>"           -> search:春晚
 * timeline: "timeline:<date>"          -> timeline:2026-02-20
 * user: "user:<userId>:<userName>"     -> user:1234567890:张三
 * note: "note:<noteId>"                -> note:abc123
 * product: "product:<keyword>"         -> product:女装
 */
export type CollectionIdSpec = {
  source: 'search';
  keyword: string;
} | {
  source: 'timeline';
  date: string; // YYYY-MM-DD
} | {
  source: 'user';
  userId: string;
  userName?: string;
} | {
  source: 'note';
  noteId: string;
} | {
  source: 'product';
  keyword: string;
};

/**
 * Build collection ID from spec
 */
export function buildCollectionId(spec: CollectionIdSpec): string {
  switch (spec.source) {
    case 'search':
      return `search:${spec.keyword}`;
    case 'timeline':
      return `timeline:${spec.date}`;
    case 'user':
      const safeName = spec.userName?.replace(/[\/\\:*?"<>|]/g, '_') || 'unknown';
      return `user:${spec.userId}:${safeName}`;
    case 'note':
      return `note:${spec.noteId}`;
    case 'product':
      return `product:${spec.keyword}`;
  }
}

/**
 * Parse collection ID back to spec
 */
export function parseCollectionId(id: string): CollectionIdSpec | null {
  const parts = id.split(':');
  if (parts.length < 2) return null;
  
  const source = parts[0] as CollectionSource;
  switch (source) {
    case 'search':
      return { source: 'search', keyword: parts.slice(1).join(':') };
    case 'timeline':
      return { source: 'timeline', date: parts[1] };
    case 'user':
      return { source: 'user', userId: parts[1], userName: parts[2] };
    case 'note':
      return { source: 'note', noteId: parts[1] };
    case 'product':
      return { source: 'product', keyword: parts.slice(1).join(':') };
    default:
      return null;
  }
}
