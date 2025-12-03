/**
 * 微博主页工作流
 * 基于 BaseWorkflow 和原子操作子模式
 */

const BaseWorkflow = require('../core/base-workflow.js.cjs');
const BaseAtomicOperation = require('../core/atomic-operations/base-atomic-operation.js.cjs');
const {
  NavigateOperation,
  WaitForNavigationOperation
} = require('../core/atomic-operations/navigation-operations.js.cjs');

/**
 * 微博主页工作流
 * 提取微博主页的热门帖子和推荐内容
 */
class WeiboHomepageWorkflow extends BaseWorkflow {
  constructor(config = {}) {
    super({
      name: 'weibo-homepage',
      version: '1.0.0',
      description: '微博主页热门帖子提取工作流',
      timeout: 120000,
      maxRetries: 3,
      category: 'weibo',
      targetUrl: 'https://weibo.com',
      maxPosts: 50,
      ...config
    });
  }

  /**
   * 注册原子操作
   */
  async registerAtomicOperations() {
    console.log('📝 注册微博主页原子操作...');

    // 导航相关操作
    this.registerAtomicOperation('navigate', new NavigateOperation({
      timeout: this.config.timeout
    }));

    this.registerAtomicOperation('waitForNavigation', new WaitForNavigationOperation({
      timeout: this.config.timeout
    }));

    // 微博专用导航操作
    this.registerAtomicOperation('weiboNavigate', new WeiboNavigateOperation({
      timeout: this.config.timeout
    }));

    // 数据提取操作
    this.registerAtomicOperation('extractPostLinks', new ExtractPostLinksOperation({
      maxPosts: this.config.maxPosts
    }));

    this.registerAtomicOperation('extractAuthorInfo', new ExtractAuthorInfoOperation());

    this.registerAtomicOperation('extractPostContent', new ExtractPostContentOperation());

    this.registerAtomicOperation('extractPostTime', new ExtractPostTimeOperation());

    // 页面交互操作
    this.registerAtomicOperation('scrollToLoadMore', new ScrollToLoadMoreOperation());

    this.registerAtomicOperation('clickLoadMore', new ClickLoadMoreOperation());

    // 验证操作
    this.registerAtomicOperation('validatePage', new ValidatePageOperation());

    this.registerAtomicOperation('validatePosts', new ValidatePostsOperation());

    console.log('✅ 微博主页原子操作注册完成');
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(options = {}) {
    console.log('🔧 开始执行微博主页工作流...');

    const results = {
      posts: [],
      metadata: {
        workflowName: this.config.name,
        version: this.config.version,
        targetUrl: this.config.targetUrl,
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        executionTime: 0
      }
    };

    try {
      // 步骤1: 导航到微博主页
      await this.stepNavigateToHomepage();

      // 步骤2: 验证页面
      await this.stepValidatePage();

      // 步骤3: 提取初始帖子
      await this.stepExtractInitialPosts(results);

      // 步骤4: 加载更多帖子
      await this.stepLoadMorePosts(results);

      // 步骤5: 验证结果
      await this.stepValidateResults(results);

      // 步骤6: 处理和保存数据
      await this.stepProcessResults(results);

      console.log(`✅ 微博主页工作流执行完成，共提取 ${results.posts.length} 条帖子`);

      return results;

    } catch (error) {
      console.error('❌ 微博主页工作流执行失败:', error);
      throw error;
    }
  }

  /**
   * 步骤1: 导航到微博主页
   */
  async stepNavigateToHomepage() {
    console.log('📋 步骤1: 导航到微博主页...');

    // 使用微博专用导航
    const result = await this.executeAtomicOperation('weiboNavigate', {
      url: this.config.targetUrl,
      options: {
        waitForContent: true,
        maxScrollAttempts: 2
      }
    });

    this.setSharedData('navigationResult', result);
    return result;
  }

  /**
   * 步骤2: 验证页面
   */
  async stepValidatePage() {
    console.log('📋 步骤2: 验证页面状态...');

    const result = await this.executeAtomicOperation('validatePage');

    if (!result.success) {
      throw new Error('页面验证失败');
    }

    this.setSharedData('pageValidation', result);
    return result;
  }

  /**
   * 步骤3: 提取初始帖子
   */
  async stepExtractInitialPosts(results) {
    console.log('📋 步骤3: 提取初始帖子...');

    // 提取帖子链接
    const linksResult = await this.executeAtomicOperation('extractPostLinks');

    // 提取作者信息
    const authorsResult = await this.executeAtomicOperation('extractAuthorInfo');

    // 提取帖子内容
    const contentResult = await this.executeAtomicOperation('extractPostContent');

    // 提取发布时间
    const timeResult = await this.executeAtomicOperation('extractPostTime');

    // 组合数据
    const combinedPosts = this.combinePostData(
      linksResult.result || [],
      authorsResult.result || [],
      contentResult.result || [],
      timeResult.result || []
    );

    results.posts = combinedPosts;
    this.setSharedData('initialPosts', combinedPosts);

    return combinedPosts;
  }

  /**
   * 步骤4: 加载更多帖子
   */
  async stepLoadMorePosts(results) {
    console.log('📋 步骤4: 加载更多帖子...');

    const maxPosts = this.config.maxPosts || 50;
    let attempts = 0;
    const maxAttempts = 5;

    while (results.posts.length < maxPosts && attempts < maxAttempts) {
      console.log(`🔄 当前帖子数: ${results.posts.length}, 目标: ${maxPosts}`);

      // 尝试点击加载更多
      const loadMoreResult = await this.executeAtomicOperation('clickLoadMore');

      if (!loadMoreResult.success) {
        // 如果点击失败，尝试滚动加载
        await this.executeAtomicOperation('scrollToLoadMore');
      }

      // 等待新内容加载
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 提取新增的帖子
      const newPosts = await this.extractNewPosts(results.posts);

      if (newPosts.length > 0) {
        results.posts.push(...newPosts);
        console.log(`📥 新增 ${newPosts.length} 条帖子`);
      } else {
        console.log('⚠️ 未发现新帖子，停止加载');
        break;
      }

      attempts++;
    }

    return results.posts;
  }

  /**
   * 步骤5: 验证结果
   */
  async stepValidateResults(results) {
    console.log('📋 步骤5: 验证提取结果...');

    const validation = await this.executeAtomicOperation('validatePosts', {
      posts: results.posts
    });

    if (!validation.success) {
      console.warn('⚠️ 帖子验证警告:', validation.warnings);
    }

    results.metadata.validation = validation;
    return validation;
  }

  /**
   * 步骤6: 处理和保存数据
   */
  async stepProcessResults(results) {
    console.log('📋 步骤6: 处理和保存数据...');

    // 去重
    results.posts = this.removeDuplicates(results.posts);

    // 限制数量
    if (results.posts.length > this.config.maxPosts) {
      results.posts = results.posts.slice(0, this.config.maxPosts);
    }

    // 更新元数据
    results.metadata.totalPosts = results.posts.length;
    results.metadata.extractedAt = new Date().toISOString();
    results.metadata.executionTime = Date.now() - this.state.startTime;

    // 保存到共享数据
    this.setSharedData('finalResults', results);

    return results;
  }

  /**
   * 组合帖子数据
   */
  combinePostData(links, authors, contents, times) {
    const posts = [];
    const maxLength = Math.max(links.length, authors.length, contents.length, times.length);

    for (let i = 0; i < maxLength; i++) {
      const post = {
        id: this.extractPostId(links[i]) || `post-${i}`,
        url: links[i] || '',
        author: authors[i] || '',
        content: contents[i] || '',
        time: times[i] || '',
        extractedAt: new Date().toISOString()
      };

      // 验证必要字段
      if (post.id && post.url) {
        posts.push(post);
      }
    }

    return posts;
  }

  /**
   * 提取帖子ID
   */
  extractPostId(url) {
    if (!url) return null;
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * 提取新帖子
   */
  async extractNewPosts(existingPosts) {
    const existingIds = new Set(existingPosts.map(p => p.id));

    // 提取当前页面的所有帖子
    const linksResult = await this.executeAtomicOperation('extractPostLinks');
    const authorsResult = await this.executeAtomicOperation('extractAuthorInfo');
    const contentResult = await this.executeAtomicOperation('extractPostContent');
    const timeResult = await this.executeAtomicOperation('extractPostTime');

    const allPosts = this.combinePostData(
      linksResult.result || [],
      authorsResult.result || [],
      contentResult.result || [],
      timeResult.result || []
    );

    // 过滤出新帖子
    const newPosts = allPosts.filter(post => !existingIds.has(post.id));

    return newPosts;
  }

  /**
   * 去重
   */
  removeDuplicates(posts) {
    const seen = new Set();
    return posts.filter(post => {
      const key = post.id;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

// 微博专用原子操作
class WeiboNavigateOperation extends BaseAtomicOperation {
  async execute(context, params) {
    const { url, options = {} } = params;

    console.log(`🚀 微博专用导航: ${url}`);

    // 基础导航
    await context.page.goto(url, {
      waitUntil: 'networkidle',
      timeout: this.config.timeout
    });

    // 智能等待内容加载
    if (options.waitForContent) {
      await this.waitForWeiboContent(context.page, options);
    }

    console.log('✅ 微博导航完成');

    return {
      success: true,
      url,
      title: await context.page.title()
    };
  }

  async waitForWeiboContent(page, options) {
    const maxAttempts = options.maxScrollAttempts || 3;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        // 等待关键元素
        await page.waitForSelector('[class*="Feed_body"], .feed-item, .card', {
          timeout: 5000,
          state: 'attached'
        });

        // 智能滚动
        await page.evaluate(() => {
          window.scrollTo(0, window.innerHeight / 2);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('✅ 微博内容加载完成');
        return;

      } catch (error) {
        attempts++;
        console.log(`⚠️ 内容加载尝试 ${attempts}/${maxAttempts}`);
      }
    }
  }
}

// 数据提取原子操作
class ExtractPostLinksOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🔍 提取帖子链接...');

    const links = await context.page.$$eval(
      'a[href*="/status/"]',
      elements => elements.map(el => el.href)
        .filter(href => href && href.includes('/status/'))
        .filter((href, index, self) => self.indexOf(href) === index) // 去重
    );

    console.log(`📥 找到 ${links.length} 个帖子链接`);

    return {
      success: true,
      result: links
    };
  }
}

class ExtractAuthorInfoOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('👤 提取作者信息...');

    const authors = await context.page.$$eval(
      '[class*="author"], .username, .nickname',
      elements => elements.map(el => el.textContent?.trim() || '')
        .filter(text => text.length > 0)
    );

    console.log(`📥 找到 ${authors.length} 个作者信息`);

    return {
      success: true,
      result: authors
    };
  }
}

class ExtractPostContentOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📝 提取帖子内容...');

    const contents = await context.page.$$eval(
      '[class*="content"], .text, .feed-text',
      elements => elements.map(el => el.textContent?.trim() || '')
        .filter(text => text.length > 0)
    );

    console.log(`📥 找到 ${contents.length} 条帖子内容`);

    return {
      success: true,
      result: contents
    };
  }
}

class ExtractPostTimeOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('⏰ 提取发布时间...');

    const times = await context.page.$$eval(
      '[class*="time"], .timestamp, .date',
      elements => elements.map(el => el.textContent?.trim() || '')
        .filter(text => text.length > 0)
    );

    console.log(`📥 找到 ${times.length} 个时间信息`);

    return {
      success: true,
      result: times
    };
  }
}

// 页面交互原子操作
class ScrollToLoadMoreOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📜 滚动加载更多内容...');

    await context.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    return {
      success: true
    };
  }
}

class ClickLoadMoreOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🖱️ 点击加载更多...');

    try {
      const button = await context.page.$('.load-more, .more-button, [class*="more"]');
      if (button) {
        await button.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { success: true };
      } else {
        return { success: false, message: '未找到加载更多按钮' };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

// 验证原子操作
class ValidatePageOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🔍 验证页面状态...');

    const title = await context.page.title();
    const url = context.page.url();

    // 检查是否包含错误信息
    if (title.includes('404') || title.includes('错误')) {
      return {
        success: false,
        message: `页面标题异常: ${title}`
      };
    }

    // 检查是否有主要内容
    const hasContent = await context.page.$('[class*="Feed_body"], .feed-item, .card');
    if (!hasContent) {
      return {
        success: false,
        message: '未找到微博内容区域'
      };
    }

    return {
      success: true,
      url,
      title
    };
  }
}

class ValidatePostsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🔍 验证帖子数据...');

    const { posts } = params;
    const warnings = [];

    // 检查帖子数量
    if (posts.length === 0) {
      warnings.push('未提取到任何帖子');
    }

    // 检查帖子数据完整性
    posts.forEach((post, index) => {
      if (!post.id) warnings.push(`帖子 ${index} 缺少ID`);
      if (!post.url) warnings.push(`帖子 ${index} 缺少URL`);
      if (!post.author) warnings.push(`帖子 ${index} 缺少作者信息`);
    });

    return {
      success: warnings.length === 0,
      warnings,
      validatedPosts: posts.length
    };
  }
}

module.exports = {
  WeiboHomepageWorkflow,
  WorkflowClass: WeiboHomepageWorkflow,
  config: {
    name: 'weibo-homepage',
    version: '1.0.0',
    description: '微博主页热门帖子提取工作流',
    category: 'weibo',
    targetUrl: 'https://weibo.com',
    maxPosts: 50,
    timeout: 120000,
    tags: ['weibo', 'homepage', 'extraction'],
    author: 'Weibo Workflow System'
  }
};