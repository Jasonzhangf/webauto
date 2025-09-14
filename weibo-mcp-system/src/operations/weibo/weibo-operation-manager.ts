// 新浪微博操作管理器和注册系统
// 统一管理所有微博相关操作

import { SystemStateCenter } from '../../core/system-state-center';
import { IExecutionContext } from '../../interfaces/core';
import { WeiboPageType, WeiboPageContext, WeiboPageDetector } from './weibo-page-types';
import { WeiboHomepageContainer } from '../../containers/weibo/weibo-homepage-container';
import { BaseOperation } from '../base-operation';
import { WeiboBaseOperation } from './weibo-base-operation';

// 导入所有微博操作
import {
  GetHomepageInfoOperation,
  RefreshFeedOperation,
  LoadMorePostsOperation,
  LikePostOperation,
  CommentPostOperation,
  RepostPostOperation,
  PublishPostOperation,
  GetHotSearchOperation,
  GetRecommendedUsersOperation,
  NavigateOperation
} from './weibo-homepage-operations';

import {
  ExtractLinksOperation,
  ExtractLinksByTypeOperation,
  ExtractPostLinksOperation,
  ExtractUserLinksOperation,
  ExtractTopicLinksOperation,
  ExtractHashtagLinksOperation,
  ExtractImageLinksOperation,
  ExtractVideoLinksOperation,
  ExtractExternalLinksOperation,
  ExtractLinksFromContainerOperation,
  ValidateLinkTypeOperation
} from './weibo-link-extraction-operations';

import {
  HomepageLinkExtractionOperation,
  UserProfileLinkExtractionOperation,
  PostDetailLinkExtractionOperation,
  SearchResultsLinkExtractionOperation,
  HotSearchLinkExtractionOperation
} from './weibo-page-specific-link-extraction';

// 操作注册信息
export interface OperationRegistration {
  id: string;
  name: string;
  description: string;
  operation: new () => BaseOperation;
  category: string;
  supportedPageTypes: WeiboPageType[];
  requiresLogin: boolean;
  parameters: {
    [key: string]: {
      type: string;
      description: string;
      required: boolean;
      defaultValue?: any;
    };
  };
  resultType: string;
  version: string;
  tags: string[];
}

// 操作管理器
export class WeiboOperationManager {
  private stateCenter: SystemStateCenter;
  private operations: Map<string, OperationRegistration> = new Map();
  private pageTypeOperations: Map<WeiboPageType, string[]> = new Map();

  constructor(stateCenter: SystemStateCenter) {
    this.stateCenter = stateCenter;
    this.initializeOperations();
  }

