/**
 * 微博主页选择器库
 * 基于实际页面结构分析的选择器定义
 */

/**
 * 微博主页选择器配置
 * 包含页面元素、帖子、用户信息等各种选择器
 */
const WeiboHomepageSelectors = {
  // === 页面基础元素 ===
  page: {
    // 主容器
    mainContainer: 'body',
    contentArea: '.main, .content, .feed-container',
    
    // 导航元素
    navigation: '.nav, .navigation, .header-nav',
    searchBox: 'input[type="search"], .search-input, #search',
    
    // 登录状态
    loginButton: 'a[href*="login"], .login-btn, .signin',
    userInfo: '.user-info, .profile, .user-avatar, .username',
    
    // 分页和加载
    loadMoreButton: '.load-more, .more-button, .next-page, .Feed_body_3R0rO .more',
    feedContainer: '.Feed_body_3R0rO, .feed-item, .card, .feed'
  },

  // === 主帖子选择器 ===
  mainPosts: {
    // 帖子容器
    postContainer: '.Feed_body_3R0rO, .feed-item, .card, .feed',
    
    // 帖子基本信息
    postLink: 'a[href*="/status/"], a[href*="detail"]',
    postContent: '.content, .feed-content, .text, .Feed_body_3R0rO .content',
    postTitle: '.title, .feed-title, .subject',
    
    // 作者信息
    authorInfo: '.author, .user-info, .Feed_body_3R0rO .author',
    authorName: '.author-name, .username, .Feed_body_3R0rO .name',
    authorLink: 'a[href*="/u/"], a[href*="/profile/"], a[href*="/people/"]',
    authorAvatar: '.avatar, .user-avatar, .Feed_body_3R0rO .avatar img',
    
    // 时间信息
    postTime: '.time, .date, .timestamp, .Feed_body_3R0rO .time',
    postDate: '.date, .published, .Feed_body_3R0rO .date',
    
    // 互动信息
    engagement: '.engagement, .stats, .Feed_body_3R0rO .stats',
    likes: '.like, .favorite, .Feed_body_3R0rO .like',
    comments: '.comment, .reply, .Feed_body_3R0rO .comment',
    shares: '.share, .retweet, .Feed_body_3R0rO .share',
    
    // 媒体内容
    images: '.images img, .gallery img, .Feed_body_3R0rO img',
    videos: '.video, .media video, .Feed_body_3R0rO video',
    
    // 标签和话题
    tags: '.tags, .categories, .Feed_body_3R0rO .tags',
    topics: 'a[href*="/search/"], a[href*="?q="], .topic'
  },

  // === 用户信息选择器 ===
  userInfo: {
    // 用户主页链接
    userHomeLink: 'a[href*="/u/"], a[href*="/profile/"], a[href*="/people/"]',
    
    // 用户名
    username: '.username, .user-name, .screen-name, .Feed_body_3R0rO .name',
    
    // 用户ID
    userId: '[data-user-id], [data-uid], .user-id',
    
    // 认证信息
    verified: '.verified, .vip, .Feed_body_3R0rO .verified',
    
    // 粉丝数
    followers: '.followers, .fans, .user-stats .followers',
    
    // 关注数
    following: '.following, .friends, .user-stats .following'
  },

  // === 时间信息选择器 ===
  timeInfo: {
    // 绝对时间
    absoluteTime: '.time, .date, .timestamp, .Feed_body_3R0rO .time',
    
    // 相对时间
    relativeTime: '.time-ago, .relative-time, .Feed_body_3R0rO .time-ago',
    
    // 时间属性
    timeAttribute: 'datetime, data-time, timestamp',
    
    // 发布时间格式
    publishTime: '.publish-time, .post-time, .created-at'
  },

  // === 互动元素选择器 ===
  interactions: {
    // 点赞按钮
    likeButton: '.like-btn, .favorite-btn, .Feed_body_3R0rO .like',
    
    // 评论按钮
    commentButton: '.comment-btn, .reply-btn, .Feed_body_3R0rO .comment',
    
    // 分享按钮
    shareButton: '.share-btn, .retweet-btn, .Feed_body_3R0rO .share',
    
    // 关注按钮
    followButton: '.follow-btn, .follow, .Feed_body_3R0rO .follow'
  },

  // === 内容选择器 ===
  content: {
    // 文本内容
    textContent: '.text, .content, .Feed_body_3R0rO .content',
    
    // HTML内容
    htmlContent: '.content, .feed-content, .Feed_body_3R0rO .content',
    
    // 链接内容
    linkContent: 'a[href*="/status/"], a[href*="detail"]',
    
    // 图片内容
    imageContent: 'img[src], .images img, .Feed_body_3R0rO img',
    
    // 视频内容
    videoContent: 'video[src], .media video, .Feed_body_3R0rO video'
  },

  // === 分页选择器 ===
  pagination: {
    // 下一页按钮
    nextPage: '.next, .next-page, .Feed_body_3R0rO .next',
    
    // 上一页按钮
    prevPage: '.prev, .prev-page, .Feed_body_3R0rO .prev',
    
    // 页码
    pageNumber: '.page-number, .current-page, .Feed_body_3R0rO .page',
    
    // 总页数
    totalPages: '.total-pages, .page-count, .Feed_body_3R0rO .total-pages'
  },

  // === 搜索相关选择器 ===
  search: {
    // 搜索框
    searchInput: 'input[type="search"], .search-input, #search',
    
    // 搜索按钮
    searchButton: '.search-btn, .search-button, .Feed_body_3R0rO .search',
    
    // 搜索结果
    searchResults: '.search-results, .results, .Feed_body_3R0rO .search-results',
    
    // 搜索结果项
    searchResultItem: '.search-result, .result-item, .Feed_body_3R0rO .search-result'
  },

  // === 表单选择器 ===
  forms: {
    // 登录表单
    loginForm: '.login-form, .signin-form, #login-form',
    
    // 搜索表单
    searchForm: '.search-form, #search-form',
    
    // 发布表单
    postForm: '.post-form, .publish-form, .Feed_body_3R0rO .post-form'
  },

  // === 错误处理选择器 ===
  errorHandling: {
    // 错误消息
    errorMessage: '.error, .error-message, .Feed_body_3R0rO .error',
    
    // 加载状态
    loading: '.loading, .spinner, .Feed_body_3R0rO .loading',
    
    // 空状态
    emptyState: '.empty, .no-results, .Feed_body_3R0rO .empty'
  }
};

