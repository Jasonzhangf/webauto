/**
 * 修复版新架构链接捕获测试
 * 解决内容重复、数量不对、内容过多的问题
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../src/index.js';
import { AtomicOperationFactory } from '../../weibo-workflow-system/src/core/atomic-operations.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FixedNewArchitectureLinkCapture {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookieSystem = null;
    this.results = {
      posts: [],
      metadata: {
        workflowName: 'fixed-new-architecture-link-capture',
        version: '2.1.0',
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        targetUrl: 'https://weibo.com',
        architecture: 'Cookie Management + Atomic Operations (Fixed)',
        success: false
      }
    };
  }

  async initialize() {
    console.log('🚀 初始化修复版新架构链接捕获测试...');
    
    // 初始化Cookie管理系统
    this.cookieSystem = new WebAutoCookieManagementSystem({
      storagePath: path.join(__dirname, '../test-cookies'),
      encryptionEnabled: false,
      autoRefresh: false,
      validationEnabled: true
    });
    
    await this.cookieSystem.initialize();
    
    // 初始化浏览器
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
    
    console.log('✅ 修复版新架构初始化完成');
  }

  async loadCookiesAndAccess() {
    console.log('🍪 加载Cookie并访问页面...');
    
    const weiboCookiePath = path.join(__dirname, '../../weibo-workflow-system/cookies/weibo.com.json');
    
    try {
      // 读取Cookie文件
      const fs = await import('fs');
      const cookieData = fs.readFileSync(weiboCookiePath, 'utf8');
      const cookies = JSON.parse(cookieData);
      
      console.log(`📥 读取到 ${cookies.length} 个Cookie`);
      
      // 存储到Cookie管理系统
      await this.cookieSystem.manager.storage.storeCookies('weibo.com', cookies);
      
      // 验证Cookie健康状态
      const health = await this.cookieSystem.validateCookieHealth('weibo.com');
      console.log(`🏥 Cookie健康状态: ${JSON.stringify(health, null, 2)}`);
      
      // 加载Cookie到页面
      await this.cookieSystem.loadCookies(this.page, 'weibo.com');
      
      // 访问微博主页
      console.log('🌐 访问微博主页...');
      await this.page.goto('https://weibo.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
      
      await this.page.waitForTimeout(5000);
      
      // 获取页面标题
      const title = await this.page.title();
      console.log(`📄 页面标题: ${title}`);
      
      // 检查登录状态
      const isLoggedIn = await this.checkLoginStatus();
      console.log(`🔐 登录状态: ${isLoggedIn ? '已登录' : '未登录'}`);
      
      return { 
        success: true, 
        cookies: cookies.length, 
        health, 
        title, 
        isLoggedIn 
      };
      
    } catch (error) {
      console.error('❌ Cookie加载和访问失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  async checkLoginStatus() {
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
    
    for (const selector of loginSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim().length > 0 && text.trim().length < 50) {
            console.log(`👤 检测到用户: ${text.trim()}`);
            return true;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    return false;
  }

  async extractLinksOnly() {
    console.log('🔍 提取链接（仅链接，不提取内容）...');
    
    try {
      // 等待页面加载
      await this.page.waitForTimeout(3000);
      
      // 滚动加载更多内容
      await this.scrollToLoadMore();
      
      // 定义链接提取模式
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
          name: '数字ID链接',
          selector: 'a[href*="/"]',
          filter: (href) => href && /\d{8,}/.test(href) && href.includes('weibo.com')
        }
      ];
      
      const extractedLinks = [];
      
      for (const pattern of linkPatterns) {
        console.log(`🔍 尝试提取 ${pattern.name}...`);
        
        try {
          const links = await this.page.$$eval(pattern.selector, 
            (elements, filter) => {
              return elements
                .map(el => el.getAttribute('href'))
                .filter(href => filter(href));
            }, pattern.filter);
          
          const uniqueLinks = [...new Set(links)];
          console.log(`✅ ${pattern.name}: ${uniqueLinks.length} 个链接`);
          extractedLinks.push(...uniqueLinks);
        } catch (error) {
          console.log(`❌ ${pattern.name} 提取失败: ${error.message}`);
        }
      }
      
      // 去重并限制数量
      const allLinks = [...new Set(extractedLinks)];
      const targetLinks = allLinks.slice(0, 50);
      
      console.log(`📊 总计提取到 ${allLinks.length} 个唯一链接`);
      console.log(`🎯 目标链接数量: ${targetLinks.length}`);
      
      return targetLinks;
      
    } catch (error) {
      console.error('❌ 链接提取失败:', error.message);
      throw error;
    }
  }

  async extractBasicPostInfo(links) {
    console.log('📝 提取基本帖子信息（仅作者和时间）...');
    
    const detailedPosts = [];
    
    try {
      console.log(`🔍 开始处理 ${links.length} 个链接`);
      
      // 逐个处理每个链接
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const postId = this.extractPostId(link);
        
        if (!postId) {
          console.log(`⚠️ 跳过无效链接: ${link}`);
          continue;
        }
        
        console.log(`📝 处理第 ${i + 1}/${links.length} 个帖子: ${postId}`);
        
        try {
          // 提取基本的作者和时间信息
          const postInfo = await this.extractBasicInfo(link, postId);
          if (postInfo) {
            detailedPosts.push(postInfo);
            if (detailedPosts.length <= 10) {
              console.log(`✅ 帖子 ${detailedPosts.length}: ${postInfo.authorName || '未知'} - ${postInfo.postTime || '未知时间'}`);
            }
          }
        } catch (error) {
          console.log(`❌ 处理帖子 ${postId} 失败: ${error.message}`);
        }
        
        // 添加延迟避免过快请求
        if (i % 5 === 0) {
          await this.page.waitForTimeout(200);
        }
      }
      
      console.log(`📋 成功提取 ${detailedPosts.length}/${links.length} 个有效帖子`);
      return detailedPosts;
      
    } catch (error) {
      console.error('❌ 帖子信息提取失败:', error.message);
      return [];
    }
  }

  async extractBasicInfo(link, postId) {
    // 尝试通过链接元素找到附近的作者和时间信息
    try {
      // 查找链接元素
      const linkElement = await this.page.$(`a[href="${link}"], a[href*="${postId}"]`);
      if (!linkElement) {
        return {
          postId: postId,
          postUrl: link,
          authorName: null,
          postTime: null,
          extractedAt: new Date().toISOString()
        };
      }
      
      // 查找父级容器
      let parentElement = linkElement;
      for (let i = 0; i < 3; i++) {
        const parent = await parentElement.$('..');
        if (parent) {
          parentElement = parent;
        } else {
          break;
        }
      }
      
      // 在父级容器中查找作者信息
      let authorName = null;
      try {
        const authorElement = await parentElement.$('[class*="name"], [class*="author"], a[href*="/u/"]');
        if (authorElement) {
          authorName = await authorElement.textContent();
          if (authorName && authorName.trim().length > 0 && authorName.trim().length < 50) {
            authorName = authorName.trim();
          }
        }
      } catch (error) {
        // 忽略错误
      }
      
      // 在父级容器中查找时间信息
      let postTime = null;
      try {
        const timeElement = await parentElement.$('time, [class*="time"], [class*="date"]');
        if (timeElement) {
          postTime = await timeElement.textContent();
          if (postTime && (postTime.includes(':') || postTime.includes('-') || postTime.includes('202'))) {
            postTime = postTime.trim();
          }
        }
      } catch (error) {
        // 忽略错误
      }
      
      return {
        postId: postId,
        postUrl: link,
        authorName: authorName,
        postTime: postTime,
        extractedAt: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        postId: postId,
        postUrl: link,
        authorName: null,
        postTime: null,
        extractedAt: new Date().toISOString()
      };
    }
  }

  extractPostId(postUrl) {
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

  async scrollToLoadMore() {
    console.log('📜 滚动页面加载更多内容...');
    
    let scrollCount = 0;
    const maxScrolls = 10;
    
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
        try {
          const currentLinks = await this.page.$$eval('a[href*="/status/"], a[href*="/u/"]', 
            links => links.length);
          console.log(`📊 当前链接数量: ${currentLinks}`);
          if (currentLinks >= 60) { // 稍微多提取一些以确保有50个有效链接
            console.log('✅ 链接数量已达到目标，停止滚动');
            break;
          }
        } catch (error) {
          // 忽略错误
        }
      }
    }
  }

  async saveResults() {
    const outputPath = path.join('./results', 'fixed-new-architecture-link-capture-results.json');
    
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
      
      console.log('🧪 开始修复版新架构链接捕获测试...');
      console.log('='.repeat(60));
      
      // 加载Cookie并访问页面
      const accessResult = await this.loadCookiesAndAccess();
      if (!accessResult.success) {
        throw new Error('Cookie加载和访问失败');
      }
      
      // 只提取链接
      const links = await this.extractLinksOnly();
      
      // 提取基本帖子信息（不包括内容）
      const posts = await this.extractBasicPostInfo(links);
      
      // 保存结果
      this.results.posts = posts;
      this.results.metadata.totalPosts = posts.length;
      const outputPath = await this.saveResults();
      
      console.log('='.repeat(60));
      console.log('🎉 修复版新架构链接捕获测试完成！');
      console.log(`📊 测试结果:`);
      console.log(`   - 架构: Cookie Management + Atomic Operations (Fixed)`);
      console.log(`   - 总帖子数: ${posts.length}`);
      console.log(`   - 目标链接数: ${links.length}`);
      console.log(`   - Cookie加载: ${accessResult.success ? '成功' : '失败'}`);
      console.log(`   - 登录状态: ${accessResult.isLoggedIn ? '已登录' : '未登录'}`);
      console.log(`   - 结果文件: ${outputPath}`);
      console.log(`   - 成功状态: ${posts.length >= 40 ? '成功' : '部分成功'}`);
      
      // 显示结果示例
      if (posts.length > 0) {
        console.log(`\n📋 提取结果示例 (仅链接和基本信息):`);
        posts.slice(0, 5).forEach((post, index) => {
          console.log(`   ${index + 1}. ${post.authorName || '未知作者'} - ${post.postTime || '未知时间'}`);
          console.log(`      链接: ${post.postUrl}`);
          console.log(`      ID: ${post.postId}`);
        });
      }
      
      this.results.metadata.success = true;
      
      return {
        success: true,
        posts: posts,
        outputPath: outputPath,
        totalPosts: posts.length,
        totalLinks: links.length,
        cookieLoaded: accessResult.success,
        isLoggedIn: accessResult.isLoggedIn,
        architecture: 'Cookie Management + Atomic Operations (Fixed)'
      };
      
    } catch (error) {
      console.error('❌ 修复版测试失败:', error.message);
      
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
const test = new FixedNewArchitectureLinkCapture();
test.run().then((result) => {
  if (result.success) {
    console.log('✅ 修复版新架构链接捕获测试成功');
    process.exit(0);
  } else {
    console.log('❌ 修复版新架构链接捕获测试失败');
    process.exit(1);
  }
}).catch((error) => {
  console.error('💥 测试异常:', error);
  process.exit(1);
});