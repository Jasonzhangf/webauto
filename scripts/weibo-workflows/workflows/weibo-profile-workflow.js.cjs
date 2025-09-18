/**
 * 微博个人主页工作流
 * 基于 BaseWorkflow 和原子操作子模式
 */

const BaseWorkflow = require('../core/base-workflow.js.cjs');
const BaseAtomicOperation = require('../core/atomic-operations/base-atomic-operation.js.cjs');
const {
  NavigateOperation,
  WaitForNavigationOperation
} = require('../core/atomic-operations/navigation-operations.js.cjs');

/**
 * 微博个人主页工作流
 * 提取用户个人主页的帖子和用户信息
 */
class WeiboProfileWorkflow extends BaseWorkflow {
  constructor(config = {}) {
    super({
      name: 'weibo-profile',
      version: '1.0.0',
      description: '微博个人主页帖子和用户信息提取工作流',
      timeout: 120000,
      maxRetries: 3,
      category: 'weibo',
      maxPosts: 100,
      includeUserInfo: true,
      includeTimeline: true,
      ...config
    });
  }

  /**
   * 注册原子操作
   */
  async registerAtomicOperations() {
    console.log('📝 注册微博个人主页原子操作...');

    // 导航相关操作
    this.registerAtomicOperation('navigate', new NavigateOperation({
      timeout: this.config.timeout
    }));

    this.registerAtomicOperation('waitForNavigation', new WaitForNavigationOperation({
      timeout: this.config.timeout
    }));

    // 微博个人主页专用操作
    this.registerAtomicOperation('navigateToProfile', new NavigateToProfileOperation({
      timeout: this.config.timeout
    }));

    // 用户信息提取操作
    this.registerAtomicOperation('extractUserInfo', new ExtractUserInfoOperation());

    this.registerAtomicOperation('extractUserStats', new ExtractUserStatsOperation());

    // 帖子提取操作
    this.registerAtomicOperation('extractProfilePosts', new ExtractProfilePostsOperation({
      maxPosts: this.config.maxPosts
    }));

    this.registerAtomicOperation('extractPostDetails', new ExtractPostDetailsOperation());

    // 时间线操作
    this.registerAtomicOperation('navigateTimeline', new NavigateTimelineOperation());

    this.registerAtomicOperation('extractTimelineData', new ExtractTimelineDataOperation());

    // 验证操作
    this.registerAtomicOperation('validateProfile', new ValidateProfileOperation());

    this.registerAtomicOperation('validatePosts', new ValidatePostsOperation());

    console.log('✅ 微博个人主页原子操作注册完成');
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(options = {}) {
    console.log('🔧 开始执行微博个人主页工作流...');

    const profileUrl = options.profileUrl || this.config.profileUrl;
    if (!profileUrl) {
      throw new Error('缺少个人主页URL参数');
    }

    const results = {
      userInfo: {},
      posts: [],
      timeline: [],
      metadata: {
        workflowName: this.config.name,
        version: this.config.version,
        profileUrl: profileUrl,
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        executionTime: 0
      }
    };

    try {
      // 步骤1: 导航到个人主页
      await this.stepNavigateToProfile(profileUrl);

      // 步骤2: 验证个人主页
      await this.stepValidateProfile();

      // 步骤3: 提取用户信息
      if (this.config.includeUserInfo) {
        await this.stepExtractUserInfo(results);
      }

      // 步骤4: 提取帖子列表
      await this.stepExtractPosts(results);

      // 步骤5: 提取时间线数据
      if (this.config.includeTimeline) {
        await this.stepExtractTimeline(results);
      }

      // 步骤6: 验证结果
      await this.stepValidateResults(results);

      // 步骤7: 处理和保存数据
      await this.stepProcessResults(results);

      console.log(`✅ 微博个人主页工作流执行完成，共提取 ${results.posts.length} 条帖子`);

      return results;

    } catch (error) {
      console.error('❌ 微博个人主页工作流执行失败:', error);
      throw error;
    }
  }

  /**
   * 步骤1: 导航到个人主页
   */
  async stepNavigateToProfile(profileUrl) {
    console.log('📋 步骤1: 导航到个人主页...');

    const result = await this.executeAtomicOperation('navigateToProfile', {
      url: profileUrl,
      options: {
        waitForContent: true,
        maxScrollAttempts: 2
      }
    });

    this.setSharedData('profileUrl', profileUrl);
    this.setSharedData('navigationResult', result);
    return result;
  }

  /**
   * 步骤2: 验证个人主页
   */
  async stepValidateProfile() {
    console.log('📋 步骤2: 验证个人主页...');

    const result = await this.executeAtomicOperation('validateProfile');

    if (!result.success) {
      throw new Error('个人主页验证失败');
    }

    this.setSharedData('profileValidation', result);
    return result;
  }

  /**
   * 步骤3: 提取用户信息
   */
  async stepExtractUserInfo(results) {
    console.log('📋 步骤3: 提取用户信息...');

    // 提取基本信息
    const userInfoResult = await this.executeAtomicOperation('extractUserInfo');
    results.userInfo = { ...results.userInfo, ...userInfoResult.result };

    // 提取统计数据
    const userStatsResult = await this.executeAtomicOperation('extractUserStats');
    results.userInfo.stats = userStatsResult.result;

    this.setSharedData('userInfo', results.userInfo);
    return results.userInfo;
  }

  /**
   * 步骤4: 提取帖子列表
   */
  async stepExtractPosts(results) {
    console.log('📋 步骤4: 提取帖子列表...');

    // 提取帖子基本信息
    const postsResult = await this.executeAtomicOperation('extractProfilePosts');
    results.posts = postsResult.result || [];

    // 提取帖子详细信息
    const detailedPosts = await this.extractPostDetails(results.posts);
    results.posts = detailedPosts;

    this.setSharedData('posts', results.posts);
    return results.posts;
  }

  /**
   * 步骤5: 提取时间线数据
   */
  async stepExtractTimeline(results) {
    console.log('📋 步骤5: 提取时间线数据...');

    try {
      // 导航到时间线
      await this.executeAtomicOperation('navigateTimeline');

      // 提取时间线数据
      const timelineResult = await this.executeAtomicOperation('extractTimelineData');
      results.timeline = timelineResult.result || [];

      this.setSharedData('timeline', results.timeline);
      return results.timeline;

    } catch (error) {
      console.warn('⚠️ 时间线数据提取失败:', error.message);
      results.timeline = [];
      return results.timeline;
    }
  }

  /**
   * 步骤6: 验证结果
   */
  async stepValidateResults(results) {
    console.log('📋 步骤6: 验证提取结果...');

    const validation = await this.executeAtomicOperation('validatePosts', {
      posts: results.posts,
      userInfo: results.userInfo
    });

    if (!validation.success) {
      console.warn('⚠️ 个人主页数据验证警告:', validation.warnings);
    }

    results.metadata.validation = validation;
    return validation;
  }

  /**
   * 步骤7: 处理和保存数据
   */
  async stepProcessResults(results) {
    console.log('📋 步骤7: 处理和保存数据...');

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

    // 添加用户信息到元数据
    if (results.userInfo.username) {
      results.metadata.username = results.userInfo.username;
    }

    // 保存到共享数据
    this.setSharedData('finalResults', results);

    return results;
  }

  /**
   * 提取帖子详细信息
   */
  async extractPostDetails(posts) {
    const detailedPosts = [];

    for (const post of posts) {
      try {
        const detailsResult = await this.executeAtomicOperation('extractPostDetails', {
          post
        });

        detailedPosts.push({
          ...post,
          ...detailsResult.result,
          extractedAt: new Date().toISOString()
        });

      } catch (error) {
        console.warn(`⚠️ 提取帖子详情失败: ${post.id}`, error.message);
        detailedPosts.push({
          ...post,
          extractedAt: new Date().toISOString()
        });
      }
    }

    return detailedPosts;
  }

  /**
   * 去重
   */
  removeDuplicates(posts) {
    const seen = new Set();
    return posts.filter(post => {
      const key = post.id || post.url;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

// 微博个人主页专用原子操作
class NavigateToProfileOperation extends BaseAtomicOperation {
  async execute(context, params) {
    const { url, options = {} } = params;

    console.log(`🚀 导航到个人主页: ${url}`);

    // 验证URL格式
    if (!this.isValidProfileUrl(url)) {
      throw new Error(`无效的个人主页URL: ${url}`);
    }

    // 导航到页面
    await context.page.goto(url, {
      waitUntil: 'networkidle',
      timeout: this.config.timeout
    });

    // 等待个人主页内容加载
    await this.waitForProfileContent(context.page, options);

    console.log('✅ 个人主页导航完成');

    return {
      success: true,
      url,
      title: await context.page.title()
    };
  }

  isValidProfileUrl(url) {
    return url.includes('weibo.com/u/') ||
           url.includes('weibo.com/') &&
           !url.includes('/status/') &&
           !url.includes('/search/');
  }

  async waitForProfileContent(page, options) {
    const maxAttempts = options.maxScrollAttempts || 3;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        // 等待个人主页关键元素
        await page.waitForSelector('[class*="profile"], [class*="userinfo"], .profile_header', {
          timeout: 5000,
          state: 'attached'
        });

        // 智能滚动
        await page.evaluate(() => {
          window.scrollTo(0, window.innerHeight / 2);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('✅ 个人主页内容加载完成');
        return;

      } catch (error) {
        attempts++;
        console.log(`⚠️ 个人主页内容加载尝试 ${attempts}/${maxAttempts}`);
      }
    }
  }
}

// 用户信息提取原子操作
class ExtractUserInfoOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('👤 提取用户基本信息...');

    const userInfo = await context.page.evaluate(() => {
      // 尝试多种选择器
      const selectors = {
        username: [
          '.username',
          '.nickname',
          '[class*="username"]',
          '[class*="nickname"]',
          'h1',
          '.profile_name'
        ],
        description: [
          '.description',
          '.bio',
          '[class*="description"]',
          '[class*="intro"]',
          '.profile_intro'
        ],
        location: [
          '.location',
          '[class*="location"]',
          '.place',
          '.address'
        ],
        avatar: [
          '.avatar img',
          '[class*="avatar"] img',
          '.profile_pic img'
        ]
      };

      const extractText = (selectorList) => {
        for (const selector of selectorList) {
          const element = document.querySelector(selector);
          if (element) {
            return element.textContent?.trim() || '';
          }
        }
        return '';
      };

      const extractAttribute = (selectorList, attribute) => {
        for (const selector of selectorList) {
          const element = document.querySelector(selector);
          if (element) {
            return element.getAttribute(attribute) || '';
          }
        }
        return '';
      };

      return {
        username: extractText(selectors.username),
        description: extractText(selectors.description),
        location: extractText(selectors.location),
        avatar: extractAttribute(selectors.avatar, 'src'),
        extractedAt: new Date().toISOString()
      };
    });

    console.log(`📥 用户信息提取完成: ${userInfo.username || 'Unknown'}`);

    return {
      success: true,
      result: userInfo
    };
  }
}

class ExtractUserStatsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📊 提取用户统计数据...');

    const stats = await context.page.evaluate(() => {
      const extractNumber = (text) => {
        if (!text) return 0;
        const match = text.match(/[\d,]+/);
        return match ? parseInt(match[0].replace(/,/g, '')) : 0;
      };

      const selectors = {
        followers: [
          '.followers [class*="count"]',
          '[class*="follower"] [class*="count"]',
          '.follow_count',
          '.fans_count'
        ],
        following: [
          '.following [class*="count"]',
          '[class*="following"] [class*="count"]',
          '.friend_count'
        ],
        posts: [
          '.posts [class*="count"]',
          '[class*="post"] [class*="count"]',
          '.weibo_count'
        ]
      };

      const extractStat = (selectorList) => {
        for (const selector of selectorList) {
          const element = document.querySelector(selector);
          if (element) {
            return extractNumber(element.textContent);
          }
        }
        return 0;
      };

      return {
        followers: extractStat(selectors.followers),
        following: extractStat(selectors.following),
        posts: extractStat(selectors.posts),
        extractedAt: new Date().toISOString()
      };
    });

    console.log(`📥 用户统计数据: ${stats.posts} 帖子, ${stats.followers} 粉丝, ${stats.following} 关注`);

    return {
      success: true,
      result: stats
    };
  }
}

// 帖子提取原子操作
class ExtractProfilePostsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📝 提取个人主页帖子...');

