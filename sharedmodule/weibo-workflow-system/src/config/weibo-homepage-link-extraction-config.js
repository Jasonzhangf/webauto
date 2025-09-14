/**
 * 微博主页链接提取配置
 * 基于原子化操作的逻辑和配置分离设计
 */

const {
  AtomicOperationFactory
} = require('../core/atomic-operations');

const {
  CompositeOperationFactory
} = require('../core/composite-operations');

const {
  LinkExtractionCompositeOperation
} = require('../core/composite-operations');

/**
 * 微博主页链接提取配置
 * 纯配置，不包含任何逻辑
 */
const WeiboHomepageLinkExtractionConfig = {
  // 容器配置
  container: {
    type: 'weibo-homepage',
    selector: 'body',
    contentSelector: '.main, .content, .feed',
    behaviors: ['scroll', 'mutation'],
    triggers: ['scroll-end', 'content-change', 'time-interval']
  },

  // 原子操作配置
  atomicOperations: {
    // 检查页面加载状态
    checkPageLoaded: {
      type: 'element.exists',
      selector: '.Feed_body_3R0rO, .feed-item, .card',
      options: { timeout: 10000 }
    },

    // 等待主要内容加载
    waitForMainContent: {
      type: 'element.visible',
      selector: '.main, .content, .feed',
      options: { timeout: 15000 }
    },

    // 提取所有链接
    extractAllLinks: {
      type: 'element.attribute',
      selector: 'a[href]',
      attribute: 'href',
      options: { 
        multiple: true, 
        timeout: 5000,
        filter: (href) => href && !href.startsWith('javascript:') && !href.startsWith('#')
      }
    },

    // 提取链接文本
    extractLinkTexts: {
      type: 'element.text',
      selector: 'a[href]',
      options: { 
        multiple: true, 
        timeout: 5000,
        filter: (text) => text && text.trim().length > 0
      }
    },

    // 提取链接标题
    extractLinkTitles: {
      type: 'element.attribute',
      selector: 'a[href]',
      attribute: 'title',
      options: { 
        multiple: true, 
        timeout: 5000
      }
    },

    // 提取微博帖子链接
    extractPostLinks: {
      type: 'element.attribute',
      selector: '.Feed_body_3R0rO a[href*="/status/"], .feed-item a[href*="/status/"]',
      attribute: 'href',
      options: { 
        multiple: true, 
        timeout: 5000
      }
    },

    // 提取用户主页链接
    extractUserLinks: {
      type: 'element.attribute',
      selector: 'a[href*="/u/"], a[href*="/profile/"], a[href*="/people/"]',
      attribute: 'href',
      options: { 
        multiple: true, 
        timeout: 5000
      }
    },

    // 提取话题链接
    extractTopicLinks: {
      type: 'element.attribute',
      selector: 'a[href*="/search/"], a[href*="?q="], a[href*="keyword="]',
      attribute: 'href',
      options: { 
        multiple: true, 
        timeout: 5000
      }
    },

    // 提取图片链接
    extractImageLinks: {
      type: 'element.attribute',
      selector: 'img[src]',
      attribute: 'src',
      options: { 
        multiple: true, 
        timeout: 5000,
        filter: (src) => src && !src.includes('avatar') && !src.includes('icon')
      }
    },

    // 提取视频链接
    extractVideoLinks: {
      type: 'element.attribute',
      selector: 'video[src], source[src]',
      attribute: 'src',
      options: { 
        multiple: true, 
        timeout: 5000
      }
    },

    // 检查加载更多按钮
    checkLoadMoreButton: {
      type: 'element.exists',
      selector: '.load-more, .more-button, .next-page',
      options: { timeout: 5000 }
    },

    // 点击加载更多
    clickLoadMore: {
      type: 'element.click',
      selector: '.load-more, .more-button, .next-page',
      options: { timeout: 5000, delay: 1000 }
    },

    },

  // 组合操作配置
  compositeOperations: {
    // 链接提取系统
    linkExtractionSystem: {
      type: 'link-extraction',
      config: {
        linkSelector: 'a[href]',
        allowedTypes: ['post', 'user', 'topic', 'general'],
        validOnly: true,
        maxLinks: 100
      }
    },

    // 分页系统
    paginationSystem: {
      type: 'pagination',
      config: {
        nextButtonSelector: '.load-more, .more-button, .next-page',
        autoLoad: true,
        maxPages: 5,
        waitForContent: 3000
      }
    },

    // 内容提取系统
    contentExtractionSystem: {
      type: 'content-extraction',
      config: {
        containerSelector: '.Feed_body_3R0rO, .feed-item',
        titleSelector: '.title, .feed-title',
        contentSelector: '.content, .feed-content',
        authorSelector: '.author, .user-name',
        dateSelector: '.time, .date'
      }
    }
  },

  // 触发器配置
  triggers: {
    // 滚动触发器
    scrollTrigger: {
      type: 'scroll-trigger',
      scrollThreshold: 0.8,
      debounceTime: 2000,
      action: 'extract-links'
    },

    // 时间触发器
    timeTrigger: {
      type: 'interval-trigger',
      interval: 30000,
      action: 'periodic-extraction'
    },

    // 内容变化触发器
    contentChangeTrigger: {
      type: 'content-change-trigger',
      minContentCount: 10,
      checkInterval: 2000,
      action: 'extract-new-content'
    }
  },

  // 过滤器配置
  filters: {
    // 链接类型过滤器
    linkTypeFilter: {
      type: 'link-type',
      allowedTypes: ['post', 'user', 'topic', 'image', 'video', 'general'],
      excludedTypes: ['javascript', 'mailto', 'tel']
    },

    // 域名过滤器
    domainFilter: {
      type: 'domain',
      allowedDomains: ['weibo.com', 'm.weibo.com'],
      excludeExternal: false
    },

    // 内容长度过滤器
    contentLengthFilter: {
      type: 'content-length',
      minLength: 1,
      maxLength: 1000
    }
  },

  // 输出配置
  output: {
    // 数据结构
    dataStructure: {
      links: {
        href: 'string',
        text: 'string',
        title: 'string',
        type: 'string',
        domain: 'string',
        isValid: 'boolean',
        isInternal: 'boolean'
      },
      stats: {
        totalLinks: 'number',
        linksByType: 'object',
        domains: 'object'
      }
    },

    // 格式化选项
    formatting: {
      includeMetadata: true,
      includeStats: true,
      groupByType: true,
      sortBy: 'type'
    }
  }
};

