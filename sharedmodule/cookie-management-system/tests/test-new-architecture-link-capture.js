/**
 * New Architecture Link Capture Test
 * 基于新架构的链接捕获测试 - 结合Cookie管理和原子操作
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../src/index.js';
import { AtomicOperationFactory } from '../../weibo-workflow-system/src/core/atomic-operations.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class NewArchitectureLinkCapture {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookieSystem = null;
    this.results = {
      posts: [],
      metadata: {
        workflowName: 'new-architecture-link-capture',
        version: '2.0.0',
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        targetUrl: 'https://weibo.com',
        architecture: 'Cookie Management + Atomic Operations',
        success: false
      }
    };
  }

  async initialize() {
    console.log('🚀 初始化新架构链接捕获测试...');
    
    // 初始化Cookie管理系统
    this.cookieSystem = new WebAutoCookieManagementSystem({
      storagePath: path.join(__dirname, '../test-cookies'),
      encryptionEnabled: false,
      autoRefresh: false,
      validationEnabled: true
    });
    
    await this.cookieSystem.initialize();
    
    // 初始化浏览器 - 新架构配置
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
        '--disable-images',
        '--disable-javascript-har-promises'
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
    
    console.log('✅ 新架构初始化完成');
  }

  async loadCookiesAndAccess() {
    console.log('🍪 加载Cookie并访问页面...');
    
    const weiboCookiePath = path.join(__dirname, '../../weibo-workflow-system/cookies/weibo.com.json');
    
    try {
      // 使用原子操作读取Cookie文件
      const fs = await import('fs');
      const cookieData = fs.readFileSync(weiboCookiePath, 'utf8');
      const cookies = JSON.parse(cookieData);
      
      console.log(`📥 读取到 ${cookies.length} 个Cookie`);
      
      // 存储到Cookie管理系统
      const stored = await this.cookieSystem.manager.storage.storeCookies('weibo.com', cookies);
      console.log(`📥 Cookie存储结果: ${stored}`);
      
      // 验证Cookie健康状态
      const health = await this.cookieSystem.validateCookieHealth('weibo.com');
      console.log(`🏥 Cookie健康状态: ${JSON.stringify(health, null, 2)}`);
      
      // 加载Cookie到页面
      const loaded = await this.cookieSystem.loadCookies(this.page, 'weibo.com');
      console.log(`🍪 Cookie页面加载结果: ${loaded}`);
      
      // 使用原子操作检查页面标题
      const titleOperation = AtomicOperationFactory.createOperation('element.text', {
        selector: 'title',
        timeout: 5000
      });
      
      // 访问微博主页
      console.log('🌐 访问微博主页...');
      await this.page.goto('https://weibo.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
      
      await this.page.waitForTimeout(5000);
      
      // 获取页面标题
      const titleResult = await titleOperation.execute(this.page);
      const title = titleResult.success ? titleResult.result : 'Unknown';
      console.log(`📄 页面标题: ${title}`);
      
      // 检查登录状态
      const isLoggedIn = await this.checkLoginStatusWithAtomicOperations();
      console.log(`🔐 登录状态: ${isLoggedIn ? '已登录' : '未登录'}`);
      
      return { 
        success: true, 
        cookies: cookies.length, 
        health, 
        loaded, 
        title, 
        isLoggedIn 
      };
      
    } catch (error) {
      console.error('❌ Cookie加载和访问失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  async checkLoginStatusWithAtomicOperations() {
    console.log('🔐 使用原子操作检查登录状态...');
    
    const loginSelectors = [
      '.gn_name',
      '.S_txt1', 
      '.username',
      '[data-usercard*="true"]',
      'a[href*="/home"]',
      '.woo-box-flex.woo-box-alignCenter.Card_title_3NffA',
      '[class*="name"]',
      '.Profile_title_3y3yh'
    ];
    
    // 使用原子操作并行检查多个选择器
    const operations = loginSelectors.map(selector => 
      AtomicOperationFactory.createOperation('element.text', {
        selector: selector,
        timeout: 3000,
        multiple: true
      })
    );
    
    try {
      const results = await Promise.all(
        operations.map(op => op.execute(this.page))
      );
      
      // 检查是否有有效的用户名
      for (const result of results) {
        if (result.success && result.result) {
          const validTexts = result.result.filter(text => 
            text && text.trim().length > 0 && text.trim().length < 50
          );
          if (validTexts.length > 0) {
            console.log(`👤 检测到用户: ${validTexts[0]}`);
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('❌ 登录状态检查失败:', error.message);
      return false;
    }
  }

  async analyzePageStructureWithAtomicOperations() {
    console.log('🔍 使用原子操作分析页面结构...');
    
    const analysisResults = {
      totalLinks: 0,
      numericLinks: 0,
      feedItems: 0,
      userElements: 0,
      timeElements: 0,
      contentElements: 0
    };
    
    try {
      // 总链接数
      const linksOperation = AtomicOperationFactory.createOperation('element.attribute', {
        selector: 'a',
        attribute: 'href',
        multiple: true,
        timeout: 5000,
        filter: (href) => href && href.startsWith('http')
      });
      
      const linksResult = await linksOperation.execute(this.page);
      if (linksResult.success) {
        analysisResults.totalLinks = linksResult.result.length;
        analysisResults.numericLinks = linksResult.result.filter(href => /\d+/.test(href)).length;
      }
      
      // Feed项
      const feedSelectors = [
        '[class*="feed"]',
        '[class*="card"]',
        '[class*="item"]',
        '[class*="post"]'
      ];
      
      for (const selector of feedSelectors) {
        const feedOperation = AtomicOperationFactory.createOperation('element.exists', {
          selector: selector,
          timeout: 3000
        });
        
        const feedResult = await feedOperation.execute(this.page);
        if (feedResult.success && feedResult.result) {
          analysisResults.feedItems++;
        }
      }
      
      // 用户元素
      const userOperation = AtomicOperationFactory.createOperation('element.text', {
        selector: '[class*="name"], [class*="author"], [class*="user"]',
        multiple: true,
        timeout: 5000,
        filter: (text) => text && text.trim().length > 0 && text.trim().length < 50
      });
      
      const userResult = await userOperation.execute(this.page);
      if (userResult.success) {
        analysisResults.userElements = userResult.result.length;
      }
      
      // 时间元素
      const timeOperation = AtomicOperationFactory.createOperation('element.text', {
        selector: 'time, [class*="time"], [class*="date"], span[title*="202"]',
        multiple: true,
        timeout: 5000,
        filter: (text) => text && text.trim().length > 0 && (text.includes(':') || text.includes('-') || text.includes('202'))
      });
      
      const timeResult = await timeOperation.execute(this.page);
      if (timeResult.success) {
        analysisResults.timeElements = timeResult.result.length;
      }
      
      // 内容元素
      const contentOperation = AtomicOperationFactory.createOperation('element.text', {
        selector: '[class*="content"], [class*="text"], [class*="body"]',
        multiple: true,
        timeout: 5000,
        filter: (text) => text && text.trim().length > 5 && text.trim().length < 500
      });
      
      const contentResult = await contentOperation.execute(this.page);
      if (contentResult.success) {
        analysisResults.contentElements = contentResult.result.length;
      }
      
      console.log('📊 页面结构分析结果:');
      console.log(`   - 总链接数: ${analysisResults.totalLinks}`);
      console.log(`   - 数字链接: ${analysisResults.numericLinks}`);
      console.log(`   - Feed项: ${analysisResults.feedItems}`);
      console.log(`   - 用户元素: ${analysisResults.userElements}`);
      console.log(`   - 时间元素: ${analysisResults.timeElements}`);
      console.log(`   - 内容元素: ${analysisResults.contentElements}`);
      
      return analysisResults;
      
    } catch (error) {
      console.error('❌ 页面结构分析失败:', error.message);
      return analysisResults;
    }
  }

  async extractLinksWithNewPatterns() {
    console.log('🔍 使用新模式提取链接...');
    
    try {
      // 等待页面加载
      await this.page.waitForTimeout(3000);
      
      // 滚动加载更多内容
      await this.scrollToLoadMore();
      
      // 分析页面结构
      const analysis = await this.analyzePageStructureWithAtomicOperations();
      
      // 尝试多种链接提取模式
      const linkPatterns = [
        {
          name: '标准状态链接',
          selector: 'a[href*="/status/"]',
          filter: (href) => href && href.includes('/status/') && href.startsWith('http')
        },
        {
          name: '微博ID链接',
          selector: 'a[href*="/u/"]',
          filter: (href) => href && href.includes('/u/') && /\d+/.test(href)
        },
        {
          name: '话题链接',
          selector: 'a[href*="/topic/"]',
          filter: (href) => href && href.includes('/topic/')
        },
        {
          name: '数字ID链接',
          selector: 'a[href*="/"]',
          filter: (href) => href && /\d{8,}/.test(href) && href.includes('weibo.com')
        }
      ];
      
      const extractedLinks = [];
      
      for (const pattern of linkPatterns) {
        console.log(`🔍 尝试提取 ${pattern.name}...`);
        
        const linkOperation = AtomicOperationFactory.createOperation('element.attribute', {
          selector: pattern.selector,
          attribute: 'href',
          multiple: true,
          timeout: 8000,
          filter: pattern.filter
        });
        
        const result = await linkOperation.execute(this.page);
        if (result.success && result.result) {
          const uniqueLinks = [...new Set(result.result)];
          console.log(`✅ ${pattern.name}: ${uniqueLinks.length} 个链接`);
          extractedLinks.push(...uniqueLinks);
        }
      }
      
      // 去重
      const allLinks = [...new Set(extractedLinks)];
      console.log(`📊 总计提取到 ${allLinks.length} 个唯一链接`);
      
      // 提取详细信息
      if (allLinks.length > 0) {
        const targetLinks = allLinks.slice(0, 50); // 目标50个链接
        const detailedPosts = await this.extractPostDetailsWithAtomicOperations(targetLinks);
        this.results.posts = detailedPosts;
        this.results.metadata.totalPosts = detailedPosts.length;
        
        return detailedPosts;
      }
      
      return [];
      
    } catch (error) {
      console.error('❌ 链接提取失败:', error.message);
      throw error;
    }
  }

  async extractPostDetailsWithAtomicOperations(links) {
    console.log('📝 使用原子操作提取帖子详情...');
    
    const detailedPosts = [];
    
    try {
      console.log(`🔍 开始处理 ${links.length} 个链接`);
      
      // 逐个处理每个链接，确保准确性
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const postId = this.extractPostId(link);
        
        if (!postId) {
          console.log(`⚠️ 跳过无效链接: ${link}`);
          continue;
        }
        
        console.log(`📝 处理第 ${i + 1}/${links.length} 个帖子: ${postId}`);
        
        try {
          // 为每个链接创建专门的提取操作
          const postDetail = await this.extractSinglePostDetail(link, postId);
          if (postDetail && this.validatePost(postDetail)) {
            detailedPosts.push(postDetail);
            if (detailedPosts.length <= 10) {
              console.log(`✅ 帖子 ${detailedPosts.length}: ${postDetail.authorName || '未知'} - ${postDetail.postTime || '未知时间'}`);
            }
          }
        } catch (error) {
          console.log(`❌ 处理帖子 ${postId} 失败: ${error.message}`);
        }
        
        // 添加短暂延迟避免过快请求
        if (i % 10 === 0) {
          await this.page.waitForTimeout(500);
        }
      }
      
      console.log(`📋 成功提取 ${detailedPosts.length}/${links.length} 个有效帖子`);
      return detailedPosts;
      
    } catch (error) {
      console.error('❌ 帖子详情提取失败:', error.message);
      return [];
    }
  }
  
  async extractSinglePostDetail(link, postId) {
    // 针对单个帖子的详细信息提取
    const selectors = {
      // 微博帖子的各种选择器
      author: [
        `a[href*="/u/${postId}"]`,
        `a[href*="/u/"]`,
        '[class*="name"]',
        '[class*="author"]',
        '[data-usercard*="true"]'
      ],
      time: [
        'time',
        '[class*="time"]',
        '[class*="date"]',
        'span[title*="202"]'
      ],
      content: [
        '[class*="content"]',
        '[class*="text"]',
        '[class*="body"]',
        '[class*="Feed_body"]'
      ]
    };
    
    // 尝试找到相关的父级元素
    let parentElement = null;
    try {
      // 尝试通过链接找到父级帖子元素
      const linkElement = await this.page.$(`a[href="${link}"], a[href*="${postId}"]`);
      if (linkElement) {
        parentElement = await linkElement.$('..');
      }
    } catch (error) {
      // 如果找不到链接元素，跳过
    }
    
    // 提取作者信息
    let authorName = null;
    for (const selector of selectors.author) {
      try {
        const authorElement = parentElement 
          ? await parentElement.$(selector)
          : await this.page.$(selector);
        if (authorElement) {
          authorName = await authorElement.textContent();
          if (authorName && authorName.trim().length > 0 && authorName.trim().length < 50) {
            authorName = authorName.trim();
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    // 提取时间信息
    let postTime = null;
    for (const selector of selectors.time) {
      try {
        const timeElement = parentElement 
          ? await parentElement.$(selector)
          : await this.page.$(selector);
        if (timeElement) {
          postTime = await timeElement.textContent();
          if (postTime && (postTime.includes(':') || postTime.includes('-') || postTime.includes('202'))) {
            postTime = postTime.trim();
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    // 提取内容信息（限制长度）
    let postContent = null;
    for (const selector of selectors.content) {
      try {
        const contentElement = parentElement 
          ? await parentElement.$(selector)
          : await this.page.$(selector);
        if (contentElement) {
          postContent = await contentElement.textContent();
          if (postContent && postContent.trim().length > 5 && postContent.trim().length < 200) {
            postContent = postContent.trim();
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    return {
      postId: postId,
      postUrl: link,
      authorName: authorName,
      postTime: postTime,
      postContent: postContent,
      extractedAt: new Date().toISOString()
    };
  }

  findBestMatch(link, items) {
    // 简单的最佳匹配算法
    return items.find(item => item && item.trim()) || null;
  }

  extractPostId(postUrl) {
    // 尝试多种ID提取模式
    const patterns = [
      /\/status\/(\d+)/,
      /\/u\/(\d+)/,
      /\/(\d{8,})/,
      /id=(\d+)/
    ];
    
    for (const pattern of patterns) {
      const match = postUrl.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  validatePost(post) {
    return post.postId && post.postUrl;
  }

  async scrollToLoadMore() {
    console.log('📜 滚动页面加载更多内容...');
    
    let scrollCount = 0;
    const maxScrolls = 8; // 增加滚动次数以获取更多链接
    
    while (scrollCount < maxScrolls) {
      // 滚动到底部
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // 等待加载
      await this.page.waitForTimeout(3000);
      
      scrollCount++;
      console.log(`📜 滚动第 ${scrollCount} 次`);
      
      // 检查是否已经有足够的链接
      if (scrollCount >= 5) {
        const currentLinks = await this.page.$$eval('a[href*="/status/"], a[href*="/u/"]', 
          links => links.length);
        console.log(`📊 当前链接数量: ${currentLinks}`);
        if (currentLinks >= 50) {
          console.log('✅ 链接数量已达到目标，停止滚动');
          break;
        }
      }
    }
  }

  async saveResults() {
    const outputPath = path.join('./results', 'new-architecture-link-capture-results.json');
    
    const fs = await import('fs');
    const fsPromises = await import('fs').then(m => m.promises);
    
    try {
      await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    } catch (error) {
      // Directory already exists
    }
    
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
      
      console.log('🧪 开始新架构链接捕获测试...');
      console.log('='.repeat(60));
      
      // 加载Cookie并访问页面
      const accessResult = await this.loadCookiesAndAccess();
      if (!accessResult.success) {
        throw new Error('Cookie加载和访问失败');
      }
      
      // 提取链接
      const posts = await this.extractLinksWithNewPatterns();
      
      // 保存结果
      const outputPath = await this.saveResults();
      
      console.log('='.repeat(60));
      console.log('🎉 新架构链接捕获测试完成！');
      console.log(`📊 测试结果:`);
      console.log(`   - 架构: Cookie Management + Atomic Operations`);
      console.log(`   - 总帖子数: ${posts.length}`);
      console.log(`   - Cookie加载: ${accessResult.loaded ? '成功' : '失败'}`);
      console.log(`   - 登录状态: ${accessResult.isLoggedIn ? '已登录' : '未登录'}`);
      console.log(`   - 结果文件: ${outputPath}`);
      console.log(`   - 成功状态: ${posts.length > 0 ? '成功' : '部分成功'}`);
      
      // 显示结果示例
      if (posts.length > 0) {
        console.log(`\n📋 提取结果示例:`);
        posts.slice(0, 3).forEach((post, index) => {
          console.log(`   ${index + 1}. ${post.authorName || '未知作者'} - ${post.postTime || '未知时间'}`);
          console.log(`      链接: ${post.postUrl}`);
          console.log(`      内容: ${post.postContent ? post.postContent.substring(0, 50) + '...' : '无内容'}`);
        });
      }
      
      this.results.metadata.success = true;
      
      return {
        success: true,
        posts: posts,
        outputPath: outputPath,
        totalPosts: posts.length,
        cookieLoaded: accessResult.loaded,
        isLoggedIn: accessResult.isLoggedIn,
        architecture: 'Cookie Management + Atomic Operations'
      };
      
    } catch (error) {
      console.error('❌ 新架构测试失败:', error.message);
      
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
const test = new NewArchitectureLinkCapture();
test.run().then((result) => {
  if (result.success) {
    console.log('✅ 新架构链接捕获测试成功');
    process.exit(0);
  } else {
    console.log('❌ 新架构链接捕获测试失败');
    process.exit(1);
  }
}).catch((error) => {
  console.error('💥 测试异常:', error);
  process.exit(1);
});