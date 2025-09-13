import { z } from 'zod';

// 页面布局类型
export enum PageLayoutType {
  SINGLE_COLUMN_INFINITE = 'single_column_infinite',      // 单列无限循环
  SINGLE_COLUMN_PAGINATED = 'single_column_paginated',      // 单列分页
  GRID_INFINITE = 'grid_infinite',                         // 网格无限循环
  GRID_PAGINATED = 'grid_paginated',                       // 网格分页
  UNKNOWN = 'unknown'
}

// 分页检测类型
export enum PaginationType {
  NONE = 'none',              // 无分页
  LOAD_MORE = 'load_more',    // 加载更多按钮
  INFINITE_SCROLL = 'infinite_scroll',  // 无限滚动
  NUMBERED_PAGES = 'numbered_pages',  // 数字分页
  NEXT_PREVIOUS = 'next_previous'      // 上一页/下一页
}

// 页面分析结果
export interface PageStructureAnalysis {
  layoutType: PageLayoutType;
  paginationType: PaginationType;
  mainContentSelector?: string;
  postListSelector?: string;
  postItemSelector?: string;
  paginationSelector?: string;
  loadMoreSelector?: string;
  confidence: number;
  metadata: {
    columnCount: number;
    hasImages: boolean;
    hasAvatars: boolean;
    hasTitles: boolean;
    hasDescriptions: boolean;
    hasDates: boolean;
    hasInteractionButtons: boolean;
    detectedFrameworks: string[];
    layoutPatterns: string[];
  };
}

// 帖子元素结构
export interface PostElement {
  selector: string;
  type: 'container' | 'title' | 'content' | 'author' | 'avatar' | 'image' | 'link' | 'date' | 'interaction';
  content?: string;
  attributes?: Record<string, string>;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

// 帖子数据结构
export interface PostData {
  id: string;
  selector: string;
  title?: string;
  content?: string;
  author?: {
    name: string;
    link?: string;
    avatar?: string;
  };
  link?: string;
  images?: string[];
  date?: string;
  interactions?: {
    likes?: number;
    comments?: number;
    shares?: number;
  };
  metadata?: {
    position: number;
    visibleArea: number;
    hasFullContent: boolean;
  };
}

// 评论数据结构
export interface CommentData {
  id: string;
  author: {
    name: string;
    link?: string;
    avatar?: string;
  };
  content: string;
  date?: string;
  replies?: CommentData[];
  metadata?: {
    position: number;
    isReply: boolean;
    depth: number;
  };
}

// 列表分析结果
export interface ListAnalysisResult {
  mainContainer: string;
  postListContainer: string;
  postItemSelector: string;
  repeatingElements: Array<{
    selector: string;
    count: number;
    type: string;
  }>;
  changingElements: Array<{
    selector: string;
    changeType: 'content' | 'visibility' | 'position';
    confidence: number;
  }>;
  largestVisibleElement: {
    selector: string;
    area: number;
    elementCount: number;
  };
  detectedPatterns: string[];
}

// 滚动分析结果
export interface ScrollAnalysisResult {
  beforeScroll: ListAnalysisResult;
  afterScroll: ListAnalysisResult;
  dynamicElements: Array<{
    selector: string;
    change: 'appeared' | 'disappeared' | 'modified';
    confidence: number;
  }>;
  paginationDetected: boolean;
  infiniteScrollDetected: boolean;
  loadMoreButton?: string;
}

// 内容提取配置
export interface ContentExtractionConfig {
  includeImages: boolean;
  includeComments: boolean;
  includeInteractions: boolean;
  maxCommentsPerPost: number;
  maxPosts: number;
  contentLengthLimit: number;
}

// 提取结果
export interface ContentExtractionResult {
  posts: PostData[];
  pageInfo: {
    url: string;
    title: string;
    layoutType: PageLayoutType;
    paginationType: PaginationType;
    totalPosts: number;
    extractedPosts: number;
  };
  metadata: {
    extractionTime: number;
    usedAI: boolean;
    confidence: number;
    warnings: string[];
  };
}

// Schema验证
export const PageStructureAnalysisSchema = z.object({
  layoutType: z.nativeEnum(PageLayoutType),
  paginationType: z.nativeEnum(PaginationType),
  mainContentSelector: z.string().optional(),
  postListSelector: z.string().optional(),
  postItemSelector: z.string().optional(),
  paginationSelector: z.string().optional(),
  loadMoreSelector: z.string().optional(),
  confidence: z.number().min(0).max(1),
  metadata: z.object({
    columnCount: z.number().min(1).max(10),
    hasImages: z.boolean(),
    hasAvatars: z.boolean(),
    hasTitles: z.boolean(),
    hasDescriptions: z.boolean(),
    hasDates: z.boolean(),
    hasInteractionButtons: z.boolean(),
    detectedFrameworks: z.array(z.string()),
    layoutPatterns: z.array(z.string())
  })
});

export const PostElementSchema = z.object({
  selector: z.string(),
  type: z.enum(['container', 'title', 'content', 'author', 'avatar', 'image', 'link', 'date', 'interaction']),
  content: z.string().optional(),
  attributes: z.record(z.string()).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }),
  confidence: z.number().min(0).max(1)
});

export const PostDataSchema = z.object({
  id: z.string(),
  selector: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  author: z.object({
    name: z.string(),
    link: z.string().optional(),
    avatar: z.string().optional()
  }).optional(),
  link: z.string().optional(),
  images: z.array(z.string()).optional(),
  date: z.string().optional(),
  interactions: z.object({
    likes: z.number().optional(),
    comments: z.number().optional(),
    shares: z.number().optional()
  }).optional(),
  metadata: z.object({
    position: z.number(),
    visibleArea: z.number(),
    hasFullContent: z.boolean()
  }).optional()
});

export const ContentExtractionConfigSchema = z.object({
  includeImages: z.boolean().default(true),
  includeComments: z.boolean().default(false),
  includeInteractions: z.boolean().default(true),
  maxCommentsPerPost: z.number().default(10),
  maxPosts: z.number().default(50),
  contentLengthLimit: z.number().default(1000)
});

// Types are already exported as interfaces above