/**
 * 微博主页选择器验证器
 * 用于验证选择器的有效性
 */
class WeiboSelectorValidator {
  /**
   * 验证选择器是否有效
   */
  static validateSelector(selector) {
    if (!selector || typeof selector !== 'string') {
      return { valid: false, error: '选择器不能为空' };
    }
    
    if (selector.length === 0) {
      return { valid: false, error: '选择器长度不能为0' };
    }
    
    // 检查选择器语法
    try {
      document.querySelector(selector);
    } catch (error) {
      return { valid: false, error: `选择器语法错误: ${error.message}` };
    }
    
    return { valid: true };
  }

  /**
   * 验证选择器组
   */
  static validateSelectorGroup(selectorGroup) {
    const results = {};
    
    for (const [key, selector] of Object.entries(selectorGroup)) {
      if (typeof selector === 'string') {
        results[key] = this.validateSelector(selector);
      } else if (typeof selector === 'object') {
        results[key] = this.validateSelectorGroup(selector);
      }
    }
    
    return results;
  }

  /**
   * 获取选择器组中的所有选择器
   */
  static getAllSelectors(selectorGroup) {
    const selectors = [];
    
    for (const value of Object.values(selectorGroup)) {
      if (typeof value === 'string') {
        selectors.push(value);
      } else if (typeof value === 'object') {
        selectors.push(...this.getAllSelectors(value));
      }
    }
    
    return selectors;
  }
}

/**
 * 微博主页选择器管理器
 */
class WeiboSelectorManager {
  constructor() {
    this.selectors = WeiboHomepageSelectors;
    this.validator = WeiboSelectorValidator;
  }

