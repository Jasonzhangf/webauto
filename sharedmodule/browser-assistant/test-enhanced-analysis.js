/**
 * 测试增强版智能分析器输出
 * 验证详细分析结果和二次分析能力
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const WeiboContentAnalyzer = require('./WeiboContentAnalyzer');

async function testEnhancedAnalysisOutput() {
  console.log('🧪 测试增强版智能分析器输出...\n');
  
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
    
    // 执行增强版分析
    console.log('🔍 执行增强版页面分析...');
    const analysis = await analyzer.analyzePageState(page);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 增强版分析结果输出');
    console.log('='.repeat(60) + '\n');
    
    // 1. 基础分析摘要
    console.log('📋 基础分析摘要:');
    console.log(`  分析时间: ${new Date(analysis.analysis.timestamp).toLocaleString()}`);
    console.log(`  页面URL: ${analysis.analysis.pageInfo.url}`);
    console.log(`  页面标题: ${analysis.analysis.pageInfo.title}`);
    console.log(`  滚动高度: ${analysis.analysis.pageInfo.scrollHeight}px`);
    console.log(`  客户端高度: ${analysis.analysis.pageInfo.clientHeight}px`);
    
    // 2. 详细分析结果
    console.log('\n🔍 详细分析结果:');
    
    if (analysis.detailedAnalysis) {
      console.log('  内容质量分析:');
      console.log(`    - 内容丰富度评分: ${analysis.detailedAnalysis.contentQuality.contentRichnessScore.toFixed(1)}/100`);
      console.log(`    - 总文本长度: ${analysis.detailedAnalysis.contentQuality.totalTextLength} 字符`);
      console.log(`    - Feed元素: ${analysis.detailedAnalysis.contentQuality.feedElements}`);
      console.log(`    - Card元素: ${analysis.detailedAnalysis.contentQuality.cardElements}`);
      console.log(`    - 文本密度: ${analysis.detailedAnalysis.contentQuality.textDensity.toFixed(4)}`);
      
      console.log('\n  链接质量分析:');
      console.log(`    - 链接质量评分: ${analysis.detailedAnalysis.linkQuality.linkQualityScore.toFixed(1)}/100`);
      console.log(`    - 总链接数: ${analysis.detailedAnalysis.linkQuality.totalLinks}`);
      console.log(`    - 有效帖子链接: ${analysis.detailedAnalysis.linkQuality.validPostLinks}`);
      console.log(`    - 链接密度: ${analysis.detailedAnalysis.linkQuality.linkDensity.toFixed(4)}`);
      console.log(`    - 主导格式: ${analysis.detailedAnalysis.linkQuality.dominantFormat}`);
      console.log('    - 格式分布:', analysis.detailedAnalysis.linkQuality.formatDistribution);
      
      if (analysis.detailedAnalysis.viewportQuality) {
        console.log('\n  可视区域质量分析:');
        console.log(`    - 可视区域评分: ${analysis.detailedAnalysis.viewportQuality.viewportScore.toFixed(1)}/100`);
        console.log(`    - 可视区域内容: ${analysis.detailedAnalysis.viewportQuality.hasViewportContent ? '✅' : '❌'}`);
        console.log(`    - 内容比例: ${(analysis.detailedAnalysis.viewportQuality.contentRatio * 100).toFixed(1)}%`);
        console.log(`    - 帖子候选数: ${analysis.detailedAnalysis.viewportQuality.postCandidates}`);
        console.log(`    - 可视链接数: ${analysis.detailedAnalysis.viewportQuality.validLinksInViewport}`);
        console.log(`    - 内容密度: ${analysis.detailedAnalysis.viewportQuality.contentDensity.toFixed(4)}`);
      }
      
      if (analysis.detailedAnalysis.staticImpact) {
        console.log('\n  静态元素影响分析:');
        console.log(`    - 静态影响评分: ${analysis.detailedAnalysis.staticImpact.staticImpactScore.toFixed(1)}/100`);
        console.log(`    - 静态元素数量: ${analysis.detailedAnalysis.staticImpact.staticElementCount}`);
        console.log(`    - 显著静态内容: ${analysis.detailedAnalysis.staticImpact.hasSignificantStaticContent ? '⚠️' : '✅'}`);
        console.log('    - 静态元素类型:', analysis.detailedAnalysis.staticImpact.staticElementTypes);
      }
      
      console.log('\n  结构完整性分析:');
      console.log(`    - 结构完整性评分: ${analysis.detailedAnalysis.structuralIntegrity.structuralScore.toFixed(1)}/100`);
      console.log(`    - 结构健康度: ${analysis.detailedAnalysis.structuralIntegrity.structureHealth}`);
      console.log(`    - 完整性分数: ${analysis.detailedAnalysis.structuralIntegrity.integrityScore}/6`);
      console.log(`    - 主要内容: ${analysis.detailedAnalysis.structuralIntegrity.hasMainContent ? '✅' : '❌'}`);
      console.log(`    - 导航: ${analysis.detailedAnalysis.structuralIntegrity.hasNavigation ? '✅' : '❌'}`);
      console.log(`    - 侧边栏: ${analysis.detailedAnalysis.structuralIntegrity.hasSidebar ? '✅' : '❌'}`);
      
      console.log('\n  动态状态分析:');
      console.log(`    - 动态状态评分: ${analysis.detailedAnalysis.dynamicState.dynamicScore.toFixed(1)}/100`);
      console.log(`    - 正在加载: ${analysis.detailedAnalysis.dynamicState.isLoading ? '⚠️' : '✅'}`);
      console.log(`    - 内容稳定: ${analysis.detailedAnalysis.dynamicState.isContentStable ? '✅' : '❌'}`);
      console.log(`    - 加载元素: ${analysis.detailedAnalysis.dynamicState.loadingElements}`);
      console.log(`    - 动画元素: ${analysis.detailedAnalysis.dynamicState.animatedElements}`);
      console.log(`    - 隐藏元素: ${analysis.detailedAnalysis.dynamicState.hiddenElements}`);
      console.log(`    - 需要滚动: ${analysis.detailedAnalysis.dynamicState.needsScroll ? '⚠️' : '✅'}`);
      
      console.log('\n  错误状态分析:');
      console.log(`    - 错误状态评分: ${analysis.detailedAnalysis.errorState.errorScore.toFixed(1)}/100`);
      console.log(`    - 有错误: ${analysis.detailedAnalysis.errorState.hasErrors ? '❌' : '✅'}`);
      console.log(`    - 空状态: ${analysis.detailedAnalysis.errorState.hasEmptyState ? '❌' : '✅'}`);
      console.log(`    - 错误元素: ${analysis.detailedAnalysis.errorState.errorElements}`);
      console.log(`    - 空元素: ${analysis.detailedAnalysis.errorState.emptyElements}`);
      console.log(`    - 网络错误: ${analysis.detailedAnalysis.errorState.networkErrors}`);
      console.log(`    - 可用性: ${analysis.detailedAnalysis.errorState.isUsable ? '✅' : '❌'}`);
      console.log(`    - 次要问题: ${analysis.detailedAnalysis.errorState.hasMinorIssues ? '⚠️' : '✅'}`);
    }
    
    // 3. 总体评分
    console.log('\n📈 总体评分:');
    if (analysis.overallScores) {
      console.log(`  - 内容质量: ${analysis.overallScores.contentQuality.toFixed(1)}/100`);
      console.log(`  - 链接质量: ${analysis.overallScores.linkQuality.toFixed(1)}/100`);
      console.log(`  - 可视区域: ${analysis.overallScores.viewportQuality.toFixed(1)}/100`);
      console.log(`  - 结构完整性: ${analysis.overallScores.structuralIntegrity.toFixed(1)}/100`);
      console.log(`  - 动态状态: ${analysis.overallScores.dynamicState.toFixed(1)}/100`);
      console.log(`  - 错误状态: ${analysis.overallScores.errorState.toFixed(1)}/100`);
      console.log(`  - 静态影响: ${analysis.overallScores.staticImpact.toFixed(1)}/100`);
      console.log(`  - 总分: ${analysis.overallScores.totalScore.toFixed(1)}/100`);
      console.log(`  - 等级: ${analysis.overallScores.grade.toUpperCase()}`);
    }
    
    // 4. 判断结果
    console.log('\n⚖️ 智能判断结果:');
    analysis.judgments.forEach((judgment, index) => {
      const emoji = judgment.severity === 'positive' ? '✅' : 
                   judgment.severity === 'high' ? '❌' : 
                   judgment.severity === 'medium' ? '⚠️' : '📝';
      console.log(`  ${index + 1}. ${emoji} [${judgment.type.toUpperCase()}] ${judgment.message}`);
      console.log(`     严重程度: ${judgment.severity}`);
      console.log(`     建议: ${judgment.recommendation}`);
      if (judgment.details) {
        console.log(`     详情: ${JSON.stringify(judgment.details).substring(0, 100)}...`);
      }
      console.log('');
    });
    
    // 5. 二次分析结果
    if (analysis.secondaryAnalysis) {
      console.log('🔄 二次分析结果:');
      console.log(`  - 分析置信度: ${analysis.secondaryAnalysis.confidence.toFixed(1)}%`);
      console.log(`  - 可靠性评级: ${analysis.secondaryAnalysis.summary.reliability.toUpperCase()}`);
      console.log(`  - 总体评估: ${analysis.secondaryAnalysis.summary.overallAssessment.toUpperCase()}`);
      console.log(`  - 主要问题: ${analysis.secondaryAnalysis.summary.primaryIssue || '无'}`);
      console.log(`  - 需要关注: ${analysis.secondaryAnalysis.summary.needsAttention ? '是' : '否'}`);
      
      console.log('\n  判断模式分析:');
      const patterns = analysis.secondaryAnalysis.judgmentPatterns;
      console.log(`    - 正面指示: ${patterns.positive} 个`);
      console.log(`    - 高严重度: ${patterns.high} 个`);
      console.log(`    - 中严重度: ${patterns.medium} 个`);
      console.log(`    - 低严重度: ${patterns.low} 个`);
      console.log(`    - 主导严重度: ${patterns.dominantSeverity.type}`);
      
      console.log('\n  主要问题识别:');
      const issues = analysis.secondaryAnalysis.primaryIssues;
      console.log(`    - 关键问题: ${issues.critical.join(', ') || '无'}`);
      console.log(`    - 重要问题: ${issues.important.join(', ') || '无'}`);
      console.log(`    - 需要关注总数: ${issues.needsAttention}`);
      
      if (analysis.secondaryAnalysis.optimizationSuggestions.length > 0) {
        console.log('\n  优化建议:');
        analysis.secondaryAnalysis.optimizationSuggestions.forEach((suggestion, index) => {
          const priorityEmoji = suggestion.priority === 'high' ? '🔴' : 
                               suggestion.priority === 'medium' ? '🟡' : '🟢';
          console.log(`    ${index + 1}. ${priorityEmoji} ${suggestion.description}`);
          console.log(`       原因: ${suggestion.reason}`);
          console.log(`       动作: ${suggestion.action}`);
        });
      }
    }
    
    // 6. 🎯 选择器结果（主要输出）
    console.log('\n🎯 选择器结果（用于内容提取）:');
    if (analysis.selectorResults) {
      console.log('\n  📦 帖子容器选择器:');
      const postContainers = analysis.selectorResults.postContainers;
      console.log(`    最佳选择器: ${postContainers.best}`);
      console.log(`    可靠性: ${(postContainers.reliability * 100).toFixed(1)}%`);
      console.log(`    候选选择器数量: ${postContainers.candidates.length}`);
      
      console.log('\n  🔗 帖子链接选择器:');
      const postLinks = analysis.selectorResults.postLinks;
      console.log(`    最佳选择器: ${postLinks.best}`);
      console.log(`    可靠性: ${(postLinks.reliability * 100).toFixed(1)}%`);
      console.log(`    主导格式: ${postLinks.dominantFormat}`);
      console.log(`    估算数量: ${postLinks.candidates[0]?.estimatedCount || '未知'}`);
      
      console.log('\n  👤 用户信息选择器:');
      const userInfo = analysis.selectorResults.userInfo;
      console.log(`    最佳选择器: ${userInfo.best}`);
      console.log(`    可靠性: ${(userInfo.reliability * 100).toFixed(1)}%`);
      
      console.log('\n  📝 帖子内容选择器:');
      const postContent = analysis.selectorResults.postContent;
      console.log(`    最佳选择器: ${postContent.best}`);
      console.log(`    可靠性: ${(postContent.reliability * 100).toFixed(1)}%`);
      
      console.log('\n  ⏰ 时间信息选择器:');
      const timeInfo = analysis.selectorResults.timeInfo;
      console.log(`    最佳选择器: ${timeInfo.best}`);
      console.log(`    可靠性: ${(timeInfo.reliability * 100).toFixed(1)}%`);
      
      console.log('\n  🔢 交互数据选择器:');
      const interactions = analysis.selectorResults.interactions;
      console.log(`    点赞: ${interactions.likes.best} (可靠性: ${(interactions.likes.reliability * 100).toFixed(1)}%)`);
      console.log(`    评论: ${interactions.comments.best} (可靠性: ${(interactions.comments.reliability * 100).toFixed(1)}%)`);
      console.log(`    转发: ${interactions.reposts.best} (可靠性: ${(interactions.reposts.reliability * 100).toFixed(1)}%)`);
      
      console.log('\n  🖼️  可视区域选择器:');
      const viewport = analysis.selectorResults.viewport;
      console.log(`    主要视口: ${viewport.mainViewport}`);
      console.log(`    内容区域: ${viewport.contentArea}`);
      console.log(`    滚动容器: ${viewport.scrollContainer}`);
      
      console.log('\n  ✅ 推荐选择器组合:');
      const recommended = analysis.selectorResults.recommended;
      console.log('\n    主要选择器 (用于提取):');
      recommended.primary.forEach((selector, index) => {
        console.log(`      ${index + 1}. ${selector}`);
      });
      
      console.log('\n    备用选择器 (用于验证):');
      recommended.fallback.forEach((selector, index) => {
        console.log(`      ${index + 1}. ${selector}`);
      });
      
      console.log('\n    最小选择器 (用于快速扫描):');
      recommended.minimal.forEach((selector, index) => {
        console.log(`      ${index + 1}. ${selector}`);
      });
      
      console.log('\n  📊 选择器验证结果:');
      const validation = analysis.selectorResults.validation;
      Object.entries(validation).forEach(([type, result]) => {
        const status = result.isValid ? '✅' : '❌';
        console.log(`    ${type}: ${status} (置信度: ${(result.confidence * 100).toFixed(1)}%)`);
      });
      
      console.log('\n  🏆 选择器可靠性排名:');
      const rankings = analysis.selectorResults.rankings;
      console.log('\n    帖子容器排名:');
      rankings.postContainers.forEach((item, index) => {
        console.log(`      ${index + 1}. ${item.selector} (可靠性: ${(item.reliability * 100).toFixed(1)}%)`);
      });
      
      console.log('\n    帖子链接排名:');
      rankings.postLinks.forEach((item, index) => {
        console.log(`      ${index + 1}. ${item.selector} (可靠性: ${(item.reliability * 100).toFixed(1)}%)`);
      });
      
      console.log(`\n  ⏰ 生成时间: ${new Date(analysis.selectorResults.generatedAt).toLocaleString()}`);
    }
    
    // 7. 增强版摘要
    console.log('\n📋 增强版摘要:');
    if (analysis.enhancedSummary) {
      console.log(`  - 总体评分: ${analysis.enhancedSummary.overallScore.toFixed(1)}/100 (${analysis.enhancedSummary.scoreGrade.toUpperCase()})`);
      console.log(`  - 分析置信度: ${analysis.enhancedSummary.analysisConfidence.toFixed(1)}% (${analysis.enhancedSummary.reliability.toUpperCase()})`);
      console.log(`  - 准备捕获: ${analysis.enhancedSummary.isReadyForCapture ? '✅' : '❌'}`);
      console.log(`  - 需要优化: ${analysis.enhancedSummary.needsOptimization ? '⚠️' : '✅'}`);
      console.log(`  - 推荐动作: ${analysis.enhancedSummary.recommendedAction}`);
      console.log(`  - 总体评估: ${analysis.enhancedSummary.overallAssessment.toUpperCase()}`);
      
      console.log('\n  关键指标:');
      const metrics = analysis.enhancedSummary.keyMetrics;
      console.log(`    - 总判断数: ${metrics.judgments}`);
      console.log(`    - 高严重度问题: ${metrics.highSeverityIssues}`);
      console.log(`    - 中严重度问题: ${metrics.mediumSeverityIssues}`);
      console.log(`    - 正面指示器: ${metrics.positiveIndicators}`);
    }
    
    // 8. 最终建议
    console.log('\n🎯 最终建议:');
    console.log(`  消息: ${analysis.finalRecommendation.message}`);
    console.log(`  优先级: ${analysis.finalRecommendation.priority}`);
    console.log(`  动作: ${analysis.finalRecommendation.action}`);
    if (analysis.finalRecommendation.suggestions) {
      console.log(`  优化建议: ${analysis.finalRecommendation.suggestions.join(', ')}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ 增强版分析完成');
    console.log('='.repeat(60));
    
    return analysis;
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  } finally {
    await browserManager.cleanup();
  }
}

// 运行测试
testEnhancedAnalysisOutput().catch(console.error);