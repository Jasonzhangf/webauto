/**
 * 测试增强版可视区域检测功能
 * 验证静态元素识别和可视区域内容分析
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const WeiboContentAnalyzer = require('./WeiboContentAnalyzer');

async function testViewportDetection() {
  console.log('🔍 测试增强版可视区域检测功能...');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: true,
    targetDomain: 'weibo.com',
    defaultTimeout: 30000
  });
  
  const analyzer = new WeiboContentAnalyzer();
  
  try {
    // 初始化并导航
    await browserManager.initializeWithAutoLogin('https://weibo.com');
    const page = await browserManager.getCurrentPage();
    
    console.log('📝 等待页面加载完成...');
    await page.waitForTimeout(5000);
    
    // 测试1：初始状态分析
    console.log('\n🧪 测试1：初始页面状态分析');
    const initialAnalysis = await analyzer.analyzePageState(page);
    
    console.log('📊 初始分析结果:');
    console.log(`  页面健康: ${initialAnalysis.summary.isHealthy ? '✅' : '❌'}`);
    console.log(`  需要操作: ${initialAnalysis.summary.needsAction ? '是' : '否'}`);
    console.log(`  总体评估: ${initialAnalysis.summary.overallAssessment}`);
    
    if (initialAnalysis.viewportAnalysis) {
      console.log('\n🎯 可视区域分析:');
      console.log(`  可视区域内容: ${initialAnalysis.viewportAnalysis.hasViewportContent ? '✅' : '❌'}`);
      console.log(`  帖子候选数: ${initialAnalysis.viewportAnalysis.postCandidates}`);
      console.log(`  有效链接数: ${initialAnalysis.viewportAnalysis.validLinksInViewport}`);
      console.log(`  内容密度: ${initialAnalysis.viewportAnalysis.contentDensity.toFixed(4)}`);
      console.log(`  内容比例: ${(initialAnalysis.viewportAnalysis.contentRatio * 100).toFixed(1)}%`);
      console.log(`  静态元素数: ${initialAnalysis.viewportAnalysis.staticElements}`);
    }
    
    if (initialAnalysis.staticElementAnalysis) {
      console.log('\n🏗️ 静态元素分析:');
      console.log(`  静态元素过多: ${initialAnalysis.staticElementAnalysis.hasSignificantStaticContent ? '⚠️' : '✅'}`);
      console.log(`  静态元素总数: ${initialAnalysis.staticElementAnalysis.staticElements.length}`);
      console.log('  静态元素类型分布:');
      Object.entries(initialAnalysis.staticElementAnalysis.staticElementTypes).forEach(([type, count]) => {
        console.log(`    ${type}: ${count}`);
      });
    }
    
    console.log('\n📋 检测到的问题:');
    initialAnalysis.judgments.forEach((judgment, index) => {
      console.log(`  ${index + 1}. [${judgment.type}] ${judgment.message} (${judgment.severity})`);
      console.log(`     建议: ${judgment.recommendation}`);
    });
    
    console.log(`\n🎯 最终建议: ${initialAnalysis.finalRecommendation.message}`);
    console.log(`   优先级: ${initialAnalysis.finalRecommendation.priority}`);
    console.log(`   操作: ${initialAnalysis.finalRecommendation.action}`);
    
    // 测试2：滚动后分析，检测静态元素
    console.log('\n🧪 测试2：滚动后静态元素检测');
    
    // 记录滚动前的元素状态
    const beforeScroll = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      return elements.map(el => ({
        className: el.className || '',
        id: el.id || '',
        tagName: el.tagName,
        rect: el.getBoundingClientRect(),
        text: (el.textContent || '').substring(0, 50)
      })).filter(el => el.rect.top < window.innerHeight && el.rect.bottom > 0);
    });
    
    // 执行滚动
    console.log('📜 执行页面滚动...');
    await page.evaluate(() => {
      window.scrollTo(0, window.innerHeight * 0.7); // 滚动到70%位置
    });
    await page.waitForTimeout(2000);
    
    // 记录滚动后的元素状态
    const afterScroll = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      return elements.map(el => ({
        className: el.className || '',
        id: el.id || '',
        tagName: el.tagName,
        rect: el.getBoundingClientRect(),
        text: (el.textContent || '').substring(0, 50)
      })).filter(el => el.rect.top < window.innerHeight && el.rect.bottom > 0);
    });
    
    // 分析滚动前后不变的元素（可能是静态UI）
    const staticElements = [];
    beforeScroll.forEach(beforeEl => {
      const matchingAfterEl = afterScroll.find(afterEl => 
        afterEl.className === beforeEl.className && 
        afterEl.id === beforeEl.id && 
        afterEl.tagName === beforeEl.tagName
      );
      if (matchingAfterEl && Math.abs(beforeEl.rect.top - matchingAfterEl.rect.top) < 5) {
        staticElements.push(beforeEl);
      }
    });
    
    console.log(`📊 滚动分析结果:`);
    console.log(`  滚动前可视元素: ${beforeScroll.length}`);
    console.log(`  滚动后可视元素: ${afterScroll.length}`);
    console.log(`  位置不变的元素: ${staticElements.length}`);
    
    // 分析静态元素类型
    const staticTypes = {};
    staticElements.forEach(el => {
      const type = analyzer.getStaticElementType(el);
      staticTypes[type] = (staticTypes[type] || 0) + 1;
    });
    
    console.log('  静态元素类型分布:');
    Object.entries(staticTypes).forEach(([type, count]) => {
      console.log(`    ${type}: ${count}`);
    });
    
    // 测试3：滚动后的重新分析
    console.log('\n🧪 测试3：滚动后重新分析');
    const afterScrollAnalysis = await analyzer.analyzePageState(page);
    
    console.log('📊 滚动后分析结果:');
    console.log(`  页面健康: ${afterScrollAnalysis.summary.isHealthy ? '✅' : '❌'}`);
    console.log(`  需要操作: ${afterScrollAnalysis.summary.needsAction ? '是' : '否'}`);
    
    if (afterScrollAnalysis.viewportAnalysis) {
      console.log('\n🎯 滚动后可视区域:');
      console.log(`  可视区域内容: ${afterScrollAnalysis.viewportAnalysis.hasViewportContent ? '✅' : '❌'}`);
      console.log(`  帖子候选数: ${afterScrollAnalysis.viewportAnalysis.postCandidates}`);
      console.log(`  内容比例: ${(afterScrollAnalysis.viewportAnalysis.contentRatio * 100).toFixed(1)}%`);
    }
    
    // 对比分析结果
    console.log('\n📈 分析结果对比:');
    const comparison = {
      initialJudgments: initialAnalysis.judgments.length,
      afterScrollJudgments: afterScrollAnalysis.judgments.length,
      initialViewportContent: initialAnalysis.viewportAnalysis?.hasViewportContent || false,
      afterScrollViewportContent: afterScrollAnalysis.viewportAnalysis?.hasViewportContent || false,
      initialContentRatio: initialAnalysis.viewportAnalysis?.contentRatio || 0,
      afterScrollContentRatio: afterScrollAnalysis.viewportAnalysis?.contentRatio || 0
    };
    
    Object.entries(comparison).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    
    // 测试4：模拟内容变化检测
    console.log('\n🧪 测试4：内容变化检测能力');
    
    // 等待一段时间，看是否有动态内容加载
    console.log('⏳ 等待动态内容加载...');
    await page.waitForTimeout(3000);
    
    const finalAnalysis = await analyzer.analyzePageState(page);
    
    console.log('📊 最终分析结果:');
    console.log(`  页面健康: ${finalAnalysis.summary.isHealthy ? '✅' : '❌'}`);
    console.log(`  最终建议: ${finalAnalysis.finalRecommendation.message}`);
    
    if (finalAnalysis.viewportAnalysis) {
      console.log(`  最终可视区域内容: ${finalAnalysis.viewportAnalysis.hasViewportContent ? '✅' : '❌'}`);
      console.log(`  最终内容比例: ${(finalAnalysis.viewportAnalysis.contentRatio * 100).toFixed(1)}%`);
    }
    
    return {
      initialAnalysis,
      afterScrollAnalysis,
      finalAnalysis,
      staticElementsFound: staticElements.length,
      viewportDetectionWorking: initialAnalysis.viewportAnalysis !== null,
      testResults: {
        initialViewportContent: comparison.initialViewportContent,
        afterScrollViewportContent: comparison.afterScrollViewportContent,
        contentRatioImproved: comparison.afterScrollContentRatio > comparison.initialContentRatio,
        staticElementsDetected: staticElements.length > 0
      }
    };
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  } finally {
    await browserManager.cleanup();
  }
}

// 运行测试
testViewportDetection().catch(console.error);