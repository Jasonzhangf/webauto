/**
 * 测试微博内容状态智能分析器
 * 验证动态判断条件的准确性
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const WeiboContentAnalyzer = require('./WeiboContentAnalyzer');

async function testContentAnalyzer() {
  console.log('🧠 测试微博内容状态智能分析器...');
  
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
    
    console.log('📝 等待初始页面加载...');
    await page.waitForTimeout(5000);
    
    // 第一次分析（初始状态）
    console.log('\n🔍 第一次分析（初始状态）:');
    const analysis1 = await analyzer.analyzePageState(page);
    console.log('分析结果:', JSON.stringify(analysis1.summary, null, 2));
    console.log('建议:', analysis1.finalRecommendation.message);
    
    if (analysis1.summary.needsAction) {
      console.log('\n📋 检测到的问题:');
      analysis1.judgments.forEach((judgment, index) => {
        console.log(`  ${index + 1}. [${judgment.type}] ${judgment.message} (${judgment.severity})`);
        console.log(`     建议: ${judgment.recommendation}`);
      });
    }
    
    // 根据建议执行操作
    await executeRecommendation(page, analysis1.finalRecommendation);
    
    // 第二次分析（操作后）
    console.log('\n🔍 第二次分析（操作后）:');
    const analysis2 = await analyzer.analyzePageState(page);
    console.log('分析结果:', JSON.stringify(analysis2.summary, null, 2));
    console.log('建议:', analysis2.finalRecommendation.message);
    
    // 比较两次分析结果
    console.log('\n📊 分析结果对比:');
    console.log(`  初始状态问题: ${analysis1.summary.needsAction ? '是' : '否'} (${analysis1.judgments.length} 个问题)`);
    console.log(`  操作后问题: ${analysis2.summary.needsAction ? '是' : '否'} (${analysis2.judgments.length} 个问题)`);
    console.log(`  改善情况: ${analysis1.judgments.length > analysis2.judgments.length ? '✅ 有改善' : '⚠️ 无明显变化'}`);
    
    // 详细对比
    if (analysis1.judgments.length > 0 || analysis2.judgments.length > 0) {
      console.log('\n📝 详细问题对比:');
      console.log('  初始问题:');
      analysis1.judgments.forEach((j, i) => {
        console.log(`    ${i + 1}. ${j.message}`);
      });
      console.log('  剩余问题:');
      analysis2.judgments.forEach((j, i) => {
        console.log(`    ${i + 1}. ${j.message}`);
      });
    }
    
    // 测试不同页面的分析能力
    console.log('\n🌐 测试用户主页分析...');
    await testUserPageAnalysis(page, analyzer);
    
    return {
      initialAnalysis: analysis1,
      finalAnalysis: analysis2,
      improvement: analysis1.judgments.length > analysis2.judgments.length
    };
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  } finally {
    await browserManager.cleanup();
  }
}

/**
 * 执行分析器的建议
 */
async function executeRecommendation(page, recommendation) {
  console.log(`\n🎯 执行建议: ${recommendation.message}`);
  
  switch (recommendation.action) {
    case 'wait':
      console.log(`⏳ 等待 ${recommendation.waitTime || 3000}ms...`);
      await page.waitForTimeout(recommendation.waitTime || 3000);
      break;
      
    case 'scroll':
      console.log(`📜 滚动页面 ${recommendation.scrollCount || 3} 次...`);
      for (let i = 0; i < (recommendation.scrollCount || 3); i++) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        console.log(`   滚动第 ${i + 1} 次...`);
        await page.waitForTimeout(2000);
      }
      break;
      
    case 'wait_and_retry':
      console.log('⏳ 等待并重试...');
      await page.waitForTimeout(5000);
      break;
      
    case 'scroll_for_more_content':
      console.log('📜 滚动加载更多内容...');
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(2000);
      }
      break;
      
    case 'proceed':
      console.log('✅ 页面状态良好，继续操作');
      break;
      
    case 'stop_and_diagnose':
      console.log('🚨 需要停止并诊断问题');
      break;
      
    case 'caution':
      console.log('⚠️ 谨慎操作，存在轻微问题');
      break;
      
    default:
      console.log('❓ 未知建议类型，跳过执行');
  }
}

/**
 * 测试用户主页分析
 */
async function testUserPageAnalysis(page, analyzer) {
  try {
    // 导航到一个用户主页进行测试
    console.log('🔗 导航到测试用户主页...');
    await page.goto('https://weibo.com/u/1992424454');
    await page.waitForTimeout(3000);
    
    console.log('🔍 分析用户主页...');
    const userAnalysis = await analyzer.analyzePageState(page);
    
    console.log('用户主页分析结果:');
    console.log(`  状态健康: ${userAnalysis.summary.isHealthy ? '✅' : '❌'}`);
    console.log(`  需要操作: ${userAnalysis.summary.needsAction ? '是' : '否'}`);
    console.log(`  建议: ${userAnalysis.finalRecommendation.message}`);
    
    if (userAnalysis.summary.needsAction) {
      console.log('  检测到的问题:');
      userAnalysis.judgments.forEach((j, i) => {
        console.log(`    ${i + 1}. ${j.message}`);
      });
    }
    
    // 返回主页
    await page.goto('https://weibo.com');
    await page.waitForTimeout(2000);
    
  } catch (error) {
    console.log('⚠️ 用户主页测试跳过:', error.message);
  }
}

// 运行测试
testContentAnalyzer().catch(console.error);