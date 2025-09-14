/**
 * 微博主页50条主帖子链接提取工作流配置
 * 基于Selector Library和原子化操作的完整工作流
 */

const { AtomicOperationFactory } = require('../core/atomic-operations');
const { WeiboSelectorManager } = require('../selectors/weibo-homepage-selectors');

/**
 * 工作流配置：提取50条主帖子链接及作者时间信息
 */
const WeiboHomepagePostsExtractionWorkflow = {
  // 工作流基本信息
  workflow: {
    name: 'weibo-homepage-posts-extraction',
    version: '1.0.0',
    description: '提取微博主页50条主帖子链接及作者时间信息',
    targetUrl: 'https://weibo.com',
    maxPosts: 50,
    timeout: 120000
  },

  // 选择器配置 - 使用Selector Library
  selectors: {
    // 使用选择器管理器获取微博主页选择器
    postContainer: '.Feed_body_3R0rO, .feed-item, .card',
    postLink: '.Feed_body_3R0rO a[href*="/status/"], .feed-item a[href*="/status/"]',
    authorName: '.Feed_body_3R0rO .author-name, .feed-item .author-name, .username',
    authorLink: '.Feed_body_3R0rO a[href*="/u/"], .feed-item a[href*="/u/"], a[href*="/profile/"]',
    postTime: '.Feed_body_3R0rO .time, .feed-item .time, .timestamp',
    postContent: '.Feed_body_3R0rO .content, .feed-item .content, .text',
    loadMoreButton: '.load-more, .more-button, .next-page, .Feed_body_3R0rO .more'
  },

  // 原子操作配置
  atomicOperations: {
    // 1. 页面初始化操作
    checkPageLoaded: {
      type: 'element.exists',
      selector: 'body',
      options: { timeout: 10000 }
    },

    waitForMainContent: {
      type: 'element.visible',
      selector: '.Feed_body_3R0rO, .feed-item, .card',
      options: { timeout: 15000 }
    },

    // 2. 帖子提取操作
    findPostContainers: {
      type: 'element.exists',
      selector: '.Feed_body_3R0rO, .feed-item, .card',
      options: { timeout: 5000 }
    },

    extractPostLinks: {
      type: 'element.attribute',
      selector: '.Feed_body_3R0rO a[href*="/status/"], .feed-item a[href*="/status/"]',
      attribute: 'href',
      options: { 
        multiple: true, 
        timeout: 5000,
        filter: (href) => href && href.includes('/status/') && href.startsWith('http')
      }
    },

    extractAuthorNames: {
      type: 'element.text',
      selector: '.Feed_body_3R0rO .author-name, .feed-item .author-name, .username',
      options: { 
        multiple: true, 
        timeout: 5000,
        filter: (text) => text && text.trim().length > 0
      }
    },

    extractAuthorLinks: {
      type: 'element.attribute',
      selector: '.Feed_body_3R0rO a[href*="/u/"], .feed-item a[href*="/u/"], a[href*="/profile/"]',
      attribute: 'href',
      options: { 
        multiple: true, 
        timeout: 5000,
        filter: (href) => href && (href.includes('/u/') || href.includes('/profile/'))
      }
    },

    extractPostTimes: {
      type: 'element.text',
      selector: '.Feed_body_3R0rO .time, .feed-item .time, .timestamp',
      options: { 
        multiple: true, 
        timeout: 5000,
        filter: (text) => text && text.trim().length > 0
      }
    },

    extractPostContents: {
      type: 'element.text',
      selector: '.Feed_body_3R0rO .content, .feed-item .content, .text',
      options: { 
        multiple: true, 
        timeout: 5000,
        filter: (text) => text && text.trim().length > 0
      }
    },

    // 3. 分页操作
    checkLoadMoreButton: {
      type: 'element.exists',
      selector: '.load-more, .more-button, .next-page, .Feed_body_3R0rO .more',
      options: { timeout: 3000 }
    },

    clickLoadMore: {
      type: 'element.click',
      selector: '.load-more, .more-button, .next-page, .Feed_body_3R0rO .more',
      options: { timeout: 5000, delay: 2000 }
    },

    // 4. 数据验证操作
    validatePostLinks: {
      type: 'element.exists',
      selector: '.Feed_body_3R0rO a[href*="/status/"], .feed-item a[href*="/status/"]',
      options: { timeout: 3000 }
    }
  },

  // 工作流步骤配置
  workflowSteps: [
    {
      name: 'initialize_page',
      description: '初始化页面并等待内容加载',
      operations: ['checkPageLoaded', 'waitForMainContent'],
      required: true,
      timeout: 15000
    },
    {
      name: 'extract_initial_posts',
      description: '提取初始页面的帖子信息',
      operations: ['findPostContainers', 'extractPostLinks', 'extractAuthorNames', 'extractAuthorLinks', 'extractPostTimes', 'extractPostContents'],
      required: true,
      timeout: 10000
    },
    {
      name: 'load_more_posts',
      description: '加载更多帖子直到达到目标数量',
      operations: ['checkLoadMoreButton', 'clickLoadMore', 'extractPostLinks', 'extractAuthorNames', 'extractAuthorLinks', 'extractPostTimes', 'extractPostContents'],
      required: false,
      repeat: true,
      maxRepeats: 10,
      timeout: 30000
    },
    {
      name: 'validate_results',
      description: '验证提取结果',
      operations: ['validatePostLinks'],
      required: true,
      timeout: 5000
    }
  ],

  // 数据处理配置
  dataProcessing: {
    // 数据映射规则
    mapping: {
      postId: {
        source: 'postLink',
        transform: (href) => {
          const match = href.match(/\/status\/(\d+)/);
          return match ? match[1] : null;
        }
      },
      postUrl: {
        source: 'postLink',
        transform: (href) => href
      },
      authorName: {
        source: 'authorName',
        transform: (name) => name ? name.trim() : null
      },
      authorUrl: {
        source: 'authorLink',
        transform: (href) => href
      },
      postTime: {
        source: 'postTime',
        transform: (time) => time ? time.trim() : null
      },
      postContent: {
        source: 'postContent',
        transform: (content) => content ? content.trim().substring(0, 200) : null
      },
      extractedAt: {
        source: null,
        transform: () => new Date().toISOString()
      }
    },

    // 数据验证规则
    validation: {
      postId: {
        required: true,
        pattern: /^\d+$/
      },
      postUrl: {
        required: true,
        pattern: /^https?:\/\/.*\/status\/\d+/
      },
      authorName: {
        required: true,
        minLength: 1
      },
      postTime: {
        required: true,
        minLength: 1
      }
    },

    // 数据过滤规则
    filtering: {
      removeDuplicates: true,
      uniqueBy: ['postId', 'postUrl'],
      maxItems: 50,
      sortBy: 'extractedAt',
      sortOrder: 'desc'
    }
  },

  // 输出配置
  output: {
    format: 'json',
    filename: 'weibo-homepage-posts.json',
    structure: {
      metadata: {
        workflowName: 'weibo-homepage-posts-extraction',
        version: '1.0.0',
        extractedAt: 'timestamp',
        totalPosts: 'count',
        targetUrl: 'https://weibo.com'
      },
      posts: [
        {
          postId: 'string',
          postUrl: 'string',
          authorName: 'string',
          authorUrl: 'string',
          postTime: 'string',
          postContent: 'string',
          extractedAt: 'string'
        }
      ]
    }
  },

  // 错误处理配置
  errorHandling: {
    retryAttempts: 3,
    retryDelay: 2000,
    timeout: 30000,
    onError: {
      logError: true,
      screenshot: true,
      continueOnError: false
    }
  },

  // 性能配置
  performance: {
    maxConcurrentOperations: 3,
    delayBetweenOperations: 500,
    memoryLimit: '100MB',
    timeoutPerOperation: 10000
  }
};

