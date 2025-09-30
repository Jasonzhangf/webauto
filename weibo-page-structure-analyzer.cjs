#!/usr/bin/env node

/**
 * 微博页面结构分析器
 * 分析微博页面的三个重要容器selector:
 * 1. 页面容器 - 整个页面的根容器
 * 2. 主帖子列表容器 - 包含所有帖子的容器
 * 3. 帖子容器 - 单个帖子的容器
 */

const { chromium } = require('playwright');
const fs = require('fs');

class WeiboPageStructureAnalyzer {
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
   * 分析微博页面结构
   */
  async analyzePageStructure() {
    console.log('🔍 开始分析微博页面结构...');
    console.log('📋 目标：找到三个重要容器的selector');
    console.log('   1. 页面容器 - 整个页面的根容器');
    console.log('   2. 主帖子列表容器 - 包含所有帖子的容器');
    console.log('   3. 帖子容器 - 单个帖子的容器');

    try {
      // 1. 初始化浏览器
      await this.initializeBrowser();

      // 2. 注入Cookie
      await this.injectCookies();

      // 3. 导航到微博
      await this.navigateToWeibo();

      // 4. 等待页面完全加载
      await this.page.waitForTimeout(5000);

      // 5. 分析页面结构
      const analysisResult = await this.performStructureAnalysis();

      console.log('\n🎉 页面结构分析完成！');
      return analysisResult;

    } catch (error) {
      console.error('❌ 页面结构分析失败:', error.message);
      throw error;
    }
  }

