// 微博链接提取操作 - 核心需求分析和容器映射关系
// 基于页面结构的精确链接提取系统

import { WeiboBaseOperation } from './weibo-base-operation';
import { IExecutionContext } from '../../interfaces/core';
import { WeiboPageType, WeiboPageContext, WeiboPageDetector } from './weibo-page-types';

// 链接类型定义
export interface WeiboLink {
  url: string;
  title: string;
  type: 'post' | 'user' | 'topic' | 'image' | 'video' | 'external' | 'hashtag';
  sourceElement: string;
  sourceContainer: string;
  metadata?: {
    userId?: string;
    postId?: string;
    topicName?: string;
    imageCount?: number;
    videoDuration?: number;
    domain?: string;
  };
  position: {
    index: number;
    container: string;
    xpath?: string;
  };
}

// 链接提取参数
export interface LinkExtractionParams {
  targetTypes?: WeiboLink['type'][];
  maxCount?: number;
  containerFilter?: string;
  urlFilter?: RegExp;
  titleFilter?: RegExp;
  includeMetadata?: boolean;
  includePosition?: boolean;
  sortBy?: 'url' | 'title' | 'type' | 'position';
}

// 链接提取结果
export interface LinkExtractionResult {
  success: boolean;
  pageContext: {
    url: string;
    title: string;
    pageType: WeiboPageType;
  };
  links: WeiboLink[];
  summary: {
    totalLinks: number;
    byType: Record<WeiboLink['type'], number>;
    extractedCount: number;
    processingTime: number;
  };
  params: LinkExtractionParams;
  timestamp: Date;
}

// 容器映射关系定义
export interface ContainerMapping {
  pageType: WeiboPageType;
  containers: {
    [containerName: string]: {
      selector: string;
      description: string;
      linkTypes: WeiboLink['type'][];
      subContainers?: string[];
    };
  };
  linkPatterns: {
    [linkType: string]: {
      urlPattern: RegExp;
      titleSelector?: string;
      metadataExtractors?: {
        [key: string]: (element: any, url: string) => any;
      };
    };
  };
}

