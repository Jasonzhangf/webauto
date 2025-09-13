/**
 * 基于页面结构分析的微博帖子元素筛选器
 * 使用从test-gentle.js中发现的页面结构模式
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');

async function testImprovedSelectors() {
  console.log('🔍 测试改进的选择器逻辑...');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: true,
    targetDomain: 'weibo.com',
    defaultTimeout: 30000
  });
  
  try {
    // 使用自动登录初始化
    await browserManager.initializeWithAutoLogin('https://weibo.com');
    const page = await browserManager.getCurrentPage();
    
    // 等待页面加载
    await page.waitForTimeout(10000);
    
    // 改进的选择器测试
    const analysis = await page.evaluate(() => {
      const mainContent = document.querySelector('.Main_wrap_2GRrG');
      if (!mainContent) {
        return { error: 'Main content area not found' };
      }
      
      console.log('[DEBUG] 开始分析页面结构...');
      
      // 策略1: 直接使用发现的Feed和Card模式
      const strategies = {
        feedElements: mainContent.querySelectorAll('[class*="Feed_"], [class*="feed_"]'),
        cardElements: mainContent.querySelectorAll('[class*="Card_"], [class*="card_"]'),
        feedWrapElements: mainContent.querySelectorAll('.Feed_wrap_3v9LH'),
        feedBodyElements: mainContent.querySelectorAll('.Feed_body_3R0rO'),
        homeFeedElements: mainContent.querySelectorAll('.Home_feed_3o7ry'),
        scrollContainerElements: mainContent.querySelectorAll('.Scroll_container_280Ky > div')
      };
      
      // 分析每种策略的结果
      const strategyResults = {};
      Object.entries(strategies).forEach(([name, elements]) => {
        strategyResults[name] = {
          count: elements.length,
          sampleElements: Array.from(elements).slice(0, 3).map(el => ({
            tagName: el.tagName,
            className: el.className,
            hasText: el.textContent.trim().length > 10,
            textLength: el.textContent.trim().length,
            hasLinks: el.querySelectorAll('a[href*="status"], a[href*="detail"]').length > 0,
            linkCount: el.querySelectorAll('a[href*="status"], a[href*="detail"]').length
          }))
        };
      });
      
      // 策略2: 多层级查找 - 先找容器，再在容器内找链接
      const multiLevelResults = [];
      
      // 2.1 从Feed元素中找
      Array.from(strategies.feedElements).forEach((el, index) => {
        const links = el.querySelectorAll('a[href*="status"], a[href*="detail"]');
        if (links.length > 0) {
          multiLevelResults.push({
            strategy: 'feedElement',
            index: index,
            element: el,
            className: el.className,
            textLength: el.textContent.trim().length,
            foundLinks: links.length,
            firstLink: links[0].href
          });
        }
      });
      
      // 2.2 从Card元素中找
      Array.from(strategies.cardElements).forEach((el, index) => {
        const links = el.querySelectorAll('a[href*="status"], a[href*="detail"]');
        if (links.length > 0) {
          multiLevelResults.push({
            strategy: 'cardElement',
            index: index,
            element: el,
            className: el.className,
            textLength: el.textContent.trim().length,
            foundLinks: links.length,
            firstLink: links[0].href
          });
        }
      });
      
      // 2.3 从scroll容器中找
      Array.from(strategies.scrollContainerElements).forEach((el, index) => {
        const links = el.querySelectorAll('a[href*="status"], a[href*="detail"]');
        if (links.length > 0) {
          multiLevelResults.push({
            strategy: 'scrollContainer',
            index: index,
            element: el,
            className: el.className,
            textLength: el.textContent.trim().length,
            foundLinks: links.length,
            firstLink: links[0].href
          });
        }
      });
      
      // 策略3: 级联查找 - 从大容器到小元素
      const cascadeResults = [];
      const allContainers = mainContent.querySelectorAll('.Feed_wrap_3v9LH, .Card_wrap_2ibWe, .Scroll_container_280Ky > div');
      
      Array.from(allContainers).forEach((container, containerIndex) => {
        // 在容器内查找所有可能的帖子链接
        const links = container.querySelectorAll('a[href*="status"], a[href*="detail"]');
        const textContent = container.textContent.trim();
        
        if (links.length > 0 && textContent.length > 10) {
          cascadeResults.push({
            strategy: 'cascade',
            containerIndex: containerIndex,
            containerClass: container.className,
            textLength: textContent.length,
            foundLinks: links.length,
            sampleLinks: Array.from(links).slice(0, 3).map(link => link.href)
          });
        }
      });
      
      // 策略4: 基于DOM结构的层次查找
      const hierarchicalResults = [];
      
      // 查找所有包含status链接的元素，然后向上查找合适的容器
      const allStatusLinks = mainContent.querySelectorAll('a[href*="status"], a[href*="detail"]');
      
      Array.from(allStatusLinks).slice(0, 20).forEach((link, linkIndex) => {
        // 向上查找合适的容器
        let container = link.parentElement;
        let depth = 0;
        const maxDepth = 5;
        
        while (container && depth < maxDepth && container !== mainContent) {
          const className = container.className || '';
          const text = container.textContent.trim();
          
          // 检查是否是合适的容器
          if (text.length > 10 && (
            className.includes('Feed') || 
            className.includes('feed') ||
            className.includes('Card') ||
            className.includes('card') ||
            container.children.length > 2
          )) {
            hierarchicalResults.push({
              strategy: 'hierarchical',
              linkIndex: linkIndex,
              depth: depth,
              containerClass: className,
              containerTag: container.tagName,
              textLength: text.length,
              href: link.href,
              childrenCount: container.children.length
            });
            break;
          }
          
          container = container.parentElement;
          depth++;
        }
      });
      
      return {
        strategyResults: strategyResults,
        multiLevelResults: multiLevelResults.slice(0, 10),
        cascadeResults: cascadeResults.slice(0, 10),
        hierarchicalResults: hierarchicalResults.slice(0, 10),
        totalStatusLinks: allStatusLinks.length,
        summary: {
          strategiesTested: Object.keys(strategies).length,
          multiLevelMatches: multiLevelResults.length,
          cascadeMatches: cascadeResults.length,
          hierarchicalMatches: hierarchicalResults.length
        }
      };
    });
    
    // 输出分析结果
    console.log('\n📊 选择器策略分析结果:');
    console.log('='.repeat(50));
    
    // 1. 基础策略结果
    console.log('\n📋 基础策略结果:');
    Object.entries(analysis.strategyResults).forEach(([strategy, result]) => {
      console.log(`\n${strategy}: ${result.count} 个元素`);
      if (result.sampleElements.length > 0) {
        result.sampleElements.forEach((sample, i) => {
          console.log(`  样本${i+1}: ${sample.className} (文本:${sample.textLength}, 链接:${sample.linkCount})`);
        });
      }
    });
    
    // 2. 多层级结果
    console.log('\n🔗 多层级查找结果:');
    if (analysis.multiLevelResults.length > 0) {
      analysis.multiLevelResults.forEach((result, i) => {
        console.log(`  ${i+1}. ${result.strategy}: ${result.className} (文本:${result.textLength}, 链接:${result.foundLinks})`);
        if (result.firstLink) {
          console.log(`     链接: ${result.firstLink}`);
        }
      });
    } else {
      console.log('  ❌ 未找到匹配的元素');
    }
    
    // 3. 级联查找结果
    console.log('\n🌊 级联查找结果:');
    if (analysis.cascadeResults.length > 0) {
      analysis.cascadeResults.forEach((result, i) => {
        console.log(`  ${i+1}. ${result.containerClass} (文本:${result.textLength}, 链接:${result.foundLinks})`);
      });
    } else {
      console.log('  ❌ 未找到匹配的容器');
    }
    
    // 4. 层次查找结果
    console.log('\n🏗️ 层次查找结果:');
    if (analysis.hierarchicalResults.length > 0) {
      analysis.hierarchicalResults.forEach((result, i) => {
        console.log(`  ${i+1}. 深度${result.depth}: ${result.containerClass} (文本:${result.textLength}, 子元素:${result.childrenCount})`);
        console.log(`     链接: ${result.href}`);
      });
    } else {
      console.log('  ❌ 未找到合适的容器');
    }
    
    // 5. 总结
    console.log('\n📈 总结:');
    console.log(`  总共找到 ${analysis.totalStatusLinks} 个状态链接`);
    console.log(`  多层级匹配: ${analysis.summary.multiLevelMatches}`);
    console.log(`  级联匹配: ${analysis.summary.cascadeMatches}`);
    console.log(`  层次匹配: ${analysis.summary.hierarchicalMatches}`);
    
    // 6. 推荐最佳策略
    console.log('\n🎯 推荐策略:');
    if (analysis.summary.hierarchicalMatches > 0) {
      console.log('  ✅ 推荐使用层次查找策略 - 从链接向上找容器');
    } else if (analysis.summary.cascadeMatches > 0) {
      console.log('  ✅ 推荐使用级联查找策略 - 从大容器开始筛选');
    } else if (analysis.summary.multiLevelMatches > 0) {
      console.log('  ✅ 推荐使用多层级查找策略 - 直接在Feed/Card元素中找链接');
    } else {
      console.log('  ⚠️  需要进一步分析页面结构');
    }
    
    return analysis;
    
  } catch (error) {
    console.error('❌ 分析失败:', error.message);
    throw error;
  }
}

// 运行测试
testImprovedSelectors().catch(console.error);