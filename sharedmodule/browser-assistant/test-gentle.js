const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');

async function navigateAndAnalyze() {
  console.log('🌐 导航到微博并分析...');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true, // 使用已有cookie
    waitForLogin: true,
    targetDomain: 'weibo.com',
    defaultTimeout: 30000
  });
  
  try {
    // 使用自动登录初始化
    console.log('🔐 使用cookie自动登录微博...');
    await browserManager.initializeWithAutoLogin('https://weibo.com');
    const page = await browserManager.getCurrentPage();
    
    // 等待页面加载
    await page.waitForTimeout(10000);
    
    // 分析具体的帖子元素结构
    const postAnalysis = await page.evaluate(() => {
      // 查找主内容区域
      const mainContent = document.querySelector('.Main_wrap_2GRrG');
      if (!mainContent) {
        return { error: 'Main content area not found' };
      }
      
      // 查找所有可能的帖子容器
      const postCandidates = Array.from(mainContent.querySelectorAll('*')).filter(el => {
        const text = el.textContent.trim();
        return text.length > 10 && el.querySelector('a[href*="status"], a[href*="detail"]');
      });
      
      // 分析前几个候选元素
      const candidates = postCandidates.slice(0, 5).map((el, index) => {
        const links = Array.from(el.querySelectorAll('a[href*="status"], a[href*="detail"]'));
        return {
          index: index + 1,
          tagName: el.tagName,
          className: el.className,
          textLength: el.textContent.trim().length,
          hasStatusLink: links.length > 0,
          statusLinks: links.slice(0, 2).map(link => link.href),
          childrenCount: el.children.length
        };
      });
      
      // 查找具体的帖子类名模式
      const feedPatterns = {};
      ['feed', 'Feed', 'card', 'Card', 'post', 'Post'].forEach(pattern => {
        const elements = mainContent.querySelectorAll(`[class*="${pattern}"]`);
        if (elements.length > 0) {
          feedPatterns[pattern] = {
            count: elements.length,
            classNames: [...new Set(Array.from(elements).map(el => el.className))].slice(0, 3)
          };
        }
      });
      
      return {
        mainContentFound: true,
        totalPostCandidates: postCandidates.length,
        detailedCandidates: candidates,
        feedPatterns: feedPatterns
      };
    });
    
    console.log('🔍 帖子元素结构分析:');
    console.log('- 主内容区域找到:', postAnalysis.mainContentFound);
    console.log('- 候选帖子数量:', postAnalysis.totalPostCandidates);
    console.log('- Feed模式分布:', JSON.stringify(postAnalysis.feedPatterns, null, 2));
    console.log('- 详细候选元素:');
    postAnalysis.detailedCandidates.forEach(candidate => {
      console.log(`  ${candidate.index}. ${candidate.tagName} (${candidate.className})`);
      console.log(`     文本长度: ${candidate.textLength}, 链接: ${candidate.hasStatusLink ? '是' : '否'}`);
      if (candidate.statusLinks.length > 0) {
        console.log(`     状态链接: ${candidate.statusLinks[0]}`);
      }
    });
    
    return postAnalysis;
    
  } catch (error) {
    console.error('❌ 分析失败:', error.message);
    throw error;
  }
}

navigateAndAnalyze().catch(console.error);