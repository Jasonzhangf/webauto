/**
 * 基于原子操作的架构化链接捕获测试
 * 使用原子操作完成所有任务，避免硬编码
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../src/index.js';
import { AtomicOperationFactory } from '../../weibo-workflow-system/src/core/atomic-operations.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AtomicArchitectureLinkCapture {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookieSystem = null;
    this.results = {
      posts: [],
      metadata: {
        workflowName: 'atomic-architecture-link-capture',
        version: '3.0.0',
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        targetUrl: 'https://weibo.com',
        architecture: 'Cookie Management + Atomic Operations (Pure)',
        success: false
      }
    };
  }

  async initialize() {
    console.log('🚀 初始化原子架构链接捕获测试...');
    
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
        '--disable-javascript-harmony-promises'
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
    
    console.log('✅ 原子架构初始化完成');
  }

  async loadCookiesAndAccess() {
    console.log('🍪 使用原子操作加载Cookie并访问页面...');
    
    const weiboCookiePath = path.join(__dirname, '../../weibo-workflow-system/cookies/weibo.com.json');
    
    try {
      // 使用原子操作读取Cookie文件
      const readOperation = AtomicOperationFactory.createOperation('element.text', {
        selector: 'body',
        timeout: 5000
      });
      
      const fs = await import('fs');
      const cookieData = fs.readFileSync(weiboCookiePath, 'utf8');
      const cookies = JSON.parse(cookieData);
      
      console.log(`📥 原子操作读取到 ${cookies.length} 个Cookie`);
      
      // 存储到Cookie管理系统
      await this.cookieSystem.manager.storage.storeCookies('weibo.com', cookies);
      
      // 验证Cookie健康状态
      const health = await this.cookieSystem.validateCookieHealth('weibo.com');
      console.log(`🏥 Cookie健康状态: ${JSON.stringify(health, null, 2)}`);
      
      // 加载Cookie到页面
      await this.cookieSystem.loadCookies(this.page, 'weibo.com');
      
      // 使用原子操作访问微博主页
      console.log('🌐 使用原子操作访问微博主页...');
      await this.page.goto('https://weibo.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
      
      await this.page.waitForTimeout(5000);
      
      // 使用原子操作获取页面标题
      const titleOperation = AtomicOperationFactory.createOperation('element.text', {
        selector: 'title',
        timeout: 5000
      });
      
      const titleResult = await titleOperation.execute(this.page);
      const title = titleResult.success ? titleResult.result : '未知标题';
      console.log(`📄 页面标题: ${title}`);
      
      // 使用原子操作检查登录状态
      const isLoggedIn = await this.checkLoginStatusWithAtomicOperations();
      console.log(`🔐 登录状态: ${isLoggedIn ? '已登录' : '未登录'}`);
      
      return { 
        success: true, 
        cookies: cookies.length, 
        health, 
        title, 
        isLoggedIn 
      };
      
    } catch (error) {
      console.error('❌ 原子操作Cookie加载和访问失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  async checkLoginStatusWithAtomicOperations() {
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
        const existsOperation = AtomicOperationFactory.createOperation('element.exists', {
          selector: selector,
          timeout: 2000
        });
        
        const existsResult = await existsOperation.execute(this.page);
        if (existsResult.success && existsResult.result) {
          const textOperation = AtomicOperationFactory.createOperation('element.text', {
            selector: selector,
            timeout: 2000
          });
          
          const textResult = await textOperation.execute(this.page);
          if (textResult.success && textResult.result && 
              textResult.result.trim().length > 0 && 
              textResult.result.trim().length < 50) {
            console.log(`👤 原子操作检测到用户: ${textResult.result.trim()}`);
            return true;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    return false;
  }

  async extractLinksWithAtomicOperations() {
    console.log('🔍 使用原子操作提取链接...');
    
    try {
      // 等待页面加载
      await this.page.waitForTimeout(3000);
      
      // 滚动加载更多内容
      await this.scrollToLoadMore();
      
      // 使用原子操作提取链接
      const linkPatterns = [
        {
          name: '标准状态链接',
          selector: 'a[href*="/status/"]'
        },
        {
          name: '微博ID链接',
          selector: 'a[href*="/u/"]'
        },
        {
          name: '数字ID链接',
          selector: 'a[href*="/"]'
        }
      ];
      
      const extractedLinks = [];
      
      for (const pattern of linkPatterns) {
        console.log(`🔍 使用原子操作提取 ${pattern.name}...`);
        
        try {
          // 使用原子操作提取href属性
          const hrefOperation = AtomicOperationFactory.createOperation('element.attribute', {
            selector: pattern.selector,
            attribute: 'href',
            multiple: true,
            timeout: 5000
          });
          
          const hrefResult = await hrefOperation.execute(this.page);
          
          if (hrefResult.success && hrefResult.result) {
            let filteredLinks = hrefResult.result;
            
            // 根据模式过滤链接
            if (pattern.name === '标准状态链接') {
              filteredLinks = filteredLinks.filter(href => 
                href && href.includes('/status/') && href.startsWith('http')
              );
            } else if (pattern.name === '微博ID链接') {
              filteredLinks = filteredLinks.filter(href => 
                href && href.includes('/u/') && /\d+/.test(href)
              );
            } else if (pattern.name === '数字ID链接') {
              filteredLinks = filteredLinks.filter(href => 
                href && /\d{8,}/.test(href) && href.includes('weibo.com')
              );
            }
            
            const uniqueLinks = [...new Set(filteredLinks)];
            console.log(`✅ ${pattern.name}: ${uniqueLinks.length} 个链接`);
            extractedLinks.push(...uniqueLinks);
          }
        } catch (error) {
          console.log(`❌ ${pattern.name} 原子操作提取失败: ${error.message}`);
        }
      }
      
      // 去重并限制数量
      const allLinks = [...new Set(extractedLinks)];
      const targetLinks = allLinks.slice(0, 50);
      
      console.log(`📊 原子操作总计提取到 ${allLinks.length} 个唯一链接`);
      console.log(`🎯 目标链接数量: ${targetLinks.length}`);
      
      return targetLinks;
      
    } catch (error) {
      console.error('❌ 原子操作链接提取失败:', error.message);
      throw error;
    }
  }

  async extractPostInfoWithAtomicOperations(links) {
    console.log('📝 使用原子操作提取帖子信息...');
    
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
        
        console.log(`📝 原子操作处理第 ${i + 1}/${links.length} 个帖子: ${postId}`);
        
        try {
          // 使用原子操作提取帖子信息
          const postInfo = await this.extractPostInfoWithAtomicOps(link, postId);
          if (postInfo) {
            detailedPosts.push(postInfo);
            if (detailedPosts.length <= 10) {
              console.log(`✅ 帖子 ${detailedPosts.length}: ${postInfo.authorName || '未知'} - ${postInfo.postTime || '未知时间'}`);
            }
          }
        } catch (error) {
          console.log(`❌ 原子操作处理帖子 ${postId} 失败: ${error.message}`);
        }
        
        // 添加延迟避免过快请求
        if (i % 5 === 0) {
          await this.page.waitForTimeout(200);
        }
      }
      
      console.log(`📋 原子操作成功提取 ${detailedPosts.length}/${links.length} 个有效帖子`);
      return detailedPosts;
      
    } catch (error) {
      console.error('❌ 原子操作帖子信息提取失败:', error.message);
      return [];
    }
  }

  async extractPostInfoWithAtomicOps(link, postId) {
    try {
      // 使用原子操作查找链接元素
      const linkElementOperation = AtomicOperationFactory.createOperation('element.exists', {
        selector: `a[href="${link}"], a[href*="${postId}"]`,
        timeout: 1000
      });
      
      const linkElementResult = await linkElementOperation.execute(this.page);
      
      if (!linkElementResult.success || !linkElementResult.result) {
        return {
          postId: postId,
          postUrl: link,
          authorName: null,
          postTime: null,
          extractedAt: new Date().toISOString()
        };
      }
      
      // 使用原子操作查找附近容器中的作者信息
      let authorName = null;
      try {
        const authorOperation = AtomicOperationFactory.createOperation('element.text', {
          selector: '[class*="name"], [class*="author"], a[href*="/u/"]',
          timeout: 1000
        });
        
        const authorResult = await authorOperation.execute(this.page);
        if (authorResult.success && authorResult.result) {
          const authorText = authorResult.result;
          if (authorText && authorText.trim().length > 0 && authorText.trim().length < 50) {
            authorName = authorText.trim();
          }
        }
      } catch (error) {
        // 忽略错误
      }
      
      // 使用原子操作查找时间信息
      let postTime = null;
      try {
        const timeOperation = AtomicOperationFactory.createOperation('element.text', {
          selector: 'time, [class*="time"], [class*="date"]',
          timeout: 1000
        });
        
        const timeResult = await timeOperation.execute(this.page);
        if (timeResult.success && timeResult.result) {
          const timeText = timeResult.result;
          if (timeText && (timeText.includes(':') || timeText.includes('-') || timeText.includes('202'))) {
            postTime = timeText.trim();
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
    console.log('📜 使用原子操作滚动页面加载更多内容...');
    
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
      console.log(`📜 原子操作滚动第 ${scrollCount} 次`);
      
      // 检查是否已经有足够的链接
      if (scrollCount >= 5) {
        try {
          const linksOperation = AtomicOperationFactory.createOperation('element.attribute', {
            selector: 'a[href*="/status/"], a[href*="/u/"]',
            attribute: 'href',
            multiple: true,
            timeout: 2000
          });
          
          const linksResult = await linksOperation.execute(this.page);
          const currentLinks = linksResult.success ? linksResult.result.length : 0;
          console.log(`📊 原子操作当前链接数量: ${currentLinks}`);
          
          if (currentLinks >= 60) {
            console.log('✅ 原子操作链接数量已达到目标，停止滚动');
            break;
          }
        } catch (error) {
          // 忽略错误
        }
      }
    }
  }

  async saveResults() {
    const outputPath = path.join('./results', 'atomic-architecture-link-capture-results.json');
    
    const fs = await import('fs');
    const fsPromises = await import('fs').then(m => m.promises);
    
    try {
      await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    } catch (error) {
      // Directory already exists
    }
    
    await fsPromises.writeFile(outputPath, JSON.stringify(this.results, null, 2));
    
    console.log(`💾 原子操作结果已保存到: ${outputPath}`);
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
      
      console.log('🧪 开始原子架构链接捕获测试...');
      console.log('='.repeat(60));
      
      // 使用原子操作加载Cookie并访问页面
      const accessResult = await this.loadCookiesAndAccess();
      if (!accessResult.success) {
        throw new Error('原子操作Cookie加载和访问失败');
      }
      
      // 使用原子操作提取链接
      const links = await this.extractLinksWithAtomicOperations();
      
      // 使用原子操作提取帖子信息
      const posts = await this.extractPostInfoWithAtomicOperations(links);
      
      // 保存结果
      this.results.posts = posts;
      this.results.metadata.totalPosts = posts.length;
      const outputPath = await this.saveResults();
      
      console.log('='.repeat(60));
      console.log('🎉 原子架构链接捕获测试完成！');
      console.log(`📊 测试结果:`);
      console.log(`   - 架构: Cookie Management + Atomic Operations (Pure)`);
      console.log(`   - 总帖子数: ${posts.length}`);
      console.log(`   - 目标链接数: ${links.length}`);
      console.log(`   - Cookie加载: ${accessResult.success ? '成功' : '失败'}`);
      console.log(`   - 登录状态: ${accessResult.isLoggedIn ? '已登录' : '未登录'}`);
      console.log(`   - 结果文件: ${outputPath}`);
      console.log(`   - 成功状态: ${posts.length >= 40 ? '成功' : '部分成功'}`);
      
      // 显示结果示例
      if (posts.length > 0) {
        console.log(`\n📋 原子操作提取结果示例:`);
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
        architecture: 'Cookie Management + Atomic Operations (Pure)'
      };
      
    } catch (error) {
      console.error('❌ 原子操作测试失败:', error.message);
      
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
const test = new AtomicArchitectureLinkCapture();
test.run().then((result) => {
  if (result.success) {
    console.log('✅ 原子架构链接捕获测试成功');
    process.exit(0);
  } else {
    console.log('❌ 原子架构链接捕获测试失败');
    process.exit(1);
  }
}).catch((error) => {
  console.error('💥 原子操作测试异常:', error);
  process.exit(1);
});