  /**
   * 执行页面结构分析
   */
  async performStructureAnalysis() {
    console.log('🔬 开始深度页面结构分析...');

    const analysis = await this.page.evaluate(() => {
      const results = {
        pageContainers: [],
        feedContainers: [],
        postContainers: [],
        hierarchy: {},
        recommendations: {
          pageContainer: null,
          feedContainer: null,
          postContainer: null
        }
      };

      // 1. 查找页面级容器
      console.log('📄 查找页面级容器...');
      const pageSelectors = [
        'body',
        '#app',
        '.app',
        '[class*="app"]',
        '[class*="main"]',
        '[class*="page"]',
        '[class*="container"]',
        '[class*="wrapper"]',
        '.main',
        '.page',
        '.container',
        '.wrapper'
      ];

      pageSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            const element = elements[0];
            const rect = element.getBoundingClientRect();
            if (rect.width > 800 && rect.height > 600) {
              results.pageContainers.push({
                selector,
                elementCount: elements.length,
                width: rect.width,
                height: rect.height,
                children: element.children.length,
                className: element.className,
                id: element.id
              });
            }
          }
        } catch (e) {
          // 忽略选择器错误
        }
      });

      // 2. 查找帖子列表容器
      console.log('📋 查找帖子列表容器...');
      const feedSelectors = [
        '[class*="Feed"]',
        '[class*="feed"]',
        '[class*="timeline"]',
        '[class*="stream"]',
        '[class*="content"]',
        '[class*="main"]',
        '[class*="home"]',
        '.Feed',
        '.feed',
        '.timeline',
        '.stream',
        '#feed',
        '#timeline',
        '#stream'
      ];

      feedSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            const element = elements[0];
            const rect = element.getBoundingClientRect();
            if (rect.width > 300 && rect.height > 200) {
              // 检查是否包含帖子元素
              const postCount = element.querySelectorAll('[class*="card"], [class*="post"], [class*="feed_item"], article, .Card').length;

              results.feedContainers.push({
                selector,
                elementCount: elements.length,
                width: rect.width,
                height: rect.height,
                children: element.children.length,
                postCount: postCount,
                className: element.className,
                id: element.id
              });
            }
          }
        } catch (e) {
          // 忽略选择器错误
        }
      });

      // 3. 查找单个帖子容器
      console.log('📝 查找单个帖子容器...');
      const postSelectors = [
        '[class*="card"]',
        '[class*="post"]',
        '[class*="feed_item"]',
        '[class*="item"]',
        '[class*="article"]',
        '[class*="content"]',
        'article',
        '.Card',
        '.card',
        '.post',
        '.feed_item',
        '.item',
        '.article'
      ];

      postSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            const element = elements[0];
            const rect = element.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 100) {
              // 检查是否包含帖子内容
              const hasContent = element.querySelector('[class*="text"], [class*="content"], p, .text') !== null;
              const hasImage = element.querySelector('img') !== null;
              const hasLink = element.querySelector('a[href*="/"], a[href*="detail"]') !== null;

              results.postContainers.push({
                selector,
                elementCount: elements.length,
                width: rect.width,
                height: rect.height,
                hasContent,
                hasImage,
                hasLink,
                className: element.className,
                id: element.id
              });
            }
          }
        } catch (e) {
          // 忽略选择器错误
        }
      });

      // 4. 分析层次结构
      console.log('🏗️ 分析容器层次结构...');
      if (results.pageContainers.length > 0) {
        const pageContainer = results.pageContainers[0];
        results.hierarchy.page = pageContainer;

        // 在页面容器中查找子容器
        if (pageContainer.className) {
          const pageElement = document.querySelector('.' + pageContainer.className.split(' ').join('.'));
          if (pageElement) {
            const feedInPage = pageElement.querySelector('[class*="Feed"], [class*="feed"], [class*="timeline"]');
            if (feedInPage) {
              results.hierarchy.feed = {
                selector: feedInPage.className ? '.' + feedInPage.className.split(' ').join('.') : null,
                className: feedInPage.className,
                inPageContainer: true
              };
            }
          }
        }
      }

      // 5. 生成推荐选择器
      console.log('💡 生成推荐选择器...');
      if (results.pageContainers.length > 0) {
        const bestPage = results.pageContainers.reduce((best, current) =>
          current.width > best.width ? current : best
        );
        results.recommendations.pageContainer = bestPage.selector;
      }

      if (results.feedContainers.length > 0) {
        const bestFeed = results.feedContainers.reduce((best, current) =>
          current.postCount > best.postCount ? current : best
        );
        results.recommendations.feedContainer = bestFeed.selector;
      }

      if (results.postContainers.length > 0) {
        const bestPost = results.postContainers.reduce((best, current) =>
          current.elementCount > best.elementCount ? current : best
        );
        results.recommendations.postContainer = bestPost.selector;
      }

      return results;
    });

    // 6. 输出分析结果
    console.log('\n📊 页面结构分析结果:');
    console.log('='.repeat(60));

    console.log('\n📄 页面容器候选:');
    analysis.pageContainers.forEach((container, index) => {
      console.log(`   ${index + 1}. ${container.selector}`);
      console.log(`      尺寸: ${container.width}x${container.height}`);
      console.log(`      元素数: ${container.elementCount}`);
      console.log(`      子元素: ${container.children}`);
      console.log(`      类名: ${container.className || '无'}`);
      console.log('');
    });

    console.log('\n📋 帖子列表容器候选:');
    analysis.feedContainers.forEach((container, index) => {
      console.log(`   ${index + 1}. ${container.selector}`);
      console.log(`      尺寸: ${container.width}x${container.height}`);
      console.log(`      元素数: ${container.elementCount}`);
      console.log(`      帖子数: ${container.postCount}`);
      console.log(`      类名: ${container.className || '无'}`);
      console.log('');
    });

    console.log('\n📝 单个帖子容器候选:');
    analysis.postContainers.forEach((container, index) => {
      console.log(`   ${index + 1}. ${container.selector}`);
      console.log(`      尺寸: ${container.width}x${container.height}`);
      console.log(`      元素数: ${container.elementCount}`);
      console.log(`      内容: ${container.hasContent ? '✅' : '❌'}`);
      console.log(`      图片: ${container.hasImage ? '✅' : '❌'}`);
      console.log(`      链接: ${container.hasLink ? '✅' : '❌'}`);
      console.log(`      类名: ${container.className || '无'}`);
      console.log('');
    });

    console.log('\n🎯 推荐的选择器:');
    console.log(`   页面容器: ${analysis.recommendations.pageContainer || '未找到'}`);
    console.log(`   帖子列表容器: ${analysis.recommendations.feedContainer || '未找到'}`);
    console.log(`   单个帖子容器: ${analysis.recommendations.postContainer || '未找到'}`);

    return analysis;
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

    console.log('🧹 页面结构分析器资源已清理');
  }

  /**
   * 生成容器配置文件
   */
  generateContainerConfig(analysis) {
    const config = {
      version: '1.0.0',
      website: 'weibo.com',
      containers: {
        page: {
          name: '页面容器',
          selector: analysis.recommendations.pageContainer || 'body',
          description: '整个微博页面的根容器',
          priority: 1
        },
        feed: {
          name: '主帖子列表容器',
          selector: analysis.recommendations.feedContainer || '[class*="Feed"]',
          description: '包含所有微博帖子的主要容器',
          priority: 2
        },
        post: {
          name: '帖子容器',
          selector: analysis.recommendations.postContainer || '[class*="card"]',
          description: '单个微博帖子的容器',
          priority: 3
        }
      },
      discovery: {
        strategy: 'recursive-depth-first',
        maxDepth: 5,
        waitForElements: true,
        timeout: 10000
      },
      metadata: {
        analysisTime: new Date().toISOString(),
        totalCandidates: {
          page: analysis.pageContainers.length,
          feed: analysis.feedContainers.length,
          post: analysis.postContainers.length
        }
      }
    };

    return config;
  }
}

/**
 * 主分析函数
 */
async function analyzeWeiboPageStructure() {
  const analyzer = new WeiboPageStructureAnalyzer({
    verbose: true,
    headless: false, // 使用可视化模式以便观察
    timeout: 30000
  });

  try {
    // 执行页面结构分析
    const analysis = await analyzer.analyzePageStructure();

    // 生成容器配置
    const config = analyzer.generateContainerConfig(analysis);

    // 保存配置文件
    const configPath = './weibo-container-config.json';
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('\n💾 容器配置已保存到:', configPath);
    console.log('📋 配置包含以下容器:');
    console.log(`   - 页面容器: ${config.containers.page.selector}`);
    console.log(`   - 帖子列表容器: ${config.containers.feed.selector}`);
    console.log(`   - 帖子容器: ${config.containers.post.selector}`);

    // 保持浏览器打开以便检查
    console.log('\n📱 浏览器保持打开状态，请检查分析结果...');
    console.log('⚠️ 按 Ctrl+C 退出程序');

    // 等待用户检查
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 页面结构分析失败:', error.message);
  } finally {
    await analyzer.cleanup();
  }
}

// 执行分析
analyzeWeiboPageStructure().catch(console.error);