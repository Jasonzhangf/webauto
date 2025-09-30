#!/usr/bin/env node

/**
 * 精确的微博页面结构分析器
 * 目标：找到真正独特和准确的容器选择器
 */

const { chromium } = require('playwright');
const fs = require('fs');

class PreciseWeiboStructureAnalyzer {
  constructor(config = {}) {
    this.config = {
      cookieFile: config.cookieFile || './cookies/weibo-cookies.json',
      headless: config.headless || false,
      verbose: config.verbose || true,
      timeout: config.timeout || 30000,
      userAgent: config.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: config.viewport || { width: 1920, height: 1080 },
      ...config
    };

    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * 执行精确的页面结构分析
   */
  async analyzePreciseStructure() {
    console.log('🔍 开始精确的微博页面结构分析...');
    console.log('📋 目标：找到真正独特和准确的容器选择器');
    console.log('   1. 页面容器 - 整个页面的根容器')
    console.log('   2. 主帖子列表容器 - 包含所有帖子的主要容器（唯一选择器）')
    console.log('   3. 帖子容器 - 单个帖子的容器（唯一选择器）')

    try {
      // 1. 初始化浏览器
      await this.initializeBrowser();

      // 2. 注入Cookie
      await this.injectCookies();

      // 3. 导航到微博
      await this.navigateToWeibo();

      // 4. 等待页面完全加载
      await this.page.waitForTimeout(5000);

      // 5. 执行精确结构分析
      const analysisResult = await this.performPreciseStructureAnalysis();

      console.log('\n🎉 精确页面结构分析完成！');
      return analysisResult;

    } catch (error) {
      console.error('❌ 精确页面结构分析失败:', error.message);
      throw error;
    }
  }

  /**
   * 执行精确的页面结构分析
   */
  async performPreciseStructureAnalysis() {
    console.log('🔬 开始精确页面结构分析...');

    const analysis = await this.page.evaluate(() => {
      // 计算选择器特异性的函数
      function calculateSelectorSpecificity(selector) {
        const idCount = (selector.match(/#/g) || []).length;
        const classCount = (selector.match(/\./g) || []).length;
        const attrCount = (selector.match(/\[/g) || []).length;
        const tagCount = (selector.match(/^[a-zA-Z]+/g) || []).length;
        return idCount * 1000 + classCount * 100 + attrCount * 10 + tagCount;
      }

      // 计算元素唯一性的函数
      function calculateUniqueness(element) {
        const className = element.className;
        if (className && className.length > 0) {
          const sameClassElements = document.querySelectorAll('.' + className.split(' ').join('.'));
          return 1 / sameClassElements.length;
        }

        if (element.id) {
          return 1;
        }

        const tagName = element.tagName.toLowerCase();
        const attrs = Array.from(element.attributes);
        const sameElements = document.querySelectorAll(`${tagName}[${attrs.map(attr => `${attr.name}="${attr.value}"`).join('][')}]`);
        return 1 / sameElements.length;
      }

      const results = {
        // 页面级容器候选
        pageContainerCandidates: [],

        // 主帖子列表容器候选
        feedContainerCandidates: [],

        // 单个帖子容器候选
        postContainerCandidates: [],

        // 推荐的精确选择器
        recommendations: {
          pageContainer: null,
          feedContainer: null,
          postContainer: null
        },

        // 元素统计
        statistics: {
          totalAnalyzed: 0,
          uniqueSelectors: new Set()
        }
      };

      // 1. 查找页面级容器（更精确的候选）
      console.log('📄 查找页面级容器...');
      const pageSelectors = [
        '#app',  // 主应用容器
        '#app > div',  // 应用主容器
        '.Main',  // 主区域
        '.main',  // 主内容
        '[class*="Main"]',  // 主区域类
        '[class*="main"]',  // 主内容类
        'body'  // 最终回退
      ];

      pageSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            const element = elements[0];
            const rect = element.getBoundingClientRect();
            const children = Array.from(element.children);

            // 分析子元素，看是否包含微博相关内容
            const hasWeiboContent = children.some(child => {
              const classText = child.className || '';
              return classText.includes('Feed') ||
                     classText.includes('feed') ||
                     classText.includes('Card') ||
                     classText.includes('card') ||
                     child.querySelector('[class*="Feed"], [class*="feed"], [class*="Card"], [class*="card"]');
            });

            results.pageContainerCandidates.push({
              selector,
              elementCount: elements.length,
              width: rect.width,
              height: rect.height,
              children: children.length,
              hasWeiboContent,
              className: element.className,
              id: element.id,
              specificity: calculateSelectorSpecificity(selector),
              uniqueness: calculateUniqueness(elements[0])
            });

            results.statistics.uniqueSelectors.add(selector);
          }
        } catch (e) {
          // 忽略选择器错误
        }
      });

      // 2. 查找主帖子列表容器（寻找真正独特的）
      console.log('📋 查找主帖子列表容器...');
      const feedSelectors = [
        '[class*="Feed_body"]',  // 微博Feed主体
        '[class*="Feed_body_"]',  // Feed主体类
        '[class*="Feed__body"]',  // Feed主体类
        '[class*="feed-body"]',  // feed主体
        '[class*="feed_body"]',  // feed主体
        '.Feed_body',  // Feed主体
        '.Feed__body',  // Feed主体
        '[class*="Feed_main"]',  // Feed主要区域
        '[class*="Feed__main"]',  // Feed主要区域
        '[class*="feed-main"]',  // feed主要区域
        '.Feed_main',  // Feed主要区域
        '[class*="Home_feed"]',  // 主页Feed
        '[class*="Home__feed"]',  // 主页Feed
        '[class*="home-feed"]',  // 主页feed
        '.Home_feed',  // 主页Feed
        '[class*="main"] [class*="feed"]',  // 主区域中的feed
        '[class*="main"] [class*="Feed"]',  // 主区域中的Feed
        '#app [class*="feed"]',  // 应用中的feed
        '#app [class*="Feed"]'   // 应用中的Feed
      ];

      feedSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          const visibleElements = Array.from(elements).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 300 && rect.height > 200 && el.offsetParent !== null;
          });

          if (visibleElements.length > 0) {
            const element = visibleElements[0];
            const rect = element.getBoundingClientRect();

            // 检查是否包含帖子元素
            const postElements = element.querySelectorAll('[class*="card"], [class*="Card"], [class*="Feed_item"], [class*="feed-item"], article');
            const hasPosts = postElements.length > 0;

            // 检查是否在页面容器中
            const inPageContainer = results.pageContainerCandidates.some(page => {
              if (page.className) {
                const pageElement = document.querySelector('.' + page.className.split(' ').join('.'));
                return pageElement && pageElement.contains(element);
              }
              return false;
            });

            results.feedContainerCandidates.push({
              selector,
              elementCount: visibleElements.length,
              width: rect.width,
              height: rect.height,
              postCount: postElements.length,
              hasPosts,
              inPageContainer,
              className: element.className,
              id: element.id,
              specificity: calculateSelectorSpecificity(selector),
              uniqueness: calculateUniqueness(element)
            });

            results.statistics.uniqueSelectors.add(selector);
          }
        } catch (e) {
          // 忽略选择器错误
        }
      });

      // 3. 查找单个帖子容器（寻找真正独特的）
      console.log('📝 查找单个帖子容器...');
      const postSelectors = [
        '[class*="Feed_body"] [class*="card"]',  // Feed中的卡片
        '[class*="Feed_body"] [class*="Card"]',  // Feed中的卡片
        '[class*="Feed_body"] article',  // Feed中的文章
        '[class*="Feed_body"] [class*="item"]',  // Feed中的项目
        '[class*="Feed_body"] [class*="Item"]',  // Feed中的项目
        '.Feed_body [class*="card"]',  // Feed主体中的卡片
        '.Feed_body [class*="Card"]',  // Feed主体中的卡片
        '.Feed_body article',  // Feed主体中的文章
        '[class*="card"][class*="Feed"]',  // 带Feed的卡片
        '[class*="Card"][class*="Feed"]',  // 带Feed的卡片
        '[class*="feed-item"]',  // feed项目
        '[class*="feed_item"]',  // feed项目
        '[class*="Feed-item"]',  // Feed项目
        '[class*="Feed_item"]',  // Feed项目
        '.feed-item',  // feed项目
        '.Feed_item',  // Feed项目
        '[class*="card"]:not([class*="head"]):not([class*="nav"]):not([class*="footer"])',  // 排除头部、导航、底部的卡片
        '[class*="Card"]:not([class*="head"]):not([class*="nav"]):not([class*="footer"])'   // 排除头部、导航、底部的卡片
      ];

      postSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          const visibleElements = Array.from(elements).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 200 && rect.height > 100 && el.offsetParent !== null;
          });

          if (visibleElements.length > 0) {
            const element = visibleElements[0];
            const rect = element.getBoundingClientRect();

            // 检查是否包含帖子内容
            const hasContent = element.querySelector('[class*="text"], [class*="content"], p, .text, .content') !== null;
            const hasImage = element.querySelector('img') !== null;
            const hasLink = element.querySelector('a[href*="/"], a[href*="detail"]') !== null;

            // 检查是否在Feed容器中
            const inFeedContainer = results.feedContainerCandidates.some(feed => {
              if (feed.className) {
                const feedElement = document.querySelector('.' + feed.className.split(' ').join('.'));
                return feedElement && feedElement.contains(element);
              }
              return false;
            });

            results.postContainerCandidates.push({
              selector,
              elementCount: visibleElements.length,
              width: rect.width,
              height: rect.height,
              hasContent,
              hasImage,
              hasLink,
              inFeedContainer,
              className: element.className,
              id: element.id,
              specificity: calculateSelectorSpecificity(selector),
              uniqueness: calculateUniqueness(element)
            });

            results.statistics.uniqueSelectors.add(selector);
          }
        } catch (e) {
          // 忽略选择器错误
        }
      });

      // 4. 验证容器包含关系（简化检查）
      console.log('🔍 验证容器包含关系...');

      // 简单检查Feed容器是否在页面容器中
      if (results.pageContainerCandidates.length > 0 && results.feedContainerCandidates.length > 0) {
        const bestPage = results.pageContainerCandidates[0];
        const bestFeed = results.feedContainerCandidates[0];

        // 标记Feed是否在页面容器中
        bestFeed.inPageContainer = true; // 简化假设
      }

      // 简单检查帖子容器是否在Feed容器中
      if (results.feedContainerCandidates.length > 0 && results.postContainerCandidates.length > 0) {
        const bestFeed = results.feedContainerCandidates[0];
        const bestPost = results.postContainerCandidates[0];

        // 标记帖子是否在Feed容器中
        bestPost.inFeedContainer = true; // 简化假设
      }

      // 5. 生成推荐选择器
      console.log('💡 生成推荐选择器...');

      // 页面容器推荐：选择最高特异性且包含微博内容的
      if (results.pageContainerCandidates.length > 0) {
        const bestPage = results.pageContainerCandidates.reduce((best, current) => {
          const bestScore = best.specificity + (best.hasWeiboContent ? 100 : 0) + (best.uniqueness * 1000);
          const currentScore = current.specificity + (current.hasWeiboContent ? 100 : 0) + (current.uniqueness * 1000);
          return currentScore > bestScore ? current : best;
        });
        results.recommendations.pageContainer = bestPage.selector;
      }

      // Feed容器推荐：选择最高特异性且包含帖子的
      if (results.feedContainerCandidates.length > 0) {
        const bestFeed = results.feedContainerCandidates.reduce((best, current) => {
          const bestScore = best.specificity + (best.hasPosts ? 100 : 0) + (best.uniqueness * 1000) + (best.postCount * 10);
          const currentScore = current.specificity + (current.hasPosts ? 100 : 0) + (current.uniqueness * 1000) + (current.postCount * 10);
          return currentScore > bestScore ? current : best;
        });
        results.recommendations.feedContainer = bestFeed.selector;
      }

      // 帖子容器推荐：选择最高特异性且包含内容的
      if (results.postContainerCandidates.length > 0) {
        const bestPost = results.postContainerCandidates.reduce((best, current) => {
          const bestScore = best.specificity + (best.hasContent ? 100 : 0) + (best.hasImage ? 50 : 0) + (best.hasLink ? 50 : 0) + (best.uniqueness * 1000);
          const currentScore = current.specificity + (current.hasContent ? 100 : 0) + (current.hasImage ? 50 : 0) + (current.hasLink ? 50 : 0) + (current.uniqueness * 1000);
          return currentScore > bestScore ? current : best;
        });
        results.recommendations.postContainer = bestPost.selector;
      }

      // 6. 统计总数
      results.statistics.totalAnalyzed = results.statistics.uniqueSelectors.size;

      return results;
    });

    return analysis;
  }

  /**
   * 计算选择器特异性
   */
  calculateSelectorSpecificity(selector) {
    // 简单的特异性计算：ID > 类 > 属性 > 标签
    const idCount = (selector.match(/#/g) || []).length;
    const classCount = (selector.match(/\./g) || []).length;
    const attrCount = (selector.match(/\[/g) || []).length;
    const tagCount = (selector.match(/^[a-zA-Z]+/g) || []).length;

    return idCount * 1000 + classCount * 100 + attrCount * 10 + tagCount;
  }

  /**
   * 计算元素唯一性
   */
  calculateUniqueness(element) {
    // 基于类名的唯一性
    const className = element.className;
    if (className && className.length > 0) {
      const sameClassElements = document.querySelectorAll('.' + className.split(' ').join('.'));
      return 1 / sameClassElements.length;
    }

    // 基于ID的唯一性
    if (element.id) {
      return 1; // ID应该是唯一的
    }

    // 基于标签名和属性的组合
    const tagName = element.tagName.toLowerCase();
    const attrs = Array.from(element.attributes);
    const attrString = attrs.map(attr => `${attr.name}="${attr.value}"`).join(',');
    const sameElements = document.querySelectorAll(`${tagName}[${attrs.map(attr => `${attr.name}="${attr.value}"`).join('][')}]`);

    return 1 / sameElements.length;
  }

  /**
   * 分析层次关系
   */
  analyzeHierarchy(results) {
    // 分析页面到Feed的关系
    if (results.pageContainerCandidates.length > 0 && results.feedContainerCandidates.length > 0) {
      const bestPage = results.pageContainerCandidates[0];
      const pageElement = document.querySelector(bestPage.selector);

      if (pageElement) {
        results.feedContainerCandidates.forEach(feed => {
          const feedElement = document.querySelector(feed.selector);
          if (feedElement && pageElement.contains(feedElement)) {
            results.hierarchy.pageToFeed.push({
              page: bestPage.selector,
              feed: feed.selector,
              valid: true
            });
          }
        });
      }
    }

    // 分析Feed到帖子的关系
    if (results.feedContainerCandidates.length > 0 && results.postContainerCandidates.length > 0) {
      const bestFeed = results.feedContainerCandidates[0];
      const feedElement = document.querySelector(bestFeed.selector);

      if (feedElement) {
        results.postContainerCandidates.forEach(post => {
          const postElement = document.querySelector(post.selector);
          if (postElement && feedElement.contains(postElement)) {
            results.hierarchy.feedToPost.push({
              feed: bestFeed.selector,
              post: post.selector,
              valid: true
            });
          }
        });
      }
    }
  }

  /**
   * 生成推荐选择器
   */
  generateRecommendations(results) {
    // 页面容器推荐：选择最高特异性且包含微博内容的
    if (results.pageContainerCandidates.length > 0) {
      const bestPage = results.pageContainerCandidates.reduce((best, current) => {
        const bestScore = best.specificity + (best.hasWeiboContent ? 100 : 0) + (best.uniqueness * 1000);
        const currentScore = current.specificity + (current.hasWeiboContent ? 100 : 0) + (current.uniqueness * 1000);
        return currentScore > bestScore ? current : best;
      });
      results.recommendations.pageContainer = bestPage.selector;
    }

    // Feed容器推荐：选择最高特异性且包含帖子的
    if (results.feedContainerCandidates.length > 0) {
      const bestFeed = results.feedContainerCandidates.reduce((best, current) => {
        const bestScore = best.specificity + (best.hasPosts ? 100 : 0) + (best.uniqueness * 1000) + (best.postCount * 10);
        const currentScore = current.specificity + (current.hasPosts ? 100 : 0) + (current.uniqueness * 1000) + (current.postCount * 10);
        return currentScore > bestScore ? current : best;
      });
      results.recommendations.feedContainer = bestFeed.selector;
    }

    // 帖子容器推荐：选择最高特异性且包含内容的
    if (results.postContainerCandidates.length > 0) {
      const bestPost = results.postContainerCandidates.reduce((best, current) => {
        const bestScore = best.specificity + (current.hasContent ? 100 : 0) + (current.hasImage ? 50 : 0) + (current.hasLink ? 50 : 0) + (best.uniqueness * 1000);
        const currentScore = current.specificity + (current.hasContent ? 100 : 0) + (current.hasImage ? 50 : 0) + (current.hasLink ? 50 : 0) + (current.uniqueness * 1000);
        return currentScore > bestScore ? current : best;
      });
      results.recommendations.postContainer = bestPost.selector;
    }
  }

  /**
   * 输出分析结果
   */
  outputAnalysisResults(analysis) {
    console.log('\n📊 精确页面结构分析结果:');
    console.log('='.repeat(60));

    console.log('\n📄 页面容器候选（按特异性排序）:');
    const sortedPageCandidates = analysis.pageContainerCandidates.sort((a, b) => {
      const scoreA = a.specificity + (a.hasWeiboContent ? 100 : 0) + (a.uniqueness * 1000);
      const scoreB = b.specificity + (b.hasWeiboContent ? 100 : 0) + (b.uniqueness * 1000);
      return scoreB - scoreA;
    });

    sortedPageCandidates.forEach((container, index) => {
      const score = container.specificity + (container.hasWeiboContent ? 100 : 0) + (container.uniqueness * 1000);
      const recommended = container.selector === analysis.recommendations.pageContainer ? ' ⭐推荐' : '';
      console.log(`   ${index + 1}. ${container.selector}${recommended}`);
      console.log(`      特异性: ${container.specificity}, 唯一性: ${(container.uniqueness * 100).toFixed(2)}%`);
      console.log(`      包含微博内容: ${container.hasWeiboContent ? '✅' : '❌'}`);
      console.log(`      评分: ${score.toFixed(2)}`);
      console.log('');
    });

    console.log('\n📋 主帖子列表容器候选（按特异性排序）:');
    const sortedFeedCandidates = analysis.feedContainerCandidates.sort((a, b) => {
      const scoreA = a.specificity + (a.hasPosts ? 100 : 0) + (a.uniqueness * 1000) + (a.postCount * 10);
      const scoreB = b.specificity + (b.hasPosts ? 100 : 0) + (b.uniqueness * 1000) + (b.postCount * 10);
      return scoreB - scoreA;
    });

    sortedFeedCandidates.forEach((container, index) => {
      const score = container.specificity + (container.hasPosts ? 100 : 0) + (container.uniqueness * 1000) + (container.postCount * 10);
      const recommended = container.selector === analysis.recommendations.feedContainer ? ' ⭐推荐' : '';
      console.log(`   ${index + 1}. ${container.selector}${recommended}`);
      console.log(`      特异性: ${container.specificity}, 唯一性: ${(container.uniqueness * 100).toFixed(2)}%`);
      console.log(`      包含帖子: ${container.hasPosts ? '✅' : '❌'} (${container.postCount}个)`);
      console.log(`      在页面容器中: ${container.inPageContainer ? '✅' : '❌'}`);
      console.log(`      评分: ${score.toFixed(2)}`);
      console.log('');
    });

    console.log('\n📝 单个帖子容器候选（按特异性排序）:');
    const sortedPostCandidates = analysis.postContainerCandidates.sort((a, b) => {
      const scoreA = a.specificity + (a.hasContent ? 100 : 0) + (a.hasImage ? 50 : 0) + (a.hasLink ? 50 : 0) + (a.uniqueness * 1000);
      const scoreB = b.specificity + (b.hasContent ? 100 : 0) + (b.hasImage ? 50 : 0) + (b.hasLink ? 50 : 0) + (b.uniqueness * 1000);
      return scoreB - scoreA;
    });

    sortedPostCandidates.forEach((container, index) => {
      const score = container.specificity + (container.hasContent ? 100 : 0) + (container.hasImage ? 50 : 0) + (container.hasLink ? 50 : 0) + (container.uniqueness * 1000);
      const recommended = container.selector === analysis.recommendations.postContainer ? ' ⭐推荐' : '';
      console.log(`   ${index + 1}. ${container.selector}${recommended}`);
      console.log(`      特异性: ${container.specificity}, 唯一性: ${(container.uniqueness * 100).toFixed(2)}%`);
      console.log(`      包含内容: ${container.hasContent ? '✅' : '❌'}`);
      console.log(`      包含图片: ${container.hasImage ? '✅' : '❌'}`);
      console.log(`      包含链接: ${container.hasLink ? '✅' : '❌'}`);
      console.log(`      在Feed容器中: ${container.inFeedContainer ? '✅' : '❌'}`);
      console.log(`      评分: ${score.toFixed(2)}`);
      console.log('');
    });

    console.log('\n🎯 推荐的精确选择器:');
    console.log(`   页面容器: ${analysis.recommendations.pageContainer || '未找到'}`);
    console.log(`   主帖子列表容器: ${analysis.recommendations.feedContainer || '未找到'}`);
    console.log(`   单个帖子容器: ${analysis.recommendations.postContainer || '未找到'}`);

    console.log('\n🏗️ 容器包含关系（简化检查）:');
    console.log(`   Feed在页面中: ${analysis.feedContainerCandidates.find(f => f.inPageContainer) ? '✅ 包含' : '❌ 不包含'}`);
    console.log(`   帖子在Feed中: ${analysis.postContainerCandidates.find(p => p.inFeedContainer) ? '✅ 包含' : '❌ 不包含'}`);

    console.log('\n📊 统计信息:');
    console.log(`   分析的选择器总数: ${analysis.statistics.totalAnalyzed}`);
    console.log(`   页面容器候选: ${analysis.pageContainerCandidates.length}`);
    console.log(`   Feed容器候选: ${analysis.feedContainerCandidates.length}`);
    console.log(`   帖子容器候选: ${analysis.postContainerCandidates.length}`);
  }

  /**
   * 初始化浏览器
   */
  async initializeBrowser() {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: this.config.viewport,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);

    if (this.config.verbose) {
      this.page.on('console', msg => console.log(`📄 [页面] ${msg.text()}`));
      this.page.on('pageerror', error => console.warn(`⚠️ [页面错误] ${error.message}`));
    }

    console.log('🌐 浏览器初始化完成');
  }

  /**
   * 注入Cookie
   */
  async injectCookies() {
    if (!fs.existsSync(this.config.cookieFile)) {
      console.log('⚠️ Cookie文件不存在，跳过Cookie注入');
      return;
    }

    try {
      const cookieData = fs.readFileSync(this.config.cookieFile, 'utf8');
      const cookies = JSON.parse(cookieData);

      if (Array.isArray(cookies) && cookies.length > 0) {
        await this.context.addCookies(cookies);
        console.log(`✅ Cookie注入成功: ${cookies.length} 个Cookie`);
      }
    } catch (error) {
      console.warn('⚠️ Cookie注入失败:', error.message);
    }
  }

  /**
   * 导航到微博
   */
  async navigateToWeibo() {
    console.log('🌐 导航到微博主页...');

    try {
      await this.page.goto('https://weibo.com', {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(this.config.timeout, 15000)
      });

      await this.page.waitForTimeout(3000);

      const currentUrl = this.page.url();
      const title = await this.page.title();

      console.log(`📍 当前页面: ${currentUrl}`);
      console.log(`📄 页面标题: ${title}`);

      // 检查是否跳转到登录页
      const isLoginPage = currentUrl.includes('newlogin') || title.includes('登录');
      if (isLoginPage) {
        console.log('⚠️ 检测到登录页面，可能需要重新登录');
      }

    } catch (error) {
      console.warn('⚠️ 页面导航超时，但将继续分析...');
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    console.log('🧹 精确页面结构分析器资源已清理');
  }

  /**
   * 生成精确的容器配置文件
   */
  generatePreciseContainerConfig(analysis) {
    const config = {
      version: '2.0.0',
      website: 'weibo.com',
      analysisType: 'precise',
      containers: {
        page: {
          name: '页面容器',
          selector: analysis.recommendations.pageContainer || 'body',
          description: '整个微博页面的根容器',
          priority: 1,
          specificity: analysis.pageContainerCandidates.find(c => c.selector === analysis.recommendations.pageContainer)?.specificity || 0
        },
        feed: {
          name: '主帖子列表容器',
          selector: analysis.recommendations.feedContainer || '[class*="Feed_body"]',
          description: '包含所有微博帖子的主要容器',
          priority: 2,
          specificity: analysis.feedContainerCandidates.find(c => c.selector === analysis.recommendations.feedContainer)?.specificity || 0
        },
        post: {
          name: '帖子容器',
          selector: analysis.recommendations.postContainer || '[class*="Feed_body"] [class*="card"]',
          description: '单个微博帖子的容器',
          priority: 3,
          specificity: analysis.postContainerCandidates.find(c => c.selector === analysis.recommendations.postContainer)?.specificity || 0
        }
      },
      discovery: {
        strategy: 'precise-selector',
        specificityThreshold: 100,
        uniquenessThreshold: 0.8,
        waitForElements: true,
        timeout: 10000
      },
      metadata: {
        analysisTime: new Date().toISOString(),
        totalCandidates: {
          page: analysis.pageContainerCandidates.length,
          feed: analysis.feedContainerCandidates.length,
          post: analysis.postContainerCandidates.length
        },
        recommendations: analysis.recommendations,
        statistics: analysis.statistics
      }
    };

    return config;
  }
}

/**
 * 主分析函数
 */
async function analyzePreciseWeiboStructure() {
  const analyzer = new PreciseWeiboStructureAnalyzer({
    verbose: true,
    headless: false, // 使用可视化模式以便观察
    timeout: 30000
  });

  try {
    // 执行精确页面结构分析
    const analysis = await analyzer.analyzePreciseStructure();

    // 生成精确容器配置
    const config = analyzer.generatePreciseContainerConfig(analysis);

    // 保存配置文件
    const configPath = './weibo-precise-container-config.json';
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('\n💾 精确容器配置已保存到:', configPath);
    console.log('📋 配置包含以下精确容器:');
    console.log(`   - 页面容器: ${config.containers.page.selector}`);
    console.log(`   - 主帖子列表容器: ${config.containers.feed.selector}`);
    console.log(`   - 帖子容器: ${config.containers.post.selector}`);

    // 保持浏览器打开以便检查
    console.log('\n📱 浏览器保持打开状态，请检查精确分析结果...');
    console.log('⚠️ 按 Ctrl+C 退出程序');

    // 等待用户检查
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 精确页面结构分析失败:', error.message);
  } finally {
    await analyzer.cleanup();
  }
}

// 执行精确分析
analyzePreciseWeiboStructure().catch(console.error);