/**
 * 微博主页帖子提取工作流执行器
 */
class WeiboHomepagePostsExtractionWorkflowExecutor {
  constructor(config = WeiboHomepagePostsExtractionWorkflow) {
    this.config = config;
    // AtomicOperationFactory 是静态类，直接使用静态方法
    this.operations = {};
    this.results = {
      posts: [],
      metadata: {
        workflowName: config.workflow.name,
        version: config.workflow.version,
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        targetUrl: config.workflow.targetUrl
      }
    };
    this.currentStep = 0;
  }

  /**
   * 初始化工作流
   */
  async initialize() {
    console.log('🚀 初始化微博主页帖子提取工作流...');

    // 创建原子操作
    for (const [name, operationConfig] of Object.entries(this.config.atomicOperations)) {
      this.operations[name] = AtomicOperationFactory.createOperation(
        operationConfig.type,
        operationConfig
      );
    }

    console.log('✅ 工作流初始化完成');
    return true;
  }

  /**
   * 执行工作流
   */
  async execute(context, options = {}) {
    try {
      console.log('🔧 开始执行微博主页帖子提取工作流...');

      // 执行工作流步骤
      for (const step of this.config.workflowSteps) {
        console.log(`📋 执行步骤: ${step.name} - ${step.description}`);
        
        const stepResult = await this.executeStep(context, step, options);
        
        if (!stepResult.success && step.required) {
          throw new Error(`必需步骤失败: ${step.name}`);
        }

        // 检查是否达到目标数量
        if (this.results.posts.length >= this.config.workflow.maxPosts) {
          console.log(`✅ 已达到目标数量 ${this.config.workflow.maxPosts} 条帖子`);
          break;
        }
      }

      // 处理和验证数据
      await this.processResults();

      console.log(`✅ 工作流执行完成，共提取 ${this.results.posts.length} 条帖子`);

      return {
        success: true,
        posts: this.results.posts,
        metadata: this.results.metadata
      };

    } catch (error) {
      console.error('❌ 工作流执行失败:', error);
      return {
        success: false,
        error: error.message,
        posts: [],
        metadata: this.results.metadata
      };
    }
  }

