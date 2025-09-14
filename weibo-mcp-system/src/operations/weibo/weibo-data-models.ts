// 新浪微博专用数据模型

// 基础数据结构
export interface WeiboUser {
  userId: string;
  username: string;
  nickname: string;
  avatar: string;
  verified: boolean;
  verifiedType: 'personal' | 'enterprise' | 'government' | 'organization';
  verifiedReason?: string;
  description: string;
  location: string;
  gender: 'male' | 'female' | 'unknown';
  birthday?: string;
  registerTime?: string;
  followCount: number;
  fansCount: number;
  postCount: number;
  level: number;
  tags: string[];
  isProtected: boolean;
  isFollowing: boolean;
  isFollowed: boolean;
}

export interface WeiboPost {
  mid: string;              // 微博ID
  uid: string;              // 用户ID
  username: string;
  nickname: string;
  avatar: string;
  content: string;
  rawContent: string;       // 原始内容（含HTML标签）
  publishTime: Date;
  source: string;           // 发布来源（如：iPhone客户端）
  geo?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  images: WeiboImage[];
  videos: WeiboVideo[];
  repostCount: number;
  commentCount: number;
  likeCount: number;
  isLiked: boolean;
  isReposted: boolean;
  isCommented: boolean;
  isPrivate: boolean;
  isTop: boolean;
  isOriginal: boolean;     // 是否为原创微博
  repostFrom?: WeiboPost;   // 转发的原始微博
  topics: string[];         // 相关话题
  mentions: WeiboUser[];    // 提及的用户
  urls: WeiboUrl[];         // 包含的链接
  attitudes: WeiboAttitude[];
  permissions: {
    canComment: boolean;
    canRepost: boolean;
    canLike: boolean;
  };
}

export interface WeiboComment {
  id: string;
  mid: string;              // 所在的微博ID
  uid: string;
  username: string;
  nickname: string;
  avatar: string;
  content: string;
  rawContent: string;
  publishTime: Date;
  likeCount: number;
  replyCount: number;
  isLiked: boolean;
  isReply: boolean;
  replyToCommentId?: string;
  replyToUser?: WeiboUser;
  mentions: WeiboUser[];
  device: string;
  location?: string;
  verified: boolean;
  level: number;
}

export interface WeiboImage {
  url: string;
  thumbnailUrl: string;
  middleUrl: string;
  largeUrl: string;
  originalUrl: string;
  width: number;
  height: number;
  size: number;
  format: 'jpg' | 'png' | 'gif' | 'webp';
  description?: string;
}

export interface WeiboVideo {
  url: string;
  thumbnailUrl: string;
  duration: number;
  width: number;
  height: number;
  size: number;
  format: 'mp4' | 'mov' | 'avi' | 'flv';
  bitrate: number;
  description?: string;
  coverImage?: string;
}

export interface WeiboUrl {
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
  isShortUrl: boolean;
  originalUrl?: string;
}

export interface WeiboAttitude {
  uid: string;
  username: string;
  nickname: string;
  avatar: string;
  attitude: 'like' | 'unlike' | 'support' | 'oppose';
  time: Date;
}

// 搜索相关数据结构
export interface WeiboSearchResult {
  mid: string;
  uid: string;
  username: string;
  nickname: string;
  content: string;
  publishTime: Date;
  repostCount: number;
  commentCount: number;
  likeCount: number;
  type: 'post' | 'user' | 'topic';
  relevanceScore: number;
  highlights: string[];
}

export interface WeiboSearchParams {
  keyword: string;
  type: 'all' | 'post' | 'user' | 'topic';
  page: number;
  count: number;
  startTime?: Date;
  endTime?: Date;
  userFilter?: {
    verified?: boolean;
    gender?: 'male' | 'female';
    location?: string;
  };
  contentFilter?: {
    hasImage?: boolean;
    hasVideo?: boolean;
    hasOriginal?: boolean;
  };
  sortType: 'time' | 'relevance' | 'hot' | 'follower';
}

