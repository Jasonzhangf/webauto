/**
 * 调试微博搜索结果页面结构
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');

async function debugSearchPage() {
  console.log('🔍 调试微博搜索结果页面结构\n');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: true,
    targetDomain: 'weibo.com'
  });
  
  try {
    await browserManager.initializeWithAutoLogin('https://weibo.com');
    
    const page = await browserManager.getCurrentPage();
    
    // 直接访问搜索页面
    const searchUrl = 'https://s.weibo.com/weibo?q=查理柯克';
    console.log(`🔍 直接访问搜索页面: ${searchUrl}`);
    await browserManager.navigate(searchUrl);
    await page.waitForTimeout(5000);
    
    // 分析页面结构
    console.log('📊 分析搜索结果页面结构...\n');
    
    const pageAnalysis = await page.evaluate(() => {
      const analysis = {
        url: window.location.href,
        title: document.title,
        
        // 查找所有可能的帖子容器
        feedContainers: [],
        
        // 查找所有可能的用户名元素
        userElements: [],
        
        // 查找所有可能的内容元素
        contentElements: [],
        
        // 查找所有可能的时间元素
        timeElements: [],
        
        // 查找所有可能的互动元素
        interactionElements: [],
        
        // 页面所有class属性
        allClasses: [],
        
        // 页面所有data属性
        allDataAttributes: []
      };
      
      // 收集所有class属性
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        if (el.className) {
          analysis.allClasses.push(el.className);
        }
      });
      
      // 收集所有data属性
      allElements.forEach(el => {
        const attributes = el.attributes;
        for (let i = 0; i < attributes.length; i++) {
          const attr = attributes[i];
          if (attr.name.startsWith('data-')) {
            analysis.allDataAttributes.push(attr.name);
          }
        }
      });
      
      // 查找可能的帖子容器
      const feedSelectors = [
        '[class*="feed"]',
        '[class*="card"]',
        '[class*="post"]',
        '[class*="article"]',
        '[class*="item"]',
        '[class*="result"]',
        '[class*="content"]',
        '[data-feedid]',
        '[mid]'
      ];
      
      feedSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          analysis.feedContainers.push({
            selector: selector,
            count: elements.length,
            sample: elements[0].className || 'no-class'
          });
        }
      });
      
      // 查找用户名元素
      const userSelectors = [
        '[class*="name"]',
        '[class*="user"]',
        '[class*="author"]',
        '[class*="nick"]',
        'a[href*="u/"]',
        'a[href*="user"]'
      ];
      
      userSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          analysis.userElements.push({
            selector: selector,
            count: elements.length,
            sample: elements[0].textContent.trim().substring(0, 50)
          });
        }
      });
      
      // 查找内容元素
      const contentSelectors = [
        '[class*="content"]',
        '[class*="text"]',
        '[class*="body"]',
        'p',
        'div:not([class*="user"]):not([class*="action"])'
      ];
      
      contentSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          analysis.contentElements.push({
            selector: selector,
            count: elements.length,
            sample: elements[0].textContent.trim().substring(0, 100)
          });
        }
      });
      
      // 查找时间元素
      const timeSelectors = [
        'time',
        '[class*="time"]',
        '[class*="date"]',
        '[class*="from"]',
        'span[title]'
      ];
      
      timeSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          analysis.timeElements.push({
            selector: selector,
            count: elements.length,
            sample: elements[0].getAttribute('title') || elements[0].textContent.trim()
          });
        }
      });
      
      // 查找互动元素
      const interactionSelectors = [
        '[class*="like"]',
        '[class*="comment"]',
        '[class*="repost"]',
        '[class*="share"]',
        '[class*="thumb"]',
        '[class*="赞"]',
        '[class*="评论"]',
        '[class*="转发"]'
      ];
      
      interactionSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          analysis.interactionElements.push({
            selector: selector,
            count: elements.length,
            sample: elements[0].textContent.trim()
          });
        }
      });
      
      return analysis;
    });
    
    // 显示分析结果
    console.log('📄 页面信息:');
    console.log(`   URL: ${pageAnalysis.url}`);
    console.log(`   标题: ${pageAnalysis.title}\n`);
    
    console.log('🔍 帖子容器选择器:');
    pageAnalysis.feedContainers.forEach(container => {
      console.log(`   ${container.selector}: ${container.count} 个元素`);
      console.log(`     示例class: ${container.sample}`);
    });
    console.log('');
    
    console.log('👤 用户名选择器:');
    pageAnalysis.userElements.forEach(user => {
      console.log(`   ${user.selector}: ${user.count} 个元素`);
      console.log(`     示例内容: "${user.sample}"`);
    });
    console.log('');
    
    console.log('📝 内容选择器:');
    pageAnalysis.contentElements.forEach(content => {
      console.log(`   ${content.selector}: ${content.count} 个元素`);
      console.log(`     示例内容: "${content.sample}"`);
    });
    console.log('');
    
    console.log('⏰ 时间选择器:');
    pageAnalysis.timeElements.forEach(time => {
      console.log(`   ${time.selector}: ${time.count} 个元素`);
      console.log(`     示例内容: "${time.sample}"`);
    });
    console.log('');
    
    console.log('🎯 互动选择器:');
    pageAnalysis.interactionElements.forEach(interaction => {
      console.log(`   ${interaction.selector}: ${interaction.count} 个元素`);
      console.log(`     示例内容: "${interaction.sample}"`);
    });
    console.log('');
    
    console.log('💡 常见的class属性:');
    const uniqueClasses = [...new Set(pageAnalysis.allClasses)];
    const feedClasses = uniqueClasses.filter(cls => {
      if (typeof cls !== 'string') return false;
      return cls.includes('feed') || 
             cls.includes('card') || 
             cls.includes('post') ||
             cls.includes('item') ||
             cls.includes('content');
    });
    feedClasses.slice(0, 10).forEach(cls => {
      console.log(`   ${cls}`);
    });
    console.log('');
    
    console.log('⏳ 浏览器将保持打开10秒供观察...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('❌ 调试失败:', error.message);
  } finally {
    await browserManager.cleanup();
  }
}

debugSearchPage().catch(console.error);