    const posts = await context.page.evaluate(() => {
      const postElements = document.querySelectorAll('[class*="Feed_body"], .feed-item, .card');
      const posts = [];

      postElements.forEach((element, index) => {
        try {
          // 提取帖子链接
          const linkElement = element.querySelector('a[href*="/status/"]');
          const link = linkElement ? linkElement.href : '';

          // 提取帖子内容
          const contentElement = element.querySelector('[class*="content"], .text, .feed-text');
          const content = contentElement ? contentElement.textContent.trim() : '';

          // 提取时间
          const timeElement = element.querySelector('[class*="time"], .timestamp, .date');
          const time = timeElement ? timeElement.textContent.trim() : '';

          // 提取互动数据
          const statsElement = element.querySelector('[class*="stats"], .interaction');
          const stats = statsElement ? statsElement.textContent : '';

          posts.push({
            id: link ? link.match(/\/status\/(\d+)/)?.[1] || `post-${index}` : `post-${index}`,
            url: link,
            content: content.substring(0, 200), // 限制内容长度
            time: time,
            stats: stats,
            index: index
          });
        } catch (error) {
          console.warn(`帖子 ${index} 提取失败:`, error);
        }
      });

      return posts;
    });

    console.log(`📥 找到 ${posts.length} 条个人主页帖子`);

