/**
 * Weibo Link Capture Test with Retry Mechanism
 * 带重试机制的微博链接捕获测试
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../src/index.js';
import { AtomicOperationFactory } from '../../weibo-workflow-system/src/core/atomic-operations.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WeiboLinkCaptureWithRetry {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookieSystem = null;
    this.results = {
      posts: [],
      metadata: {
        workflowName: 'weibo-link-capture-with-retry',
        version: '1.0.0',
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        targetUrl: 'https://weibo.com',
        retryAttempts: 0,
        success: false
      }
    };
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  async initialize() {
    console.log('🚀 初始化带重试机制的微博链接捕获测试...');
    
    // 初始化Cookie管理系统
    this.cookieSystem = new WebAutoCookieManagementSystem({
      storagePath: path.join(__dirname, '../test-cookies'),
      encryptionEnabled: false,
      autoRefresh: false,
      validationEnabled: true
    });
    
    await this.cookieSystem.initialize();
    
    // 初始化浏览器配置
    this.browser = await chromium.launch({ 
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images', // 禁用图片加速加载
        '--disable-javascript-har-promises' // 禁用某些JS特性
      ]
    });
    
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      javaScriptEnabled: true
    });
    
    this.page = await context.newPage();
    
    console.log('✅ 测试环境初始化完成');
  }

  async loadCookiesWithRetry() {
    console.log('🍪 加载Cookie (带重试机制)...');
    
    const weiboCookiePath = path.join(__dirname, '../../weibo-workflow-system/cookies/weibo.com.json');
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`📥 Cookie加载尝试 ${attempt}/${this.maxRetries}`);
        
        // 使用原生fs模块读取Cookie文件
        const fs = await import('fs');
        const cookieData = fs.readFileSync(weiboCookiePath, 'utf8');
        const cookies = JSON.parse(cookieData);
        
        console.log(`📥 读取到 ${cookies.length} 个Cookie`);
        
        // 显示关键Cookie信息
        const importantCookies = cookies.filter(c => 
          ['SUB', 'SUBP', 'XSRF-TOKEN', 'WBPSESS'].includes(c.name)
        );
        console.log('🔑 关键Cookie:');
        importantCookies.forEach(cookie => {
          console.log(`   ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
        });
        
        // 存储到Cookie管理系统
        const stored = await this.cookieSystem.manager.storage.storeCookies('weibo.com', cookies);
        console.log(`📥 Cookie存储结果: ${stored}`);
        
        if (stored) {
          // 验证Cookie健康状态
          const health = await this.cookieSystem.validateCookieHealth('weibo.com');
          console.log(`🏥 Cookie健康状态: ${JSON.stringify(health, null, 2)}`);
          
          // 加载Cookie到页面
          const loaded = await this.cookieSystem.loadCookies(this.page, 'weibo.com');
          console.log(`🍪 Cookie页面加载结果: ${loaded}`);
          
          if (loaded) {
            return { success: true, cookies: cookies.length, health };
          }
        }
        
      } catch (error) {
        console.error(`❌ Cookie加载尝试 ${attempt} 失败:`, error.message);
        if (attempt < this.maxRetries) {
          console.log(`⏳ ${this.retryDelay/1000}秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }
    
    return { success: false, error: 'Cookie加载失败' };
  }

  async accessWeiboWithRetry() {
    console.log('🌐 访问微博主页 (带重试机制)...');
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🌐 页面访问尝试 ${attempt}/${this.maxRetries}`);
        
        // 先设置页面超时
        await this.page.setDefaultTimeout(45000); // 45秒
        
        // 访问微博主页
        await this.page.goto('https://weibo.com', { 
          waitUntil: 'domcontentloaded',
          timeout: 45000 
        });
        
        // 等待页面加载
        await this.page.waitForTimeout(8000);
        
        // 获取页面信息
        const title = await this.page.title();
        const url = this.page.url();
        console.log(`📄 页面标题: ${title}`);
        console.log(`🔗 当前URL: ${url}`);
        
        // 检查是否被重定向
        if (url.includes('login') || url.includes('signin')) {
          throw new Error('页面被重定向到登录页面');
        }
        
        // 检查页面内容
        const bodyText = await this.page.evaluate(() => {
          return document.body ? document.body.innerText.substring(0, 200) : '';
        });
        console.log(`📄 页面内容预览: ${bodyText.substring(0, 100)}...`);
        
        // 检查登录状态
        const isLoggedIn = await this.checkLoginStatus();
        console.log(`🔐 登录状态: ${isLoggedIn ? '已登录' : '未登录'}`);
        
        this.results.metadata.retryAttempts = attempt;
        return { success: true, title, url, isLoggedIn };
        
      } catch (error) {
        console.error(`❌ 页面访问尝试 ${attempt} 失败:`, error.message);
        if (attempt < this.maxRetries) {
          console.log(`⏳ ${this.retryDelay/1000}秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          
          // 清理页面状态
          try {
            await this.page.evaluate(() => {
              window.stop();
            });
          } catch (e) {
            // 忽略页面停止错误
          }
        }
      }
    }
    
    return { success: false, error: '页面访问失败' };
  }

  async checkLoginStatus() {
    try {
      // 检查各种可能的登录指示器
      const selectors = [
        '.gn_name',
        '.S_txt1', 
        '.username',
        '[data-usercard*="true"]',
        'a[href*="/home"]',
        '.woo-box-flex.woo-box-alignCenter.Card_title_3NffA',
        '[class*="name"]',
        '.Profile_title_3y3yh'
      ];
      
      for (const selector of selectors) {
        const elements = await this.page.$$(selector);
        if (elements.length > 0) {
          for (const element of elements) {
            const text = await element.textContent();
            if (text && text.trim().length > 0 && text.trim().length < 50) {
              console.log(`👤 检测到用户元素: ${text.trim()}`);
              return true;
            }
          }
        }
      }
      
      // 检查是否有登录按钮
      const loginSelectors = [
        'a[href*="login"]',
        'button:has-text("登录")',
        '.login-btn',
        '.signin-btn'
      ];
      
      for (const selector of loginSelectors) {
        const elements = await this.page.$$(selector);
        if (elements.length > 0) {
          console.log('🔐 检测到登录相关元素，可能未登录');
          return false;
        }
      }
      
      return false;
    } catch (error) {
      console.error('❌ 登录状态检查失败:', error.message);
      return false;
    }
  }

  async extractPostLinks() {
    console.log('🔍 开始提取微博帖子链接...');
    
    try {
      // 先等待页面完全加载
      await this.page.waitForTimeout(5000);
      
      // 滚动页面加载更多内容
      await this.scrollToLoadMore();
      
      // 分析页面结构
      await this.analyzePageStructure();
      
      // 使用原子操作提取链接
      const linkExtractor = AtomicOperationFactory.createOperation('element.attribute', {
        selector: 'a[href*="/status/"]',
        attribute: 'href',
        multiple: true,
        timeout: 15000,
        filter: (href) => href && href.includes('/status/') && href.startsWith('http')
      });
      
      console.log('📋 提取帖子链接...');
      const result = await linkExtractor.execute(this.page);
      
      let links = [];
      if (result.success) {
        links = result.result || [];
      }
      
      // 去重
      links = [...new Set(links)];
      console.log(`✅ 提取到 ${links.length} 个帖子链接`);
      
      // 显示前10个链接
      if (links.length > 0) {
        console.log('📋 前10个帖子链接:');
        links.slice(0, 10).forEach((link, index) => {
          console.log(`   ${index + 1}. ${link}`);
        });
      }
      
      // 提取详细信息
      if (links.length > 0) {
        const detailedPosts = await this.extractPostDetails(links.slice(0, 30)); // 限制30个
        this.results.posts = detailedPosts;
        this.results.metadata.totalPosts = detailedPosts.length;
        this.results.metadata.success = true;
        
        return detailedPosts;
      }
      
      return [];
    } catch (error) {
      console.error('❌ 链接提取失败:', error.message);
      throw error;
    }
  }

  async analyzePageStructure() {
    console.log('🔍 分析页面结构...');
    
    const title = await this.page.title();
    console.log(`📄 页面标题: ${title}`);
    
    // 获取所有链接
    const allLinks = await this.page.$$eval('a', links => 
      links.map(link => link.href).filter(href => href && href.startsWith('http'))
    );
    console.log(`🔗 总链接数: ${allLinks.length}`);
    
    // 查找包含数字的链接
    const numericLinks = allLinks.filter(href => /\d+/.test(href));
    console.log(`🔢 包含数字的链接: ${numericLinks.length}`);
    
    // 查找状态链接
    const statusLinks = allLinks.filter(href => href.includes('/status/'));
    console.log(`📝 状态链接数: ${statusLinks.length}`);
    
    // 显示前5个状态链接
    if (statusLinks.length > 0) {
      console.log('📝 前5个状态链接:');
      statusLinks.slice(0, 5).forEach((link, index) => {
        console.log(`   ${index + 1}. ${link}`);
      });
    }
  }

  async scrollToLoadMore() {
    console.log('📜 滚动页面加载更多内容...');
    
    let previousHeight = 0;
    let currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
    let scrollCount = 0;
    const maxScrolls = 5; // 减少滚动次数以节省时间
    
    while (scrollCount < maxScrolls) {
      // 滚动到底部
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // 等待加载
      await this.page.waitForTimeout(3000);
      
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
    
    // 提取作者信息
    const authorExtractor = AtomicOperationFactory.createOperation('element.text', {
      selector: 'a[href*="/u/"], .UserName, .woo-box-flex.woo-box-alignCenter.Card_title_3NffA, [class*="name"], [class*="author"]',
      multiple: true,
      timeout: 8000,
      filter: (text) => text && text.trim().length > 0 && text.trim().length < 50
    });
    
    // 提取时间信息
    const timeExtractor = AtomicOperationFactory.createOperation('element.text', {
      selector: 'time, [class*="time"], [class*="date"], span[title*="202"]',
      multiple: true,
      timeout: 8000,
      filter: (text) => text && text.trim().length > 0 && (text.includes(':') || text.includes('-') || text.includes('202'))
    });
    
    // 提取内容信息
    const contentExtractor = AtomicOperationFactory.createOperation('element.text', {
      selector: '[class*="content"], [class*="text"], .Feed_body_3R0rO, .Feed_body_3R0rO div',
      multiple: true,
      timeout: 8000,
      filter: (text) => text && text.trim().length > 5 && text.trim().length < 500
    });
    
    // 并行执行提取
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
    
    // 组合数据
    for (let i = 0; i < Math.min(links.length, 30); i++) {
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
      
      if (this.validatePost(post)) {
        detailedPosts.push(post);
        if (detailedPosts.length <= 5) {
          console.log(`✅ 帖子 ${detailedPosts.length}: ${post.authorName || '未知'} - ${post.postTime || '未知时间'}`);
        }
      }
    }
    
    console.log(`📋 有效帖子数量: ${detailedPosts.length}/${Math.min(links.length, 30)}`);
    return detailedPosts;
  }

  findNearestAuthor(link, authors) {
    return authors.find(author => author && author.trim()) || null;
  }

  findNearestTime(link, times) {
    return times.find(time => time && (time.includes(':') || time.includes('-') || time.includes('202'))) || null;
  }

  findNearestContent(link, contents) {
    return contents.find(content => content && content.trim().length > 10 && content.trim().length < 500) || null;
  }

  extractPostId(postUrl) {
    const match = postUrl.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  validatePost(post) {
    return post.postId && post.postUrl;
  }

  async saveResults() {
    const outputPath = path.join('./results', 'weibo-link-capture-results.json');
    
    // 确保目录存在
    const fs = await import('fs');
    const fsPromises = await import('fs').then(m => m.promises);
    
    try {
      await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    } catch (error) {
      // Directory already exists
    }
    
    // 保存结果
    await fsPromises.writeFile(outputPath, JSON.stringify(this.results, null, 2));
    
    console.log(`💾 结果已保存到: ${outputPath}`);
    return outputPath;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
    
    if (this.cookieSystem) {
      await this.cookieSystem.shutdown();
    }
  }

  async run() {
    try {
      await this.initialize();
      
      console.log('🧪 开始带重试机制的微博链接捕获测试...');
      console.log('='.repeat(60));
      
      // 加载Cookie
      const cookieResult = await this.loadCookiesWithRetry();
      if (!cookieResult.success) {
        throw new Error('Cookie加载失败');
      }
      
      // 访问页面
      const accessResult = await this.accessWeiboWithRetry();
      if (!accessResult.success) {
        throw new Error('页面访问失败');
      }
      
      // 提取链接
      const posts = await this.extractPostLinks();
      
      // 保存结果
      const outputPath = await this.saveResults();
      
      console.log('='.repeat(60));
      console.log('🎉 带重试机制的微博链接捕获测试完成！');
      console.log(`📊 提取结果:`);
      console.log(`   - 总帖子数: ${posts.length}`);
      console.log(`   - 成功率: ${((posts.length / Math.max(posts.length, 1)) * 100).toFixed(1)}%`);
      console.log(`   - 结果文件: ${outputPath}`);
      console.log(`   - Cookie加载: ${cookieResult.success ? '成功' : '失败'}`);
      console.log(`   - 登录状态: ${accessResult.isLoggedIn ? '已登录' : '未登录'}`);
      console.log(`   - 重试次数: ${this.results.metadata.retryAttempts}`);
      
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
        totalPosts: posts.length,
        cookieLoaded: cookieResult.success,
        isLoggedIn: accessResult.isLoggedIn,
        retryAttempts: this.results.metadata.retryAttempts
      };
      
    } catch (error) {
      console.error('❌ 测试失败:', error.message);
      
      // 保存错误结果
      this.results.metadata.success = false;
      this.results.metadata.error = error.message;
      await this.saveResults();
      
      return {
        success: false,
        error: error.message,
        results: this.results
      };
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
const test = new WeiboLinkCaptureWithRetry();
test.run().then((result) => {
  if (result.success) {
    console.log('✅ 带重试机制的微博链接捕获测试成功');
    process.exit(0);
  } else {
    console.log('❌ 带重试机制的微博链接捕获测试失败');
    process.exit(1);
  }
}).catch((error) => {
  console.error('💥 测试异常:', error);
  process.exit(1);
});