  /**
   * 获取选择器
   */
  getSelector(path) {
    const keys = path.split('.');
    let current = this.selectors;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return null;
      }
    }
    
    return current;
  }

  /**
   * 设置选择器
   */
  setSelector(path, selector) {
    const keys = path.split('.');
    let current = this.selectors;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = selector;
  }

  /**
   * 获取所有选择器
   */
  getAllSelectors() {
    return this.selectors;
  }

  /**
   * 验证所有选择器
   */
  validateAllSelectors() {
    return this.validator.validateSelectorGroup(this.selectors);
  }

  /**
   * 获取特定类型的选择器
   */
  getSelectorsByType(type) {
    return this.selectors[type] || {};
  }

  /**
   * 获取帖子相关选择器
   */
  getPostSelectors() {
    return {
      container: this.getSelector('mainPosts.postContainer'),
      link: this.getSelector('mainPosts.postLink'),
      content: this.getSelector('mainPosts.postContent'),
      title: this.getSelector('mainPosts.postTitle'),
      author: {
        name: this.getSelector('mainPosts.authorName'),
        link: this.getSelector('mainPosts.authorLink'),
        info: this.getSelector('mainPosts.authorInfo')
      },
      time: {
        absolute: this.getSelector('mainPosts.postTime'),
        relative: this.getSelector('mainPosts.postTime')
      },
      engagement: {
        likes: this.getSelector('mainPosts.likes'),
        comments: this.getSelector('mainPosts.comments'),
        shares: this.getSelector('mainPosts.shares')
      }
    };
  }

  /**
   * 获取用户信息选择器
   */
  getUserSelectors() {
    return {
      username: this.getSelector('userInfo.username'),
      userLink: this.getSelector('userInfo.userHomeLink'),
      avatar: this.getSelector('userInfo.authorAvatar'),
      verified: this.getSelector('userInfo.verified')
    };
  }

  /**
   * 获取时间信息选择器
   */
  getTimeSelectors() {
    return {
      absolute: this.getSelector('timeInfo.absoluteTime'),
      relative: this.getSelector('timeInfo.relativeTime'),
      attribute: this.getSelector('timeInfo.timeAttribute')
    };
  }
}

/**
 * 选择器使用示例和最佳实践
 */
const WeiboSelectorExamples = {
  // 基础使用示例
  basicUsage: {
    // 获取帖子容器
    getPostContainers: '.Feed_body_3R0rO, .feed-item, .card',
    
    // 获取帖子链接
    getPostLinks: '.Feed_body_3R0rO a[href*="/status/"], .feed-item a[href*="/status/"]',
    
    // 获取作者信息
    getAuthorInfo: '.Feed_body_3R0rO .author, .feed-item .author',
    
    // 获取时间信息
    getTimeInfo: '.Feed_body_3R0rO .time, .feed-item .time'
  },

  // 组合选择器示例
  combinedUsage: {
    // 获取帖子的完整信息
    getPostInfo: {
      container: '.Feed_body_3R0rO',
      link: '.Feed_body_3R0rO a[href*="/status/"]',
      author: {
        name: '.Feed_body_3R0rO .author-name',
        link: '.Feed_body_3R0rO a[href*="/u/"]'
      },
      time: '.Feed_body_3R0rO .time',
      content: '.Feed_body_3R0rO .content'
    },
    
    // 获取用户信息
    getUserInfo: {
      name: '.username, .user-name',
      link: 'a[href*="/u/"], a[href*="/profile/"]',
      avatar: '.avatar img, .user-avatar img'
    }
  },

  // 优先级选择器示例
  priorityUsage: {
    // 高优先级选择器（最稳定）
    highPriority: [
      '.Feed_body_3R0rO',
      '.feed-item',
      '.card'
    ],
    
    // 中优先级选择器（较稳定）
    mediumPriority: [
      '.content',
      '.author',
      '.time'
    ],
    
    // 低优先级选择器（可能变化）
    lowPriority: [
      '.like',
      '.comment',
      '.share'
    ]
  }
};

module.exports = {
  WeiboHomepageSelectors,
  WeiboSelectorValidator,
  WeiboSelectorManager,
  WeiboSelectorExamples
};