/**
 * 容器集成配置示例
 * 展示如何配置和使用微博批量链接获取的容器系统
 */

import { WeiboPageContainer, WeiboPageConfig } from '../src/containers/WeiboPageContainer.js';
import { WeiboLinkContainer, WeiboLinkConfig } from '../src/containers/WeiboLinkContainer.js';
import { WeiboScrollContainer, WeiboScrollConfig } from '../src/containers/WeiboScrollContainer.js';
import { WeiboPaginationContainer, WeiboPaginationConfig } from '../src/containers/WeiboPaginationContainer.js';

// ==================== 配置类型定义 ====================

export interface ContainerSystemConfig {
  name: string;
  description: string;
  type: 'homepage' | 'search' | 'profile' | 'custom';
  pageConfig: WeiboPageConfig;
  linkConfig: WeiboLinkConfig;
  scrollConfig?: WeiboScrollConfig;
  paginationConfig?: WeiboPaginationConfig;
  execution: {
    timeout: number;
    enableMonitoring: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

// ==================== 微博主页链接获取配置 ====================

export const homepageLinkCaptureConfig: ContainerSystemConfig = {
  name: 'weibo-homepage-link-capture',
  description: '微博主页链接批量获取配置',
  type: 'homepage',
  pageConfig: {
    id: 'homepage-page-container',
    name: '微博主页页面管理',
    selector: 'body',
    pageType: 'homepage',
    url: 'https://weibo.com',
    enableAutoNavigation: true,
    enableErrorRecovery: true,
    maxReloadAttempts: 3,
    enableAutoRefresh: true,
    refreshInterval: 3000,
    containerConfigs: {
      linkContainer: {
        id: 'weibo-links',
        name: '微博链接容器',
        selector: '.Feed_body, .WB_feed, .card-list',
        type: 'WeiboLinkContainer',
        maxLinks: 50,
        enableAutoScroll: true,
        enableAutoPagination: false,
        scrollStep: 2,
        maxScrollAttempts: 30,
        linkPatterns: [
          'weibo.com/\d+/[A-Za-z0-9_\-]+', // 微博帖子
          'weibo.com/[A-Za-z0-9_\-]+',      // 用户主页
          'weibo.com/search\\?q=.+'          // 搜索页面
        ],
        excludePatterns: [
          'login',
          'register',
          'logout'
        ],
        enableAutoRefresh: true,
        refreshInterval: 2000,
        enableMutationObserver: true
      },
      scrollContainer: {
        id: 'homepage-scroll-container',
        name: '主页滚动控制',
        selector: 'body',
        enableAutoScroll: true,
        scrollStrategy: 'smart',
        maxScrollAttempts: 30,
        scrollStep: 2,
        scrollDelay: 1500,
        stopConditions: {
          maxScrollHeight: 50000,
          maxScrollTime: 300000, // 5分钟
          noNewContentCount: 5,
          reachBottom: true
        },
        targetElement: '.Feed_body'
      }
    }
  },
  linkConfig: {
    id: 'homepage-link-extractor',
    name: '主页链接提取器',
    selector: '.Feed_body, .card-wrap, .article',
    maxLinks: 100,
    enableAutoScroll: true,
    enableAutoPagination: false,
    scrollStep: 2,
    maxScrollAttempts: 30,
    linkPatterns: [
      'weibo.com/\d+/[A-Za-z0-9_\-]+', // 微博帖子
      'weibo.com/[A-Za-z0-9_\-]+',      // 用户主页
      'weibo.com/search\?q=.+'          // 搜索页面
    ],
    excludePatterns: [
      'login',
      'register',
      'logout'
    ],
    enableAutoRefresh: true,
    refreshInterval: 2000,
    enableMutationObserver: true
  },
  scrollConfig: {
    id: 'homepage-scroll-controller',
    name: '主页滚动控制器',
    selector: 'body',
    enableAutoScroll: true,
    scrollStrategy: 'smart',
    maxScrollAttempts: 30,
    scrollStep: 2,
    scrollDelay: 1500,
    stopConditions: {
      maxScrollHeight: 50000,
      maxScrollTime: 300000, // 5分钟
      noNewContentCount: 5,
      reachBottom: true
    },
    targetElement: '.Feed_body'
  },
  execution: {
    timeout: 600000, // 10分钟
    enableMonitoring: true,
    logLevel: 'info'
  }
};

// ==================== 微博搜索页面链接获取配置 ====================

export const searchPageLinkCaptureConfig: ContainerSystemConfig = {
  name: 'weibo-search-link-capture',
  description: '微博搜索页面链接批量获取配置',
  type: 'search',
  pageConfig: {
    id: 'search-page-container',
    name: '微博搜索页面管理',
    selector: 'body',
    pageType: 'search',
    enableAutoNavigation: true,
    enableErrorRecovery: true,
    maxReloadAttempts: 3,
    containerConfigs: {
      linkContainer: {
        id: 'search-link-container',
        name: '搜索链接提取',
        selector: '.Feed_body, .card-wrap, .search-result',
        maxLinks: 200,
        enableAutoScroll: false,
        enableAutoPagination: true,
        maxScrollAttempts: 10,
        paginationMode: 'url',
        maxPageAttempts: 10,
        linkPatterns: [
          /weibo\.com\/\d+\/[A-Za-z0-9_\-]+/, // 微博帖子
          /weibo\.com\/[A-Za-z0-9_\-]+/,      // 用户主页
        ],
        enableAutoRefresh: true,
        refreshInterval: 2000,
        enableMutationObserver: true
      },
      paginationContainer: {
        id: 'search-pagination-container',
        name: '搜索分页控制',
        selector: 'body',
        enableAutoPagination: true,
        paginationMode: 'url',
        paginationPattern: 'numbered',
        maxPageAttempts: 20,
        pageDelay: 2000,
        maxPages: 10,
        stopConditions: {
          noNewContentPages: 3,
          reachLastPage: true,
          maxPageNumber: 10
        },
        urlPattern: 'https://weibo.com/search?q={keyword}&page={page}',
        pageSelectors: {
          nextButton: '.next, .page-next, [class*="next"]',
          currentPageIndicator: '.current, .active, [class*="current"]'
        }
      }
    }
  },
  linkConfig: {
    id: 'search-link-extractor',
    name: '搜索链接提取器',
    selector: '.Feed_body, .card-wrap, .search-result',
    maxLinks: 200,
    enableAutoScroll: false,
    enableAutoPagination: true,
    paginationMode: 'url',
    maxPageAttempts: 10,
    linkPatterns: [
      /weibo\.com\/\d+\/[A-Za-z0-9_\-]+/, // 微博帖子
      /weibo\.com\/[A-Za-z0-9_\-]+/,      // 用户主页
    ],
    enableAutoRefresh: true,
    refreshInterval: 2000,
    enableMutationObserver: true
  },
  paginationConfig: {
    id: 'search-pagination-controller',
    name: '搜索分页控制器',
    selector: 'body',
    enableAutoPagination: true,
    paginationMode: 'url',
    paginationPattern: 'numbered',
    maxPageAttempts: 20,
    pageDelay: 2000,
    maxPages: 10,
    stopConditions: {
      noNewContentPages: 3,
      reachLastPage: true,
      maxPageNumber: 10
    },
    urlPattern: 'https://weibo.com/search?q={keyword}&page={page}',
    pageSelectors: {
      nextButton: '.next, .page-next, [class*="next"]',
      currentPageIndicator: '.current, .active, [class*="current"]'
    }
  },
  execution: {
    timeout: 900000, // 15分钟
    enableMonitoring: true,
    logLevel: 'info'
  }
};

// ==================== 微博用户主页链接获取配置 ====================

export const userProfileLinkCaptureConfig: ContainerSystemConfig = {
  name: 'weibo-profile-link-capture',
  description: '微博用户主页链接批量获取配置',
  type: 'profile',
  pageConfig: {
    id: 'profile-page-container',
    name: '用户主页页面管理',
    selector: 'body',
    pageType: 'profile',
    enableAutoNavigation: true,
    enableErrorRecovery: true,
    maxReloadAttempts: 3,
    containerConfigs: {
      linkContainer: {
        id: 'profile-link-container',
        name: '用户主页链接提取',
        selector: '.Feed_body, .card-wrap, .profile-feed',
        maxLinks: 150,
        enableAutoScroll: true,
        enableAutoPagination: false,
        scrollStep: 2,
        maxScrollAttempts: 25,
        linkPatterns: [
          /weibo\.com\/\d+\/[A-Za-z0-9_\-]+/, // 微博帖子
        ],
        enableAutoRefresh: true,
        refreshInterval: 2000,
        enableMutationObserver: true
      },
      scrollContainer: {
        id: 'profile-scroll-container',
        name: '用户主页滚动控制',
        selector: 'body',
        enableAutoScroll: true,
        scrollStrategy: 'incremental',
        maxScrollAttempts: 25,
        scrollStep: 2,
        scrollDelay: 1200,
        stopConditions: {
          maxScrollHeight: 30000,
          maxScrollTime: 240000, // 4分钟
          noNewContentCount: 4,
          reachBottom: true
        },
        targetElement: '.Feed_body'
      }
    }
  },
  linkConfig: {
    id: 'profile-link-extractor',
    name: '用户主页链接提取器',
    selector: '.Feed_body, .card-wrap, .profile-feed',
    maxLinks: 150,
    enableAutoScroll: true,
    enableAutoPagination: false,
    scrollStep: 2,
    maxScrollAttempts: 25,
    linkPatterns: [
      /weibo\.com\/\d+\/[A-Za-z0-9_\-]+/, // 微博帖子
    ],
    enableAutoRefresh: true,
    refreshInterval: 2000,
    enableMutationObserver: true
  },
  scrollConfig: {
    id: 'profile-scroll-controller',
    name: '用户主页滚动控制器',
    selector: 'body',
    enableAutoScroll: true,
    scrollStrategy: 'incremental',
    maxScrollAttempts: 25,
    scrollStep: 2,
    scrollDelay: 1200,
    stopConditions: {
      maxScrollHeight: 30000,
      maxScrollTime: 240000, // 4分钟
      noNewContentCount: 4,
      reachBottom: true
    },
    targetElement: '.Feed_body'
  },
  execution: {
    timeout: 480000, // 8分钟
    enableMonitoring: true,
    logLevel: 'info'
  }
};

// ==================== 高级混合模式配置 ====================

export const advancedHybridCaptureConfig: ContainerSystemConfig = {
  name: 'weibo-advanced-hybrid-capture',
  description: '高级混合模式链接获取配置（滚动+分页）',
  type: 'custom',
  pageConfig: {
    id: 'hybrid-page-container',
    name: '混合模式页面管理',
    selector: 'body',
    pageType: 'homepage',
    enableAutoNavigation: true,
    enableErrorRecovery: true,
    maxReloadAttempts: 5,
    containerConfigs: {
      linkContainer: {
        id: 'hybrid-link-container',
        name: '混合链接提取',
        selector: '.Feed_body, .card-wrap, .article',
        maxLinks: 300,
        enableAutoScroll: true,
        enableAutoPagination: true,
        scrollStep: 1,
        maxScrollAttempts: 15,
        paginationMode: 'auto',
        maxPageAttempts: 15,
        linkPatterns: [
          /weibo\.com\/\d+\/[A-Za-z0-9_\-]+/, // 微博帖子
          /weibo\.com\/[A-Za-z0-9_\-]+/,      // 用户主页
          /weibo\.com\/search\?q=.+/          // 搜索页面
        ],
        enableAutoRefresh: true,
        refreshInterval: 1500,
        enableMutationObserver: true
      },
      scrollContainer: {
        id: 'hybrid-scroll-container',
        name: '混合滚动控制',
        selector: 'body',
        enableAutoScroll: true,
        scrollStrategy: 'smart',
        maxScrollAttempts: 15,
        scrollStep: 1,
        scrollDelay: 1000,
        stopConditions: {
          maxScrollHeight: 20000,
          maxScrollTime: 180000, // 3分钟
          noNewContentCount: 3
        },
        targetElement: '.Feed_body'
      },
      paginationContainer: {
        id: 'hybrid-pagination-container',
        name: '混合分页控制',
        selector: 'body',
        enableAutoPagination: true,
        paginationMode: 'auto',
        maxPageAttempts: 15,
        pageDelay: 1500,
        maxPages: 8,
        stopConditions: {
          noNewContentPages: 2,
          maxPageNumber: 8
        },
        pageSelectors: {
          nextButton: '.next, .page-next, [class*="next"]',
          loadMoreButton: '.load-more, .more-button, [class*="load-more"]',
          currentPageIndicator: '.current, .active, [class*="current"]'
        }
      }
    }
  },
  linkConfig: {
    id: 'hybrid-link-extractor',
    name: '混合链接提取器',
    selector: '.Feed_body, .card-wrap, .article',
    maxLinks: 300,
    enableAutoScroll: true,
    enableAutoPagination: true,
    scrollStep: 1,
    maxScrollAttempts: 15,
    paginationMode: 'auto',
    maxPageAttempts: 15,
    linkPatterns: [
      /weibo\.com\/\d+\/[A-Za-z0-9_\-]+/, // 微博帖子
      /weibo\.com\/[A-Za-z0-9_\-]+/,      // 用户主页
      /weibo\.com\/search\?q=.+/          // 搜索页面
    ],
    enableAutoRefresh: true,
    refreshInterval: 1500,
    enableMutationObserver: true
  },
  scrollConfig: {
    id: 'hybrid-scroll-controller',
    name: '混合滚动控制器',
    selector: 'body',
    enableAutoScroll: true,
    scrollStrategy: 'smart',
    maxScrollAttempts: 15,
    scrollStep: 1,
    scrollDelay: 1000,
    stopConditions: {
      maxScrollHeight: 20000,
      maxScrollTime: 180000, // 3分钟
      noNewContentCount: 3
    },
    targetElement: '.Feed_body'
  },
  paginationConfig: {
    id: 'hybrid-pagination-controller',
    name: '混合分页控制器',
    selector: 'body',
    enableAutoPagination: true,
    paginationMode: 'auto',
    maxPageAttempts: 15,
    pageDelay: 1500,
    maxPages: 8,
    stopConditions: {
      noNewContentPages: 2,
      maxPageNumber: 8
    },
    pageSelectors: {
      nextButton: '.next, .page-next, [class*="next"]',
      loadMoreButton: '.load-more, .more-button, [class*="load-more"]',
      currentPageIndicator: '.current, .active, [class*="current"]'
    }
  },
  execution: {
    timeout: 1200000, // 20分钟
    enableMonitoring: true,
    logLevel: 'debug'
  }
};

// ==================== 配置管理器 ====================

export class ContainerConfigManager {
  private configs: Map<string, ContainerSystemConfig> = new Map();

  constructor() {
    // 注册预定义配置
    this.registerConfig('homepage', homepageLinkCaptureConfig);
    this.registerConfig('search', searchPageLinkCaptureConfig);
    this.registerConfig('profile', userProfileLinkCaptureConfig);
    this.registerConfig('hybrid', advancedHybridCaptureConfig);
  }

  registerConfig(key: string, config: ContainerSystemConfig): void {
    this.configs.set(key, config);
  }

  getConfig(key: string): ContainerSystemConfig | undefined {
    return this.configs.get(key);
  }

  getAllConfigs(): Map<string, ContainerSystemConfig> {
    return new Map(this.configs);
  }

  createCustomConfig(baseKey: string, overrides: Partial<ContainerSystemConfig>): ContainerSystemConfig {
    const baseConfig = this.getConfig(baseKey);
    if (!baseConfig) {
      throw new Error(`基础配置 ${baseKey} 不存在`);
    }

    return {
      ...baseConfig,
      ...overrides,
      name: overrides.name || `custom-${baseKey}`,
      description: overrides.description || `自定义配置基于 ${baseKey}`
    };
  }

  // 根据URL自动选择合适的配置
  autoSelectConfig(url: string): ContainerSystemConfig {
    if (url.includes('weibo.com/search')) {
      return this.getConfig('search')!;
    } else if (url.match(/weibo\.com\/[A-Za-z0-9_\-]+$/) && !url.match(/weibo\.com\/\d+\//)) {
      return this.getConfig('profile')!;
    } else {
      return this.getConfig('homepage')!;
    }
  }

  // 生成配置摘要
  getConfigSummary(key: string): string {
    const config = this.getConfig(key);
    if (!config) return '配置不存在';

    return `
配置名称: ${config.name}
描述: ${config.description}
类型: ${config.type}
目标链接数: ${config.linkConfig.maxLinks}
执行超时: ${config.execution.timeout / 1000}秒
监控状态: ${config.execution.enableMonitoring ? '启用' : '禁用'}
日志级别: ${config.execution.logLevel}

页面配置:
- 自动导航: ${config.pageConfig.enableAutoNavigation ? '启用' : '禁用'}
- 错误恢复: ${config.pageConfig.enableErrorRecovery ? '启用' : '禁用'}
- 最大重载次数: ${config.pageConfig.maxReloadAttempts}

链接提取配置:
- 自动滚动: ${config.linkConfig.enableAutoScroll ? '启用' : '禁用'}
- 自动分页: ${config.linkConfig.enableAutoPagination ? '启用' : '禁用'}
- 滚动步数: ${config.linkConfig.scrollStep || 'N/A'}
- 最大滚动尝试: ${config.linkConfig.maxScrollAttempts || 'N/A'}
`.trim();
  }
}

// 导出配置管理器实例
export const containerConfigManager = new ContainerConfigManager();