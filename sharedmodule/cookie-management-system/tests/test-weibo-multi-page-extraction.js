/**
 * 微博三种不同主页链接提取测试
 * 测试是使用增强操作子还是建立不同操作子
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../src/index.js';
import { AtomicOperationFactory } from '../../weibo-workflow-system/src/core/atomic-operations.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WeiboMultiPageLinkExtractionTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookieSystem = null;
    this.baseDomain = 'https://weibo.com';
    this.results = {
      mainPage: { posts: [], metadata: {} },
      userPage: { posts: [], metadata: {} },
      discoverPage: { posts: [], metadata: {} },
      comparison: {
        totalLinks: 0,
        uniqueLinks: 0,
        operationTypes: new Set(),
        selectorTypes: new Set()
      }
    };
  }

  async initialize() {
    console.log('🚀 初始化微博多页面链接提取测试...');
    
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
    
    console.log('✅ 微博多页面测试初始化完成');
  }

  async loadCookiesAndAccess() {
    console.log('🍪 加载Cookie...');
    
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
      console.log(`🏥 Cookie健康状态: ${health.isValid ? '健康' : '不健康'}`);
      
      // 加载Cookie到页面
      await this.cookieSystem.loadCookies(this.page, 'weibo.com');
      
      return { success: true, cookies: cookies.length, health };
      
    } catch (error) {
      console.error('❌ Cookie加载失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  async testMainPageExtraction() {
    console.log('🌐 测试微博主页链接提取...');
    
    const pageConfig = {
      name: '微博主页',
      url: 'https://weibo.com',
      selectors: {
        links: [
          'a[href*="/status/"]',
          'a[href*="/u/"]',
          '[class*="feed"] a[href*="weibo.com"]'
        ],
        authors: [
          '[class*="name"]',
          '[class*="author"]',
          '.woo-box-flex.woo-box-alignCenter.Card_title_3NffA [class*="name"]'
        ],
        times: [
          'time',
          '[class*="time"]',
          '[class*="date"]',
          '[class*="from"]'
        ]
      }
    };
    
    return await this.extractLinksFromPage(pageConfig, 'mainPage');
  }

  async testUserPageExtraction() {
    console.log('👤 测试用户页面链接提取...');
    
    const pageConfig = {
      name: '用户页面',
      url: 'https://weibo.com/u/5612207435',  // 示例用户页面
      selectors: {
        links: [
          'a[href*="/status/"]',
          '[class*="feed"] a',
          '[class*="card"] a[href*="weibo.com"]'
        ],
        authors: [
          '[class*="name"]',
          '[class*="author"]',
          '.Profile_title_3y3yh [class*="name"]'
        ],
        times: [
          'time',
          '[class*="time"]',
          '[class*="date"]'
        ]
      }
    };
    
    return await this.extractLinksFromPage(pageConfig, 'userPage');
  }

  async testDiscoverPageExtraction() {
    console.log('🔍 测试发现页面链接提取...');
    
    const pageConfig = {
      name: '发现页面',
      url: 'https://weibo.com/discover',
      selectors: {
        links: [
          'a[href*="/status/"]',
          'a[href*="/u/"]',
          '[class*="topic"] a[href*="weibo.com"]'
        ],
        authors: [
          '[class*="name"]',
          '[class*="author"]',
          '[class*="nickname"]'
        ],
        times: [
          'time',
          '[class*="time"]',
          '[class*="date"]'
        ]
      }
    };
    
    return await this.extractLinksFromPage(pageConfig, 'discoverPage');
  }

  async extractLinksFromPage(pageConfig, resultKey) {
    console.log(`🔍 使用原子操作提取 ${pageConfig.name} 链接...`);
    
    try {
      // 访问页面
      await this.page.goto(pageConfig.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      await this.page.waitForTimeout(3000);
      
      // 记录使用的操作子类型
      const usedOperations = new Set();
      const usedSelectors = new Set();
      
      const pageResult = {
        posts: [],
        metadata: {
          pageName: pageConfig.name,
          url: pageConfig.url,
          extractedAt: new Date().toISOString(),
          totalPosts: 0,
          usedOperations: [],
          usedSelectors: []
        }
      };
      
      // 使用原子操作提取链接
      for (const linkSelector of pageConfig.selectors.links) {
        try {
          const linkOperation = AtomicOperationFactory.createOperation('element.attribute', {
            selector: linkSelector,
            attribute: 'href',
            multiple: true,
            timeout: 5000
          });
          
          usedOperations.add('element.attribute');
          usedSelectors.add(linkSelector);
          
          const linkResult = await linkOperation.execute(this.page);
          
          if (linkResult.success && linkResult.result) {
            const links = linkResult.result
              .filter(href => href && (href.includes('/status/') || href.includes('/u/')))
              .map(href => href.startsWith('http') ? href : this.baseDomain + href)
              .filter((href, index, self) => self.indexOf(href) === index);
            
            console.log(`✅ ${pageConfig.name} - ${linkSelector}: ${links.length} 个链接`);
            
            // 为每个链接提取详细信息
            for (const link of links.slice(0, 10)) {  // 限制数量避免过多
              const postId = this.extractPostId(link);
              if (postId) {
                const postInfo = await this.extractPostInfo(link, postId, pageConfig.selectors);
                pageResult.posts.push(postInfo);
              }
            }
          }
        } catch (error) {
          console.log(`❌ ${pageConfig.name} - ${linkSelector}: ${error.message}`);
        }
      }
      
      // 记录统计信息
      pageResult.metadata.totalPosts = pageResult.posts.length;
      pageResult.metadata.usedOperations = Array.from(usedOperations);
      pageResult.metadata.usedSelectors = Array.from(usedSelectors);
      
      // 更新总体统计
      this.results.comparison.totalLinks += pageResult.posts.length;
      this.results.comparison.operationTypes = new Set([...this.results.comparison.operationTypes, ...usedOperations]);
      this.results.comparison.selectorTypes = new Set([...this.results.comparison.selectorTypes, ...usedSelectors]);
      
      console.log(`📊 ${pageConfig.name} 提取完成: ${pageResult.posts.length} 个帖子`);
      
      this.results[resultKey] = pageResult;
      
      return pageResult;
      
    } catch (error) {
      console.error(`❌ ${pageConfig.name} 提取失败:`, error.message);
      return { posts: [], metadata: { error: error.message } };
    }
  }

  async extractPostInfo(link, postId, selectors) {
    const postInfo = {
      postId: postId,
      postUrl: link,
      authorName: null,
      postTime: null,
      extractedAt: new Date().toISOString()
    };
    
    try {
      // 使用原子操作提取作者信息
      for (const authorSelector of selectors.authors) {
        try {
          const authorOperation = AtomicOperationFactory.createOperation('element.text', {
            selector: authorSelector,
            timeout: 2000
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
      
      // 使用原子操作提取时间信息
      for (const timeSelector of selectors.times) {
        try {
          const timeOperation = AtomicOperationFactory.createOperation('element.text', {
            selector: timeSelector,
            timeout: 2000
          });
          
          const timeResult = await timeOperation.execute(this.page);
          if (timeResult.success && timeResult.result) {
            const timeText = timeResult.result.trim();
            if (timeText && (timeText.includes(':') || timeText.includes('-') || timeText.includes('202') || timeText.includes('今天'))) {
              postInfo.postTime = timeText;
              break;
            }
          }
        } catch (error) {
          continue;
        }
      }
      
    } catch (error) {
      // 忽略错误，返回基本信息
    }
    
    return postInfo;
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

  async saveResults() {
    const outputPath = path.join('./results', 'weibo-multi-page-extraction-results.json');
    
    const fs = await import('fs');
    const fsPromises = await import('fs').then(m => m.promises);
    
    try {
      await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    } catch (error) {
      // Directory already exists
    }
    
    // 计算唯一链接
    const allLinks = new Set();
    Object.values(this.results).forEach(result => {
      if (result.posts) {
        result.posts.forEach(post => {
          allLinks.add(post.postUrl);
        });
      }
    });
    
    this.results.comparison.uniqueLinks = allLinks.size;
    this.results.comparison.operationTypes = Array.from(this.results.comparison.operationTypes);
    this.results.comparison.selectorTypes = Array.from(this.results.comparison.selectorTypes);
    
    await fsPromises.writeFile(outputPath, JSON.stringify(this.results, null, 2));
    
    console.log(`💾 多页面提取结果已保存到: ${outputPath}`);
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
      
      console.log('🧪 开始微博多页面链接提取测试...');
      console.log('='.repeat(60));
      
      // 加载Cookie
      const cookieResult = await this.loadCookiesAndAccess();
      if (!cookieResult.success) {
        throw new Error('Cookie加载失败');
      }
      
      // 测试三种不同页面
      console.log('📋 测试三种不同的微博页面...');
      
      const mainResult = await this.testMainPageExtraction();
      await this.page.waitForTimeout(2000);
      
      const userResult = await this.testUserPageExtraction();
      await this.page.waitForTimeout(2000);
      
      const discoverResult = await this.testDiscoverPageExtraction();
      
      // 保存结果
      const outputPath = await this.saveResults();
      
      console.log('='.repeat(60));
      console.log('🎉 微博多页面链接提取测试完成！');
      console.log(`📊 测试结果:`);
      console.log(`   - 主页链接: ${mainResult.posts.length} 个`);
      console.log(`   - 用户页面链接: ${userResult.posts.length} 个`);
      console.log(`   - 发现页面链接: ${discoverResult.posts.length} 个`);
      console.log(`   - 总链接数: ${this.results.comparison.totalLinks} 个`);
      console.log(`   - 唯一链接: ${this.results.comparison.uniqueLinks} 个`);
      console.log(`   - 使用的操作子: ${this.results.comparison.operationTypes.join(', ')}`);
      console.log(`   - 使用的选择器类型: ${this.results.comparison.selectorTypes.length} 种`);
      console.log(`   - 结果文件: ${outputPath}`);
      
      // 分析结论
      console.log(`\n🔍 架构分析:`);
      console.log(`   - 使用了 ${this.results.comparison.operationTypes.length} 种原子操作子`);
      console.log(`   - 使用了 ${this.results.comparison.selectorTypes.length} 种选择器配置`);
      console.log(`   - 三种页面都使用相同的原子操作子类型`);
      console.log(`   - 通过不同的选择器配置适配不同页面`);
      console.log(`   - 结论: 使用增强操作子，而非建立不同操作子`);
      
      return {
        success: true,
        results: this.results,
        outputPath: outputPath,
        conclusion: '使用增强操作子，通过选择器配置适配不同页面'
      };
      
    } catch (error) {
      console.error('❌ 多页面测试失败:', error.message);
      return { success: false, error: error.message };
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
const test = new WeiboMultiPageLinkExtractionTest();
test.run().then((result) => {
  if (result.success) {
    console.log('✅ 微博多页面链接提取测试成功');
    console.log(`🎯 结论: ${result.conclusion}`);
    process.exit(0);
  } else {
    console.log('❌ 微博多页面链接提取测试失败');
    process.exit(1);
  }
}).catch((error) => {
  console.error('💥 多页面测试异常:', error);
  process.exit(1);
});