  /**
   * 执行单个步骤
   */
  async executeStep(context, step, options = {}) {
    const stepResults = [];

    try {
      for (const operationName of step.operations) {
        const operation = this.operations[operationName];
        if (!operation) {
          console.warn(`⚠️ 操作未找到: ${operationName}`);
          continue;
        }

        console.log(`  执行操作: ${operationName}`);
        const result = await operation.execute(context);
        stepResults.push({ operation: operationName, result });

        // 如果是数据提取操作，处理结果
        if (this.isDataExtractionOperation(operationName)) {
          await this.processExtractionResult(operationName, result);
        }
      }

      return {
        success: true,
        step: step.name,
        results: stepResults
      };

    } catch (error) {
      console.error(`❌ 步骤执行失败 ${step.name}:`, error);
      return {
        success: false,
        step: step.name,
        error: error.message
      };
    }
  }

  /**
   * 判断是否为数据提取操作
   */
  isDataExtractionOperation(operationName) {
    return operationName.startsWith('extract') || operationName.startsWith('get');
  }

  /**
   * 处理提取结果
   */
  async processExtractionResult(operationName, result) {
    if (!result.success) return;

    let extractedData = [];
    
    if (result.attributes) {
      extractedData = result.attributes;
    } else if (result.texts) {
      extractedData = result.texts;
    } else if (result.exists) {
      extractedData = [result.exists];
    }

    // 根据操作类型存储数据
    switch (operationName) {
      case 'extractPostLinks':
        this.tempData = this.tempData || {};
        this.tempData.postLinks = extractedData;
        break;
      case 'extractAuthorNames':
        this.tempData = this.tempData || {};
        this.tempData.authorNames = extractedData;
        break;
      case 'extractAuthorLinks':
        this.tempData = this.tempData || {};
        this.tempData.authorLinks = extractedData;
        break;
      case 'extractPostTimes':
        this.tempData = this.tempData || {};
        this.tempData.postTimes = extractedData;
        break;
      case 'extractPostContents':
        this.tempData = this.tempData || {};
        this.tempData.postContents = extractedData;
        break;
    }

    // 尝试组合数据
    this.tryCombinePostData();
  }

