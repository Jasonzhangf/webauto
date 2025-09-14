// 新浪微博操作子系统 - 统一导出文件
// 提供完整的微博操作功能

// 核心类型和接口
export * from './weibo-data-models';
export * from './weibo-page-types';
export * from './weibo-link-extraction-mapping';

// 基础操作类
export * from './weibo-base-operation';

// 主页操作
export * from './weibo-homepage-operations';

// 链接提取操作
export * from './weibo-link-extraction-operations';

// 页面特定链接提取操作
export * from './weibo-page-specific-link-extraction';

// 操作管理器
export * from './weibo-operation-manager';

// 容器类
export {
  WeiboHomepageContainer,
  WeiboNavigationContainer,
  WeiboFeedContainer,
  WeiboPostContainer,
  WeiboSidebarContainer,
  WeiboPostBoxContainer
} from '../../containers/weibo/weibo-homepage-container';

// 便捷函数
export { WeiboPageDetector } from './weibo-page-types';
export { OperationLocator } from './weibo-link-extraction-mapping';

// 常量定义
export const WEIBO_OPERATION_CATEGORIES = {
  HOMEPAGE: 'homepage',
  INTERACTION: 'interaction',
  DISCOVERY: 'discovery',
  NAVIGATION: 'navigation',
  EXTRACTION: 'extraction',
  VALIDATION: 'validation'
} as const;

export const WEIBO_LINK_TYPES = {
  POST: 'post',
  USER: 'user',
  TOPIC: 'topic',
  HASHTAG: 'hashtag',
  IMAGE: 'image',
  VIDEO: 'video',
  EXTERNAL: 'external'
} as const;

export const WEIBO_PAGE_TYPES = {
  HOMEPAGE: 'homepage',
  USER_PROFILE: 'user_profile',
  POST_DETAIL: 'post_detail',
  SEARCH_RESULTS: 'search_results',
  HOT_SEARCH: 'hot_search',
  MESSAGE_CENTER: 'message_center',
  SETTINGS: 'settings'
} as const;

// 工厂函数
import { SystemStateCenter } from '../../core/system-state-center';
import { WeiboOperationManager } from './weibo-operation-manager';
import { IExecutionContext } from '../../interfaces/core';

/**
 * 创建微博操作管理器
 */
export function createWeiboOperationManager(stateCenter: SystemStateCenter): WeiboOperationManager {
  return new WeiboOperationManager(stateCenter);
}

/**
 * 获取所有可用的微博操作
 */
export function getAvailableWeiboOperations(manager: WeiboOperationManager) {
  return manager.getAllOperations();
}

/**
 * 获取当前页面支持的操作
 */
export function getSupportedOperationsForPage(manager: WeiboOperationManager, pageType: string) {
  return manager.getOperationsForPageType(pageType as any);
}

/**
 * 搜索微博操作
 */
export function searchWeiboOperations(manager: WeiboOperationManager, query: string) {
  return manager.searchOperations(query);
}

/**
 * 执行微博操作
 */
export async function executeWeiboOperation(
  manager: WeiboOperationManager,
  operationId: string,
  context: IExecutionContext,
  params: any
) {
  return await manager.executeOperation(operationId, context, params);
}

/**
 * 验证操作参数
 */
export function validateWeiboOperationParameters(
  manager: WeiboOperationManager,
  operationId: string,
  params: any
) {
  return manager.validateOperationParameters(operationId, params);
}

/**
 * 获取操作统计信息
 */
export function getWeiboOperationStats(manager: WeiboOperationManager) {
  return manager.getOperationStats();
}

// 常用操作ID常量
export const WEIBO_OPERATIONS = {
  // 主页操作
  GET_HOMEPAGE_INFO: 'get_homepage_info',
  REFRESH_FEED: 'refresh_feed',
  LOAD_MORE_POSTS: 'load_more_posts',
  
  // 交互操作
  LIKE_POST: 'like_post',
  COMMENT_POST: 'comment_post',
  REPOST_POST: 'repost_post',
  PUBLISH_POST: 'publish_post',
  
  // 发现操作
  GET_HOT_SEARCH: 'get_hot_search',
  GET_RECOMMENDED_USERS: 'get_recommended_users',
  
  // 导航操作
  NAVIGATE: 'navigate',
  
  // 链接提取操作
  EXTRACT_LINKS: 'extract_links',
  EXTRACT_LINKS_BY_TYPE: 'extract_links_by_type',
  EXTRACT_POST_LINKS: 'extract_post_links',
  EXTRACT_USER_LINKS: 'extract_user_links',
  EXTRACT_TOPIC_LINKS: 'extract_topic_links',
  VALIDATE_LINK_TYPE: 'validate_link_type',
  
  // 页面特定链接提取
  HOMEPAGE_EXTRACT_LINKS: 'homepage_extract_links',
  USER_PROFILE_EXTRACT_LINKS: 'user_profile_extract_links',
  POST_DETAIL_EXTRACT_LINKS: 'post_detail_extract_links',
  SEARCH_RESULTS_EXTRACT_LINKS: 'search_results_extract_links',
  HOT_SEARCH_EXTRACT_LINKS: 'hot_search_extract_links'
} as const;

// 类型别名
export type WeiboOperationId = keyof typeof WEIBO_OPERATIONS;
export type WeiboPageType = typeof WEIBO_PAGE_TYPES[keyof typeof WEIBO_PAGE_TYPES];
export type WeiboLinkType = typeof WEIBO_LINK_TYPES[keyof typeof WEIBO_LINK_TYPES];
export type WeiboOperationCategory = typeof WEIBO_OPERATION_CATEGORIES[keyof typeof WEIBO_OPERATION_CATEGORIES];

// 默认配置
export const DEFAULT_WEIBO_CONFIG = {
  // 链接提取默认配置
  linkExtraction: {
    maxCount: 100,
    includeMetadata: true,
    includePosition: true,
    targetTypes: Object.values(WEIBO_LINK_TYPES)
  },
  
  // 操作超时配置
  timeouts: {
    default: 30000,
    navigation: 10000,
    elementWait: 5000,
    ajax: 8000
  },
  
  // 重试配置
  retry: {
    maxAttempts: 3,
    delay: 1000,
    backoffFactor: 2
  }
} as const;