// 用户相关数据结构
export interface WeiboUserStats {
  uid: string;
  username: string;
  nickname: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  dailyStats: WeiboDailyStats[];
  monthlyStats: WeiboMonthlyStats[];
  yearlyStats: WeiboYearlyStats[];
  topPosts: WeiboPost[];
  engagementRate: number;
  activityScore: number;
  influenceScore: number;
}

export interface WeiboDailyStats {
  date: string;
  posts: number;
  reposts: number;
  comments: number;
  likes: number;
  newFollowers: number;
  lostFollowers: number;
}

export interface WeiboMonthlyStats {
  month: string;
  posts: number;
  reposts: number;
  comments: number;
  likes: number;
  newFollowers: number;
  lostFollowers: number;
  avgEngagementRate: number;
}

export interface WeiboYearlyStats {
  year: number;
  posts: number;
  reposts: number;
  comments: number;
  likes: number;
  newFollowers: number;
  lostFollowers: number;
  avgEngagementRate: number;
  growthRate: number;
}

// 热搜相关数据结构
export interface WeiboHotSearchItem {
  rank: number;
  keyword: string;
  searchCount: number;
  category: 'social' | 'entertainment' | 'sports' | 'tech' | 'finance' | 'other';
  isHot: boolean;
  isNew: boolean;
  isRecommended: boolean;
  trendingScore: number;
  relatedTopics: string[];
  description?: string;
  imageUrl?: string;
  updateTime: Date;
}

export interface WeiboHotSearchList {
  updateTime: Date;
  items: WeiboHotSearchItem[];
  total: number;
  categories: {
    [key: string]: WeiboHotSearchItem[];
  };
}

// 消息相关数据结构
export interface WeiboMessage {
  id: string;
  type: 'private' | 'comment' | 'like' | 'follow' | 'mention' | 'system';
  sender: WeiboUser;
  receiver: WeiboUser;
  content: string;
  rawContent: string;
  sendTime: Date;
  isRead: boolean;
  isReplied: boolean;
  relatedPost?: WeiboPost;
  relatedComment?: WeiboComment;
  attachments: WeiboMessageAttachment[];
}

export interface WeiboMessageAttachment {
  id: string;
  type: 'image' | 'video' | 'file' | 'voice';
  url: string;
  filename: string;
  size: number;
  thumbnailUrl?: string;
  duration?: number;
}

// 话题相关数据结构
export interface WeiboTopic {
  id: string;
  name: string;
  description: string;
  image: string;
  participantCount: number;
  postCount: number;
  readCount: number;
  createTime: Date;
  updateTime: Date;
  category: string;
  tags: string[];
  admins: WeiboUser[];
  isHot: boolean;
  isRecommended: boolean;
  trending: boolean;
}

// 页面渲染数据结构
export interface WeiboPageData {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
  items: WeiboPost[] | WeiboUser[] | WeiboSearchResult[];
  pageInfo: {
    loadTime: number;
    renderTime: number;
    elementCount: number;
  };
}

// 错误和状态数据结构
export interface WeiboOperationError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
  timestamp: Date;
  retryable: boolean;
  suggestions?: string[];
}

export interface WeiboOperationStatus {
  operationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  progress: number;
  message?: string;
  error?: WeiboOperationError;
  result?: any;
  metrics: {
    requests: number;
    dataTransferred: number;
    memoryUsed: number;
    cpuUsed: number;
  };
}

// 配置数据结构
export interface WeiboOperationConfig {
  retry: {
    maxAttempts: number;
    delay: number;
    backoffFactor: number;
  };
  timeout: {
    default: number;
    navigation: number;
    elementWait: number;
    ajax: number;
  };
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
    burstLimit: number;
  };
  userAgent: {
    mobile: string;
    desktop: string;
  };
  proxy: {
    enabled: boolean;
    servers: string[];
    rotation: 'random' | 'roundrobin';
  };
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableConsole: boolean;
    enableFile: boolean;
    filePath: string;
  };
}