  private initializeOperations(): void {
    // 注册主页操作
    this.registerOperation({
      id: 'get_homepage_info',
      name: 'Get Homepage Info',
      description: '获取微博主页信息',
      operation: GetHomepageInfoOperation,
      category: 'homepage',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: false,
      parameters: {},
      resultType: 'HomepageInfo',
      version: '1.0.0',
      tags: ['homepage', 'info', 'overview']
    });

    this.registerOperation({
      id: 'refresh_feed',
      name: 'Refresh Feed',
      description: '刷新微博Feed流',
      operation: RefreshFeedOperation,
      category: 'homepage',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: true,
      parameters: {},
      resultType: 'RefreshFeedResult',
      version: '1.0.0',
      tags: ['homepage', 'feed', 'refresh']
    });

    this.registerOperation({
      id: 'load_more_posts',
      name: 'Load More Posts',
      description: '加载更多微博帖子',
      operation: LoadMorePostsOperation,
      category: 'homepage',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: false,
      parameters: {
        count: {
          type: 'number',
          description: '要加载的帖子数量',
          required: false,
          defaultValue: 10
        }
      },
      resultType: 'LoadMorePostsResult',
      version: '1.0.0',
      tags: ['homepage', 'feed', 'load-more']
    });

    this.registerOperation({
      id: 'like_post',
      name: 'Like Post',
      description: '点赞微博帖子',
      operation: LikePostOperation,
      category: 'interaction',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: true,
      parameters: {
        postIndex: {
          type: 'number',
          description: '帖子索引位置',
          required: true
        }
      },
      resultType: 'LikePostResult',
      version: '1.0.0',
      tags: ['interaction', 'like', 'post']
    });

    this.registerOperation({
      id: 'comment_post',
      name: 'Comment Post',
      description: '评论微博帖子',
      operation: CommentPostOperation,
      category: 'interaction',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: true,
      parameters: {
        postIndex: {
          type: 'number',
          description: '帖子索引位置',
          required: true
        },
        comment: {
          type: 'string',
          description: '评论内容',
          required: true
        }
      },
      resultType: 'CommentPostResult',
      version: '1.0.0',
      tags: ['interaction', 'comment', 'post']
    });

    this.registerOperation({
      id: 'repost_post',
      name: 'Repost Post',
      description: '转发微博帖子',
      operation: RepostPostOperation,
      category: 'interaction',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: true,
      parameters: {
        postIndex: {
          type: 'number',
          description: '帖子索引位置',
          required: true
        },
        repostContent: {
          type: 'string',
          description: '转发内容',
          required: false,
          defaultValue: ''
        }
      },
      resultType: 'RepostPostResult',
      version: '1.0.0',
      tags: ['interaction', 'repost', 'post']
    });

    this.registerOperation({
      id: 'publish_post',
      name: 'Publish Post',
      description: '发布微博',
      operation: PublishPostOperation,
      category: 'interaction',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: true,
      parameters: {
        content: {
          type: 'string',
          description: '微博内容',
          required: true
        },
        images: {
          type: 'array',
          description: '图片路径数组',
          required: false,
          defaultValue: []
        }
      },
      resultType: 'PublishPostResult',
      version: '1.0.0',
      tags: ['interaction', 'publish', 'post']
    });

    this.registerOperation({
      id: 'get_hot_search',
      name: 'Get Hot Search',
      description: '获取热搜列表',
      operation: GetHotSearchOperation,
      category: 'discovery',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: false,
      parameters: {
        limit: {
          type: 'number',
          description: '获取数量限制',
          required: false,
          defaultValue: 20
        }
      },
      resultType: 'HotSearchResult',
      version: '1.0.0',
      tags: ['discovery', 'hot-search', 'trending']
    });

    this.registerOperation({
      id: 'get_recommended_users',
      name: 'Get Recommended Users',
      description: '获取推荐用户',
      operation: GetRecommendedUsersOperation,
      category: 'discovery',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: false,
      parameters: {
        limit: {
          type: 'number',
          description: '获取数量限制',
          required: false,
          defaultValue: 10
        }
      },
      resultType: 'RecommendedUsersResult',
      version: '1.0.0',
      tags: ['discovery', 'users', 'recommendations']
    });

    this.registerOperation({
      id: 'navigate',
      name: 'Navigate',
      description: '导航到指定页面',
      operation: NavigateOperation,
      category: 'navigation',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: false,
      parameters: {
        target: {
          type: 'string',
          description: '导航目标 (home|discover|message|profile)',
          required: true
        }
      },
      resultType: 'NavigationResult',
      version: '1.0.0',
      tags: ['navigation', 'browse']
    });

    // 注册链接提取操作
    this.registerOperation({
      id: 'extract_links',
      name: 'Extract Links',
      description: '提取页面中的所有链接',
      operation: ExtractLinksOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS,
        WeiboPageType.HOT_SEARCH
      ],
      requiresLogin: false,
      parameters: {
        targetTypes: {
          type: 'array',
          description: '目标链接类型数组',
          required: false,
          defaultValue: ['post', 'user', 'topic', 'hashtag', 'image', 'video', 'external']
        },
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 100
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        },
        includeMetadata: {
          type: 'boolean',
          description: '是否包含元数据',
          required: false,
          defaultValue: true
        },
        includePosition: {
          type: 'boolean',
          description: '是否包含位置信息',
          required: false,
          defaultValue: true
        }
      },
      resultType: 'LinkExtractionResult',
      version: '1.0.0',
      tags: ['extraction', 'links', 'scraping']
    });

    this.registerOperation({
      id: 'extract_links_by_type',
      name: 'Extract Links by Type',
      description: '提取指定类型的链接',
      operation: ExtractLinksByTypeOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS,
        WeiboPageType.HOT_SEARCH
      ],
      requiresLogin: false,
      parameters: {
        linkType: {
          type: 'string',
          description: '链接类型',
          required: true
        },
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 50
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        }
      },
      resultType: 'WeiboLink[]',
      version: '1.0.0',
      tags: ['extraction', 'links', 'scraping']
    });

    this.registerOperation({
      id: 'extract_post_links',
      name: 'Extract Post Links',
      description: '提取微博帖子链接',
      operation: ExtractPostLinksOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS
      ],
      requiresLogin: false,
      parameters: {
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 50
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        }
      },
      resultType: 'WeiboLink[]',
      version: '1.0.0',
      tags: ['extraction', 'links', 'posts', 'scraping']
    });

    this.registerOperation({
      id: 'extract_user_links',
      name: 'Extract User Links',
      description: '提取用户链接',
      operation: ExtractUserLinksOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS
      ],
      requiresLogin: false,
      parameters: {
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 50
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        }
      },
      resultType: 'WeiboLink[]',
      version: '1.0.0',
      tags: ['extraction', 'links', 'users', 'scraping']
    });

    this.registerOperation({
      id: 'extract_topic_links',
      name: 'Extract Topic Links',
      description: '提取话题链接',
      operation: ExtractTopicLinksOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS,
        WeiboPageType.HOT_SEARCH
      ],
      requiresLogin: false,
      parameters: {
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 50
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        }
      },
      resultType: 'WeiboLink[]',
      version: '1.0.0',
      tags: ['extraction', 'links', 'topics', 'scraping']
    });

    this.registerOperation({
      id: 'validate_link_type',
      name: 'Validate Link Type',
      description: '验证链接类型',
      operation: ValidateLinkTypeOperation,
      category: 'validation',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS,
        WeiboPageType.HOT_SEARCH
      ],
      requiresLogin: false,
      parameters: {
        url: {
          type: 'string',
          description: '链接URL',
          required: true
        },
        linkType: {
          type: 'string',
          description: '链接类型',
          required: true
        }
      },
      resultType: 'LinkValidationResult',
      version: '1.0.0',
      tags: ['validation', 'links', 'verification']
    });

    // 注册页面特定的链接提取操作
    this.registerOperation({
      id: 'homepage_extract_links',
      name: 'Homepage Extract Links',
      description: '从微博主页提取链接',
      operation: HomepageLinkExtractionOperation,
      category: 'extraction',
      supportedPageTypes: [WeiboPageType.HOMEPAGE],
      requiresLogin: false,
      parameters: {
        targetTypes: {
          type: 'array',
          description: '目标链接类型数组',
          required: false,
          defaultValue: ['post', 'user', 'topic', 'hashtag', 'image', 'video', 'external']
        },
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 100
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        }
      },
      resultType: 'LinkExtractionResult',
      version: '1.0.0',
      tags: ['extraction', 'links', 'homepage', 'scraping']
    });

    this.registerOperation({
      id: 'user_profile_extract_links',
      name: 'User Profile Extract Links',
      description: '从用户主页提取链接',
      operation: UserProfileLinkExtractionOperation,
      category: 'extraction',
      supportedPageTypes: [WeiboPageType.USER_PROFILE],
      requiresLogin: false,
      parameters: {
        targetTypes: {
          type: 'array',
          description: '目标链接类型数组',
          required: false,
          defaultValue: ['post', 'user', 'topic', 'hashtag', 'image', 'video']
        },
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 100
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        }
      },
      resultType: 'LinkExtractionResult',
      version: '1.0.0',
      tags: ['extraction', 'links', 'user-profile', 'scraping']
    });

    this.registerOperation({
      id: 'post_detail_extract_links',
      name: 'Post Detail Extract Links',
      description: '从微博详情页提取链接',
      operation: PostDetailLinkExtractionOperation,
      category: 'extraction',
      supportedPageTypes: [WeiboPageType.POST_DETAIL],
      requiresLogin: false,
      parameters: {
        targetTypes: {
          type: 'array',
          description: '目标链接类型数组',
          required: false,
          defaultValue: ['post', 'user', 'topic', 'hashtag', 'image', 'video', 'external']
        },
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 200
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        }
      },
      resultType: 'LinkExtractionResult',
      version: '1.0.0',
      tags: ['extraction', 'links', 'post-detail', 'scraping']
    });

    this.registerOperation({
      id: 'search_results_extract_links',
      name: 'Search Results Extract Links',
      description: '从搜索结果页提取链接',
      operation: SearchResultsLinkExtractionOperation,
      category: 'extraction',
      supportedPageTypes: [WeiboPageType.SEARCH_RESULTS],
      requiresLogin: false,
      parameters: {
        targetTypes: {
          type: 'array',
          description: '目标链接类型数组',
          required: false,
          defaultValue: ['post', 'user', 'topic']
        },
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 100
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        }
      },
      resultType: 'LinkExtractionResult',
      version: '1.0.0',
      tags: ['extraction', 'links', 'search-results', 'scraping']
    });

    this.registerOperation({
      id: 'hot_search_extract_links',
      name: 'Hot Search Extract Links',
      description: '从热搜页提取链接',
      operation: HotSearchLinkExtractionOperation,
      category: 'extraction',
      supportedPageTypes: [WeiboPageType.HOT_SEARCH],
      requiresLogin: false,
      parameters: {
        targetTypes: {
          type: 'array',
          description: '目标链接类型数组',
          required: false,
          defaultValue: ['topic', 'hashtag']
        },
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 50
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        }
      },
      resultType: 'LinkExtractionResult',
      version: '1.0.0',
      tags: ['extraction', 'links', 'hot-search', 'scraping']
    });
  }

  private registerOperation(registration: OperationRegistration): void {
    this.operations.set(registration.id, registration);
    
    // 更新页面类型到操作的映射
    registration.supportedPageTypes.forEach(pageType => {
      if (!this.pageTypeOperations.has(pageType)) {
        this.pageTypeOperations.set(pageType, []);
      }
      this.pageTypeOperations.get(pageType)!.push(registration.id);
    });
  }

  // 获取所有操作
  getAllOperations(): OperationRegistration[] {
    return Array.from(this.operations.values());
  }

  // 获取指定操作
  getOperation(operationId: string): OperationRegistration | null {
    return this.operations.get(operationId) || null;
  }

  // 获取支持指定页面类型的操作
  getOperationsForPageType(pageType: WeiboPageType): OperationRegistration[] {
    const operationIds = this.pageTypeOperations.get(pageType) || [];
    return operationIds.map(id => this.operations.get(id)!).filter(Boolean);
  }

  // 获取指定分类的操作
  getOperationsByCategory(category: string): OperationRegistration[] {
    return Array.from(this.operations.values()).filter(op => op.category === category);
  }

  // 搜索操作
  searchOperations(query: string): OperationRegistration[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.operations.values()).filter(op =>
      op.name.toLowerCase().includes(lowerQuery) ||
      op.description.toLowerCase().includes(lowerQuery) ||
      op.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  // 检查操作是否需要登录
  requiresLogin(operationId: string): boolean {
    const operation = this.operations.get(operationId);
    return operation ? operation.requiresLogin : false;
  }

  // 验证操作参数
  validateOperationParameters(operationId: string, params: any): { valid: boolean; errors: string[] } {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return { valid: false, errors: [`Operation not found: ${operationId}`] };
    }

    const errors: string[] = [];

    // 检查必需参数
    for (const [paramName, paramConfig] of Object.entries(operation.parameters)) {
      if (paramConfig.required && params[paramName] === undefined) {
        errors.push(`Missing required parameter: ${paramName}`);
      }
    }

    // 检查参数类型
    for (const [paramName, paramValue] of Object.entries(params)) {
      const paramConfig = operation.parameters[paramName];
      if (paramConfig) {
        // 简单的类型检查
        const expectedType = paramConfig.type;
        const actualType = Array.isArray(paramValue) ? 'array' : typeof paramValue;
        
        if (expectedType !== actualType) {
          errors.push(`Parameter ${paramName} should be ${expectedType}, got ${actualType}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // 执行操作
  async executeOperation(operationId: string, context: IExecutionContext, params: any): Promise<any> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation not found: ${operationId}`);
    }

    // 验证参数
    const validation = this.validateOperationParameters(operationId, params);
    if (!validation.valid) {
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    // 创建操作实例
    const operationInstance = new operation.operation();
    
    // 执行操作
    return await operationInstance.execute(context, params);
  }

  // 获取操作统计信息
  getOperationStats(): {
    totalOperations: number;
    operationsByCategory: Record<string, number>;
    operationsByPageType: Record<WeiboPageType, number>;
    operationsRequiringLogin: number;
  } {
    const operationsByCategory: Record<string, number> = {};
    const operationsByPageType: Record<WeiboPageType, number> = {};

    // 按分类统计
    Array.from(this.operations.values()).forEach(op => {
      operationsByCategory[op.category] = (operationsByCategory[op.category] || 0) + 1;
    });

    // 按页面类型统计
    Array.from(this.pageTypeOperations.entries()).forEach(([pageType, operationIds]) => {
      operationsByPageType[pageType] = operationIds.length;
    });

    const operationsRequiringLogin = Array.from(this.operations.values())
      .filter(op => op.requiresLogin).length;

    return {
      totalOperations: this.operations.size,
      operationsByCategory,
      operationsByPageType,
      operationsRequiringLogin
    };
  }

  // 创建主页容器
  async createHomepageContainer(context: IExecutionContext): Promise<WeiboHomepageContainer> {
    const pageContext = await this.getPageContext(context);
    return new WeiboHomepageContainer(this.stateCenter, pageContext);
  }

  // 获取页面上下文
  private async getPageContext(context: IExecutionContext): Promise<WeiboPageContext> {
    const url = context.page?.url() || '';
    const title = await context.page?.title() || '';
    return WeiboPageDetector.getPageContext(url, title);
  }
}