/**
 * 测试选择器结果输出功能
 * 验证分析器是否能输出实用的CSS选择器用于内容提取
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const WeiboContentAnalyzer = require('./WeiboContentAnalyzer');

async function testSelectorResults() {
  console.log('🎯 测试选择器结果输出功能...\n');
  
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
    
    // 执行分析
    console.log('🔍 执行页面分析...');
    const analysis = await analyzer.analyzePageState(page);
    
    console.log('\n' + '='.repeat(80));
    console.log('🎯 选择器结果输出测试');
    console.log('='.repeat(80) + '\n');
    
    // 主要输出：选择器结果
    if (analysis.selectorResults) {
      console.log('📋 选择器结果概览:');
      console.log(`  生成时间: ${new Date(analysis.selectorResults.generatedAt).toLocaleString()}`);
      console.log(`  主要选择器数量: ${analysis.selectorResults.recommended.primary.length}`);
      console.log(`  备用选择器数量: ${analysis.selectorResults.recommended.fallback.length}`);
      console.log('');
      
      // 1. 帖子容器选择器
      console.log('📦 帖子容器选择器:');
      const containers = analysis.selectorResults.postContainers;
      console.log(`  最佳选择器: ${containers.best}`);
      console.log(`  可靠性: ${(containers.reliability * 100).toFixed(1)}%`);
      console.log(`  优先级: ${containers.candidates[0]?.priority || 'unknown'}`);
      console.log(`  估算匹配数: ${containers.candidates[0]?.estimatedCount || 'unknown'}`);
      
      // 显示前3个候选选择器
      console.log('  候选选择器 (前3个):');
      containers.candidates.slice(0, 3).forEach((candidate, index) => {
        console.log(`    ${index + 1}. ${candidate.selector} (评分: ${(candidate.matchScore * 100).toFixed(1)}%, 优先级: ${candidate.priority})`);
      });
      console.log('');
      
      // 2. 帖子链接选择器
      console.log('🔗 帖子链接选择器:');
      const links = analysis.selectorResults.postLinks;
      console.log(`  最佳选择器: ${links.best}`);
      console.log(`  可靠性: ${(links.reliability * 100).toFixed(1)}%`);
      console.log(`  主导格式: ${links.dominantFormat}`);
      console.log(`  估算链接数: ${links.candidates[0]?.estimatedCount || 'unknown'}`);
      
      console.log('  候选选择器 (前3个):');
      links.candidates.slice(0, 3).forEach((candidate, index) => {
        console.log(`    ${index + 1}. ${candidate.selector} (评分: ${(candidate.matchScore * 100).toFixed(1)}%, 格式: ${candidate.format})`);
      });
      console.log('');
      
      // 3. 用户信息选择器
      console.log('👤 用户信息选择器:');
      const userInfo = analysis.selectorResults.userInfo;
      console.log(`  最佳选择器: ${userInfo.best}`);
      console.log(`  可靠性: ${(userInfo.reliability * 100).toFixed(1)}%`);
      console.log('');
      
      // 4. 帖子内容选择器
      console.log('📝 帖子内容选择器:');
      const content = analysis.selectorResults.postContent;
      console.log(`  最佳选择器: ${content.best}`);
      console.log(`  可靠性: ${(content.reliability * 100).toFixed(1)}%`);
      console.log('');
      
      // 5. 推荐选择器组合
      console.log('✅ 推荐选择器组合 (用于实际内容提取):');
      const recommended = analysis.selectorResults.recommended;
      
      console.log('\n  🔥 主要选择器 (推荐用于内容提取):');
      recommended.primary.forEach((selector, index) => {
        console.log(`    ${index + 1}. ${selector}`);
      });
      
      console.log('\n  🔄 备用选择器 (如果主要选择器失效):');
      recommended.fallback.forEach((selector, index) => {
        console.log(`    ${index + 1}. ${selector}`);
      });
      
      console.log('\n  ⚡ 最小选择器 (用于快速扫描):');
      recommended.minimal.forEach((selector, index) => {
        console.log(`    ${index + 1}. ${selector}`);
      });
      console.log('');
      
      // 6. 选择器验证结果
      console.log('🔍 选择器验证结果:');
      const validation = analysis.selectorResults.validation;
      Object.entries(validation).forEach(([type, result]) => {
        const status = result.isValid ? '✅ 有效' : '❌ 无效';
        console.log(`  ${type.padEnd(15)}: ${status} (置信度: ${(result.confidence * 100).toFixed(1)}%)`);
      });
      console.log('');
      
      // 7. 可视区域选择器
      console.log('🖼️  可视区域选择器:');
      const viewport = analysis.selectorResults.viewport;
      console.log(`  主要视口: ${viewport.mainViewport}`);
      console.log(`  内容区域: ${viewport.contentArea}`);
      console.log(`  滚动容器: ${viewport.scrollContainer}`);
      console.log(`  完整视口内容: ${viewport.viewportContent}`);
      console.log('');
      
      // 8. 实际使用建议
      console.log('💡 实际使用建议:');
      console.log('  1. 帖子提取使用主要选择器组合');
      console.log('  2. 如果主要选择器失效，切换到备用选择器');
      console.log('  3. 快速验证可以使用最小选择器组合');
      console.log('  4. 根据选择器验证结果调整提取策略');
      console.log('  5. 可视区域分析可以帮助优化滚动策略');
      console.log('');
      
      // 9. 生成提取配置示例
      console.log('🛠️  生成提取配置示例:');
      const extractionConfig = {
        selectors: {
          postContainer: recommended.primary[0],
          postLinks: recommended.primary[1],
          username: recommended.primary[2],
          content: recommended.primary[3],
          timeInfo: recommended.primary[4],
          interactions: analysis.selectorResults.interactions
        },
        viewport: {
          main: viewport.mainViewport,
          content: viewport.contentArea,
          scrollable: viewport.scrollContainer
        },
        strategy: {
          primary: 'primary',
          fallback: 'fallback',
          validation: true
        }
      };
      
      console.log('  配置对象 (可直接用于内容提取):');
      console.log(JSON.stringify(extractionConfig, null, 2));
      console.log('');
      
      console.log('✅ 选择器结果生成完成！');
      console.log('这些选择器可以直接用于微博内容提取程序。');
      
    } else {
      console.log('❌ 未找到选择器结果，分析器可能需要更新。');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🎯 测试完成');
    console.log('='.repeat(80));
    
    return analysis;
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  } finally {
    await browserManager.cleanup();
  }
}

// 运行测试
testSelectorResults().catch(console.error);