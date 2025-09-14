/**
 * 微博主页链接提取测试脚本
 * 使用原子操作测试微博主页帖子提取
 */

const { chromium } = require('playwright');
const { AtomicOperationFactory } = require('./src/core/atomic-operations');
const { WeiboSelectorManager } = require('./src/selectors/weibo-homepage-selectors');
const { CookieManager } = require('./CookieManager');
const path = require('path');

class WeiboHomepageLinkExtractionTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.selectorManager = new WeiboSelectorManager();
    this.cookieManager = new CookieManager();
    this.results = {
      posts: [],
      metadata: {
        workflowName: 'weibo-homepage-link-extraction-test',
        version: '1.0.0',
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        targetUrl: 'https://weibo.com'
      }
    };
  }

  async initialize() {
    console.log('🚀 初始化测试环境...');
    
    // 启动浏览器
    this.browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // 创建页面
    this.page = await this.browser.newPage();
    
    // 设置视口
    await this.page.setViewportSize({ width: 1280, height: 720 });
    
    console.log('✅ 测试环境初始化完成');
  }

  async loginWithCookies() {
    console.log('🍪 尝试使用Cookie登录...');
    
    try {
      // 尝试加载已保存的Cookie
      await this.cookieManager.loadCookies(this.page, 'weibo');
      
      // 访问微博主页验证登录状态
      await this.page.goto('https://weibo.com', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // 等待页面加载
      await this.page.waitForTimeout(3000);
      
      // 检查是否已登录
      const isLoggedIn = await this.checkLoginStatus();
      
      if (isLoggedIn) {
        console.log('✅ Cookie登录成功');
        return true;
      } else {
        console.log('⚠️ Cookie已过期，需要手动登录');
        return false;
      }
    } catch (error) {
      console.error('❌ Cookie登录失败:', error.message);
      return false;
    }
  }

  async checkLoginStatus() {
    try {
      // 检查是否存在登录元素
      const loginSelectors = [
        '.gn_header_login',
        '.login_btn',
        'a[href*="login"]',
        '.S_bg2'
      ];
      
      // 检查是否存在用户信息元素
      const userSelectors = [
        '.gn_name',
        '.S_txt1',
        '.username',
        '.user-name'
      ];
      
      for (const selector of userSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim().length > 0) {
            console.log(`👤 检测到已登录用户: ${text.trim()}`);
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  async extractPostLinks() {
    console.log('🔍 开始提取帖子链接...');
    
    try {
      // 滚动页面以加载更多内容
      await this.scrollToLoadMore();
      
      // 使用原子操作提取链接
      const postLinks = await this.extractLinks();
      
      console.log(`📋 提取到 ${postLinks.length} 个帖子链接`);
      
      // 提取详细信息
      const detailedPosts = await this.extractPostDetails(postLinks);
      
      this.results.posts = detailedPosts;
      this.results.metadata.totalPosts = detailedPosts.length;
      
      return detailedPosts;
      
    } catch (error) {
      console.error('❌ 提取帖子链接失败:', error.message);
      throw error;
    }
  }

  async scrollToLoadMore() {
    console.log('📜 滚动页面加载更多内容...');
    
    let previousHeight = 0;
    let currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
    let scrollCount = 0;
    const maxScrolls = 5;
    
    while (scrollCount < maxScrolls) {
      // 滚动到底部
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // 等待加载
      await this.page.waitForTimeout(2000);
      
      // 检查是否有新内容
      previousHeight = currentHeight;
      currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
      
      if (currentHeight === previousHeight) {
        console.log('📄 页面已加载完成');
        break;
      }
      
      scrollCount++;
      console.log(`📜 滚动第 ${scrollCount} 次，当前高度: ${currentHeight}`);
    }
  }

  async extractLinks() {
    const selectors = this.selectorManager.getSelectors();
    
    // 创建链接提取原子操作
    const linkExtractor = AtomicOperationFactory.createOperation('element.attribute', {
      selector: selectors.posts.postLink,
      attribute: 'href',
      multiple: true,
      timeout: 10000,
      filter: (href) => href && href.includes('/status/') && href.startsWith('http')
    });
    
    // 执行提取
    const result = await linkExtractor.execute(this.page);
    
    if (result.success) {
      return result.result || [];
    } else {
      throw new Error(`链接提取失败: ${result.error}`);
    }
  }

  async extractPostDetails(links) {
    console.log('📝 提取帖子详细信息...');
    
    const selectors = this.selectorManager.getSelectors();
    const detailedPosts = [];
    
    // 创建作者名称提取器
    const authorNameExtractor = AtomicOperationFactory.createOperation('element.text', {
      selector: selectors.posts.authorName,
      multiple: true,
      timeout: 5000,
      filter: (text) => text && text.trim().length > 0
    });
    
    // 创建时间提取器
    const timeExtractor = AtomicOperationFactory.createOperation('element.text', {
      selector: selectors.posts.postTime,
      multiple: true,
      timeout: 5000,
      filter: (text) => text && text.trim().length > 0
    });
    
    // 创建内容提取器
    const contentExtractor = AtomicOperationFactory.createOperation('element.text', {
      selector: selectors.posts.postContent,
      multiple: true,
      timeout: 5000,
      filter: (text) => text && text.trim().length > 0
    });
    
    // 并行提取所有信息
    const [authorNames, postTimes, postContents] = await Promise.all([
      authorNameExtractor.execute(this.page),
      timeExtractor.execute(this.page),
      contentExtractor.execute(this.page)
    ]);
    
    // 组合数据
    for (let i = 0; i < Math.min(links.length, 20); i++) { // 限制为20个帖子
      const link = links[i];
      const postId = this.extractPostId(link);
      
      if (!postId) continue;
      
      const post = {
        postId: postId,
        postUrl: link,
        authorName: (authorNames.result && authorNames.result[i]) ? authorNames.result[i].trim() : null,
        postTime: (postTimes.result && postTimes.result[i]) ? postTimes.result[i].trim() : null,
        postContent: (postContents.result && postContents.result[i]) ? postContents.result[i].trim().substring(0, 200) : null,
        extractedAt: new Date().toISOString()
      };
      
      // 验证数据
      if (this.validatePost(post)) {
        detailedPosts.push(post);
      }
    }
    
    return detailedPosts;
  }

  extractPostId(postUrl) {
    const match = postUrl.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  validatePost(post) {
    return post.postId && post.postUrl && post.authorName;
  }

  async saveResults() {
    const fs = require('fs').promises;
    const outputPath = path.join('./results', 'weibo-homepage-links-test.json');
    
    // 确保目录存在
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    // 保存结果
    await fs.writeFile(outputPath, JSON.stringify(this.results, null, 2));
    
    console.log(`💾 结果已保存到: ${outputPath}`);
    return outputPath;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async run() {
    try {
      await this.initialize();
      
      // 尝试登录
      const isLoggedIn = await this.loginWithCookies();
      
      if (!isLoggedIn) {
        console.log('⚠️ 未登录，尝试访问公开内容...');
        await this.page.goto('https://weibo.com', { 
          waitUntil: 'networkidle',
          timeout: 30000 
        });
      }
      
      // 提取帖子链接
      const posts = await this.extractPostLinks();
      
      // 保存结果
      const outputPath = await this.saveResults();
      
      console.log('🎉 测试完成！');
      console.log(`📊 提取结果:`);
      console.log(`   - 总帖子数: ${posts.length}`);
      console.log(`   - 保存路径: ${outputPath}`);
      
      return {
        success: true,
        posts: posts,
        outputPath: outputPath
      };
      
    } catch (error) {
      console.error('❌ 测试失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
if (require.main === module) {
  const test = new WeiboHomepageLinkExtractionTest();
  
  test.run().then((result) => {
    if (result.success) {
      console.log('✅ 原子操作链接提取测试成功');
    } else {
      console.log('❌ 原子操作链接提取测试失败');
      process.exit(1);
    }
  }).catch((error) => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
}

module.exports = { WeiboHomepageLinkExtractionTest };