/**
 * 微博主页链接提取系统
 * 逻辑与配置完全分离
 */
class WeiboHomepageLinkExtractionSystem {
  constructor(config = WeiboHomepageLinkExtractionConfig) {
    this.config = config;
    this.atomicFactory = new AtomicOperationFactory();
    this.compositeFactory = new CompositeOperationFactory();
    this.operations = {};
    this.results = {
      links: [],
      stats: {
        totalLinks: 0,
        linksByType: {},
        domains: {}
      }
    };
  }

  /**
   * 构建原子操作
   */
  buildAtomicOperations() {
    const { atomicOperations } = this.config;
    
    for (const [name, operationConfig] of Object.entries(atomicOperations)) {
      this.operations[name] = this.atomicFactory.createOperation(
        operationConfig.type,
        operationConfig
      );
    }

    return this.operations;
  }

  /**
   * 构建组合操作
   */
  buildCompositeOperations() {
    const { compositeOperations } = this.config;
    
    for (const [name, systemConfig] of Object.entries(compositeOperations)) {
      this.operations[name] = this.compositeFactory.createCustomSystem(
        systemConfig.config,
        this.getCompositeOperationClass(systemConfig.type)
      );
    }

    return this.operations;
  }

  /**
   * 获取组合操作类
   */
  getCompositeOperationClass(type) {
    const operationClasses = {
      'link-extraction': LinkExtractionCompositeOperation,
      'pagination': class PaginationSystem {
        constructor(config) {
          this.config = config;
          this.atomicFactory = new AtomicOperationFactory();
          this.operations = {};
        }

        buildOperations() {
          this.operations.checkNextButton = this.atomicFactory.createOperation('element.exists', {
            selector: this.config.nextButtonSelector,
            options: { timeout: 5000 }
          });

          this.operations.clickNextButton = this.atomicFactory.createOperation('element.click', {
            selector: this.config.nextButtonSelector,
            options: { timeout: 5000, delay: 1000 }
          });

          return this.operations;
        }

        async execute(context, options = {}) {
          let page = 1;
          const maxPages = this.config.maxPages || 5;
          const results = [];

          while (page <= maxPages) {
            const nextButtonExists = await this.operations.checkNextButton.execute(context);
            
            if (!nextButtonExists.exists && page > 1) {
              break;
            }

            if (page > 1) {
              await this.operations.clickNextButton.execute(context);
              await new Promise(resolve => setTimeout(resolve, this.config.waitForContent || 3000));
            }

            results.push({
              page: page,
              action: 'page-loaded',
              timestamp: new Date().toISOString()
            });

            page++;
          }

          return {
            success: true,
            pagesLoaded: page - 1,
            results: results
          };
        }
      }
    };

    return operationClasses[type] || LinkExtractionCompositeOperation;
  }

