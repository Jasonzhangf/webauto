/**
 * 微博搜索和帖子捕获工具
 * 搜索指定关键字并捕获50条帖子保存到本地文件
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const fs = require('fs');
const path = require('path');

class WeiboSearchCapture {
  constructor(options = {}) {
    this.browserManager = new CamoufoxManager({
      headless: false,
      autoInjectCookies: true,
      waitForLogin: true,
      targetDomain: 'weibo.com',
      defaultTimeout: 15000,
      ...options
    });
    
    this.saveRootDir = options.saveRootDir || path.join(process.env.HOME, '.webauto');
    this.posts = [];
  }

  async initialize() {
    console.log('🚀 初始化微博搜索捕获工具...\n');
    await this.browserManager.initializeWithAutoLogin('https://weibo.com');
  }

  async searchKeyword(keyword) {
    console.log(`🔍 开始搜索关键字: "${keyword}"\n`);
    
    const page = await this.browserManager.getCurrentPage();
    
    // 使用正确的微博搜索URL
    const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`;
    console.log(`   🔍 使用正确的搜索URL: ${searchUrl}`);
    
    await this.browserManager.navigate(searchUrl);
    await page.waitForTimeout(5000);
    
    // 检查是否成功跳转到搜索结果页
    const currentUrl = page.url();
    console.log(`   📍 当前页面: ${currentUrl}`);
    
    // 验证是否在搜索结果页面
    if (!currentUrl.includes('search') && !currentUrl.includes('q=')) {
      console.log('   ⚠️  搜索页面跳转失败，尝试备用方案...');
      
      // 备用方案：导航到首页后搜索
      await this.browserManager.navigate('https://weibo.com');
      await page.waitForTimeout(3000);
      
      // 查找搜索框
      const searchInputs = await page.$$('input[placeholder*="搜索"], input[type="search"], input[name*="search"]');
      
      if (searchInputs.length > 0) {
        const searchInput = searchInputs[0];
        await searchInput.fill(keyword);
        console.log(`   ✅ 已在搜索框输入: "${keyword}"`);
        
        // 使用回车键搜索
        await searchInput.press('Enter');
        await page.waitForTimeout(5000);
      }
    }
    
    // 最终检查搜索页面
    const finalUrl = page.url();
    console.log(`   📍 最终页面: ${finalUrl}`);
    
    // 如果还没有搜索结果，尝试其他搜索URL
    if (!finalUrl.includes('s.weibo.com') && !finalUrl.includes('weibo')) {
      console.log('   🔄 尝试备用搜索URL...');
      const backupSearchUrl = `https://m.weibo.cn/search?q=${encodeURIComponent(keyword)}`;
      await this.browserManager.navigate(backupSearchUrl);
      await page.waitForTimeout(5000);
    }
    
    console.log('   ✅ 搜索页面加载完成\n');
    return true;
  }

  async capturePosts(count = 50) {
    console.log(`📝 开始捕获帖子，目标数量: ${count}\n`);
    
    const page = await this.browserManager.getCurrentPage();
    let capturedPosts = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;
    
    while (capturedPosts < count && scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;
      
      // 提取当前页面的帖子
      const newPosts = await this.extractPostsFromPage();
      
      // 过滤重复帖子
      const uniquePosts = newPosts.filter(post => 
        !this.posts.some(existingPost => existingPost.id === post.id)
      );
      
      this.posts.push(...uniquePosts);
      capturedPosts = this.posts.length;
      
      console.log(`   📊 滚动 ${scrollAttempts}: 新增 ${uniquePosts.length} 条帖子，总计 ${capturedPosts} 条`);
      
      if (capturedPosts >= count) {
        break;
      }
      
      // 滚动页面加载更多内容
      console.log('   📜 滚动页面加载更多内容...');
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      await page.waitForTimeout(3000);
    }
    
    // 截取指定数量的帖子
    this.posts = this.posts.slice(0, count);
    console.log(`\n✅ 成功捕获 ${this.posts.length} 条帖子\n`);
    
    return this.posts;
  }

  async extractPostsFromPage() {
    const page = await this.browserManager.getCurrentPage();
    const currentUrl = page.url();
    console.log(`[DEBUG] extractPostsFromPage called, current URL: ${currentUrl}`);
    
    return await page.evaluate(() => {
      const posts = [];
      
      // 首先检查是否在搜索结果页面
      const isSearchPage = window.location.href.includes('s.weibo.com') || 
                          window.location.href.includes('search') || 
                          window.location.href.includes('q=');
      
      console.log(`[DEBUG] Page evaluation - isSearchPage: ${isSearchPage}, URL: ${window.location.href}`);
      
      if (!isSearchPage) {
        console.log('[DEBUG] Not on search page, returning empty posts');
        return posts; // 不在搜索页面，不提取内容
      }
      
      // 基于调试结果优化的搜索结果选择器
      const postElements = document.querySelectorAll([
        // s.weibo.com 搜索结果页面的帖子容器
        '.wbs-feed',
        '.card-wrap',
        '.card-feed',
        '.card'
      ].join(', '));
      
      console.log(`[DEBUG] 找到 ${postElements.length} 个候选元素`);
      
      postElements.forEach((element, index) => {
        try {
          // 添加调试信息
          const elementClass = element.className || 'no-class';
          const elementText = element.textContent.trim().substring(0, 50);
          console.log(`[DEBUG] 处理元素 ${index + 1}/${postElements.length}: class="${elementClass}", text="${elementText}..."`);
          // 跳过明显不是帖子的元素
          const textContent = element.textContent.trim();
          if (textContent.length < 15) {
            return;
          }
          
          // 跳过导航栏、按钮等非内容元素
          if (textContent.includes('首页') || 
              textContent.includes('发现') || 
              textContent.includes('消息') || 
              textContent.includes('我') ||
              textContent.includes('搜索') ||
              textContent.includes('登录') ||
              textContent.includes('注册')) {
            return;
          }
          
          // 提取帖子ID
          const postId = element.getAttribute('data-id') || 
                        element.getAttribute('mid') || 
                        element.getAttribute('data-feedid') ||
                        `post_${Date.now()}_${index}`;
          
          // 基于调试结果优化的用户信息提取
          let username = '未知用户';
          const userSelectors = [
            '.card-wrap a[class*="name"]',
            '.wbs-feed a[class*="name"]',
            '.card-feed a[class*="name"]',
            'a[href*="u/"]',
            '[class*="name"]'
          ];
          
          for (const selector of userSelectors) {
            const userElement = element.querySelector(selector);
            if (userElement && userElement.textContent.trim()) {
              username = userElement.textContent.trim();
              break;
            }
          }
          
          // 基于调试结果优化的内容提取
          let content = '';
          const contentSelectors = [
            'p',  // 优先使用p标签，调试显示p标签包含实际内容
            '.card-wrap .content',
            '.wbs-feed .content',
            '.card-feed .content',
            '[class*="content"]',
            '[class*="text"]'
          ];
          
          for (const selector of contentSelectors) {
            const contentElement = element.querySelector(selector);
            if (contentElement && contentElement.textContent.trim()) {
              content = contentElement.textContent.trim();
              break;
            }
          }
          
          // 如果没有找到内容，尝试获取元素的文本内容
          if (!content) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = element.innerHTML;
            
            // 移除不需要的元素
            const unwantedElements = tempDiv.querySelectorAll('script, style, [class*="action"], [class*="toolbar"], [class*="interaction"], button, a[class*="more"]');
            unwantedElements.forEach(el => el.remove());
            
            content = tempDiv.textContent.trim();
          }
          
          // 更精确的时间提取
          let time = '';
          const timeSelectors = [
            '.card-wrap [class*="time"]',
            '.wbs-feed [class*="time"]',
            'time',
            '[class*="from"]',
            '[class*="date"]',
            'span[title]'
          ];
          
          for (const selector of timeSelectors) {
            const timeElement = element.querySelector(selector);
            if (timeElement) {
              time = timeElement.getAttribute('title') || timeElement.getAttribute('datetime') || timeElement.textContent.trim();
              if (time) break;
            }
          }
          
          // 更精确的互动数据提取
          const stats = {};
          const互动选择器 = {
            likes: ['.card-wrap [class*="like"]', '.wbs-feed [class*="like"]', '[class*="赞"]', '[data-action="like"]'],
            comments: ['.card-wrap [class*="comment"]', '.wbs-feed [class*="comment"]', '[class*="评论"]', '[data-action="comment"]'],
            reposts: ['.card-wrap [class*="repost"]', '.wbs-feed [class*="repost"]', '[class*="转发"]', '[data-action="repost"]']
          };
          
          Object.entries(互动选择器).forEach(([key, selectors]) => {
            for (const selector of selectors) {
              const statElement = element.querySelector(selector);
              if (statElement) {
                const text = statElement.textContent.trim();
                // 提取数字
                const match = text.match(/\d+/);
                if (match) {
                  stats[key] = match[0];
                  break;
                }
              }
            }
          });
          
          // 提取图片信息
          const images = Array.from(element.querySelectorAll('img')).map(img => img.src).filter(src => src);
          
          // 提取链接
          const links = Array.from(element.querySelectorAll('a[href]')).map(a => a.href).filter(href => href);
          
          // 只保存有内容的帖子
          if (content.length > 5 && username !== '未知用户') {
            posts.push({
              id: postId,
              username: username,
              content: content,
              time: time,
              stats: stats,
              images: images.slice(0, 5), // 最多保存5张图片
              links: links.slice(0, 3),   // 最多保存3个链接
              extractedAt: new Date().toISOString()
            });
          }
        } catch (error) {
          console.warn(`提取帖子 ${index} 时出错:`, error.message);
        }
      });
      
      return posts;
    });
  }

  createSaveDirectory(keyword) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const safeKeyword = keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const saveDir = path.join(this.saveRootDir, today, safeKeyword);
    
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

  async savePosts(keyword) {
    console.log(`💾 保存帖子到本地文件...\n`);
    
    const saveDir = this.createSaveDirectory(keyword);
    const savedFiles = [];
    
    for (let i = 0; i < this.posts.length; i++) {
      const post = this.posts[i];
      const filename = `post_${i + 1}_${post.id}.md`;
      const filepath = path.join(saveDir, filename);
      
      // 生成markdown内容
      const markdown = this.generatePostMarkdown(post, keyword, i + 1);
      
      // 保存文件
      fs.writeFileSync(filepath, markdown, 'utf8');
      savedFiles.push(filepath);
      
      console.log(`   ✅ 保存帖子 ${i + 1}/${this.posts.length}: ${filename}`);
    }
    
    // 保存汇总信息
    const summaryFile = path.join(saveDir, 'search_summary.md');
    const summary = this.generateSummaryMarkdown(keyword, this.posts, saveDir);
    fs.writeFileSync(summaryFile, summary, 'utf8');
    
    console.log(`\n📁 所有文件已保存到: ${saveDir}`);
    console.log(`📊 总计保存 ${this.posts.length} 条帖子\n`);
    
    return { saveDir, savedFiles, summaryFile };
  }

  generatePostMarkdown(post, keyword, index) {
    const statsText = Object.entries(post.stats)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ');
    
    const imagesText = post.images.length > 0 
      ? '\n\n**图片:**\n' + post.images.map((img, i) => `![图片${i + 1}](${img})`).join('\n')
      : '';
    
    const linksText = post.links.length > 0
      ? '\n\n**链接:**\n' + post.links.map((link, i) => `[链接${i + 1}](${link})`).join('\n')
      : '';
    
    return `# 帖子 ${index}: ${post.username}

**搜索关键字:** ${keyword}
**用户:** ${post.username}
**时间:** ${post.time}
**帖子ID:** ${post.id}

---

## 内容

${post.content}

## 互动数据

${statsText || '无互动数据'}

${imagesText}

${linksText}

## 元信息

- **提取时间:** ${new Date(post.extractedAt).toLocaleString('zh-CN')}
- **数据源:** 微博搜索
- **搜索关键字:** ${keyword}

---

*此文件由微博搜索捕获工具自动生成*`;
  }

  generateSummaryMarkdown(keyword, posts, saveDir) {
    const totalStats = posts.reduce((acc, post) => {
      Object.entries(post.stats).forEach(([key, value]) => {
        acc[key] = (acc[key] || 0) + parseInt(value) || 0;
      });
      return acc;
    }, {});
    
    const users = [...new Set(posts.map(post => post.username))];
    const avgContentLength = Math.round(posts.reduce((sum, post) => sum + post.content.length, 0) / posts.length);
    
    return `# 微博搜索结果汇总

## 搜索信息

- **搜索关键字:** ${keyword}
- **搜索时间:** ${new Date().toLocaleString('zh-CN')}
- **捕获帖子数量:** ${posts.length}
- **保存目录:** ${saveDir}

## 数据统计

### 用户统计
- **唯一用户数量:** ${users.length}
- **主要用户:** ${users.slice(0, 5).join(', ')}${users.length > 5 ? '...' : ''}

### 内容统计
- **平均内容长度:** ${avgContentLength} 字符
- **包含图片的帖子:** ${posts.filter(p => p.images.length > 0).length}
- **包含链接的帖子:** ${posts.filter(p => p.links.length > 0).length}

### 互动统计
${Object.entries(totalStats).map(([key, value]) => `- **${key}:** ${value}`).join('\n') || '- 无互动数据'}

## 文件列表

${posts.map((post, i) => `- [帖子 ${i + 1}: ${post.username}](post_${i + 1}_${post.id}.md)`).join('\n')}

---

*此汇总文件由微博搜索捕获工具自动生成*`;
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
    console.log('使用方法: node weibo-search-capture.js <关键字> [帖子数量]');
    console.log('示例: node weibo-search-capture.js "浏览器自动化" 50');
    process.exit(1);
  }
  
  const keyword = args[0];
  const postCount = parseInt(args[1]) || 50;
  
  console.log('🔥 微博搜索捕获工具启动');
  console.log(`关键字: "${keyword}"`);
  console.log(`目标数量: ${postCount} 条帖子`);
  console.log(`保存目录: ~/.webauto\n`);
  
  const captureTool = new WeiboSearchCapture();
  
  try {
    // 初始化
    await captureTool.initialize();
    
    // 搜索关键字
    await captureTool.searchKeyword(keyword);
    
    // 捕获帖子
    await captureTool.capturePosts(postCount);
    
    // 保存帖子
    const result = await captureTool.savePosts(keyword);
    
    console.log('🎉 搜索捕获任务完成！');
    console.log(`📁 结果保存在: ${result.saveDir}`);
    
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

module.exports = WeiboSearchCapture;