// 页面特定的容器映射配置
export const PAGE_CONTAINER_MAPPINGS: Record<WeiboPageType, ContainerMapping> = {
  [WeiboPageType.HOMEPAGE]: {
    pageType: WeiboPageType.HOMEPAGE,
    containers: {
      feedList: {
        selector: 'div[node-type="feed_list"]',
        description: '微博Feed流列表',
        linkTypes: ['post', 'user', 'topic', 'hashtag', 'image', 'video'],
        subContainers: ['feedItems']
      },
      feedItems: {
        selector: 'div[action-type="feed_list_item"]',
        description: '单个微博条目',
        linkTypes: ['post', 'user', 'topic', 'hashtag', 'image', 'video'],
        subContainers: ['postContent', 'postActions', 'userInfo']
      },
      postContent: {
        selector: 'div[node-type="feed_list_content"]',
        description: '微博内容区域',
        linkTypes: ['hashtag', 'topic', 'external', 'image', 'video']
      },
      userInfo: {
        selector: 'div[class*="feed_user"]',
        description: '用户信息区域',
        linkTypes: ['user']
      },
      postActions: {
        selector: 'div[node-type="feed_list_options"]',
        description: '微博操作按钮区域',
        linkTypes: ['post']
      },
      sidebar: {
        selector: 'div[class*="sidebar"]',
        description: '侧边栏',
        linkTypes: ['topic', 'user']
      },
      hotSearch: {
        selector: 'div[node-type="hot_list"]',
        description: '热搜列表',
        linkTypes: ['topic', 'hashtag']
      },
      navigation: {
        selector: 'div[class*="nav"]',
        description: '导航栏',
        linkTypes: ['user']
      }
    },
    linkPatterns: {
      post: {
        urlPattern: /weibo\.com\/\d+\/[a-zA-Z0-9]+|weibo\.com\/status\/\d+/,
        metadataExtractors: {
          postId: (element, url) => {
            const match = url.match(/status\/(\d+)/);
            return match ? match[1] : null;
          }
        }
      },
      user: {
        urlPattern: /weibo\.com\/[a-zA-Z0-9_]+|weibo\.com\/u\/\d+/,
        metadataExtractors: {
          userId: (element, url) => {
            const match = url.match(/u\/(\d+)/);
            return match ? match[1] : null;
          }
        }
      },
      topic: {
        urlPattern: /weibo\.com\/search\?q=([^&]+)/,
        metadataExtractors: {
          topicName: (element, url) => {
            const match = url.match(/q=([^&]+)/);
            return match ? decodeURIComponent(match[1]) : null;
          }
        }
      },
      hashtag: {
        urlPattern: /#([^#]+)#/,
        metadataExtractors: {
          topicName: (element, url) => {
            const match = url.match(/#([^#]+)#/);
            return match ? match[1] : null;
          }
        }
      },
      image: {
        urlPattern: /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i,
        metadataExtractors: {
          imageCount: (element, url) => 1
        }
      },
      video: {
        urlPattern: /\.(mp4|mov|avi|flv)(\?.*)?$/i,
        metadataExtractors: {
          videoDuration: (element, url) => 0 // 需要从页面获取
        }
      },
      external: {
        urlPattern: /^https?:\/\//,
        metadataExtractors: {
          domain: (element, url) => {
            try {
              return new URL(url).hostname;
            } catch {
              return null;
            }
          }
        }
      }
    }
  },
  
  [WeiboPageType.USER_PROFILE]: {
    pageType: WeiboPageType.USER_PROFILE,
    containers: {
      userInfo: {
        selector: 'div[class*="Profile_header"]',
        description: '用户头部信息',
        linkTypes: ['user']
      },
      postsList: {
        selector: 'div[class*="Profile_feed"]',
        description: '用户微博列表',
        linkTypes: ['post', 'user', 'topic', 'hashtag', 'image', 'video'],
        subContainers: ['postItems']
      },
      postItems: {
        selector: 'div[class*="feed_item"]',
        description: '用户微博条目',
        linkTypes: ['post', 'user', 'topic', 'hashtag', 'image', 'video']
      },
      followingList: {
        selector: 'div[class*="follow_list"]',
        description: '关注列表',
        linkTypes: ['user']
      },
      followersList: {
        selector: 'div[class*="fans_list"]',
        description: '粉丝列表',
        linkTypes: ['user']
      }
    },
    linkPatterns: {
      // 使用与主页相同的链接模式
      ...PAGE_CONTAINER_MAPPINGS[WeiboPageType.HOMEPAGE].linkPatterns
    }
  },
  
  [WeiboPageType.POST_DETAIL]: {
    pageType: WeiboPageType.POST_DETAIL,
    containers: {
      postContent: {
        selector: 'div[class*="WB_detail"]',
        description: '微博详情内容',
        linkTypes: ['post', 'user', 'topic', 'hashtag', 'image', 'video']
      },
      commentsList: {
        selector: 'div[node-type="comment_list"]',
        description: '评论列表',
        linkTypes: ['user', 'post', 'hashtag'],
        subContainers: ['commentItems']
      },
      commentItems: {
        selector: 'div[class*="comment_item"]',
        description: '评论条目',
        linkTypes: ['user', 'hashtag']
      },
      repostList: {
        selector: 'div[node-type="repost_list"]',
        description: '转发列表',
        linkTypes: ['user', 'post'],
        subContainers: ['repostItems']
      },
      repostItems: {
        selector: 'div[class*="repost_item"]',
        description: '转发条目',
        linkTypes: ['user', 'post']
      }
    },
    linkPatterns: {
      // 使用与主页相同的链接模式
      ...PAGE_CONTAINER_MAPPINGS[WeiboPageType.HOMEPAGE].linkPatterns
    }
  },
  
  [WeiboPageType.SEARCH_RESULTS]: {
    pageType: WeiboPageType.SEARCH_RESULTS,
    containers: {
      searchResults: {
        selector: 'div[node-type="search_result"]',
        description: '搜索结果列表',
        linkTypes: ['post', 'user', 'topic'],
        subContainers: ['resultItems']
      },
      resultItems: {
        selector: 'div[class*="search_result_item"]',
        description: '搜索结果条目',
        linkTypes: ['post', 'user', 'topic']
      },
      filterTabs: {
        selector: 'div[class*="filter_tabs"]',
        description: '筛选标签',
        linkTypes: ['topic']
      }
    },
    linkPatterns: {
      // 使用与主页相同的链接模式
      ...PAGE_CONTAINER_MAPPINGS[WeiboPageType.HOMEPAGE].linkPatterns
    }
  },
  
  [WeiboPageType.HOT_SEARCH]: {
    pageType: WeiboPageType.HOT_SEARCH,
    containers: {
      hotList: {
        selector: 'div[node-type="hot_list"]',
        description: '热搜列表',
        linkTypes: ['topic', 'hashtag'],
        subContainers: ['hotItems']
      },
      hotItems: {
        selector: 'div[class*="hot_item"]',
        description: '热搜条目',
        linkTypes: ['topic', 'hashtag']
      },
      categoryTabs: {
        selector: 'div[class*="category_tabs"]',
        description: '分类标签',
        linkTypes: ['topic']
      }
    },
    linkPatterns: {
      // 使用与主页相同的链接模式
      ...PAGE_CONTAINER_MAPPINGS[WeiboPageType.HOMEPAGE].linkPatterns
    }
  }
};

// 容器操作映射关系
export interface ContainerOperationMapping {
  containerName: string;
  operations: {
    [operationName: string]: {
      description: string;
      parameters: {
        [paramName: string]: {
          type: string;
          description: string;
          required: boolean;
          defaultValue?: any;
        };
      };
      resultType: string;
    };
  };
}

// 链接提取操作的容器操作映射
export const LINK_EXTRACTION_OPERATIONS: ContainerOperationMapping = {
  containerName: 'linkExtractor',
  operations: {
    extractLinks: {
      description: '从指定容器中提取所有链接',
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
      resultType: 'LinkExtractionResult'
    },
    extractLinksByType: {
      description: '提取指定类型的链接',
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
      resultType: 'WeiboLink[]'
    },
    extractPostLinks: {
      description: '提取微博帖子链接',
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
      resultType: 'WeiboLink[]'
    },
    extractUserLinks: {
      description: '提取用户链接',
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
      resultType: 'WeiboLink[]'
    },
    extractTopicLinks: {
      description: '提取话题链接',
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
      resultType: 'WeiboLink[]'
    },
    extractImageLinks: {
      description: '提取图片链接',
      parameters: {
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
      resultType: 'WeiboLink[]'
    },
    extractVideoLinks: {
      description: '提取视频链接',
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
      resultType: 'WeiboLink[]'
    }
  }
};

// 操作定位器
export class OperationLocator {
  private containerMappings: Record<WeiboPageType, ContainerMapping>;
  private operationMappings: Record<string, ContainerOperationMapping>;

  constructor() {
    this.containerMappings = PAGE_CONTAINER_MAPPINGS;
    this.operationMappings = {
      linkExtractor: LINK_EXTRACTION_OPERATIONS
    };
  }

  // 获取页面类型的容器映射
  getContainerMapping(pageType: WeiboPageType): ContainerMapping | null {
    return this.containerMappings[pageType] || null;
  }

  // 获取操作映射
  getOperationMapping(operationName: string): ContainerOperationMapping | null {
    return this.operationMappings[operationName] || null;
  }

  // 查找支持指定链接类型的容器
  findContainersForLinkType(pageType: WeiboPageType, linkType: WeiboLink['type']): string[] {
    const mapping = this.getContainerMapping(pageType);
    if (!mapping) return [];

    return Object.entries(mapping.containers)
      .filter(([_, container]) => container.linkTypes.includes(linkType))
      .map(([name, _]) => name);
  }

  // 查找容器的所有支持的操作
  findOperationsForContainer(containerName: string): string[] {
    return Object.keys(this.operationMappings);
  }

  // 获取链接类型的匹配模式
  getLinkPattern(pageType: WeiboPageType, linkType: WeiboLink['type']): RegExp | null {
    const mapping = this.getContainerMapping(pageType);
    if (!mapping || !mapping.linkPatterns[linkType]) return null;
    
    return mapping.linkPatterns[linkType].urlPattern;
  }

  // 验证URL是否符合指定类型
  validateLinkType(pageType: WeiboPageType, url: string, linkType: WeiboLink['type']): boolean {
    const pattern = this.getLinkPattern(pageType, linkType);
    if (!pattern) return false;
    
    return pattern.test(url);
  }

  // 推断链接类型
  inferLinkType(pageType: WeiboPageType, url: string): WeiboLink['type'] | null {
    const mapping = this.getContainerMapping(pageType);
    if (!mapping) return null;

    for (const [type, patternInfo] of Object.entries(mapping.linkPatterns)) {
      if (patternInfo.urlPattern.test(url)) {
        return type as WeiboLink['type'];
      }
    }

    // 默认为外部链接
    return url.startsWith('http') ? 'external' : null;
  }
}