  /**
   * 执行链接提取
   */
  async execute(context, options = {}) {
    try {
      console.log('🔍 开始微博主页链接提取...');

      // 1. 检查页面加载状态
      console.log('检查页面加载状态...');
      const pageLoaded = await this.operations.checkPageLoaded.execute(context);
      if (!pageLoaded.exists) {
        throw new Error('页面未正确加载');
      }

      // 2. 等待主要内容加载
      console.log('等待主要内容加载...');
      await this.operations.waitForMainContent.execute(context);

      // 3. 执行分页系统
      if (options.enablePagination && this.operations.paginationSystem) {
        console.log('执行分页系统...');
        const paginationResult = await this.operations.paginationSystem.composite.execute(context);
        console.log(`已加载 ${paginationResult.pagesLoaded} 页内容`);
      }

      // 4. 提取各种类型的链接
      console.log('提取链接数据...');
      const linkExtractionPromises = [
        this.operations.extractAllLinks.execute(context),
        this.operations.extractLinkTexts.execute(context),
        this.operations.extractLinkTitles.execute(context),
        this.operations.extractPostLinks.execute(context),
        this.operations.extractUserLinks.execute(context),
        this.operations.extractTopicLinks.execute(context),
        this.operations.extractImageLinks.execute(context),
        this.operations.extractVideoLinks.execute(context)
      ];

      const linkResults = await Promise.all(linkExtractionPromises);

      // 5. 处理和组合链接数据
      console.log('处理链接数据...');
      this.processLinkResults(linkResults);

      // 6. 应用过滤器
      console.log('应用过滤器...');
      this.applyFilters();

      // 7. 生成统计信息
      console.log('生成统计信息...');
      this.generateStats();

      console.log(`✅ 链接提取完成，共提取 ${this.results.stats.totalLinks} 个链接`);

      return {
        success: true,
        links: this.results.links,
        stats: this.results.stats,
        config: this.config
      };

    } catch (error) {
      console.error('❌ 链接提取失败:', error);
      return {
        success: false,
        error: error.message,
        links: [],
        stats: this.results.stats
      };
    }
  }