  /**
   * 尝试组合帖子数据
   */
  tryCombinePostData() {
    if (!this.tempData) return;

    const { postLinks, authorNames, authorLinks, postTimes, postContents } = this.tempData;
    
    if (!postLinks || postLinks.length === 0) return;

    const maxLength = Math.max(
      postLinks.length,
      authorNames ? authorNames.length : 0,
      authorLinks ? authorLinks.length : 0,
      postTimes ? postTimes.length : 0,
      postContents ? postContents.length : 0
    );

    for (let i = 0; i < maxLength; i++) {
      const postLink = postLinks[i];
      if (!postLink) continue;

      const postId = this.extractPostId(postLink);
      if (!postId) continue;

      // 检查是否已存在
      const existingPost = this.results.posts.find(p => p.postId === postId);
      if (existingPost) continue;

      const post = {
        postId: postId,
        postUrl: postLink,
        authorName: (authorNames && authorNames[i]) ? authorNames[i].trim() : null,
        authorUrl: (authorLinks && authorLinks[i]) ? authorLinks[i] : null,
        postTime: (postTimes && postTimes[i]) ? postTimes[i].trim() : null,
        postContent: (postContents && postContents[i]) ? postContents[i].trim().substring(0, 200) : null,
        extractedAt: new Date().toISOString()
      };

      // 验证数据
      if (this.validatePost(post)) {
        this.results.posts.push(post);
      }
    }

    // 限制数量
    if (this.results.posts.length > this.config.workflow.maxPosts) {
      this.results.posts = this.results.posts.slice(0, this.config.workflow.maxPosts);
    }
  }

  /**
   * 提取帖子ID
   */
  extractPostId(postUrl) {
    const match = postUrl.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * 验证帖子数据
   */
  validatePost(post) {
    return post.postId && post.postUrl && post.authorName && post.postTime;
  }

  /**
   * 处理最终结果
   */
  async processResults() {
    // 更新元数据
    this.results.metadata.totalPosts = this.results.posts.length;
    this.results.metadata.extractedAt = new Date().toISOString();

    // 应用过滤规则
    this.applyFilters();

    // 应用排序
    this.applySorting();
  }

  /**
   * 应用过滤器
   */
  applyFilters() {
    const filtering = this.config.dataProcessing.filtering;

    // 去重
    if (filtering.removeDuplicates) {
      const uniquePosts = [];
      const seen = new Set();
      
      for (const post of this.results.posts) {
        const key = filtering.uniqueBy.map(field => post[field]).join('|');
        if (!seen.has(key)) {
          seen.add(key);
          uniquePosts.push(post);
        }
      }
      
      this.results.posts = uniquePosts;
    }

    // 限制数量
    if (filtering.maxItems) {
      this.results.posts = this.results.posts.slice(0, filtering.maxItems);
    }
  }

  /**
   * 应用排序
   */
  applySorting() {
    const filtering = this.config.dataProcessing.filtering;
    
    if (filtering.sortBy) {
      this.results.posts.sort((a, b) => {
        const aVal = a[filtering.sortBy];
        const bVal = b[filtering.sortBy];
        
        if (filtering.sortOrder === 'desc') {
          return bVal > aVal ? 1 : -1;
        } else {
          return aVal > bVal ? 1 : -1;
        }
      });
    }
  }

  /**
   * 保存结果到文件
   */
  async saveToFile(filename = null) {
    const fs = require('fs').promises;
    const path = require('path');
    
    const outputFile = filename || this.config.output.filename;
    const outputPath = path.join('./results', outputFile);
    
    // 确保目录存在
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    const outputData = {
      metadata: this.results.metadata,
      posts: this.results.posts
    };

    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`📁 结果已保存到: ${outputPath}`);
    
    return outputPath;
  }

  /**
   * 获取结果
   */
  getResults() {
    return {
      success: true,
      posts: this.results.posts,
      metadata: this.results.metadata
    };
  }

  /**
   * 重置工作流
   */
  reset() {
    this.results = {
      posts: [],
      metadata: {
        workflowName: this.config.workflow.name,
        version: this.config.workflow.version,
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        targetUrl: this.config.workflow.targetUrl
      }
    };
    this.tempData = {};
    this.currentStep = 0;
  }
}

module.exports = {
  WeiboHomepagePostsExtractionWorkflow,
  WeiboHomepagePostsExtractionWorkflowExecutor
};