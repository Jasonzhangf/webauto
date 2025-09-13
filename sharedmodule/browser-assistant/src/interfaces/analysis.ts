import { 
  PageStructureAnalysis, 
  PostData, 
  CommentData, 
  ListAnalysisResult, 
  ScrollAnalysisResult,
  ContentExtractionConfig,
  ContentExtractionResult
} from '../types/page-analysis';

// 页面分析器接口
export interface IPageAnalyzer {
  analyzePageStructure(): Promise<PageStructureAnalysis>;
  detectLayoutType(): Promise<PageLayoutType>;
  detectPaginationType(): Promise<PaginationType>;
  findMainContentSelector(): Promise<string>;
  findPostListSelector(): Promise<string>;
  findPostItemSelector(): Promise<string>;
  findPaginationSelector(): Promise<string | undefined>;
  findLoadMoreSelector(): Promise<string | undefined>;
  analyzePageMetadata(): Promise<PageMetadata>;
}

// 列表分析器接口
export interface IListAnalyzer {
  analyzeListStructure(): Promise<ListAnalysisResult>;
  analyzeScrollChanges(): Promise<ScrollAnalysisResult>;
  findRepeatingElements(containerSelector: string): Promise<RepeatingElement[]>;
  findChangingElements(containerSelector: string): Promise<ChangingElement[]>;
  findLargestVisibleElement(containerSelector: string): Promise<LargestElement>;
  detectLayoutPatterns(): Promise<string[]>;
  performScroll(): Promise<void>;
  detectPagination(): Promise<boolean>;
  detectInfiniteScroll(): Promise<boolean>;
  findLoadMoreButton(): Promise<string | undefined>;
}

// 内容提取器接口
export interface IContentExtractor {
  extractContent(structure: PageStructureAnalysis): Promise<ContentExtractionResult>;
  extractPosts(structure: PageStructureAnalysis): Promise<PostData[]>;
  extractPostData(postElement: any, index: number): Promise<PostData>;
  extractCommentsForPosts(posts: PostData[]): Promise<void>;
  extractPostComments(postSelector: string): Promise<CommentData[]>;
  findBestPostSelector(structure: PageStructureAnalysis): Promise<string | undefined>;
  validatePost(post: PostData): boolean;
}

// 智能页面分析接口
export interface IPageIntelligence {
  comprehensiveAnalysis(url: string): Promise<ComprehensiveAnalysis>;
  analyzeSocialMediaPage(url: string): Promise<SocialMediaAnalysis>;
  generatePageInsights(data: AnalysisInputData): Promise<AIInsights>;
  detectUserProfiles(posts: PostData[]): Promise<boolean>;
  detectMediaContent(posts: PostData[]): Promise<boolean>;
  detectInteractions(posts: PostData[]): Promise<boolean>;
  calculateEngagementLevel(posts: PostData[]): Promise<number>;
}

// 扩展类型定义
export interface PageMetadata {
  columnCount: number;
  hasImages: boolean;
  hasAvatars: boolean;
  hasTitles: boolean;
  hasDescriptions: boolean;
  hasDates: boolean;
  hasInteractionButtons: boolean;
  detectedFrameworks: string[];
  layoutPatterns: string[];
  loadTime: number;
  elementCount: number;
  interactiveElements: number;
  accessibilityScore?: number;
}

export interface RepeatingElement {
  selector: string;
  count: number;
  type: string;
  avgWidth: number;
  avgHeight: number;
  confidence: number;
}

export interface ChangingElement {
  selector: string;
  changeType: 'content' | 'visibility' | 'position';
  confidence: number;
  reason: string;
}

export interface LargestElement {
  selector: string;
  area: number;
  elementCount: number;
  isRoot: boolean;
  children: string[];
}

export interface ComprehensiveAnalysis {
  url: string;
  structure: PageStructureAnalysis;
  listAnalysis: ListAnalysisResult;
  scrollAnalysis: ScrollAnalysisResult;
  content: ContentExtractionResult;
  aiInsights?: AIInsights;
  timestamp: string;
  analysisDuration: number;
}

export interface SocialMediaAnalysis extends ComprehensiveAnalysis {
  socialFeatures: {
    hasUserProfiles: boolean;
    hasMediaContent: boolean;
    hasInteractions: boolean;
    engagementLevel: number;
    contentType: 'text' | 'image' | 'video' | 'mixed';
    postingFrequency: 'low' | 'medium' | 'high';
    communitySize: 'small' | 'medium' | 'large';
  };
}

export interface AIInsights {
  pageTypeConfidence: number;
  contentQuality: 'low' | 'medium' | 'high';
  userEngagement: 'low' | 'medium' | 'high';
  recommendedActions: string[];
  potentialIssues: string[];
  optimizationSuggestions: string[];
}

export interface AnalysisInputData {
  structure: PageStructureAnalysis;
  listAnalysis: ListAnalysisResult;
  scrollAnalysis: ScrollAnalysisResult;
  content: ContentExtractionResult;
}

// 页面布局和分页类型枚举
export enum PageLayoutType {
  SINGLE_COLUMN_INFINITE = 'single_column_infinite',
  SINGLE_COLUMN_PAGINATED = 'single_column_paginated',
  GRID_INFINITE = 'grid_infinite',
  GRID_PAGINATED = 'grid_paginated',
  UNKNOWN = 'unknown'
}

export enum PaginationType {
  NONE = 'none',
  LOAD_MORE = 'load_more',
  INFINITE_SCROLL = 'infinite_scroll',
  NUMBERED_PAGES = 'numbered_pages',
  NEXT_PREVIOUS = 'next_previous'
}

// 分析结果接口
export interface AnalysisResult {
  success: boolean;
  data?: any;
  error?: string;
  warnings?: string[];
  metrics: {
    executionTime: number;
    memoryUsed?: number;
    elementsAnalyzed: number;
    confidence: number;
  };
}