  /**
   * 处理链接结果
   */
  processLinkResults(linkResults) {
    const [
      allLinks, 
      linkTexts, 
      linkTitles, 
      postLinks, 
      userLinks, 
      topicLinks, 
      imageLinks, 
      videoLinks
    ] = linkResults;

    // 处理所有链接
    const allHrefs = allLinks.attributes || [];
    const allTexts = linkTexts.texts || [];
    const allTitles = linkTitles.attributes || [];

    for (let i = 0; i < allHrefs.length; i++) {
      const href = allHrefs[i];
      const text = allTexts[i] || '';
      const title = allTitles[i] || '';

      if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
        continue;
      }

      const linkType = this.detectLinkType(href, postLinks, userLinks, topicLinks, imageLinks, videoLinks);
      
      this.results.links.push({
        href: href,
        text: text,
        title: title,
        type: linkType,
        domain: this.extractDomain(href),
        isValid: this.isValidUrl(href),
        isInternal: this.isInternalUrl(href)
      });
    }
  }

  /**
   * 检测链接类型
   */
  detectLinkType(href, postLinks, userLinks, topicLinks, imageLinks, videoLinks) {
    const postHrefs = postLinks.attributes || [];
    const userHrefs = userLinks.attributes || [];
    const topicHrefs = topicLinks.attributes || [];
    const imageHrefs = imageLinks.attributes || [];
    const videoHrefs = videoLinks.attributes || [];

    if (postHrefs.includes(href)) return 'post';
    if (userHrefs.includes(href)) return 'user';
    if (topicHrefs.includes(href)) return 'topic';
    if (imageHrefs.includes(href)) return 'image';
    if (videoHrefs.includes(href)) return 'video';
    
    if (href.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i)) return 'image';
    if (href.match(/\.(mp4|avi|mov|wmv|flv|webm)$/i)) return 'video';
    if (href.match(/\.(mp3|wav|ogg|aac|flac)$/i)) return 'audio';
    if (href.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt)$/i)) return 'document';
    
    return 'general';
  }

  /**
   * 提取域名
   */
  extractDomain(href) {
    try {
      const url = new URL(href);
      return url.hostname;
    } catch {
      return '';
    }
  }

  /**
   * 验证URL
   */
  isValidUrl(href) {
    try {
      new URL(href);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查是否为内部链接
   */
  isInternalUrl(href) {
    try {
      const url = new URL(href);
      return url.hostname.includes('weibo.com');
    } catch {
      return false;
    }
  }

  /**
   * 应用过滤器
   */
  applyFilters() {
    const { filters } = this.config;
    
    let filteredLinks = this.results.links;

    // 应用链接类型过滤器
    if (filters.linkTypeFilter) {
      const { allowedTypes, excludedTypes } = filters.linkTypeFilter;
      filteredLinks = filteredLinks.filter(link => {
        if (allowedTypes && !allowedTypes.includes(link.type)) return false;
        if (excludedTypes && excludedTypes.includes(link.type)) return false;
        return true;
      });
    }

    // 应用域名过滤器
    if (filters.domainFilter) {
      const { allowedDomains, excludeExternal } = filters.domainFilter;
      filteredLinks = filteredLinks.filter(link => {
        if (allowedDomains && !allowedDomains.some(domain => link.domain.includes(domain))) return false;
        if (excludeExternal && !link.isInternal) return false;
        return true;
      });
    }

    // 应用内容长度过滤器
    if (filters.contentLengthFilter) {
      const { minLength, maxLength } = filters.contentLengthFilter;
      filteredLinks = filteredLinks.filter(link => {
        const length = link.text.length;
        if (minLength && length < minLength) return false;
        if (maxLength && length > maxLength) return false;
        return true;
      });
    }

    this.results.links = filteredLinks;
  }

  /**
   * 生成统计信息
   */
  generateStats() {
    this.results.stats.totalLinks = this.results.links.length;
    
    // 按类型统计
    this.results.stats.linksByType = {};
    for (const link of this.results.links) {
      this.results.stats.linksByType[link.type] = (this.results.stats.linksByType[link.type] || 0) + 1;
    }

    // 按域名统计
    this.results.stats.domains = {};
    for (const link of this.results.links) {
      this.results.stats.domains[link.domain] = (this.results.stats.domains[link.domain] || 0) + 1;
    }
  }

  /**
   * 获取提取结果
   */
  getResults() {
    return {
      links: this.results.links,
      stats: this.results.stats,
      config: this.config
    };
  }

  /**
   * 重置系统
   */
  reset() {
    this.results = {
      links: [],
      stats: {
        totalLinks: 0,
        linksByType: {},
        domains: {}
      }
    };

    for (const operation of Object.values(this.operations)) {
      if (operation.reset) {
        operation.reset();
      }
    }
  }
}

module.exports = {
  WeiboHomepageLinkExtractionConfig,
  WeiboHomepageLinkExtractionSystem
};