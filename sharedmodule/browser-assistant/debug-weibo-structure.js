/**
 * 深度调试微博页面结构和内容加载
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');

async function debugWeiboStructure() {
  console.log('🔍 深度调试微博页面结构...');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: true,
    targetDomain: 'weibo.com',
    defaultTimeout: 30000
  });
  
  try {
    await browserManager.initializeWithAutoLogin('https://weibo.com');
    const page = await browserManager.getCurrentPage();
    
    console.log('📝 等待页面初始加载...');
    await page.waitForTimeout(5000);
    
    // 滚动页面以触发动态内容加载
    console.log('📜 开始滚动页面以加载更多内容...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      console.log(`   滚动第 ${i + 1} 次...`);
      await page.waitForTimeout(3000);
    }
    
    // 等待额外时间让内容加载
    console.log('⏳ 等待内容加载完成...');
    await page.waitForTimeout(5000);
    
    // 深度分析页面结构
    const debug = await page.evaluate(() => {
      console.log('[DEBUG] 开始深度分析页面结构...');
      
      // 1. 分析整个页面的链接情况
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      const linkAnalysis = {
        total: allLinks.length,
        byPattern: {
          status: allLinks.filter(a => a.href.includes('/status/')).length,
          detail: allLinks.filter(a => a.href.includes('/detail/')).length,
          weibo: allLinks.filter(a => a.href.includes('weibo.com')).length,
          other: allLinks.filter(a => !a.href.includes('/status/') && !a.href.includes('/detail/') && !a.href.includes('weibo.com')).length
        },
        sampleLinks: {
          status: allLinks.filter(a => a.href.includes('/status/')).slice(0, 3).map(a => a.href),
          detail: allLinks.filter(a => a.href.includes('/detail/')).slice(0, 3).map(a => a.href),
          other: allLinks.slice(0, 5).map(a => a.href)
        }
      };
      
      // 2. 分析页面的主要内容区域
      const mainAreas = {
        mainContent: document.querySelector('.Main_wrap_2GRrG'),
        feedElements: document.querySelectorAll('[class*="Feed"], [class*="feed"]'),
        cardElements: document.querySelectorAll('[class*="Card"], [class*="card"]'),
        scrollElements: document.querySelectorAll('[class*="Scroll"]')
      };
      
      // 3. 查找所有可能的链接模式
      const linkPatterns = [
        '/status/',
        '/detail/', 
        '/u/',
        '/n/',
        'weibo.com/',
        's.weibo.com/'
      ];
      
      const patternMatches = {};
      linkPatterns.forEach(pattern => {
        const matches = Array.from(document.querySelectorAll(`a[href*="${pattern}"]`));
        patternMatches[pattern] = {
          count: matches.length,
          sampleHrefs: matches.slice(0, 3).map(a => a.href),
          sampleTexts: matches.slice(0, 3).map(a => a.textContent.trim())
        };
      });
      
      // 4. 分析Feed元素的详细结构
      const feedDetails = Array.from(mainAreas.feedElements).slice(0, 10).map((el, index) => {
        const links = el.querySelectorAll('a[href]');
        return {
          index: index,
          className: el.className,
          textLength: el.textContent.trim().length,
          hasImages: el.querySelectorAll('img').length > 0,
          imageCount: el.querySelectorAll('img').length,
          linkCount: links.length,
          linkTypes: {
            status: Array.from(links).filter(a => a.href.includes('/status/')).length,
            detail: Array.from(links).filter(a => a.href.includes('/detail/')).length,
            other: Array.from(links).filter(a => !a.href.includes('/status/') && !a.href.includes('/detail/')).length
          },
          childrenCount: el.children.length,
          sampleLinks: Array.from(links).slice(0, 3).map(a => ({
            href: a.href,
            text: a.textContent.trim()
          }))
        };
      });
      
      // 5. 分析页面可见性
      const viewportInfo = {
        scrollHeight: document.body.scrollHeight,
        clientHeight: window.innerHeight,
        scrollTop: window.scrollY,
        scrollPercentage: Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100)
      };
      
      // 6. 检查是否有加载状态或错误提示
      const loadingStates = {
        loadingElements: document.querySelectorAll('[class*="loading"], [class*="Loading"]').length,
        errorElements: document.querySelectorAll('[class*="error"], [class*="Error"]').length,
        emptyElements: document.querySelectorAll('[class*="empty"], [class*="Empty"]').length,
        retryElements: document.querySelectorAll('[class*="retry"], [class*="Retry"]').length
      };
      
      // 7. 查找可能的内容占位符
      const placeholders = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent.trim();
        return text.length > 5 && (
          text.includes('加载') ||
          text.includes('loading') || 
          text.includes('请稍') ||
          text.includes('等待') ||
          text.includes('刷新') ||
          text.includes('重试')
        );
      }).map(el => ({
        text: el.textContent.trim(),
        className: el.className
      }));
      
      return {
        linkAnalysis: linkAnalysis,
        mainAreas: {
          mainContentExists: !!mainAreas.mainContent,
          feedCount: mainAreas.feedElements.length,
          cardCount: mainAreas.cardElements.length,
          scrollCount: mainAreas.scrollElements.length
        },
        patternMatches: patternMatches,
        feedDetails: feedDetails,
        viewportInfo: viewportInfo,
        loadingStates: loadingStates,
        placeholders: placeholders,
        documentInfo: {
          title: document.title,
          url: window.location.href,
          readyState: document.readyState
        }
      };
    });
    
    // 输出详细调试信息
    console.log('\n🔍 深度调试结果:');
    console.log('='.repeat(60));
    
    console.log('\n📄 页面基本信息:');
    console.log(`  标题: ${debug.documentInfo.title}`);
    console.log(`  URL: ${debug.documentInfo.url}`);
    console.log(`  状态: ${debug.documentInfo.readyState}`);
    
    console.log('\n📊 链接分析:');
    console.log(`  总链接数: ${debug.linkAnalysis.total}`);
    Object.entries(debug.linkAnalysis.byPattern).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} 个链接`);
    });
    
    console.log('\n🔗 链接模式匹配:');
    Object.entries(debug.patternMatches).forEach(([pattern, data]) => {
      console.log(`\n  "${pattern}": ${data.count} 个匹配`);
      if (data.sampleHrefs.length > 0) {
        data.sampleHrefs.forEach((href, i) => {
          console.log(`    ${i+1}. ${href}`);
          console.log(`       文本: "${data.sampleTexts[i]}"`);
        });
      }
    });
    
    console.log('\n📱 页面区域分析:');
    console.log(`  主内容区域: ${debug.mainAreas.mainContentExists ? '✅ 找到' : '❌ 未找到'}`);
    console.log(`  Feed元素: ${debug.mainAreas.feedCount} 个`);
    console.log(`  Card元素: ${debug.mainAreas.cardCount} 个`);
    console.log(`  Scroll元素: ${debug.mainAreas.scrollCount} 个`);
    
    console.log('\n📜 Feed元素详细分析:');
    if (debug.feedDetails.length > 0) {
      debug.feedDetails.forEach((feed, i) => {
        console.log(`\n  Feed ${i+1}: ${feed.className}`);
        console.log(`    文本长度: ${feed.textLength}`);
        console.log(`    链接总数: ${feed.linkCount}`);
        console.log(`    状态链接: ${feed.linkTypes.status}`);
        console.log(`    详情链接: ${feed.linkTypes.detail}`);
        console.log(`    图片数量: ${feed.imageCount}`);
        if (feed.sampleLinks.length > 0) {
          console.log('    示例链接:');
          feed.sampleLinks.forEach((link, j) => {
            console.log(`      ${j+1}. ${link.text} -> ${link.href}`);
          });
        }
      });
    } else {
      console.log('  ❌ 未找到Feed元素');
    }
    
    console.log('\n📐 视口信息:');
    console.log(`  页面高度: ${debug.viewportInfo.scrollHeight}px`);
    console.log(`  窗口高度: ${debug.viewportInfo.clientHeight}px`);
    console.log(`  滚动位置: ${debug.viewportInfo.scrollTop}px`);
    console.log(`  滚动百分比: ${debug.viewportInfo.scrollPercentage}%`);
    
    console.log('\n⚠️  加载状态检查:');
    console.log(`  加载中元素: ${debug.loadingStates.loadingElements} 个`);
    console.log(`  错误元素: ${debug.loadingStates.errorElements} 个`);
    console.log(`  空状态元素: ${debug.loadingStates.emptyElements} 个`);
    console.log(`  重试元素: ${debug.loadingStates.retryElements} 个`);
    
    if (debug.placeholders.length > 0) {
      console.log('\n🔄 内容占位符:');
      debug.placeholders.forEach((placeholder, i) => {
        console.log(`  ${i+1}. "${placeholder.text}" (${placeholder.className})`);
      });
    }
    
    console.log('\n🎯 关键发现:');
    if (debug.linkAnalysis.byPattern.status === 0 && debug.linkAnalysis.byPattern.detail === 0) {
      console.log('  ❌ 未找到任何status或detail链接');
      console.log('  🔍 可能原因:');
      console.log('    - 内容未完全加载');
      console.log('    - 需要用户交互触发');
      console.log('    - 页面结构发生变化');
      console.log('    - 需要不同的链接模式');
    } else {
      console.log('  ✅ 找到status/detail链接');
    }
    
    return debug;
    
  } catch (error) {
    console.error('❌ 调试失败:', error.message);
    throw error;
  }
}

// 运行调试
debugWeiboStructure().catch(console.error);