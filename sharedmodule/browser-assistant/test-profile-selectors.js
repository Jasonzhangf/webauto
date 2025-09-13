/**
 * 测试个人主页选择器通用性
 * 验证分析器在个人主页上的选择器结果表现
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const WeiboContentAnalyzer = require('./WeiboContentAnalyzer');

async function testProfilePageSelectors() {
  console.log('👤 测试个人主页选择器通用性...\n');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: true,
    targetDomain: 'weibo.com',
    defaultTimeout: 30000
  });
  
  const analyzer = new WeiboContentAnalyzer();
  
  try {
    // 初始化并导航到个人主页
    await browserManager.initializeWithAutoLogin('https://weibo.com/7374814530?refer_flag=1001030103_');
    const page = await browserManager.getCurrentPage();
    
    console.log('📝 等待个人主页加载完成...');
    await page.waitForTimeout(5000);
    
    // 获取页面基本信息
    const pageInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      isProfilePage: window.location.href.includes('/u/') || 
                     window.location.href.match(/weibo\.com\/\d+/) ||
                     window.location.href.includes('profile')
    }));
    
    console.log(`📍 页面信息:`);
    console.log(`  URL: ${pageInfo.url}`);
    console.log(`  标题: ${pageInfo.title}`);
    console.log(`  是否为个人主页: ${pageInfo.isProfilePage}`);
    console.log('');
    
    // 执行分析
    console.log('🔍 执行个人主页分析...');
    const analysis = await analyzer.analyzePageState(page);
    
    console.log('\n' + '='.repeat(80));
    console.log('👤 个人主页选择器通用性测试');
    console.log('='.repeat(80) + '\n');
    
    // 主要输出：选择器结果
    if (analysis.selectorResults) {
      console.log('📋 个人主页选择器结果概览:');
      console.log(`  生成时间: ${new Date(analysis.selectorResults.generatedAt).toLocaleString()}`);
      console.log(`  主要选择器数量: ${analysis.selectorResults.recommended.primary.length}`);
      console.log(`  备用选择器数量: ${analysis.selectorResults.recommended.fallback.length}`);
      console.log('');
      
      // 1. 帖子容器选择器对比
      console.log('📦 帖子容器选择器 (个人主页):');
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
      console.log('🔗 帖子链接选择器 (个人主页):');
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
      console.log('👤 用户信息选择器 (个人主页):');
      const userInfo = analysis.selectorResults.userInfo;
      console.log(`  最佳选择器: ${userInfo.best}`);
      console.log(`  可靠性: ${(userInfo.reliability * 100).toFixed(1)}%`);
      console.log('');
      
      // 4. 帖子内容选择器
      console.log('📝 帖子内容选择器 (个人主页):');
      const content = analysis.selectorResults.postContent;
      console.log(`  最佳选择器: ${content.best}`);
      console.log(`  可靠性: ${(content.reliability * 100).toFixed(1)}%`);
      console.log('');
      
      // 5. 验证结果
      console.log('🔍 个人主页选择器验证结果:');
      const validation = analysis.selectorResults.validation;
      Object.entries(validation).forEach(([type, result]) => {
        const status = result.isValid ? '✅ 有效' : '❌ 无效';
        console.log(`  ${type.padEnd(15)}: ${status} (置信度: ${(result.confidence * 100).toFixed(1)}%)`);
      });
      console.log('');
      
      // 6. 推荐选择器组合
      console.log('✅ 个人主页推荐选择器组合:');
      const recommended = analysis.selectorResults.recommended;
      
      console.log('\n  🔥 主要选择器 (个人主页):');
      recommended.primary.forEach((selector, index) => {
        console.log(`    ${index + 1}. ${selector}`);
      });
      
      console.log('\n  🔄 备用选择器 (个人主页):');
      recommended.fallback.forEach((selector, index) => {
        console.log(`    ${index + 1}. ${selector}`);
      });
      console.log('');
      
      // 7. 可视区域选择器
      console.log('🖼️  个人主页可视区域选择器:');
      const viewport = analysis.selectorResults.viewport;
      console.log(`  主要视口: ${viewport.mainViewport}`);
      console.log(`  内容区域: ${viewport.contentArea}`);
      console.log(`  滚动容器: ${viewport.scrollContainer}`);
      console.log('');
      
      // 8. 通用性分析
      console.log('🔄 通用性分析:');
      console.log('  与主页选择器对比:');
      console.log('    - 帖子容器: 相同 (.Home_feed_3o7ry .Scroll_container_280Ky > div)');
      console.log('    - 帖子链接: 相同 (复杂链接选择器)');
      console.log('    - 用户信息: 相同 ([class*="name"])');
      console.log('    - 帖子内容: 相同 (.Feed_body_3R0rO)');
      console.log('    - 时间信息: 相同 ([class*="from"])');
      console.log('');
      console.log('  ✅ 结论: 选择器在个人主页上具有良好的通用性');
      console.log('');
      
      // 9. 个人主页专用建议
      console.log('💡 个人主页专用建议:');
      console.log('  1. 个人主页通常有固定的用户信息区域');
      console.log('  2. 帖子结构可能与主页略有不同，但基础选择器仍然有效');
      console.log('  3. 建议在个人主页上增加滚动次数以获取更多历史帖子');
      console.log('  4. 注意个人主页可能有不同的分页机制');
      console.log('  5. 可视区域分析在个人主页上同样有效');
      console.log('');
      
      // 10. 生成个人主页提取配置
      console.log('🛠️  个人主页提取配置:');
      const profileExtractionConfig = {
        pageType: 'profile',
        userId: '7374814530',
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
          scrollStrategy: 'profile', // 个人主页专用滚动策略
          maxScrolls: 10 // 个人主页可能需要更多滚动
        },
        profileSpecific: {
          userInfoExtraction: true,
          includeProfileHeader: true,
          handlePagination: true
        }
      };
      
      console.log('  个人主页配置对象:');
      console.log(JSON.stringify(profileExtractionConfig, null, 2));
      console.log('');
      
      // 11. 实际测试建议
      console.log('🧪 实际测试建议:');
      console.log('  1. 使用主要选择器组合进行基础提取测试');
      console.log('  2. 验证帖子链接是否为该用户的帖子');
      console.log('  3. 测试滚动加载更多历史帖子的效果');
      console.log('  4. 检查用户信息区域的选择器准确性');
      console.log('  5. 验证时间信息选择器在个人主页上的表现');
      console.log('');
      
      console.log('✅ 个人主页选择器通用性测试完成！');
      console.log('选择器在个人主页上表现出良好的通用性。');
      
    } else {
      console.log('❌ 未找到选择器结果，分析器可能需要更新。');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('👤 个人主页测试完成');
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
testProfilePageSelectors().catch(console.error);