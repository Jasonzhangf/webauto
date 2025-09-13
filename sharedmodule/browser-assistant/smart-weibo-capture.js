/**
 * 智能微博主页捕获工具 v2.0
 * 集成智能内容分析器，实现动态判断和自适应策略
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const WeiboContentAnalyzer = require('./WeiboContentAnalyzer');
const fs = require('fs');
const path = require('path');

class SmartWeiboHomepageCapture {
  constructor(options = {}) {
    // 继承原有的配置
    const antiCrawlerConfig = {
      headless: false,
      autoInjectCookies: true,
      waitForLogin: true,
      targetDomain: 'weibo.com',
      defaultTimeout: 15000,
      randomDelay: {
        min: 2000,
        max: 5000
      },
      maxConcurrentRequests: 1,
      pageLoadTimeout: 30000,
      randomUserAgent: true,
      ...options
    };
    
    this.browserManager = new CamoufoxManager(antiCrawlerConfig);
    this.contentAnalyzer = new WeiboContentAnalyzer();
    
    this.saveRootDir = options.saveRootDir || path.join(process.env.HOME, '.webauto');
    this.posts = [];
    this.lastRequestTime = 0;
    this.requestCount = 0;
    
    // 智能策略配置
    this.smartConfig = {
      // 重试策略
      maxRetries: 3,
      retryDelay: 5000,
      
      // 动态等待策略
      maxWaitTime: 30000,
      waitInterval: 2000,
      
      // 滚动策略
      maxScrollAttempts: 10,
      scrollWaitTime: 2000,
      
      // 内容验证
      minPostsThreshold: 3,
      minContentLength: 50,
      
      // 性能优化
      enableParallelAnalysis: true,
      cacheResults: true
    };
    
    // 继承原有的选择器
    this.selectors = {
      homepagePosts: [
        '.Home_feed_3o7ry .Scroll_container_280Ky > div',
        '.Scroll_container_280Ky > div',
        '.Home_feed_3o7ry > div',
        '[class*="Feed"]',
        '[class*="feed"]'
      ],
      profilePosts: [
        '.Home_feed_3o7ry .Scroll_container_280Ky > div',
        '.Scroll_container_280Ky > div',
        '[class*="Feed_body"]',
        '.WB_feed',
        '.WB_detail',
        '[class*="feed"]',
        '[class*="card"]'
      ],
      postLinks: [
        'a[href^="https://weibo.com/"][href*="/"][href*="com/"]:not([href*="/u/"]):not([href*="/n/"]):not([href*="s.weibo.com"])',
        'a[href*="weibo.com/"][href*="/"]:not([href*="/u/"]):not([href*="/n/"]):not([href*="s.weibo.com"])',
        'a[href*="/status/"]',
        'a[href*="/detail/"]',
        'a[href*="detail"]',
        '.Scroll_container_280Ky a[href*="status"]',
        '[class*="feed"] a[href*="status"]'
      ],
      userInfo: [
        '[class*="name"]',
        '.Feed_body_3R0rO [class*="name"]',
        'a[href*="/u/"]',
        '[class*="nick"]'
      ],
      postContent: [
        '.Feed_body_3R0rO',
        '[class*="Feed_body"]',
        '.WB_text',
        '[class*="text"]',
        '[class*="content"]'
      ],
      timeInfo: [
        '[class*="from"]',
        '[class*="time"]',
        'time',
        '.Feed_body_3R0rO [class*="from"]'
      ],
      interactionData: {
        likes: ['[class*="like"]', '[class*="赞"]'],
        comments: ['[class*="comment"]', '[class*="评论"]'],
        reposts: ['[class*="repost"]', '[class*="转发"]']
      }
    };
  }

  async initialize() {
    console.log('🚀 初始化智能微博主页捕获工具 v2.0...\n');
    await this.browserManager.initializeWithAutoLogin('https://weibo.com');
  }

  /**
   * 智能主页帖子捕获
   */
  async smartCaptureHomepagePosts(maxPosts = 50) {
    console.log('🏠 开始智能捕获微博主页帖子...\n');
    
    const page = await this.browserManager.getCurrentPage();
    let attempts = 0;
    let lastAnalysis = null;
    
    while (attempts < this.smartConfig.maxRetries) {
      attempts++;
      console.log(`🔄 第 ${attempts} 次尝试捕获...`);
      
      try {
        // 1. 智能分析页面状态
        const analysis = await this.contentAnalyzer.analyzePageState(page);
        lastAnalysis = analysis;
        
        console.log(`📊 页面状态: ${analysis.summary.isHealthy ? '✅ 健康' : '❌ 需要处理'}`);
        
        // 2. 根据分析结果执行智能策略
        const strategyResult = await this.executeSmartStrategy(page, analysis);
        
        if (strategyResult.shouldProceed) {
          // 3. 执行帖子捕获
          const posts = await this.extractPostsFromPage(page, 'homepage');
          
          // 4. 验证捕获结果
          if (this.validateCaptureResult(posts, maxPosts)) {
            this.posts = posts.slice(0, maxPosts);
            console.log(`✅ 智能捕获成功: ${this.posts.length} 条帖子\n`);
            return this.posts;
          } else {
            console.log('⚠️ 捕获结果验证失败，继续尝试...');
          }
        } else {
          console.log(`⚠️ 策略执行建议停止: ${strategyResult.reason}`);
        }
        
      } catch (error) {
        console.warn(`⚠️ 第 ${attempts} 次尝试失败:`, error.message);
      }
      
      // 5. 重试延迟
      if (attempts < this.smartConfig.maxRetries) {
        console.log(`⏳ 等待 ${this.smartConfig.retryDelay / 1000} 秒后重试...`);
        await page.waitForTimeout(this.smartConfig.retryDelay);
      }
    }
    
    // 6. 最终 fallback
    console.log('🚨 智能捕获失败，使用传统方法...');
    return await this.fallbackCapture(page, maxPosts);
  }

  /**
   * 执行智能策略
   */
  async executeSmartStrategy(page, analysis) {
    const recommendation = analysis.finalRecommendation;
    
    console.log(`🎯 执行智能策略: ${recommendation.message}`);
    
    switch (recommendation.action) {
      case 'wait':
        console.log(`⏳ 智能等待 ${recommendation.waitTime || this.smartConfig.waitInterval}ms...`);
        await page.waitForTimeout(recommendation.waitTime || this.smartConfig.waitInterval);
        return { shouldProceed: true };
        
      case 'scroll':
        console.log(`📜 智能滚动 ${recommendation.scrollCount || this.smartConfig.maxScrollAttempts} 次...`);
        await this.smartScroll(page, recommendation.scrollCount || this.smartConfig.maxScrollAttempts);
        return { shouldProceed: true };
        
      case 'scroll_for_more_content':
        console.log('📜 智能滚动加载更多内容...');
        await this.smartScroll(page, this.smartConfig.maxScrollAttempts);
        return { shouldProceed: true };
        
      case 'proceed':
        console.log('✅ 页面状态良好，直接进行捕获');
        return { shouldProceed: true };
        
      case 'caution':
        console.log('⚠️ 谨慎继续，存在轻微问题');
        return { shouldProceed: true };
        
      case 'stop_and_diagnose':
        console.log('🚨 检测到严重问题，停止捕获');
        return { shouldProceed: false, reason: '严重页面问题' };
        
      case 'wait_and_retry':
        console.log('⏳ 等待并重试...');
        await page.waitForTimeout(this.smartConfig.retryDelay);
        return { shouldProceed: true };
        
      default:
        console.log('❓ 未知策略，继续尝试');
        return { shouldProceed: true };
    }
  }

  /**
   * 智能滚动策略
   */
  async smartScroll(page, scrollCount) {
    console.log('📜 执行智能滚动策略...');
    
    for (let i = 0; i < scrollCount; i++) {
      // 滚动前分析
      const beforeScroll = await this.getQuickPageInfo(page);
      
      // 执行滚动
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      console.log(`   滚动第 ${i + 1}/${scrollCount} 次...`);
      
      // 等待内容加载
      await page.waitForTimeout(this.smartConfig.scrollWaitTime);
      
      // 滚动后分析
      const afterScroll = await this.getQuickPageInfo(page);
      
      // 检查是否有新内容
      const hasNewContent = afterScroll.totalLinks > beforeScroll.totalLinks ||
                          afterScroll.scrollHeight > beforeScroll.scrollHeight;
      
      if (!hasNewContent && i > 2) {
        console.log('   📭 连续滚动无新内容，停止滚动');
        break;
      }
      
      if (hasNewContent) {
        console.log(`   📊 新增链接: ${afterScroll.totalLinks - beforeScroll.totalLinks}`);
      }
    }
  }

  /**
   * 快速页面信息获取
   */
  async getQuickPageInfo(page) {
    return await page.evaluate(() => ({
      scrollHeight: document.body.scrollHeight,
      scrollTop: window.scrollY,
      totalLinks: document.querySelectorAll('a[href]').length,
      postLinks: document.querySelectorAll('a[href*="/status/"], a[href*="/detail/"], a[href^="https://weibo.com/"][href*="/"]:not([href*="/u/"])').length
    }));
  }

  /**
   * 验证捕获结果
   */
  validateCaptureResult(posts, maxPosts) {
    if (posts.length === 0) {
      console.log('❌ 未捕获到任何帖子');
      return false;
    }
    
    if (posts.length < this.smartConfig.minPostsThreshold) {
      console.log(`⚠️ 捕获帖子数量不足: ${posts.length} < ${this.smartConfig.minPostsThreshold}`);
      return false;
    }
    
    const validPosts = posts.filter(post => 
      post.content && post.content.length >= this.smartConfig.minContentLength
    );
    
    if (validPosts.length < posts.length * 0.5) {
      console.log(`⚠️ 有效帖子比例过低: ${validPosts.length}/${posts.length}`);
      return false;
    }
    
    console.log(`✅ 验证通过: ${posts.length} 条帖子 (${validPosts.length} 条有效)`);
    return true;
  }

  /**
   * Fallback 捕获方法
   */
  async fallbackCapture(page, maxPosts) {
    console.log('🔄 执行 fallback 捕获策略...');
    
    // 导航到主页
    await this.browserManager.navigate('https://weibo.com');
    await page.waitForTimeout(3000);
    
    // 传统滚动
    console.log('📜 传统滚动加载...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);
    }
    
    // 提取帖子
    const posts = await this.extractPostsFromPage(page, 'homepage');
    this.posts = posts.slice(0, maxPosts);
    
    console.log(`📊 Fallback 捕获结果: ${this.posts.length} 条帖子\n`);
    return this.posts;
  }

  /**
   * 保持原有的帖子提取逻辑
   */
  async extractPostsFromPage(page, pageType) {
    console.log(`🔍 提取${pageType === 'homepage' ? '主页' : '用户主页'}帖子...`);
    
    return await page.evaluate(({ selectors, pageType }) => {
      const posts = [];
      
      const postContainers = document.querySelectorAll(
        (pageType === 'homepage' ? selectors.homepagePosts : selectors.profilePosts).join(', ')
      );
      
      console.log(`[DEBUG] 找到 ${postContainers.length} 个帖子容器`);
      
      postContainers.forEach((container, index) => {
        try {
          const linkElement = container.querySelector(selectors.postLinks.join(', '));
          const postLink = linkElement ? linkElement.getAttribute('href') : null;
          
          if (!postLink) {
            console.log(`[DEBUG] 帖子 ${index + 1}: 未找到链接`);
            return;
          }
          
          const fullUrl = postLink.startsWith('http') ? postLink :
                         postLink.startsWith('//') ? `https:${postLink}` :
                         `https://weibo.com${postLink}`;
          
          const userElement = container.querySelector(selectors.userInfo.join(', '));
          const username = userElement ? userElement.textContent.trim() : '未知用户';
          
          const contentElement = container.querySelector(selectors.postContent.join(', '));
          const content = contentElement ? contentElement.textContent.trim() : '';
          
          const timeElement = container.querySelector(selectors.timeInfo.join(', '));
          const timeInfo = timeElement ? timeElement.textContent.trim() : '';
          
          const interactions = {};
          Object.entries(selectors.interactionData).forEach(([key, sel]) => {
            const element = container.querySelector(sel.join(', '));
            if (element) {
              const text = element.textContent.trim();
              const match = text.match(/\d+/);
              interactions[key] = match ? match[0] : '0';
            }
          });
          
          const newFormatMatch = postLink.match(/weibo\.com\/\d+\/([A-Za-z0-9]+)/);
          const oldFormatMatch = postLink.match(/\/status\/(\d+)/) || postLink.match(/\/detail\/(\d+)/);
          const postIdMatch = newFormatMatch || oldFormatMatch;
          const postId = postIdMatch ? postIdMatch[1] : postLink;
          
          posts.push({
            id: postId,
            url: fullUrl,
            username: username,
            content: content,
            timeInfo: timeInfo,
            interactions: interactions,
            containerClass: container.className,
            pageType: pageType,
            extractedAt: new Date().toISOString()
          });
          
          console.log(`[DEBUG] 帖子 ${index + 1}: ${username} - ${content.substring(0, 50)}...`);
          
        } catch (error) {
          console.warn(`[DEBUG] 处理帖子 ${index + 1} 时出错:`, error.message);
        }
      });
      
      return posts;
    }, { selectors: this.selectors, pageType });
  }

  /**
   * 保持原有的保存功能
   */
  createSaveDirectory(type, identifier = '') {
    const today = new Date().toISOString().split('T')[0];
    const safeIdentifier = identifier.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const dirName = type === 'homepage' ? 'homepage' : `profile_${safeIdentifier}`;
    const saveDir = path.join(this.saveRootDir, today, dirName);
    
    if (!fs.existsSync(this.saveRootDir)) {
      fs.mkdirSync(this.saveRootDir, { recursive: true });
    }
    
    if (!fs.existsSync(path.join(this.saveRootDir, today))) {
      fs.mkdirSync(path.join(this.saveRootDir, today), { recursive: true });
    }
    
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    
    return saveDir;
  }

  async savePosts(type, identifier = '') {
    console.log(`💾 保存帖子到本地文件...\n`);
    
    if (this.posts.length === 0) {
      console.log('⚠️ 没有帖子需要保存');
      return;
    }
    
    const saveDir = this.createSaveDirectory(type, identifier);
    const savedFiles = [];
    
    for (let i = 0; i < this.posts.length; i++) {
      const post = this.posts[i];
      const filename = `post_${i + 1}_${post.id}.md`;
      const filepath = path.join(saveDir, filename);
      
      const markdown = this.generatePostMarkdown(post, type, i + 1);
      fs.writeFileSync(filepath, markdown, 'utf8');
      savedFiles.push(filepath);
      
      console.log(`   ✅ 保存帖子 ${i + 1}/${this.posts.length}: ${filename}`);
    }
    
    const summaryFile = path.join(saveDir, 'smart_capture_summary.md');
    const summary = this.generateSmartSummary(type, identifier, this.posts, saveDir);
    fs.writeFileSync(summaryFile, summary, 'utf8');
    
    const dataFile = path.join(saveDir, 'posts_data.json');
    fs.writeFileSync(dataFile, JSON.stringify(this.posts, null, 2), 'utf8');
    
    console.log(`\n📁 所有文件已保存到: ${saveDir}`);
    console.log(`📊 总计保存 ${this.posts.length} 条帖子 (智能捕获)\n`);
    
    return { saveDir, savedFiles, summaryFile, dataFile };
  }

  generatePostMarkdown(post, type, index) {
    const interactionsText = Object.entries(post.interactions)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ');
    
    return `# 智能捕获 - ${type === 'homepage' ? '主页' : '用户主页'}帖子 ${index}

**用户:** ${post.username}
**帖子ID:** ${post.id}
**页面类型:** ${post.pageType}
**时间信息:** ${post.timeInfo}

---

## 内容

${post.content}

## 互动数据

${interactionsText || '无互动数据'}

## 链接信息

- **原文链接:** [查看原文](${post.url})

## 元信息

- **提取时间:** ${new Date(post.extractedAt).toLocaleString('zh-CN')}
- **容器类名:** ${post.containerClass}
- **数据源:** 微博${type === 'homepage' ? '主页' : '用户主页'}
- **捕获方式:** 智能分析 v2.0

---

*此文件由智能微博捕获工具 v2.0 自动生成*`;
  }

  generateSmartSummary(type, identifier, posts, saveDir) {
    const totalInteractions = posts.reduce((acc, post) => {
      Object.entries(post.interactions).forEach(([key, value]) => {
        acc[key] = (acc[key] || 0) + parseInt(value) || 0;
      });
      return acc;
    }, {});
    
    const users = [...new Set(posts.map(post => post.username))];
    const avgContentLength = Math.round(posts.reduce((sum, post) => sum + post.content.length, 0) / posts.length);
    
    return `# 智能微博${type === 'homepage' ? '主页' : '用户主页'}捕获汇总 v2.0

## 智能捕获信息

- **页面类型:** ${type === 'homepage' ? '微博主页' : `用户主页 (${identifier})`}
- **捕获时间:** ${new Date().toLocaleString('zh-CN')}
- **捕获模式:** 智能分析 + 自适应策略
- **捕获帖子数量:** ${posts.length}
- **保存目录:** ${saveDir}

## 智能策略统计

### 用户统计
- **唯一用户数量:** ${users.length}
- **主要用户:** ${users.slice(0, 10).join(', ')}${users.length > 10 ? '...' : ''}

### 内容统计
- **平均内容长度:** ${avgContentLength} 字符
- **最长内容:** ${Math.max(...posts.map(p => p.content.length))} 字符
- **最短内容:** ${Math.min(...posts.map(p => p.content.length))} 字符

### 互动统计
${Object.entries(totalInteractions).map(([key, value]) => `- **${key}:** ${value}`).join('\\n') || '- 无互动数据'}

### 捕获质量评估
- **链接格式:** 新格式 (${posts.filter(p => p.url.match(/weibo\.com\/\d+\/[A-Za-z0-9]+/)).length} 个) / 传统格式 (${posts.filter(p => p.url.includes('/status/') || p.url.includes('/detail/')).length} 个)
- **页面类型分布:** ${posts.reduce((acc, post) => { acc[post.pageType] = (acc[post.pageType] || 0) + 1; return acc; }, {})}
- **容器多样性:** ${[...new Set(posts.map(p => p.containerClass))].length} 种不同容器类

## 文件列表

${posts.map((post, i) => 
  `- [帖子 ${i + 1}: ${post.username}](post_${i + 1}_${post.id}.md)`
).join('\\n')}

## 技术特性

- ✅ **智能页面状态分析**: 实时检测页面加载和内容状态
- ✅ **自适应捕获策略**: 根据页面状态动态调整捕获方法
- ✅ **多格式链接支持**: 兼容新旧微博链接格式
- ✅ **错误自动恢复**: 智能重试和 fallback 机制
- ✅ **内容质量验证**: 确保捕获内容的完整性和有效性

---

*此汇总文件由智能微博捕获工具 v2.0 自动生成*`;
  }

  async cleanup() {
    console.log('🧹 清理资源...');
    await this.browserManager.cleanup();
    console.log('✅ 清理完成');
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('智能微博主页捕获工具 v2.0');
    console.log('使用方法:');
    console.log('  智能捕获主页: node smart-weibo-capture.js homepage [最大帖子数]');
    console.log('  智能捕获用户主页: node smart-weibo-capture.js profile <用户ID或用户名> [最大帖子数]');
    console.log('');
    console.log('新增智能功能:');
    console.log('  🧠 智能页面状态分析');
    console.log('  🔄 自适应重试机制');
    console.log('  📊 实时内容质量验证');
    console.log('  🎯 动态策略调整');
    console.log('');
    console.log('示例:');
    console.log('  node smart-weibo-capture.js homepage 30');
    console.log('  node smart-weibo-capture.js profile 1234567890 20');
    process.exit(1);
  }
  
  const type = args[0];
  const identifier = args[1] || '';
  const maxPosts = parseInt(args[2]) || 50;
  
  console.log('🔥 智能微博主页捕获工具 v2.0 启动');
  console.log(`类型: ${type === 'homepage' ? '主页' : `用户主页 (${identifier})`}`);
  console.log(`目标数量: ${maxPosts} 条帖子`);
  console.log(`智能模式: 启用`);
  console.log(`保存目录: ~/.webauto\\n`);
  
  const captureTool = new SmartWeiboHomepageCapture();
  
  try {
    await captureTool.initialize();
    
    if (type === 'homepage') {
      await captureTool.smartCaptureHomepagePosts(maxPosts);
    } else if (type === 'profile') {
      // 用户主页捕获逻辑 (可以后续扩展)
      console.log('⚠️ 用户主页智能捕获功能开发中...');
    } else {
      throw new Error('无效的类型，请使用 homepage 或 profile');
    }
    
    const result = await captureTool.savePosts(type, identifier);
    
    console.log('🎉 智能捕获任务完成！');
    if (result && result.saveDir) {
      console.log(`📁 结果保存在: ${result.saveDir}`);
    }
    
  } catch (error) {
    console.error('❌ 执行失败:', error);
  } finally {
    await captureTool.cleanup();
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = SmartWeiboHomepageCapture;