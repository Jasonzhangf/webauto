/**
 * 微博错误处理和异常情况测试
 * 测试各种错误场景的处理能力
 */

const { CamoufoxManager } = require('../dist-simple/browser/CamoufoxManager');

async function testErrorHandling() {
  console.log('🛡️ 开始微博错误处理和异常情况测试...\n');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: false,
    targetDomain: 'weibo.com',
    defaultTimeout: 8000  // 缩短超时时间以便测试
  });

  try {
    // 自动登录
    console.log('🔑 自动登录中...');
    await browserManager.initializeWithAutoLogin('https://weibo.com/home');
    
    const page = await browserManager.getCurrentPage();
    
    // 测试1: 页面加载超时处理
    console.log('⏱️ 测试1: 页面加载超时处理');
    
    try {
      console.log('   🔄 尝试访问不存在的页面 (预期超时)...');
      const startTime = Date.now();
      
      await page.goto('https://weibo.com/nonexistent-page-123456789', {
        timeout: 5000,
        waitUntil: 'domcontentloaded'
      });
      
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.log(`   ✅ 成功捕获超时错误: ${error.message}`);
      console.log(`   ⏱️ 超时时间: ${elapsed}ms (应该在5000ms左右)`);
      
      // 验证浏览器仍然可用
      const title = await page.title();
      console.log(`   🔍 浏览器仍然可用: ${title.substring(0, 30)}...`);
    }
    console.log('');
    
    // 测试2: 无效元素选择器处理
    console.log('❌ 测试2: 无效元素选择器处理');
    
    // 测试不存在的元素
    const nonExistentElements = await page.$$('nonexistent-element-12345');
    console.log(`   ✅ 不存在元素查询结果: ${nonExistentElements.length} 个`);
    
    // 测试无效的CSS选择器
    try {
      const invalidSelector = await page.$$('div[invalid="test"]');
      console.log(`   ✅ 无效选择器处理: ${invalidSelector.length} 个元素`);
    } catch (selectorError) {
      console.log(`   ✅ 捕获选择器错误: ${selectorError.message}`);
    }
    
    // 测试空选择器
    const emptySelector = await page.$$('');
    console.log(`   ✅ 空选择器处理: ${emptySelector.length} 个元素`);
    console.log('');
    
    // 测试3: 网络错误处理
    console.log('🌐 测试3: 网络错误处理');
    
    // 监听网络错误
    const networkErrors = [];
    page.on('requestfailed', request => {
      const failure = request.failure();
      if (failure) {
        networkErrors.push({
          url: request.url(),
          error: failure.errorText,
          method: request.method()
        });
      }
    });
    
    // 访问可能失败的资源
    console.log('   🔄 尝试访问可能失败的资源...');
    try {
      await page.evaluate(() => {
        // 模拟加载失败的资源
        const img = document.createElement('img');
        img.src = 'https://nonexistent-image-12345.com/image.jpg';
        document.body.appendChild(img);
        
        setTimeout(() => {
          img.remove();
        }, 1000);
      });
    } catch (e) {
      console.log(`   ✅ 捕获网络相关错误: ${e.message}`);
    }
    
    await page.waitForTimeout(2000);
    
    console.log(`   📊 监控到网络错误: ${networkErrors.length} 个`);
    networkErrors.slice(0, 3).forEach((error, i) => {
      console.log(`     ${i+1}. ${error.method} - ${error.error}`);
    });
    
    // 清理监听器
    page.removeAllListeners('requestfailed');
    console.log('');
    
    // 测试4: JavaScript错误处理
    console.log('⚡ 测试4: JavaScript错误处理');
    
    const jsErrors = [];
    page.on('pageerror', error => {
      jsErrors.push({
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    });
    
    // 执行可能出错的JavaScript
    console.log('   🔄 测试JavaScript错误捕获...');
    try {
      await page.evaluate(() => {
        // 故意制造一个JavaScript错误
        nonexistentFunction();
      });
    } catch (evalError) {
      console.log(`   ✅ 捕获执行错误: ${evalError.message}`);
    }
    
    // 等待错误事件传播
    await page.waitForTimeout(1000);
    
    console.log(`   📊 捕获JS错误: ${jsErrors.length} 个`);
    jsErrors.forEach((error, i) => {
      console.log(`     ${i+1}. ${error.name}: ${error.message.substring(0, 80)}...`);
    });
    
    // 清理监听器
    page.removeAllListeners('pageerror');
    console.log('');
    
    // 测试5: 控制台错误处理
    console.log('📝 测试5: 控制台错误处理');
    
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          text: msg.text(),
          location: msg.location()
        });
      }
    });
    
    // 触发控制台错误
    console.log('   🔄 测试控制台错误捕获...');
    await page.evaluate(() => {
      console.error('测试控制台错误消息');
      setTimeout(() => {
        // 触发404错误
        const img = document.createElement('img');
        img.src = '/nonexistent-image.png';
        document.body.appendChild(img);
      }, 100);
    });
    
    await page.waitForTimeout(2000);
    
    console.log(`   📊 捕获控制台错误: ${consoleErrors.length} 个`);
    consoleErrors.slice(0, 3).forEach((error, i) => {
      console.log(`     ${i+1}. ${error.text.substring(0, 60)}...`);
    });
    
    // 清理监听器
    page.removeAllListeners('console');
    console.log('');
    
    // 测试6: 浏览器连接状态检测
    console.log('🔗 测试6: 浏览器连接状态检测');
    
    // 检查当前连接状态
    const isConnected = browserManager.isConnected();
    console.log(`   🔗 浏览器连接状态: ${isConnected ? '已连接' : '未连接'}`);
    
    // 测试页面响应性
    try {
      const title = await page.title();
      const url = page.url();
      console.log(`   ✅ 页面响应正常 - 标题: ${title.substring(0, 30)}...`);
      console.log(`   ✅ 页面响应正常 - URL: ${url}`);
    } catch (pageError) {
      console.log(`   ❌ 页面无响应: ${pageError.message}`);
    }
    
    // 测试浏览器进程状态
    try {
      const version = await page.evaluate(() => navigator.userAgent);
      console.log(`   ✅ 浏览器进程正常 - UserAgent长度: ${version.length}`);
    } catch (browserError) {
      console.log(`   ❌ 浏览器进程异常: ${browserError.message}`);
    }
    console.log('');
    
    // 测试7: 内存和资源管理
    console.log('💾 测试7: 内存和资源管理');
    
    const memoryInfo = await page.evaluate(() => {
      const memory = performance.memory;
      return {
        usedJSHeapSize: memory ? memory.usedJSHeapSize : 0,
        totalJSHeapSize: memory ? memory.totalJSHeapSize : 0,
        jsHeapSizeLimit: memory ? memory.jsHeapSizeLimit : 0,
        hasMemoryAPI: !!memory
      };
    });
    
    console.log(`   💾 内存使用情况:`);
    console.log(`     - 内存API可用: ${memoryInfo.hasMemoryAPI ? '是' : '否'}`);
    console.log(`     - 已用JS堆: ${Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024)}MB`);
    console.log(`     - 总JS堆: ${Math.round(memoryInfo.totalJSHeapSize / 1024 / 1024)}MB`);
    console.log(`     - JS堆限制: ${Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024)}MB`);
    
    // 测试页面元素数量
    const elementCount = await page.evaluate(() => {
      return {
        totalElements: document.querySelectorAll('*').length,
        images: document.querySelectorAll('img').length,
        links: document.querySelectorAll('a').length,
        scripts: document.querySelectorAll('script').length,
        stylesheets: document.querySelectorAll('style, link[rel="stylesheet"]').length
      };
    });
    
    console.log(`   📊 页面元素统计:`);
    console.log(`     - 总元素数: ${elementCount.totalElements}`);
    console.log(`     - 图片数量: ${elementCount.images}`);
    console.log(`     - 链接数量: ${elementCount.links}`);
    console.log(`     - 脚本数量: ${elementCount.scripts}`);
    console.log(`     - 样式数量: ${elementCount.stylesheets}`);
    console.log('');
    
    // 测试8: 恢复能力测试
    console.log('🔄 测试8: 恢复能力测试');
    
    try {
      // 导航到正常页面验证恢复能力
      console.log('   🔄 导航到正常页面验证恢复能力...');
      await browserManager.navigate('https://weibo.com');
      await page.waitForTimeout(3000);
      
      const finalTitle = await page.title();
      const finalUrl = page.url();
      
      console.log(`   ✅ 成功恢复 - 标题: ${finalTitle}`);
      console.log(`   ✅ 成功恢复 - URL: ${finalUrl}`);
      
      // 验证页面功能正常
      const finalElementCount = await page.$$('*').length;
      console.log(`   ✅ 页面元素正常: ${finalElementCount} 个`);
      
    } catch (recoveryError) {
      console.log(`   ❌ 恢复失败: ${recoveryError.message}`);
    }
    console.log('');
    
    console.log('🎉 错误处理和异常情况测试完成！');
    console.log('⏳ 浏览器将保持打开10秒供观察...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('❌ 测试套件失败:', error);
  } finally {
    console.log('🧹 清理资源...');
    await browserManager.cleanup();
    console.log('✅ 测试完成');
  }
}

// 运行测试
testErrorHandling().catch(console.error);