    return {
      success: true,
      result: posts
    };
  }
}

class ExtractPostDetailsOperation extends BaseAtomicOperation {
  async execute(context, params) {
    const { post } = params;

    if (!post || !post.url) {
      return {
        success: false,
        result: {}
      };
    }

    // 如果需要更详细的信息，可以在这里实现
    // 目前返回基本信息
    return {
      success: true,
      result: {
        id: post.id,
        url: post.url,
        content: post.content,
        time: post.time,
        stats: post.stats || {}
      }
    };
  }
}

// 时间线相关原子操作
class NavigateTimelineOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📅 导航到时间线...');

    try {
      // 查找时间线标签或链接
      const timelineButton = await context.page.$('a[href*="timeline"], [class*="timeline"], .timeline_tab');
      if (timelineButton) {
        await timelineButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}

class ExtractTimelineDataOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('📊 提取时间线数据...');

    const timeline = await context.page.evaluate(() => {
      const timelineElements = document.querySelectorAll('[class*="timeline"], .time-posts');
      const data = [];

      timelineElements.forEach((element, index) => {
        try {
          const timeElement = element.querySelector('[class*="time"], .timestamp');
          const contentElement = element.querySelector('[class*="content"], .text');

          data.push({
            time: timeElement ? timeElement.textContent.trim() : '',
            content: contentElement ? contentElement.textContent.trim() : '',
            index: index
          });
        } catch (error) {
          console.warn(`时间线 ${index} 提取失败:`, error);
        }
      });

      return data;
    });

    console.log(`📥 提取 ${timeline.length} 条时间线数据`);

    return {
      success: true,
      result: timeline
    };
  }
}

