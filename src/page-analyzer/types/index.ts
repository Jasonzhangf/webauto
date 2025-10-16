/**
 * 页面分析器类型定义
 */

import { Page } from 'playwright';

// ==================== 基础类型 ====================

export enum ContainerTypeEnum {
  PAGE = 'page',
  MAIN = 'main',
  FEED = 'feed',
  POST = 'post',
  ITEM = 'item',
  NAV = 'nav',
  WIDGET = 'widget',
  TEXT = 'text',
  SCROLL = 'scroll',
  CONTENT = 'content',
  NAVIGATION = 'navigation',
  INTERACTION = 'interaction',
  PAGINATION = 'pagination',
  FILTER = 'filter',
  MEDIA = 'media',
  COMMENT = 'comment',
  USER = 'user',
  FORM = 'form',
  SIDEBAR = 'sidebar',
  HEADER = 'header',
  FOOTER = 'footer',
  MODAL = 'modal',
  DROPDOWN = 'dropdown',
  TAB = 'tab',
  CAROUSEL = 'carousel',
  CARD = 'card',
  LOAD_MORE = 'load-more',
  INPUT = 'input',
  ELEMENT = 'element',
  LIST = 'list',
  UNKNOWN = 'unknown'
}

export type ContainerType = keyof typeof ContainerTypeEnum;

export type ScrollType = 'infinite' | 'pagination' | 'static' | 'lazy';
export type ContentLoadType = 'static' | 'dynamic' | 'lazy' | 'streaming';
export type InteractionType = 'click-based' | 'scroll-based' | 'hybrid' | 'none';

// ==================== 选择器配置 ====================

export interface SelectorConfig {
  root: string;
  containers: ContainerSelector[];
}

export interface ContainerSelector {
  type: ContainerType;
  selector: string;
  name: string;
  required: boolean;
  multiple?: boolean;
  children?: ContainerSelector[];
}

// ==================== 页面类型 ====================

export interface PageType {
  type: string;
  name: string;
  description: string;
  expectedContainers: string[];
  workflowTemplate: string;
  characteristics: PageCharacteristics;
}

export interface PageCharacteristics {
  scrollType: ScrollType;
  contentLoadType: ContentLoadType;
  interactionType: InteractionType;
  hasLogin: boolean;
  hasPagination: boolean;
  hasInfiniteScroll: boolean;
}

// ==================== 容器发现 ====================

export interface DiscoveredContainer {
  id: string;
  selector: string;
  name: string;
  type: ContainerType;
  priority: number;
  specificity: number;
  rect: DOMRect;
  elementCount: number;
  capabilities: ContainerCapability[];
  events?: string[];
  metadata: ContainerMetadata;
}

export interface ContainerCapability {
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  operations: string[];
}

export interface ContainerMetadata {
  discoveredAt: number;
  discoveryStrategy: string;
  elementTag: string;
  elementClasses: string[];
  innerHTMLLength: number;
  hasImages: boolean;
  hasLinks: boolean;
  hasVideos: boolean;
  isVisible: boolean;
  position?: string;
  zIndex?: number;
  contentLength?: number;
  interactionElements?: number;
  formElements?: number;
  mediaElements?: number;
}

export interface DiscoveryStrategy {
  name: string;
  priority: number;
  discover(page: Page): Promise<DiscoveredContainer[]>;
  isApplicable(url: string): boolean;
  getPriority(): number;
}

// ==================== 层次结构 ====================

export interface ContainerHierarchy {
  containers: (DiscoveredContainer & {
    depth: number;
    parent: string | null;
    children: string[];
    siblings: string[];
  })[];
  maxDepth: number;
  totalContainers: number;
}

export interface HierarchyNode {
  container: DiscoveredContainer;
  children: HierarchyNode[];
  parent?: HierarchyNode;
  depth: number;
  siblings: HierarchyNode[];
}

export interface ContainerDiscoveryResult {
  containers: DiscoveredContainer[];
  hierarchy: ContainerHierarchy;
  capabilities: any;
  stats: DiscoveryStats;
  timestamp: number;
  executionTime: number;
}

// ==================== 发现统计 ====================

export interface DiscoveryStats {
  totalCandidates: number;
  discoveredContainers: number;
  successRate: number;
  discoveryTime: number;
  strategies: string[];
  currentPage: string;
  pageTitle: string;
  typeDistribution?: Map<ContainerType, number>;
}

// ==================== 页面分析结果 ====================

export interface PageAnalysisResult {
  pageType: PageType;
  containers: DiscoveredContainer[];
  hierarchy: ContainerHierarchy;
  stats: DiscoveryStats;
  executionTime?: number;
  timestamp?: number;
}

// ==================== 事件 ====================

export interface PageAnalysisEvent {
  type: 'analysis:started' | 'analysis:progress' | 'analysis:completed' | 'analysis:error';
  data: any;
  timestamp: number;
}

// 导出能力评估相关类型
export * from './CapabilityTypes.js';

// ==================== 页面类型配置 ====================

export interface PageTypeConfig {
  name: string;
  description: string;
  urlPattern: RegExp;
  expectedContainers: string[];
  workflowTemplate: string;
  characteristics: PageCharacteristics;
  priority: number;
}
