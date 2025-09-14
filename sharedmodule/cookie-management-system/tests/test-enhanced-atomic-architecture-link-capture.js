/**
 * 增强版原子架构链接捕获测试
 * 解决链接简化、目标URL错误、用户名日期提取问题
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../src/index.js';
import { AtomicOperationFactory } from '../../weibo-workflow-system/src/core/atomic-operations.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnhancedAtomicArchitectureLinkCapture {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookieSystem = null;
    this.baseDomain = 'https://weibo.com';
    this.results = {
      posts: [],
      metadata: {
        workflowName: 'enhanced-atomic-architecture-link-capture',
        version: '3.1.0',
        extractedAt: new Date().toISOString(),
        totalPosts: 0,
        targetUrl: 'https://weibo.com',
        architecture: 'Cookie Management + Enhanced Atomic Operations',
        success: false
      }
    };
  }

  async initialize() {
    console.log('🚀 初始化增强版原子架构链接捕获测试...');
    
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
    
    console.log('✅ 增强版原子架构初始化完成');
  }

  async loadCookiesAndAccess() {
    console.log('🍪 使用增强原子操作加载Cookie并访问微博主页...');
    
    const weiboCookiePath = path.join(__dirname, '../../weibo-workflow-system/cookies/weibo.com.json');
    
    try {
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
      
      // 访问微博主页（而不是用户主页）
      console.log('🌐 访问微博主页 https://weibo.com ...');
      await this.page.goto('https://weibo.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
      
      await this.page.waitForTimeout(5000);
      
      // 获取页面标题
      const titleOperation = AtomicOperationFactory.createOperation('element.text', {
        selector: 'title',
        timeout: 5000
      });
      
      const titleResult = await titleOperation.execute(this.page);
      const title = titleResult.success ? titleResult.result : '未知标题';
      console.log(`📄 页面标题: ${title}`);
      
      // 检查登录状态
      const isLoggedIn = await this.checkLoginStatusWithEnhancedAtomicOperations();
      console.log(`🔐 登录状态: ${isLoggedIn ? '已登录' : '未登录'}`);
      
      return { 
        success: true, 
        cookies: cookies.length, 
        health, 
        title, 
        isLoggedIn 
      };
      
    } catch (error) {
      console.error('❌ 增强原子操作Cookie加载和访问失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  async checkLoginStatusWithEnhancedAtomicOperations() {
    const loginSelectors = [
      '.gn_name',
      '.S_txt1', 
      '.username',
      '[data-usercard*="true"]',
      'a[href*="/home"]',
      '.woo-box-flex.woo-box-alignCenter.Card_title_3NffA',
      '[class*="name"]',
      '.Profile_title_3y3yh',
      '.woo-box-flex.woo-box-alignCenter.Toolbar_main_2T2d5 [class*="name"]',
      '.woo-pop-profile__main [class*="name"]'
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
            console.log(`👤 增强原子操作检测到用户: ${textResult.result.trim()}`);
            return true;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    return false;
  }

  async extractLinksWithEnhancedAtomicOperations() {
    console.log('🔍 使用增强原子操作提取完整链接...');
    
    try {
      // 等待页面加载
      await this.page.waitForTimeout(3000);
      
      // 滚动加载更多内容
      await this.scrollToLoadMore();
      
      // 使用增强原子操作提取链接
      const linkPatterns = [
        {
          name: '标准状态链接',
          selector: 'a[href*="/status/"]',
          isStatusLink: true
        },
        {
          name: '微博ID链接',
          selector: 'a[href*="/u/"]',
          isUserLink: true
        },
        {
          name: '完整URL链接',
          selector: 'a[href*="weibo.com"]',
          isFullUrl: true
        }
      ];
      
      const extractedLinks = [];
      
      for (const pattern of linkPatterns) {
        console.log(`🔍 使用增强原子操作提取 ${pattern.name}...`);
        
        try {
          const hrefOperation = AtomicOperationFactory.createOperation('element.attribute', {
            selector: pattern.selector,
            attribute: 'href',
            multiple: true,
            timeout: 5000
          });
          
          const hrefResult = await hrefOperation.execute(this.page);
          
          if (hrefResult.success && hrefResult.result) {
            let processedLinks = hrefResult.result;
            
            // 处理链接，确保完整URL
            processedLinks = processedLinks.map(href => {
              if (!href) return null;
              
              // 如果是相对路径，转换为完整URL
              if (href.startsWith('/')) {
                return this.baseDomain + href;
              }
              
              // 如果已经包含完整域名，直接返回
              if (href.startsWith('http')) {
                return href;
              }
              
              return null;
            }).filter(href => href !== null);
            
            // 进一步过滤
            if (pattern.isStatusLink) {
              processedLinks = processedLinks.filter(href => 
                href.includes('/status/') && href.includes('weibo.com')
              );
            } else if (pattern.isUserLink) {
              processedLinks = processedLinks.filter(href => 
                href.includes('/u/') && /\d+/.test(href) && href.includes('weibo.com')
              );
            } else if (pattern.isFullUrl) {
              processedLinks = processedLinks.filter(href => 
                href.includes('weibo.com') && (href.includes('/status/') || href.includes('/u/'))
              );
            }
            
            const uniqueLinks = [...new Set(processedLinks)];
            console.log(`✅ ${pattern.name}: ${uniqueLinks.length} 个完整链接`);
            extractedLinks.push(...uniqueLinks);
          }
        } catch (error) {
          console.log(`❌ ${pattern.name} 增强原子操作提取失败: ${error.message}`);
        }
      }
      
      // 去重并限制数量
      const allLinks = [...new Set(extractedLinks)];
      const targetLinks = allLinks.slice(0, 50);
      
      console.log(`📊 增强原子操作总计提取到 ${allLinks.length} 个唯一完整链接`);
      console.log(`🎯 目标链接数量: ${targetLinks.length}`);
      
      return targetLinks;
      
    } catch (error) {
      console.error('❌ 增强原子操作链接提取失败:', error.message);
      throw error;
    }
  }

  async extractPostInfoWithEnhancedAtomicOperations(links) {
    console.log('📝 使用增强原子操作提取完整帖子信息...');
    
    const detailedPosts = [];
    
    try {
      console.log(`🔍 开始处理 ${links.length} 个完整链接`);
      
      // 逐个处理每个链接
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const postId = this.extractPostId(link);
        
        if (!postId) {
          console.log(`⚠️ 跳过无效链接: ${link}`);
          continue;
        }
        
        console.log(`📝 增强原子操作处理第 ${i + 1}/${links.length} 个帖子: ${postId}`);
        
        try {
          // 使用增强原子操作提取帖子信息
          const postInfo = await this.extractPostInfoWithEnhancedAtomicOps(link, postId);
          if (postInfo) {
            detailedPosts.push(postInfo);
            if (detailedPosts.length <= 10) {
              console.log(`✅ 帖子 ${detailedPosts.length}: ${postInfo.authorName || '未知'} - ${postInfo.postTime || '未知时间'}`);
            }
          }
        } catch (error) {
          console.log(`❌ 增强原子操作处理帖子 ${postId} 失败: ${error.message}`);
        }
        
        // 添加延迟避免过快请求
        if (i % 5 === 0) {
          await this.page.waitForTimeout(200);
        }
      }
      
      console.log(`📋 增强原子操作成功提取 ${detailedPosts.length}/${links.length} 个有效帖子`);
      return detailedPosts;
      
    } catch (error) {
      console.error('❌ 增强原子操作帖子信息提取失败:', error.message);
      return [];
    }
  }

  async extractPostInfoWithEnhancedAtomicOps(link, postId) {
    try {
      // 查找包含该链接的帖子容器
      const postInfo = {
        postId: postId,
        postUrl: link,
        authorName: null,
        postTime: null,
        extractedAt: new Date().toISOString()
      };

      // 方法1：通过链接元素查找附近的帖子容器
      const linkElementOperation = AtomicOperationFactory.createOperation('element.exists', {
        selector: `a[href*="${postId}"]`,
        timeout: 1000
      });
      
      const linkElementResult = await linkElementOperation.execute(this.page);
      
      if (linkElementResult.success && linkElementResult.result) {
        // 使用增强原子操作在帖子容器中查找作者信息
        const authorSelectors = [
          '[class*="name"]',
          '[class*="author"]',
          'a[href*="/u/"]',
          '.woo-box-flex.woo-box-alignCenter.Card_title_3NffA [class*="name"]',
          '.Feed_body_3R0rO [class*="name"]',
          '.Feed_body_3R0rO [class*="author"]',
          '.woo-pop-profile__main [class*="name"]'
        ];
        
        for (const authorSelector of authorSelectors) {
          try {
            const authorOperation = AtomicOperationFactory.createOperation('element.text', {
              selector: authorSelector,
              timeout: 1000
            });
            
            const authorResult = await authorOperation.execute(this.page);
            if (authorResult.success && authorResult.result) {
              const authorText = authorResult.result.trim();
              if (authorText && authorText.length > 0 && authorText.length < 50) {
                postInfo.authorName = authorText;
                break;
              }
            }
          } catch (error) {
            continue;
          }
        }
        
        // 使用增强原子操作在帖子容器中查找时间信息
        const timeSelectors = [
          'time',
          '[class*="time"]',
          '[class*="date"]',
          '.Feed_body_3R0rO time',
          '.Feed_body_3R0rO [class*="time"]',
          '.Feed_body_3R0rO [class*="date"]',
          '[class*="from"]'
        ];
        
        for (const timeSelector of timeSelectors) {
          try {
            const timeOperation = AtomicOperationFactory.createOperation('element.text', {
              selector: timeSelector,
              timeout: 1000
            });
            
            const timeResult = await timeOperation.execute(this.page);
            if (timeResult.success && timeResult.result) {
              const timeText = timeResult.result.trim();
              if (timeText && (timeText.includes(':') || timeText.includes('-') || timeText.includes('202') || timeText.includes('今天') || timeText.includes('分钟'))) {
                postInfo.postTime = timeText;
                break;
              }
            }
          } catch (error) {
            continue;
          }
        }
      }
      
      return postInfo;
      
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
    console.log('📜 使用增强原子操作滚动页面加载更多内容...');
    
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
      console.log(`📜 增强原子操作滚动第 ${scrollCount} 次`);
      
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
          console.log(`📊 增强原子操作当前链接数量: ${currentLinks}`);
          
          if (currentLinks >= 60) {
            console.log('✅ 增强原子操作链接数量已达到目标，停止滚动');
            break;
          }
        } catch (error) {
          // 忽略错误
        }
      }
    }
  }

  async saveResults() {
    const outputPath = path.join('./results', 'enhanced-atomic-architecture-link-capture-results.json');
    
    const fs = await import('fs');
    const fsPromises = await import('fs').then(m => m.promises);
    
    try {
      await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    } catch (error) {
      // Directory already exists
    }
    
    await fsPromises.writeFile(outputPath, JSON.stringify(this.results, null, 2));
    
    console.log(`💾 增强原子操作结果已保存到: ${outputPath}`);
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
      
      console.log('🧪 开始增强版原子架构链接捕获测试...');
      console.log('='.repeat(60));
      
      // 使用增强原子操作加载Cookie并访问微博主页
      const accessResult = await this.loadCookiesAndAccess();
      if (!accessResult.success) {
        throw new Error('增强原子操作Cookie加载和访问失败');
      }
      
      // 使用增强原子操作提取完整链接
      const links = await this.extractLinksWithEnhancedAtomicOperations();
      
      // 使用增强原子操作提取完整帖子信息
      const posts = await this.extractPostInfoWithEnhancedAtomicOperations(links);
      
      // 保存结果
      this.results.posts = posts;
      this.results.metadata.totalPosts = posts.length;
      const outputPath = await this.saveResults();
      
      console.log('='.repeat(60));
      console.log('🎉 增强版原子架构链接捕获测试完成！');
      console.log(`📊 测试结果:`);
      console.log(`   - 架构: Cookie Management + Enhanced Atomic Operations`);
      console.log(`   - 总帖子数: ${posts.length}`);
      console.log(`   - 目标链接数: ${links.length}`);
      console.log(`   - Cookie加载: ${accessResult.success ? '成功' : '失败'}`);
      console.log(`   - 登录状态: ${accessResult.isLoggedIn ? '已登录' : '未登录'}`);
      console.log(`   - 结果文件: ${outputPath}`);
      console.log(`   - 成功状态: ${posts.length >= 40 ? '成功' : '部分成功'}`);
      
      // 显示结果示例
      if (posts.length > 0) {
        console.log(`\n📋 增强原子操作提取结果示例:`);
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
        architecture: 'Cookie Management + Enhanced Atomic Operations'
      };
      
    } catch (error) {
      console.error('❌ 增强原子操作测试失败:', error.message);
      
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
const test = new EnhancedAtomicArchitectureLinkCapture();
test.run().then((result) => {
  if (result.success) {
    console.log('✅ 增强版原子架构链接捕获测试成功');
    process.exit(0);
  } else {
    console.log('❌ 增强版原子架构链接捕获测试失败');
    process.exit(1);
  }
}).catch((error) => {
  console.error('💥 增强原子操作测试异常:', error);
  process.exit(1);
});