// 验证原子操作
class ValidateProfileOperation extends BaseAtomicOperation {
  async execute(context, params) {
    console.log('🔍 验证个人主页...');

    const title = await context.page.title();
    const url = context.page.url();

    // 检查是否包含错误信息
    if (title.includes('404') || title.includes('错误') || title.includes('不存在')) {
      return {
        success: false,
        message: `个人主页不存在: ${title}`
      };
    }

    // 检查是否有个人主页元素
    const hasProfile = await context.page.$('[class*="profile"], [class*="userinfo"], .profile_header');
    if (!hasProfile) {
      return {
        success: false,
        message: '未找到个人主页元素'
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

    const { posts, userInfo } = params;
    const warnings = [];

    // 检查帖子数量
    if (posts.length === 0) {
      warnings.push('未提取到任何帖子');
    }

    // 检查帖子数据完整性
    posts.forEach((post, index) => {
      if (!post.id) warnings.push(`帖子 ${index} 缺少ID`);
      if (!post.url) warnings.push(`帖子 ${index} 缺少URL`);
      if (!post.content) warnings.push(`帖子 ${index} 缺少内容`);
    });

    // 检查用户信息
    if (userInfo && !userInfo.username) {
      warnings.push('用户信息缺少用户名');
    }

    return {
      success: warnings.length === 0,
      warnings,
      validatedPosts: posts.length,
      hasUserInfo: !!userInfo.username
    };
  }
}

module.exports = {
  WeiboProfileWorkflow,
  WorkflowClass: WeiboProfileWorkflow,
  config: {
    name: 'weibo-profile',
    version: '1.0.0',
    description: '微博个人主页帖子和用户信息提取工作流',
    category: 'weibo',
    maxPosts: 100,
    includeUserInfo: true,
    includeTimeline: true,
    timeout: 120000,
    tags: ['weibo', 'profile', 'user', 'extraction'],
    author: 'Weibo Workflow System'
  }
};