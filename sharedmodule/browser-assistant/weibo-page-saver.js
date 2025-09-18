/**
 * 微博页面保存和分析工具
 * 保存微博页面HTML并分析结构
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const fs = require('fs');
const path = require('path');

class WeiboPageSaver {
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
  }

  async initialize() {
    console.log('🚀 初始化微博页面保存工具...\n');
    await this.browserManager.initializeWithAutoLogin('https://weibo.com');
  }

  async saveSearchPage(keyword = '热点') {
    console.log(`🔍 保存微博搜索页面，关键字: "${keyword}"`);

    const page = await this.browserManager.getCurrentPage();

    // 导航到搜索页面
    const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`;
    console.log(`📍 访问: ${searchUrl}`);

    await this.browserManager.navigate(searchUrl);
    await page.waitForTimeout(5000);

    // 检查当前URL
    const currentUrl = page.url();
    console.log(`📄 当前页面: ${currentUrl}`);

    // 获取页面标题
    const title = await page.title();
    console.log(`📋 页面标题: ${title}`);

    // 保存HTML内容
    const html = await page.content();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeKeyword = keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');

    const saveDir = path.join(this.saveRootDir, 'page-analysis', timestamp, safeKeyword);
    fs.mkdirSync(saveDir, { recursive: true });

    const htmlPath = path.join(saveDir, 'page.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`💾 HTML保存到: ${htmlPath}`);

    // 保存页面信息
    const pageInfo = {
      keyword,
      url: currentUrl,
      title,
      timestamp,
      htmlPath,
      saveDir
    };

    const infoPath = path.join(saveDir, 'page-info.json');
    fs.writeFileSync(infoPath, JSON.stringify(pageInfo, null, 2), 'utf8');
    console.log(`📊 页面信息保存到: ${infoPath}`);

    // 截图
    const screenshotPath = path.join(saveDir, 'screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 截图保存到: ${screenshotPath}`);

    // 简单分析
    await this.analyzePageStructure(page, saveDir);

    console.log('\n✅ 页面保存完成！');
    console.log(`📁 所有文件保存在: ${saveDir}`);

    return {
      saveDir,
      htmlPath,
      pageInfo
    };
  }

  async analyzePageStructure(page, saveDir) {
    console.log('\n🔍 分析页面结构...');

    const analysis = await page.evaluate(() => {
      const results = {
        body: {
          className: document.body.className,
          id: document.body.id,
          children: document.body.children.length
        },
        mainElements: [],
        feedElements: [],
        wooElements: [],
        articleElements: [],
        potentialPosts: []
      };

      // 查找主要元素
      const mainSelectors = ['main', '.main', '#main', '.content', '.container', '.app'];
      mainSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          results.mainElements.push({
            selector,
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            children: el.children.length
          });
        });
      });

      // 查找Feed相关元素
      const feedSelectors = ['.feed', '.Feed', '[class*="feed"]', '[class*="Feed"]'];
      feedSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          results.feedElements.push({
            selector,
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            children: el.children.length,
            textLength: el.textContent?.length || 0
          });
        });
      });

      // 查找WOO元素
      const wooSelectors = ['[class*="woo-"]'];
      wooSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          results.wooElements.push({
            selector,
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            children: el.children.length,
            textLength: el.textContent?.length || 0
          });
        });
      });

      // 查找文章元素
      const articleSelectors = ['article', '[class*="article"]'];
      articleSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          results.articleElements.push({
            selector,
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            children: el.children.length,
            textLength: el.textContent?.length || 0
          });
        });
      });

      // 查找可能的帖子元素
      const postSelectors = [
        '.Feed_body__3R0rO',
        '.Feed_wrap_3v9LH',
        '.Feed_normal_12A98',
        '.Card_wrap_2ibWe',
        '.Card_card_3Jk5b',
        'article[class*="Feed"]',
        'article[class*="Card"]',
        '.wbpro-feed-content',
        '.detail_text_1U10O'
      ];

      postSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          results.potentialPosts.push({
            selector,
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            children: el.children.length,
            textLength: el.textContent?.length || 0,
            textPreview: el.textContent?.substring(0, 100)
          });
        });
      });

      return results;
    });

    // 保存分析结果
    const analysisPath = path.join(saveDir, 'structure-analysis.json');
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf8');
    console.log(`📊 结构分析保存到: ${analysisPath}`);

    // 打印关键发现
    console.log('📋 结构分析结果:');
    console.log(`   Body类名: ${analysis.body.className}`);
    console.log(`   主要元素: ${analysis.mainElements.length} 个`);
    console.log(`   Feed元素: ${analysis.feedElements.length} 个`);
    console.log(`   WOO元素: ${analysis.wooElements.length} 个`);
    console.log(`   文章元素: ${analysis.articleElements.length} 个`);
    console.log(`   潜在帖子: ${analysis.potentialPosts.length} 个`);

    // 显示潜在的帖子元素
    if (analysis.potentialPosts.length > 0) {
      console.log('\n🎯 潜在的帖子元素:');
      analysis.potentialPosts.slice(0, 10).forEach((post, index) => {
        console.log(`   ${index + 1}. ${post.selector}`);
        console.log(`      标签: ${post.tagName}, 子元素: ${post.children}`);
        console.log(`      文本长度: ${post.textLength}`);
        if (post.textPreview && post.textPreview.length > 20) {
          console.log(`      内容: ${post.textPreview.substring(0, 50)}...`);
        }
        console.log('');
      });
    }

    return analysis;
  }

  async cleanup() {
    if (this.browserManager) {
      await this.browserManager.cleanup();
      console.log('🧹 清理完成');
    }
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const keyword = args[0] || '热点';

  console.log('🔥 微博页面保存和分析工具');
  console.log('================================');
  console.log(`关键字: "${keyword}"\n`);

  const saver = new WeiboPageSaver();

  try {
    await saver.initialize();
    const result = await saver.saveSearchPage(keyword);

    console.log('\n🎉 任务完成！');
    console.log('📁 下一步可以:');
    console.log('   1. 查看 HTML 文件了解页面结构');
    console.log('   2. 分析结构分析文件');
    console.log('   3. 基于发现更新CSS选择器');

  } catch (error) {
    console.error('❌ 处理失败:', error);
  } finally {
    await saver.cleanup();
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = WeiboPageSaver;