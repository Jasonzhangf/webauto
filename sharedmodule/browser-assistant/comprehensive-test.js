/**
 * 微博自动化功能综合测试
 * 从cookie自动检测登录开始，完整测试所有功能
 * 避免任何可疑操作，专注于安全的数据采集
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const fs = require('fs');
const path = require('path');

class ComprehensiveWeiboTest {
  constructor() {
    this.browserManager = new CamoufoxManager({
      headless: false,                    // 显示浏览器便于观察
      autoInjectCookies: true,           // 启用自动cookie注入
      waitForLogin: true,                 // 等待用户登录
      targetDomain: 'weibo.com',         // 目标域名
      loginTimeout: 600,                 // 10分钟登录超时
      defaultTimeout: 20000              // 20秒默认超时
    });
    
    this.testResults = {
      cookieInjection: false,
      autoLogin: false,
      manualLogin: false,
      navigation: false,
      search: false,
      contentCapture: false,
      fileSave: false
    };
  }

  async runAllTests() {
    console.log('🧪 微博自动化功能综合测试启动\n');
    console.log('⚠️  测试原则：');
    console.log('   - 避免可疑操作行为');
    console.log('   - 不发布、转发、评论帖子');  
    console.log('   - 只进行安全的数据读取');
    console.log('   - 模拟真实用户操作节奏\n');
    
    try {
      // 测试1: Cookie自动注入
      await this.testCookieInjection();
      
      // 测试2: 自动登录检测
      await this.testAutoLogin();
      
      // 测试3: 手动登录流程（如果需要）
      await this.testManualLogin();
      
      // 测试4: 页面导航
      await this.testNavigation();
      
      // 测试5: 搜索功能
      await this.testSearchFunction();
      
      // 测试6: 内容捕获
      await this.testContentCapture();
      
      // 测试7: 文件保存
      await this.testFileSave();
      
      // 显示测试结果
      this.displayTestResults();
      
    } catch (error) {
      console.error('❌ 测试套件失败:', error.message);
    } finally {
      console.log('\n🧹 清理测试资源...');
      await this.browserManager.cleanup();
      console.log('✅ 测试完成');
    }
  }

  async testCookieInjection() {
    console.log('📝 测试1: Cookie自动注入功能');
    
    try {
      console.log('   🔄 检查是否有有效登录cookie...');
      const hasCookies = this.browserManager.hasValidLoginCookies();
      console.log(`   📊 Cookie状态: ${hasCookies ? '有效' : '无效或过期'}`);
      
      if (hasCookies) {
        console.log('   ✅ Cookie检测通过');
        this.testResults.cookieInjection = true;
      } else {
        console.log('   ⚠️  Cookie无效，将进行手动登录测试');
        this.testResults.cookieInjection = false;
      }
      
    } catch (error) {
      console.error(`   ❌ Cookie检测失败: ${error.message}`);
      this.testResults.cookieInjection = false;
    }
    
    console.log('');
  }

  async testAutoLogin() {
    console.log('📝 测试2: 自动登录检测');
    
    try {
      console.log('   🔄 初始化浏览器并尝试自动登录...');
      await this.browserManager.initialize();
      
      // 检查是否自动登录成功
      const page = await this.browserManager.getCurrentPage();
      const currentUrl = page.url();
      console.log(`   📍 当前URL: ${currentUrl}`);
      
      if (!currentUrl.includes('newlogin') && !currentUrl.includes('login')) {
        console.log('   ✅ 自动登录成功');
        this.testResults.autoLogin = true;
        this.testResults.manualLogin = true; // 不需要手动登录
      } else {
        console.log('   ⚠️  需要手动登录');
        this.testResults.autoLogin = false;
      }
      
    } catch (error) {
      console.error(`   ❌ 自动登录测试失败: ${error.message}`);
      this.testResults.autoLogin = false;
    }
    
    console.log('');
  }

  async testManualLogin() {
    if (this.testResults.autoLogin) {
      console.log('📝 测试3: 手动登录流程 (跳过，已自动登录)');
      this.testResults.manualLogin = true;
      console.log('');
      return;
    }
    
    console.log('📝 测试3: 手动登录流程');
    
    try {
      console.log('   ⏳ 等待用户手动登录 (10分钟超时)...');
      console.log('   🔐 请在浏览器中完成微博登录');
      console.log('   💡 提示：请自然操作，避免快速点击');
      
      const loginSuccess = await this.browserManager.waitForUserLogin();
      
      if (loginSuccess) {
        console.log('   ✅ 手动登录成功');
        this.testResults.manualLogin = true;
      } else {
        console.log('   ❌ 手动登录超时');
        this.testResults.manualLogin = false;
      }
      
    } catch (error) {
      console.error(`   ❌ 手动登录测试失败: ${error.message}`);
      this.testResults.manualLogin = false;
    }
    
    console.log('');
  }

  async testNavigation() {
    if (!this.testResults.manualLogin) {
      console.log('📝 测试4: 页面导航 (跳过，未登录)');
      console.log('');
      return;
    }
    
    console.log('📝 测试4: 页面导航功能');
    
    try {
      const page = await this.browserManager.getCurrentPage();
      
      // 测试导航到首页
      console.log('   🔄 导航到微博首页...');
      await this.browserManager.navigate('https://weibo.com');
      await page.waitForTimeout(3000);
      
      const title = await page.title();
      console.log(`   📄 首页标题: ${title.substring(0, 30)}...`);
      
      // 测试导航到个人主页
      console.log('   🔄 导航到个人主页...');
      await this.browserManager.navigate('https://weibo.com/home');
      await page.waitForTimeout(3000);
      
      const homeUrl = page.url();
      console.log(`   📍 个人主页URL: ${homeUrl}`);
      
      console.log('   ✅ 页面导航测试通过');
      this.testResults.navigation = true;
      
    } catch (error) {
      console.error(`   ❌ 页面导航失败: ${error.message}`);
      this.testResults.navigation = false;
    }
    
    console.log('');
  }

  async testSearchFunction() {
    if (!this.testResults.manualLogin) {
      console.log('📝 测试5: 搜索功能 (跳过，未登录)');
      console.log('');
      return;
    }
    
    console.log('📝 测试5: 搜索功能');
    
    try {
      const page = await this.browserManager.getCurrentPage();
      
      // 导航到首页
      await this.browserManager.navigate('https://weibo.com');
      await page.waitForTimeout(3000);
      
      // 查找搜索框
      console.log('   🔍 查找搜索框...');
      const searchInputs = await page.$$('input[placeholder*="搜索"], input[type="search"]');
      
      if (searchInputs.length > 0) {
        const searchInput = searchInputs[0];
        const placeholder = await searchInput.getAttribute('placeholder') || '搜索框';
        console.log(`   ✅ 找到搜索框: ${placeholder}`);
        
        // 测试搜索功能（只输入，不提交）
        console.log('   📝 测试搜索框输入功能...');
        await searchInput.fill('浏览器自动化测试');
        await page.waitForTimeout(1000);
        
        const inputValue = await searchInput.inputValue();
        console.log(`   ✅ 搜索框输入成功: "${inputValue}"`);
        
        // 清空搜索框，避免实际提交
        await searchInput.fill('');
        console.log('   🧹 已清空搜索框');
        
        this.testResults.search = true;
      } else {
        console.log('   ❌ 未找到搜索框');
        this.testResults.search = false;
      }
      
    } catch (error) {
      console.error(`   ❌ 搜索功能测试失败: ${error.message}`);
      this.testResults.search = false;
    }
    
    console.log('');
  }

  async testContentCapture() {
    if (!this.testResults.manualLogin) {
      console.log('📝 测试6: 内容捕获 (跳过，未登录)');
      console.log('');
      return;
    }
    
    console.log('📝 测试6: 内容捕获功能');
    
    try {
      const page = await this.browserManager.getCurrentPage();
      
      // 导航到个人主页查看内容
      console.log('   🔄 导航到个人主页...');
      await this.browserManager.navigate('https://weibo.com/home');
      await page.waitForTimeout(5000);
      
      // 提取页面内容
      console.log('   📝 提取微博内容...');
      const contentInfo = await page.evaluate(() => {
        const feedItems = document.querySelectorAll('[class*="feed"], [class*="card"], article');
        const images = document.querySelectorAll('img').length;
        const links = document.querySelectorAll('a[href]').length;
        
        return {
          feedItems: feedItems.length,
          images: images,
          links: links,
          hasContent: feedItems.length > 0
        };
      });
      
      console.log(`   📊 找到 ${contentInfo.feedItems} 条微博内容`);
      console.log(`   🖼️  页面包含 ${contentInfo.images} 张图片`);
      console.log(`   🔗 页面包含 ${contentInfo.links} 个链接`);
      
      if (contentInfo.hasContent) {
        console.log('   ✅ 内容捕获测试通过');
        this.testResults.contentCapture = true;
      } else {
        console.log('   ❌ 未找到有效内容');
        this.testResults.contentCapture = false;
      }
      
    } catch (error) {
      console.error(`   ❌ 内容捕获失败: ${error.message}`);
      this.testResults.contentCapture = false;
    }
    
    console.log('');
  }

  async testFileSave() {
    if (!this.testResults.manualLogin) {
      console.log('📝 测试7: 文件保存 (跳过，未登录)');
      console.log('');
      return;
    }
    
    console.log('📝 测试7: 文件保存功能');
    
    try {
      // 创建测试目录
      const testDir = path.join(process.env.HOME, '.webauto', 'test', 'comprehensive-test');
      
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      
      // 创建测试文件
      const testFile = path.join(testDir, 'test-summary.md');
      const testContent = `# 微博自动化综合测试结果

## 测试时间
${new Date().toLocaleString('zh-CN')}

## 测试结果
- Cookie自动注入: ${this.testResults.cookieInjection ? '✅ 通过' : '❌ 失败'}
- 自动登录: ${this.testResults.autoLogin ? '✅ 通过' : '❌ 失败'}
- 手动登录: ${this.testResults.manualLogin ? '✅ 通过' : '❌ 失败'}
- 页面导航: ${this.testResults.navigation ? '✅ 通过' : '❌ 失败'}
- 搜索功能: ${this.testResults.search ? '✅ 通过' : '❌ 失败'}
- 内容捕获: ${this.testResults.contentCapture ? '✅ 通过' : '❌ 失败'}

## 测试环境
- 浏览器: Camoufox (反指纹版本)
- 目标网站: weibo.com
- 测试模式: 安全数据采集

---

*此文件由微博自动化综合测试自动生成*`;
      
      fs.writeFileSync(testFile, testContent, 'utf8');
      
      console.log(`   ✅ 测试结果已保存到: ${testFile}`);
      this.testResults.fileSave = true;
      
    } catch (error) {
      console.error(`   ❌ 文件保存失败: ${error.message}`);
      this.testResults.fileSave = false;
    }
    
    console.log('');
  }

  displayTestResults() {
    console.log('📊 综合测试结果汇总');
    console.log('═'.repeat(50));
    
    const results = [
      { name: 'Cookie自动注入', passed: this.testResults.cookieInjection },
      { name: '自动登录检测', passed: this.testResults.autoLogin },
      { name: '手动登录流程', passed: this.testResults.manualLogin },
      { name: '页面导航功能', passed: this.testResults.navigation },
      { name: '搜索功能测试', passed: this.testResults.search },
      { name: '内容捕获功能', passed: this.testResults.contentCapture },
      { name: '文件保存功能', passed: this.testResults.fileSave }
    ];
    
    let passedCount = 0;
    results.forEach(result => {
      if (result.passed) passedCount++;
      const status = result.passed ? '✅ 通过' : '❌ 失败';
      console.log(`${result.name.padEnd(15)}: ${status}`);
    });
    
    console.log('═'.repeat(50));
    console.log(`总体评分: ${passedCount}/${results.length} (${Math.round(passedCount/results.length*100)}%)`);
    
    if (passedCount === results.length) {
      console.log('🎉 所有测试通过！微博自动化功能完全正常');
    } else if (passedCount >= 5) {
      console.log('✅ 大部分功能正常，可以正常使用');
    } else {
      console.log('⚠️  部分功能存在问题，需要进一步调试');
    }
  }
}

// 主函数
async function main() {
  console.log('🔥 微博自动化功能综合测试');
  console.log('📅 测试时间:', new Date().toLocaleString('zh-CN'));
  console.log('🦊 使用浏览器: Camoufox (反指纹版本)\n');
  
  const test = new ComprehensiveWeiboTest();
  await test.runAllTests();
}

// 运行测试
main().catch(console.error);