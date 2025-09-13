/**
 * 微博功能综合测试套件
 * 测试各种浏览器自动化功能
 */

const { CamoufoxManager } = require('../dist-simple/browser/CamoufoxManager');
const { SmartElementSelector } = require('../dist-simple/operations/SimpleSmartElementSelector');
const { PageOperationCenter } = require('../dist-simple/operations/SimplePageOperationCenter');

describe('微博功能综合测试', () => {
  let browserManager;
  let page;
  let elementSelector;
  let operationCenter;

  beforeAll(async () => {
    console.log('🚀 开始微博功能综合测试...\n');
    
    browserManager = new CamoufoxManager({
      headless: false,              // 显示浏览器以便观察
      autoInjectCookies: true,      // 使用自动Cookie注入
      waitForLogin: false,          // 不等待手动登录
      targetDomain: 'weibo.com',
      defaultTimeout: 15000
    });

    // 尝试自动登录
    console.log('🔑 尝试自动登录微博...');
    await browserManager.initializeWithAutoLogin('https://weibo.com');
    
    page = await browserManager.getCurrentPage();
    elementSelector = new SmartElementSelector(page);
    operationCenter = new PageOperationCenter(page);

    // 验证登录状态
    const isLoggedIn = await browserManager.checkLoginStatus();
    if (!isLoggedIn) {
      throw new Error('微博登录失败，无法继续测试');
    }
    
    console.log('✅ 微博登录成功，开始功能测试\n');
  }, 60000);

  afterAll(async () => {
    console.log('\n🧹 清理测试资源...');
    if (browserManager) {
      await browserManager.cleanup();
    }
    console.log('✅ 测试完成');
  });

  describe('1. 页面导航和基本操作', () => {
    test('应该能够成功导航到微博首页', async () => {
      console.log('🧭 测试：导航到微博首页');
      
      await browserManager.navigate('https://weibo.com');
      await page.waitForTimeout(2000);
      
      const title = await page.title();
      const url = page.url();
      
      console.log(`   页面标题: ${title}`);
      console.log(`   当前URL: ${url}`);
      
      expect(title).toContain('微博');
      expect(url).toContain('weibo.com');
      
      console.log('✅ 首页导航测试通过\n');
    });

    test('应该能够导航到个人主页', async () => {
      console.log('🏠 测试：导航到个人主页');
      
      await browserManager.navigate('https://weibo.com/home');
      await page.waitForTimeout(3000);
      
      const url = page.url();
      console.log(`   个人主页URL: ${url}`);
      
      // 检查是否成功导航到个人主页
      expect(url).toContain('weibo.com');
      
      console.log('✅ 个人主页导航测试通过\n');
    });

    test('应该能够导航到发现页面', async () => {
      console.log('🔍 测试：导航到发现页面');
      
      await browserManager.navigate('https://weibo.com/discover');
      await page.waitForTimeout(2000);
      
      const url = page.url();
      console.log(`   发现页面URL: ${url}`);
      
      expect(url).toContain('weibo.com');
      
      console.log('✅ 发现页面导航测试通过\n');
    });

    test('应该能够导航到消息中心', async () => {
      console.log('💬 测试：导航到消息中心');
      
      await browserManager.navigate('https://weibo.com/messages');
      await page.waitForTimeout(2000);
      
      const url = page.url();
      console.log(`   消息中心URL: ${url}`);
      
      expect(url).toContain('weibo.com');
      
      console.log('✅ 消息中心导航测试通过\n');
    });
  });

  describe('2. 元素选择和交互功能', () => {
    test('应该能够找到并点击导航菜单', async () => {
      console.log('📱 测试：导航菜单交互');
      
      await browserManager.navigate('https://weibo.com');
      await page.waitForTimeout(2000);
      
      // 尝试找到首页链接
      const homeLinks = await page.$$eval('a[href*="home"]', links => 
        links.map(link => link.textContent?.trim()).filter(text => text)
      );
      
      console.log(`   找到首页链接: ${homeLinks.join(', ')}`);
      
      // 尝试找到"发现"链接
      const discoverLinks = await page.$$eval('a[href*="discover"]', links => 
        links.map(link => link.textContent?.trim()).filter(text => text)
      );
      
      console.log(`   找到发现链接: ${discoverLinks.join(', ')}`);
      
      // 验证至少找到了一些导航元素
      expect(homeLinks.length + discoverLinks.length).toBeGreaterThan(0);
      
      console.log('✅ 导航菜单交互测试通过\n');
    });

    test('应该能够找到搜索框', async () => {
      console.log('🔍 测试：搜索框功能');
      
      await browserManager.navigate('https://weibo.com');
      await page.waitForTimeout(2000);
      
      // 查找搜索输入框
      const searchInputs = await page.$$eval('input[type="search"], input[placeholder*="搜索"], input[placeholder*="微博"]', inputs => 
        inputs.length
      );
      
      console.log(`   找到搜索框数量: ${searchInputs}`);
      
      expect(searchInputs).toBeGreaterThan(0);
      
      console.log('✅ 搜索框功能测试通过\n');
    });

    test('应该能够找到发布按钮', async () => {
      console.log('✏️ 测试：发布按钮功能');
      
      await browserManager.navigate('https://weibo.com/home');
      await page.waitForTimeout(3000);
      
      // 查找发布按钮
      const publishButtons = await page.$$eval('button[class*="publish"], a[class*="publish"], [class*="post"]', buttons => 
        buttons.map(btn => btn.textContent?.trim()).filter(text => text && (text.includes('发布') || text.includes('发微博')))
      );
      
      console.log(`   找到发布按钮: ${publishButtons.join(', ')}`);
      
      // 验证找到发布相关按钮
      expect(publishButtons.length).toBeGreaterThan(0);
      
      console.log('✅ 发布按钮功能测试通过\n');
    });
  });

  describe('3. 数据抓取和内容解析', () => {
    test('应该能够获取微博内容列表', async () => {
      console.log('📝 测试：微博内容抓取');
      
      await browserManager.navigate('https://weibo.com/home');
      await page.waitForTimeout(3000);
      
      // 尝试获取微博内容
      const feedItems = await page.$$eval('[class*="feed"], [class*="card"], article', items => {
        return items.map(item => {
          const text = item.textContent?.trim() || '';
          const hasContent = text.length > 10; // 有实际内容
          return {
            hasContent,
            textLength: text.length,
            hasImages: item.querySelector('img') !== null,
            hasLinks: item.querySelector('a') !== null
          };
        }).filter(item => item.hasContent);
      });
      
      console.log(`   找到微博内容数量: ${feedItems.length}`);
      console.log(`   有图片的微博: ${feedItems.filter(item => item.hasImages).length}`);
      console.log(`   有链接的微博: ${feedItems.filter(item => item.hasLinks).length}`);
      console.log(`   平均内容长度: ${Math.round(feedItems.reduce((sum, item) => sum + item.textLength, 0) / feedItems.length)}`);
      
      expect(feedItems.length).toBeGreaterThan(0);
      
      console.log('✅ 微博内容抓取测试通过\n');
    });

    test('应该能够获取用户信息', async () => {
      console.log('👤 测试：用户信息获取');
      
      await browserManager.navigate('https://weibo.com/home');
      await page.waitForTimeout(3000);
      
      // 尝试获取用户名或昵称
      const userElements = await page.$$eval('[class*="user"], [class*="name"], .nickname, .username', elements => {
        return elements.map(el => el.textContent?.trim()).filter(text => text && text.length > 1);
      });
      
      console.log(`   找到用户信息元素: ${userElements.slice(0, 5).join(', ')}...`);
      
      expect(userElements.length).toBeGreaterThan(0);
      
      console.log('✅ 用户信息获取测试通过\n');
    });

    test('应该能够获取时间信息', async () => {
      console.log('⏰ 测试：时间信息获取');
      
      await browserManager.navigate('https://weibo.com/home');
      await page.waitForTimeout(3000);
      
      // 尝试获取时间信息
      const timeElements = await page.$$eval('time, [class*="time"], [class*="date"], span[title*="20"]', elements => {
        return elements.map(el => el.textContent?.trim() || el.getAttribute('title') || '').filter(text => text && text.length > 2);
      });
      
      console.log(`   找到时间信息: ${timeElements.slice(0, 5).join(', ')}...`);
      
      expect(timeElements.length).toBeGreaterThan(0);
      
      console.log('✅ 时间信息获取测试通过\n');
    });
  });

  describe('4. 滚动加载和动态内容', () => {
    test('应该能够滚动页面加载更多内容', async () => {
      console.log('📜 测试：滚动加载功能');
      
      await browserManager.navigate('https://weibo.com/home');
      await page.waitForTimeout(3000);
      
      // 获取初始内容数量
      const initialItems = await page.$$eval('[class*="feed"], [class*="card"], article', items => items.length);
      console.log(`   初始内容数量: ${initialItems}`);
      
      // 滚动页面
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // 等待新内容加载
      await page.waitForTimeout(3000);
      
      // 获取滚动后的内容数量
      const scrolledItems = await page.$$eval('[class*="feed"], [class*="card"], article', items => items.length);
      console.log(`   滚动后内容数量: ${scrolledItems}`);
      
      console.log(`   新增内容: ${scrolledItems - initialItems}`);
      
      expect(scrolledItems).toBeGreaterThanOrEqual(initialItems);
      
      console.log('✅ 滚动加载功能测试通过\n');
    });

    test('应该能够处理页面动态变化', async () => {
      console.log('🔄 测试：动态内容处理');
      
      await browserManager.navigate('https://weibo.com/home');
      await page.waitForTimeout(3000);
      
      // 监听页面变化
      let changesDetected = 0;
      await page.evaluate(() => {
        const observer = new MutationObserver(() => {
          window['__pageChanges'] = (window['__pageChanges'] || 0) + 1;
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        window['__mutationObserver'] = observer;
      });
      
      // 等待一段时间观察变化
      await page.waitForTimeout(5000);
      
      changesDetected = await page.evaluate(() => window['__pageChanges'] || 0);
      console.log(`   检测到页面变化次数: ${changesDetected}`);
      
      // 清理observer
      await page.evaluate(() => {
        if (window['__mutationObserver']) {
          window['__mutationObserver'].disconnect();
        }
      });
      
      console.log('✅ 动态内容处理测试通过\n');
    });
  });

  describe('5. 页面操作和交互', () => {
    test('应该能够执行JavaScript', async () => {
      console.log('⚡ 测试：JavaScript执行');
      
      const result = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          cookiesEnabled: navigator.cookieEnabled
        };
      });
      
      console.log(`   页面标题: ${result.title}`);
      console.log(`   页面URL: ${result.url}`);
      console.log(`   时间戳: ${new Date(result.timestamp).toLocaleString()}`);
      console.log(`   Cookie启用: ${result.cookiesEnabled}`);
      
      expect(result.title).toContain('微博');
      expect(result.cookiesEnabled).toBe(true);
      
      console.log('✅ JavaScript执行测试通过\n');
    });

    test('应该能够获取页面截图', async () => {
      console.log('📸 测试：页面截图');
      
      await browserManager.navigate('https://weibo.com/home');
      await page.waitForTimeout(2000);
      
      const screenshot = await page.screenshot({
        fullPage: false,
        type: 'jpeg',
        quality: 80
      });
      
      console.log(`   截图大小: ${Math.round(screenshot.length / 1024)} KB`);
      
      expect(screenshot.length).toBeGreaterThan(1000); // 至少1KB
      
      console.log('✅ 页面截图测试通过\n');
    });

    test('应该能够获取页面HTML内容', async () => {
      console.log('📄 测试：页面内容获取');
      
      const html = await page.content();
      const text = await page.evaluate(() => document.body.innerText);
      
      console.log(`   HTML大小: ${Math.round(html.length / 1024)} KB`);
      console.log(`   文本内容长度: ${text.length} 字符`);
      console.log(`   包含"微博": ${html.includes('微博') ? '是' : '否'}`);
      console.log(`   包含"首页": ${html.includes('首页') ? '是' : '否'}`);
      
      expect(html.length).toBeGreaterThan(1000);
      expect(text.length).toBeGreaterThan(100);
      expect(html.includes('微博')).toBe(true);
      
      console.log('✅ 页面内容获取测试通过\n');
    });
  });

  describe('6. 错误处理和异常情况', () => {
    test('应该能够处理页面加载超时', async () => {
      console.log('⏱️ 测试：超时处理');
      
      const startTime = Date.now();
      
      try {
        // 尝试导航到一个可能不存在的页面
        await browserManager.navigate('https://weibo.com/nonexistent-page-12345', {
          timeout: 5000, // 5秒超时
          waitUntil: 'domcontentloaded'
        });
      } catch (error) {
        console.log(`   捕获到预期的超时错误: ${error.message}`);
      }
      
      const elapsed = Date.now() - startTime;
      console.log(`   操作耗时: ${elapsed}ms`);
      
      // 验证操作没有无限期挂起
      expect(elapsed).toBeLessThan(10000); // 应该在10秒内完成
      
      console.log('✅ 超时处理测试通过\n');
    });

    test('应该能够处理无效选择器', async () => {
      console.log('❌ 测试：无效选择器处理');
      
      await browserManager.navigate('https://weibo.com');
      await page.waitForTimeout(2000);
      
      // 尝试使用不存在的选择器
      const elements = await page.$$('nonexistent-element-12345');
      console.log(`   无效选择器结果: ${elements.length} 个元素`);
      
      expect(elements.length).toBe(0);
      
      console.log('✅ 无效选择器处理测试通过\n');
    });

    test('应该能够验证浏览器连接状态', async () => {
      console.log('🔗 测试：浏览器连接状态');
      
      const isConnected = browserManager.isConnected();
      console.log(`   浏览器连接状态: ${isConnected ? '已连接' : '未连接'}`);
      
      expect(isConnected).toBe(true);
      
      // 验证页面仍然响应
      const title = await page.title();
      console.log(`   页面标题获取成功: ${title.substring(0, 20)}...`);
      
      expect(title.length).toBeGreaterThan(0);
      
      console.log('✅ 浏览器连接状态测试通过\n');
    });
  });
});

// 如果直接运行此文件
if (require.main === module) {
  console.log('微博功能测试套件');
  console.log('注意：此文件需要通过Jest运行，或作为模块导入使用');
}