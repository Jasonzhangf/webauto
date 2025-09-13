/**
 * 微博主页帖子链接捕获工具
 * 使用硬编码选择器捕获微博主页和用户主页的帖子链接
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const fs = require('fs');
const path = require('path');

class WeiboHomepageCapture {
  constructor(options = {}) {
    // 反爬虫保护配置
    const antiCrawlerConfig = {
      headless: false,
      autoInjectCookies: true,
      waitForLogin: true,
      targetDomain: 'weibo.com',
      defaultTimeout: 15000,
      // 增加随机延迟
      randomDelay: {
        min: 2000,
        max: 5000
      },
      // 限制并发请求
      maxConcurrentRequests: 1,
      // 增加页面加载时间
      pageLoadTimeout: 30000,
      // 随机User-Agent
      randomUserAgent: true,
      ...options
    };
    
    this.browserManager = new CamoufoxManager(antiCrawlerConfig);
    
    this.saveRootDir = options.saveRootDir || path.join(process.env.HOME, '.webauto');
    this.posts = [];
    this.lastRequestTime = 0;
    this.requestCount = 0;
    
    // 硬编码的选择器配置
    this.selectors = {
      // 主页帖子容器
      homepagePosts: [
        '.Home_feed_3o7ry .Scroll_container_280Ky > div',
        '.Scroll_container_280Ky > div',
        '.Home_feed_3o7ry > div',
        '[class*="Feed"]',
        '[class*="feed"]'
      ],
      
      // 用户主页帖子容器  
      profilePosts: [
        '.Home_feed_3o7ry .Scroll_container_280Ky > div',
        '.Scroll_container_280Ky > div',
        '[class*="Feed_body"]',
        '.WB_feed',
        '.WB_detail',
        '[class*="feed"]',
        '[class*="card"]'
      ],
      
      // 帖子链接 - 支持新旧格式
      postLinks: [
        // 新格式: https://weibo.com/{userId}/{postId}
        'a[href^="https://weibo.com/"][href*="/"][href*="com/"]:not([href*="/u/"]):not([href*="/n/"]):not([href*="s.weibo.com"])',
        'a[href*="weibo.com/"][href*="/"]:not([href*="/u/"]):not([href*="/n/"]):not([href*="s.weibo.com"])',
        // 旧格式兼容
        'a[href*="/status/"]',
        'a[href*="/detail/"]',
        'a[href*="detail"]',
        '.Scroll_container_280Ky a[href*="status"]',
        '[class*="feed"] a[href*="status"]'
      ],
      
      // 用户信息
      userInfo: [
        '[class*="name"]',
        '.Feed_body_3R0rO [class*="name"]',
        'a[href*="/u/"]',
        '[class*="nick"]'
      ],
      
      // 帖子内容
      postContent: [
        '.Feed_body_3R0rO',
        '[class*="Feed_body"]',
        '.WB_text',
        '[class*="text"]',
        '[class*="content"]'
      ],
      
      // 时间信息
      timeInfo: [
        '[class*="from"]',
        '[class*="time"]',
        'time',
        '.Feed_body_3R0rO [class*="from"]'
      ],
      
      // 互动数据
      interactionData: {
        likes: ['[class*="like"]', '[class*="赞"]'],
        comments: ['[class*="comment"]', '[class*="评论"]'],
        reposts: ['[class*="repost"]', '[class*="转发"]']
      }
    };
  }

  async initialize() {
    console.log('🚀 初始化微博主页捕获工具...\n');
    await this.browserManager.initializeWithAutoLogin('https://weibo.com');
  }

  async captureHomepagePosts(maxPosts = 50) {
    console.log('🏠 开始捕获微博主页帖子...\n');
    
    const page = await this.browserManager.getCurrentPage();
    
    // 导航到主页
    await this.browserManager.navigate('https://weibo.com');
    await page.waitForTimeout(3000);
    
    // 滚动加载更多帖子
    console.log('📜 滚动加载帖子...');
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);
    }
    
    // 提取帖子链接
    const posts = await this.extractPostsFromPage(page, 'homepage');
    
    // 限制数量
    this.posts = posts.slice(0, maxPosts);
    
    console.log(`✅ 成功捕获 ${this.posts.length} 条主页帖子\n`);
    return this.posts;
  }

  async captureProfilePosts(username, maxPosts = 50) {
    console.log(`👤 开始捕获用户主页帖子: ${username}\n`);
    
    const page = await this.browserManager.getCurrentPage();
    
    // 构建用户主页URL
    const profileUrl = `https://weibo.com/u/${username}`;
    console.log(`   🔍 访问用户主页: ${profileUrl}`);
    
    await this.browserManager.navigate(profileUrl);
    await page.waitForTimeout(3000);
    
    // 检查是否成功访问
    const currentUrl = page.url();
    if (!currentUrl.includes(username) && !currentUrl.includes('/u/')) {
      throw new Error(`无法访问用户主页: ${username}`);
    }
    
    // 滚动加载更多帖子
    console.log('📜 滚动加载帖子...');
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);
    }
    
    // 提取帖子链接
    const posts = await this.extractPostsFromPage(page, 'profile');
    
    // 限制数量
    this.posts = posts.slice(0, maxPosts);
    
    console.log(`✅ 成功捕获 ${this.posts.length} 条用户主页帖子\n`);
    return this.posts;
  }

  async extractPostsFromPage(page, pageType) {
    console.log(`🔍 提取${pageType === 'homepage' ? '主页' : '用户主页'}帖子...`);
    
    return await page.evaluate(({ selectors, pageType }) => {
      const posts = [];
      
      // 选择帖子容器
      const postContainers = document.querySelectorAll(
        (pageType === 'homepage' ? selectors.homepagePosts : selectors.profilePosts).join(', ')
      );
      
      console.log(`[DEBUG] 找到 ${postContainers.length} 个帖子容器`);
      
      postContainers.forEach((container, index) => {
        try {
          // 提取帖子链接
          const linkElement = container.querySelector(selectors.postLinks.join(', '));
          const postLink = linkElement ? linkElement.getAttribute('href') : null;
          
          if (!postLink) {
            console.log(`[DEBUG] 帖子 ${index + 1}: 未找到链接`);
            return;
          }
          
          // 构建完整URL
          const fullUrl = postLink.startsWith('http') ? postLink :
                         postLink.startsWith('//') ? `https:${postLink}` :
                         `https://weibo.com${postLink}`;
          
          // 提取用户信息
          const userElement = container.querySelector(selectors.userInfo.join(', '));
          const username = userElement ? userElement.textContent.trim() : '未知用户';
          
          // 提取内容
          const contentElement = container.querySelector(selectors.postContent.join(', '));
          const content = contentElement ? contentElement.textContent.trim() : '';
          
          // 提取时间信息
          const timeElement = container.querySelector(selectors.timeInfo.join(', '));
          const timeInfo = timeElement ? timeElement.textContent.trim() : '';
          
          // 提取互动数据
          const interactions = {};
          Object.entries(selectors.interactionData).forEach(([key, sel]) => {
            const element = container.querySelector(sel.join(', '));
            if (element) {
              const text = element.textContent.trim();
              const match = text.match(/\d+/);
              interactions[key] = match ? match[0] : '0';
            }
          });
          
          // 提取帖子ID - 支持新旧格式
          // 新格式: https://weibo.com/{userId}/{postId}
          // 旧格式: /status/{postId} 或 /detail/{postId}
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

  createSaveDirectory(type, identifier = '') {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const safeIdentifier = identifier.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const dirName = type === 'homepage' ? 'homepage' : `profile_${safeIdentifier}`;
    const saveDir = path.join(this.saveRootDir, today, dirName);
    
    // 确保目录存在
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
      console.log('⚠️  没有帖子需要保存');
      return;
    }
    
    const saveDir = this.createSaveDirectory(type, identifier);
    const savedFiles = [];
    
    // 保存每个帖子
    for (let i = 0; i < this.posts.length; i++) {
      const post = this.posts[i];
      const filename = `post_${i + 1}_${post.id}.md`;
      const filepath = path.join(saveDir, filename);
      
      const markdown = this.generatePostMarkdown(post, type, i + 1);
      fs.writeFileSync(filepath, markdown, 'utf8');
      savedFiles.push(filepath);
      
      console.log(`   ✅ 保存帖子 ${i + 1}/${this.posts.length}: ${filename}`);
    }
    
    // 保存汇总信息
    const summaryFile = path.join(saveDir, 'posts_summary.md');
    const summary = this.generateSummaryMarkdown(type, identifier, this.posts, saveDir);
    fs.writeFileSync(summaryFile, summary, 'utf8');
    
    // 保存原始数据
    const dataFile = path.join(saveDir, 'posts_data.json');
    fs.writeFileSync(dataFile, JSON.stringify(this.posts, null, 2), 'utf8');
    
    console.log(`\n📁 所有文件已保存到: ${saveDir}`);
    console.log(`📊 总计保存 ${this.posts.length} 条帖子\n`);
    
    return { saveDir, savedFiles, summaryFile, dataFile };
  }

  generatePostMarkdown(post, type, index) {
    const interactionsText = Object.entries(post.interactions)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ');
    
    return `# ${type === 'homepage' ? '主页' : '用户主页'}帖子 ${index}

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
- **提取方法:** 硬编码选择器

---

*此文件由微博主页捕获工具自动生成*`;
  }

  generateSummaryMarkdown(type, identifier, posts, saveDir) {
    const totalInteractions = posts.reduce((acc, post) => {
      Object.entries(post.interactions).forEach(([key, value]) => {
        acc[key] = (acc[key] || 0) + parseInt(value) || 0;
      });
      return acc;
    }, {});
    
    const users = [...new Set(posts.map(post => post.username))];
    const avgContentLength = Math.round(posts.reduce((sum, post) => sum + post.content.length, 0) / posts.length);
    
    return `# 微博${type === 'homepage' ? '主页' : '用户主页'}帖子汇总

## 捕获信息

- **页面类型:** ${type === 'homepage' ? '微博主页' : `用户主页 (${identifier})`}
- **捕获时间:** ${new Date().toLocaleString('zh-CN')}
- **捕获帖子数量:** ${posts.length}
- **保存目录:** ${saveDir}

## 数据统计

### 用户统计
- **唯一用户数量:** ${users.length}
- **主要用户:** ${users.slice(0, 10).join(', ')}${users.length > 10 ? '...' : ''}

### 内容统计
- **平均内容长度:** ${avgContentLength} 字符
- **最长内容:** ${Math.max(...posts.map(p => p.content.length))} 字符
- **最短内容:** ${Math.min(...posts.map(p => p.content.length))} 字符

### 互动统计
${Object.entries(totalInteractions).map(([key, value]) => `- **${key}:** ${value}`).join('\n') || '- 无互动数据'}

### 页面类型分布
${posts.reduce((acc, post) => {
  acc[post.pageType] = (acc[post.pageType] || 0) + 1;
  return acc;
}, {})}
${Object.entries(posts.reduce((acc, post) => {
  acc[post.pageType] = (acc[post.pageType] || 0) + 1;
  return acc;
}, {})).map(([type, count]) => `- **${type}:** ${count} 个帖子`).join('\n')}

## 文件列表

${posts.map((post, i) => 
  `- [帖子 ${i + 1}: ${post.username}](post_${i + 1}_${post.id}.md)`
).join('\n')}

## 容器类名统计

${posts.reduce((acc, post) => {
  const className = post.containerClass || 'unknown';
  acc[className] = (acc[className] || 0) + 1;
  return acc;
}, {})}
${Object.entries(posts.reduce((acc, post) => {
  const className = post.containerClass || 'unknown';
  acc[className] = (acc[className] || 0) + 1;
  return acc;
}, {})).map(([className, count]) => 
  `- \`${className}\`: ${count} 个帖子`
).join('\n')}

---

*此汇总文件由微博主页捕获工具自动生成*`;
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
    console.log('使用方法:');
    console.log('  捕获主页帖子: node weibo-homepage-capture.js homepage [最大帖子数]');
    console.log('  捕获用户主页: node weibo-homepage-capture.js profile <用户ID或用户名> [最大帖子数]');
    console.log('');
    console.log('示例:');
    console.log('  node weibo-homepage-capture.js homepage 30');
    console.log('  node weibo-homepage-capture.js profile 1234567890 20');
    console.log('  node weibo-homepage-capture.js profile "用户名" 25');
    process.exit(1);
  }
  
  const type = args[0];
  const identifier = args[1] || '';
  const maxPosts = parseInt(args[2]) || 50;
  
  console.log('🔥 微博主页捕获工具启动');
  console.log(`类型: ${type === 'homepage' ? '主页' : `用户主页 (${identifier})`}`);
  console.log(`目标数量: ${maxPosts} 条帖子`);
  console.log(`保存目录: ~/.webauto\n`);
  
  const captureTool = new WeiboHomepageCapture();
  
  try {
    // 初始化
    await captureTool.initialize();
    
    // 捕获帖子
    if (type === 'homepage') {
      await captureTool.captureHomepagePosts(maxPosts);
    } else if (type === 'profile') {
      await captureTool.captureProfilePosts(identifier, maxPosts);
    } else {
      throw new Error('无效的类型，请使用 homepage 或 profile');
    }
    
    // 保存结果
    const result = await captureTool.savePosts(type, identifier);
    
    console.log('🎉 捕获任务完成！');
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

module.exports = WeiboHomepageCapture;