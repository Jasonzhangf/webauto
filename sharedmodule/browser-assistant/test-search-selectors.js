/**
 * 测试微博搜索页面选择器通用性
 * 验证分析器在微博搜索结果页面上的选择器结果表现
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const WeiboContentAnalyzer = require('./WeiboContentAnalyzer');

async function testSearchPageSelectors() {
  console.log('🔍 测试微博搜索页面选择器通用性...\n');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: true,
    targetDomain: 'weibo.com',
    defaultTimeout: 30000
  });
  
  const analyzer = new WeiboContentAnalyzer();
  
  try {
    // 初始化并导航到搜索页面
    const searchUrl = 'https://s.weibo.com/weibo?q=%E6%9F%A5%E7%90%86%E6%9F%AF%E5%85%8B';
    await browserManager.initializeWithAutoLogin(searchUrl);
    const page = await browserManager.getCurrentPage();
    
    console.log('📝 等待搜索页面加载完成...');
    await page.waitForTimeout(5000);
    
    // 获取页面基本信息
    const pageInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      isSearchPage: window.location.hostname.includes('s.weibo.com'),
      searchQuery: new URLSearchParams(window.location.search).get('q') || ''
    }));
    
    console.log(`📍 页面信息:`);
    console.log(`  URL: ${pageInfo.url}`);
    console.log(`  标题: ${pageInfo.title}`);
    console.log(`  是否为搜索页面: ${pageInfo.isSearchPage}`);
    console.log(`  搜索查询: ${decodeURIComponent(pageInfo.searchQuery)}`);
    console.log('');
    
    // 执行分析
    console.log('🔍 执行搜索页面分析...');
    const analysis = await analyzer.analyzePageState(page);
    
    console.log('\n' + '='.repeat(80));
    console.log('🔍 微博搜索页面选择器通用性测试');
    console.log('='.repeat(80) + '\n');
    
    // 主要输出：选择器结果
    if (analysis.selectorResults) {
      console.log('📋 搜索页面选择器结果概览:');
      console.log(`  生成时间: ${new Date(analysis.selectorResults.generatedAt).toLocaleString()}`);
      console.log(`  主要选择器数量: ${analysis.selectorResults.recommended.primary.length}`);
      console.log(`  备用选择器数量: ${analysis.selectorResults.recommended.fallback.length}`);
      console.log('');
      
      // 1. 帖子容器选择器对比
      console.log('📦 帖子容器选择器 (搜索页面):');
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
      
      // 2. 帖子链接选择器对比
      console.log('🔗 帖子链接选择器 (搜索页面):');
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
      console.log('👤 用户信息选择器 (搜索页面):');
      const userInfo = analysis.selectorResults.userInfo;
      console.log(`  最佳选择器: ${userInfo.best}`);
      console.log(`  可靠性: ${(userInfo.reliability * 100).toFixed(1)}%`);
      console.log('');
      
      // 4. 帖子内容选择器
      console.log('📝 帖子内容选择器 (搜索页面):');
      const content = analysis.selectorResults.postContent;
      console.log(`  最佳选择器: ${content.best}`);
      console.log(`  可靠性: ${(content.reliability * 100).toFixed(1)}%`);
      console.log('');
      
      // 5. 验证结果
      console.log('🔍 搜索页面选择器验证结果:');
      const validation = analysis.selectorResults.validation;
      Object.entries(validation).forEach(([type, result]) => {
        const status = result.isValid ? '✅ 有效' : '❌ 无效';
        console.log(`  ${type.padEnd(15)}: ${status} (置信度: ${(result.confidence * 100).toFixed(1)}%)`);
      });
      console.log('');
      
      // 6. 推荐选择器组合
      console.log('✅ 搜索页面推荐选择器组合:');
      const recommended = analysis.selectorResults.recommended;
      
      console.log('\n  🔥 主要选择器 (搜索页面):');
      recommended.primary.forEach((selector, index) => {
        console.log(`    ${index + 1}. ${selector}`);
      });
      
      console.log('\n  🔄 备用选择器 (搜索页面):');
      recommended.fallback.forEach((selector, index) => {
        console.log(`    ${index + 1}. ${selector}`);
      });
      console.log('');
      
      // 7. 可视区域选择器
      console.log('🖼️  搜索页面可视区域选择器:');
      const viewport = analysis.selectorResults.viewport;
      console.log(`  主要视口: ${viewport.mainViewport}`);
      console.log(`  内容区域: ${viewport.contentArea}`);
      console.log(`  滚动容器: ${viewport.scrollContainer}`);
      console.log('');
      
      // 8. 通用性对比分析
      console.log('🔄 三页面通用性对比:');
      console.log('  选择器类型      | 主页 | 个人主页 | 搜索页面');
      console.log('  --------------|------|----------|----------');
      console.log(`  帖子容器       | ✅   | ✅        | ${containers.reliability >= 0.8 ? '✅' : '⚠️'}`);
      console.log(`  帖子链接       | ✅   | ✅        | ${links.reliability >= 0.8 ? '✅' : '⚠️'}`);
      console.log(`  用户信息       | ✅   | ✅        | ${userInfo.reliability >= 0.8 ? '✅' : '⚠️'}`);
      console.log(`  帖子内容       | ✅   | ✅        | ${content.reliability >= 0.8 ? '✅' : '⚠️'}`);
      console.log('');
      
      // 9. 搜索页面专用分析
      console.log('🔍 搜索页面特征分析:');
      console.log(`  - 页面结构: ${pageInfo.isSearchPage ? '搜索结果页面' : '未知页面类型'}`);
      console.log(`  - 搜索关键词: ${decodeURIComponent(pageInfo.searchQuery)}`);
      console.log(`  - 估算帖子数: ${containers.candidates[0]?.estimatedCount || '未知'}`);
      console.log(`  - 估算链接数: ${links.candidates[0]?.estimatedCount || '未知'}`);
      console.log(`  - 链接格式: ${links.dominantFormat}`);
      console.log('');
      
      // 10. 搜索页面专用建议
      console.log('💡 搜索页面专用建议:');
      console.log('  1. 搜索页面通常有不同的DOM结构');
      console.log('  2. 搜索结果可能包含相关推广内容');
      console.log('  3. 建议验证提取的链接是否为真实的帖子链接');
      console.log('  4. 搜索页面可能有分页或"加载更多"机制');
      console.log('  5. 注意搜索结果的时间排序和相关性排序');
      console.log('');
      
      // 11. 生成搜索页面提取配置
      console.log('🛠️  搜索页面提取配置:');
      const searchExtractionConfig = {
        pageType: 'search',
        searchQuery: decodeURIComponent(pageInfo.searchQuery),
        searchUrl: pageInfo.url,
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
          validation: true,
          scrollStrategy: 'search', // 搜索页面专用滚动策略
          maxScrolls: 15 // 搜索页面可能需要更多滚动
        },
        searchSpecific: {
          filterRelatedContent: true,
          handleSearchPagination: true,
          extractSearchMetadata: true,
          validateRelevance: true
        }
      };
      
      console.log('  搜索页面配置对象:');
      console.log(JSON.stringify(searchExtractionConfig, null, 2));
      console.log('');
      
      // 12. 通用性评估
      const overallReliability = (
        containers.reliability + 
        links.reliability + 
        userInfo.reliability + 
        content.reliability
      ) / 4;
      
      console.log('📊 通用性评估:');
      console.log(`  - 整体可靠性: ${(overallReliability * 100).toFixed(1)}%`);
      console.log(`  - 通用性评级: ${overallReliability >= 0.8 ? '优秀' : overallReliability >= 0.6 ? '良好' : '需要优化'}`);
      console.log(`  - 推荐使用: ${overallReliability >= 0.6 ? '✅ 推荐' : '⚠️ 谨慎使用'}`);
      console.log('');
      
      // 13. 实际测试建议
      console.log('🧪 搜索页面测试建议:');
      console.log('  1. 验证搜索结果的相关性');
      console.log('  2. 测试选择器在不同搜索关键词下的表现');
      console.log('  3. 检查是否能正确提取搜索结果的元数据');
      console.log('  4. 验证分页或加载更多机制');
      console.log('  5. 测试在搜索结果为空时的处理');
      console.log('');
      
      console.log('✅ 搜索页面选择器通用性测试完成！');
      console.log(`整体可靠性: ${(overallReliability * 100).toFixed(1)}% - ${overallReliability >= 0.8 ? '优秀' : overallReliability >= 0.6 ? '良好' : '需要优化'}`);
      
    } else {
      console.log('❌ 未找到选择器结果，分析器可能需要更新。');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🔍 搜索页面测试完成');
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
testSearchPageSelectors().catch(console.error);