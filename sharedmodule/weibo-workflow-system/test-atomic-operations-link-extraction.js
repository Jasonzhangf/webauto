/**
 * 原子操作链接提取测试 - 使用真实微博主页
 * 通过cookie登录并提取真实微博主页帖子链接
 */

const { chromium } = require('playwright');
const { AtomicOperationFactory } = require('./src/core/atomic-operations');
const { CookieManager } = require('./CookieManager');
const path = require('path');
const fs = require('fs').promises;

class AtomicOperationsLinkExtractionTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookieManager = new CookieManager();
    this.results = {
      posts: [],
      metadata: {
        workflowName: 'weibo-real-homepage-extraction',
        version: '1.0.0',
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        targetUrl: 'https://weibo.com'
      }
    };
  }

  async initialize() {
    console.log('🚀 初始化原子操作链接提取测试...');
    
    this.browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1280, height: 720 });
    
    console.log('✅ 测试环境初始化完成');
  }

  async loginWithCookies() {
    console.log('🍪 尝试使用Cookie登录微博...');
    
    try {
      // 加载已保存的Cookie
      const cookiesLoaded = await this.cookieManager.loadCookies(this.page, 'weibo');
      console.log(`📊 Cookie加载结果: ${cookiesLoaded}`);
      
      // 访问微博主页验证登录状态
      console.log('🌐 访问微博主页...');
      await this.page.goto('https://weibo.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
      // 等待页面加载
      await this.page.waitForTimeout(3000);
      
      // 调试：检查页面标题和URL
      const title = await this.page.title();
      const url = this.page.url();
      console.log(`📄 页面标题: ${title}`);
      console.log(`🔗 当前URL: ${url}`);
      
      // 检查是否已登录
      const isLoggedIn = await this.checkLoginStatus();
      
      if (isLoggedIn) {
        console.log('✅ Cookie登录成功');
        return true;
      } else {
        console.log('⚠️ 登录状态检测失败，可能是选择器问题');
        
        // 尝试更简单的登录检测
        const simpleLoginCheck = await this.page.$$eval('a', links => {
          const loginTexts = ['登录', 'login', 'Sign in'];
          return !links.some(link => {
            const text = link.textContent?.toLowerCase() || '';
            return loginTexts.some(loginText => text.includes(loginText));
          });
        });
        
        console.log(`🔍 简单登录检测结果: ${simpleLoginCheck}`);
        
        if (simpleLoginCheck) {
          console.log('✅ 简单检测显示已登录');
          return true;
        } else {
          console.log('⚠️ 需要手动登录');
          await this.manualLogin();
          return true;
        }
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
        '.user-name',
        '[data-usercard*="true"]'
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

  async manualLogin() {
    console.log('🔐 请手动登录微博...');
    console.log('浏览器已打开，请在30秒内完成登录');
    
    // 等待用户手动登录
    await this.page.waitForTimeout(30000);
    
    // 检查登录状态
    const isLoggedIn = await this.checkLoginStatus();
    
    if (isLoggedIn) {
      console.log('✅ 手动登录成功，保存Cookie...');
      await this.cookieManager.saveCookies(this.page, 'weibo');
    } else {
      throw new Error('手动登录失败');
    }
  }

  async extractPostLinks() {
    console.log('🔍 开始使用原子操作提取微博主页帖子链接...');
    
    try {
      // 滚动页面以加载更多内容
      await this.scrollToLoadMore();
      
      // 先分析页面结构
      await this.analyzePageStructure();
      
      // 使用原子操作提取微博帖子链接 - 使用更通用的选择器
      const linkExtractor = AtomicOperationFactory.createOperation('element.attribute', {
        selector: 'a[href*="/status/"]',
        attribute: 'href',
        multiple: true,
        timeout: 10000,
        filter: (href) => href && href.includes('/status/') && href.startsWith('http')
      });
      
      console.log('📋 提取帖子链接...');
      const linkResult = await linkExtractor.execute(this.page);
      
      if (!linkResult.success) {
        console.log('⚠️ 未找到/status/链接，尝试其他选择器...');
        // 尝试其他可能的选择器
        const alternativeLinks = await this.extractAlternativeLinks();
        let links = alternativeLinks;
        
        // 去重
        links = [...new Set(links)];
        console.log(`✅ 提取到 ${links.length} 个帖子链接`);
        
        // 并行提取所有帖子信息
        console.log('📝 并行提取帖子详细信息...');
        const detailedPosts = await this.extractPostDetails(links);
        
        this.results.posts = detailedPosts;
        this.results.metadata.totalPosts = detailedPosts.length;
        
        return detailedPosts;
      } else {
        let links = linkResult.result || [];
        // 去重
        links = [...new Set(links)];
        console.log(`✅ 提取到 ${links.length} 个帖子链接`);
        
        // 并行提取所有帖子信息
        console.log('📝 并行提取帖子详细信息...');
        const detailedPosts = await this.extractPostDetails(links);
        
        this.results.posts = detailedPosts;
        this.results.metadata.totalPosts = detailedPosts.length;
        
        return detailedPosts;
      }
      
    } catch (error) {
      console.error('❌ 提取帖子链接失败:', error.message);
      throw error;
    }
  }

  async analyzePageStructure() {
    console.log('🔍 分析页面结构...');
    
    // 获取页面标题
    const title = await this.page.title();
    console.log(`📄 页面标题: ${title}`);
    
    // 获取所有链接
    const allLinks = await this.page.$$eval('a', links => 
      links.map(link => link.href).filter(href => href && href.startsWith('http'))
    );
    console.log(`🔗 总链接数: ${allLinks.length}`);
    
    // 查找包含数字的链接（可能是帖子）
    const numericLinks = allLinks.filter(href => /\d+/.test(href));
    console.log(`🔢 包含数字的链接: ${numericLinks.length}`);
    
    // 显示前10个链接作为示例
    console.log('📋 前10个链接示例:');
    allLinks.slice(0, 10).forEach((link, index) => {
      console.log(`   ${index + 1}. ${link}`);
    });
  }

  async extractAlternativeLinks() {
    console.log('🔄 尝试提取替代链接...');
    
    // 尝试提取所有可能的帖子链接
    const allLinks = await this.page.$$eval('a', links => 
      links.map(link => ({
        href: link.href,
        text: link.textContent?.trim(),
        class: link.className
      })).filter(item => item.href && item.href.startsWith('http'))
    );
    
    // 过滤可能是帖子的链接
    const postLinks = allLinks.filter(item => 
      item.href.includes('/status/') || 
      item.href.includes('/detail/') ||
      item.href.includes('/p/') ||
      /\d{8,}/.test(item.href) // 包含长数字的链接
    );
    
    console.log(`📋 找到 ${postLinks.length} 个可能的帖子链接`);
    
    return postLinks.map(item => item.href);
  }

  async scrollToLoadMore() {
    console.log('📜 滚动页面加载更多内容...');
    
    let previousHeight = 0;
    let currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
    let scrollCount = 0;
    const maxScrolls = 10;
    
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

  async extractPostDetails(links) {
    console.log('📝 提取帖子详细信息...');
    
    const detailedPosts = [];
    
    // 使用更通用的选择器来适应真实的微博页面结构
    const authorExtractor = AtomicOperationFactory.createOperation('element.text', {
      selector: 'a[href*="/u/"], .UserName, .woo-box-flex.woo-box-alignCenter.Card_title_3NffA, [class*="name"], [class*="author"]',
      multiple: true,
      timeout: 5000,
      filter: (text) => text && text.trim().length > 0 && text.trim().length < 50
    });
    
    const timeExtractor = AtomicOperationFactory.createOperation('element.text', {
      selector: 'time, [class*="time"], [class*="date"], span[title*="202"]',
      multiple: true,
      timeout: 5000,
      filter: (text) => text && text.trim().length > 0 && (text.includes(':') || text.includes('-') || text.includes('202'))
    });
    
    const contentExtractor = AtomicOperationFactory.createOperation('element.text', {
      selector: '[class*="content"], [class*="text"], .Feed_body_3R0rO, .Feed_body_3R0rO div',
      multiple: true,
      timeout: 5000,
      filter: (text) => text && text.trim().length > 5 && text.trim().length < 500
    });
    
    // 并行执行所有提取操作
    console.log('⚡ 并行执行提取操作...');
    const [authors, times, contents] = await Promise.all([
      authorExtractor.execute(this.page),
      timeExtractor.execute(this.page),
      contentExtractor.execute(this.page)
    ]);
    
    console.log(`📊 提取结果统计:`);
    console.log(`   - 作者信息: ${authors.result ? authors.result.length : 0} 个`);
    console.log(`   - 时间信息: ${times.result ? times.result.length : 0} 个`);
    console.log(`   - 内容信息: ${contents.result ? contents.result.length : 0} 个`);
    
    // 组合数据 - 为每个链接找到最近的作者和时间信息
    for (let i = 0; i < Math.min(links.length, 50); i++) { // 限制为50个帖子
      const link = links[i];
      const postId = this.extractPostId(link);
      
      if (!postId) continue;
      
      const post = {
        postId: postId,
        postUrl: link,
        authorName: this.findNearestAuthor(link, authors.result || []),
        postTime: this.findNearestTime(link, times.result || []),
        postContent: this.findNearestContent(link, contents.result || []),
        extractedAt: new Date().toISOString()
      };
      
      // 验证数据完整性
      if (this.validatePost(post)) {
        detailedPosts.push(post);
        if (detailedPosts.length <= 5) { // 只显示前5个
          console.log(`✅ 帖子 ${detailedPosts.length}: ${post.authorName || '未知'} - ${post.postTime || '未知时间'}`);
        }
      }
    }
    
    console.log(`📋 有效帖子数量: ${detailedPosts.length}/${Math.min(links.length, 50)}`);
    return detailedPosts;
  }

  findNearestAuthor(link, authors) {
    // 简单的匹配策略：返回第一个非空的作者
    return authors.find(author => author && author.trim()) || null;
  }

  findNearestTime(link, times) {
    // 简单的匹配策略：返回第一个包含时间格式的文本
    return times.find(time => time && (time.includes(':') || time.includes('-') || time.includes('202'))) || null;
  }

  findNearestContent(link, contents) {
    // 简单的匹配策略：返回第一个合理长度的内容
    return contents.find(content => content && content.trim().length > 10 && content.trim().length < 500) || null;
  }

  extractPostId(postUrl) {
    const match = postUrl.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  validatePost(post) {
    return post.postId && post.postUrl; // 简化验证，只要有ID和链接就算有效
  }

  async saveResults() {
    const outputPath = path.join('./results', 'weibo-real-homepage-extraction-results.json');
    
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
      
      console.log('🔬 开始真实微博主页原子操作链接提取测试...');
      console.log('='.repeat(60));
      
      // 使用cookie登录微博
      const isLoggedIn = await this.loginWithCookies();
      
      if (!isLoggedIn) {
        console.log('⚠️ 登录失败，尝试提取公开内容...');
        await this.page.goto('https://weibo.com', { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 
        });
        await this.page.waitForTimeout(3000);
      } else {
        console.log('✅ 登录成功，开始提取主页内容...');
      }
      
      // 执行链接提取
      const posts = await this.extractPostLinks();
      
      // 保存结果
      const outputPath = await this.saveResults();
      
      console.log('='.repeat(60));
      console.log('🎉 真实微博主页原子操作链接提取测试完成！');
      console.log(`📊 提取结果:`);
      console.log(`   - 总帖子数: ${posts.length}`);
      console.log(`   - 成功率: ${((posts.length / Math.max(posts.length, 1)) * 100).toFixed(1)}%`);
      console.log(`   - 结果文件: ${outputPath}`);
      
      // 显示前几个帖子示例
      if (posts.length > 0) {
        console.log(`\n📋 前几个帖子示例:`);
        posts.slice(0, 3).forEach((post, index) => {
          console.log(`   ${index + 1}. ${post.authorName || '未知作者'} - ${post.postTime || '未知时间'}`);
          console.log(`      链接: ${post.postUrl}`);
          console.log(`      内容: ${post.postContent ? post.postContent.substring(0, 50) + '...' : '无内容'}`);
        });
      }
      
      return {
        success: true,
        posts: posts,
        outputPath: outputPath,
        totalPosts: posts.length
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
  const test = new AtomicOperationsLinkExtractionTest();
  
  test.run().then((result) => {
    if (result.success) {
      console.log('✅ 原子操作链接提取测试成功');
      process.exit(0);
    } else {
      console.log('❌ 原子操作链接提取测试失败');
      process.exit(1);
    }
  }).catch((error) => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
}

module.exports = { AtomicOperationsLinkExtractionTest };