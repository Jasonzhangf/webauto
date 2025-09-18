#!/usr/bin/env node

/**
 * 微博搜索页面结构分析工具
 * 专门分析微博搜索结果页面的结构
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager.js');
const { CookieManager } = require('./dist-simple/browser/SimpleCookieManager.js');
const fs = require('fs').promises;
const path = require('path');

class WeiboSearchAnalyzer {
  constructor() {
    this.manager = null;
    this.results = {};
  }

  async initialize() {
    console.log('🚀 初始化微博搜索分析器...');
    this.manager = new CamoufoxManager();
    await this.manager.initialize();
  }

  async analyzeSearchResults(keyword = '热点') {
    console.log(`🔍 分析微博搜索结果页面，关键字: "${keyword}"`);

    try {
      // 注入Cookie
      const cookies = CookieManager.loadCookies('weibo.com');
      await this.manager.injectCookies(cookies);

      // 导航到搜索页面
      const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`;
      console.log(`📍 访问: ${searchUrl}`);

      await this.manager.navigateTo(searchUrl);
      await this.manager.page.waitForTimeout(5000);

      // 分析页面结构
      await this.analyzePageStructure();

      // 测试各种选择器
      await this.testSelectors();

      // 截图保存
      const screenshotPath = `/tmp/weibo-search-${Date.now()}.png`;
      await this.manager.page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      console.log(`📸 截图保存到: ${screenshotPath}`);

      // 保存HTML到文件
      const html = await this.manager.page.content();
      const htmlPath = `/tmp/weibo-search-${Date.now()}.html`;
      await fs.writeFile(htmlPath, html);
      console.log(`📄 HTML保存到: ${htmlPath}`);

      // 保存分析结果
      await this.saveResults();

      return this.results;

    } catch (error) {
      console.error('❌ 分析失败:', error);
      throw error;
    }
  }

  async analyzePageStructure() {
    console.log('\n🔍 分析搜索页面结构...');

    const pageStructure = await this.manager.page.evaluate(() => {
      const body = document.body;
      const analysis = {
        body: {
          className: body.className,
          id: body.id,
          children: body.children.length
        },
        mainElements: [],
        feedElements: [],
        cardElements: [],
        wooElements: []
      };

      // 查找主要元素
      const mainSelectors = ['main', '.main', '#main', '.content', '.container', '.app'];
      mainSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          analysis.mainElements.push({
            selector,
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            children: el.children.length
          });
        });
      });

      // 查找Feed相关元素
      const feedSelectors = [
        '.feed', '.feeds', '.Feed', '[class*="feed"]', '[class*="Feed"]',
        '.card', '.cards', '[class*="card"]', '[class*="Card"]',
        '.item', '.items', '[class*="item"]',
        '.post', '.posts', '[class*="post"]'
      ];

      feedSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.children.length > 0) {
            analysis.feedElements.push({
              selector,
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              children: el.children.length,
              hasText: el.textContent.trim().length > 0
            });
          }
        });
      });

      // 查找woo前缀元素（微博新UI）
      const wooSelectors = [
        '[class*="woo-panel"]',
        '[class*="woo-box"]',
        '[class*="Feed_"]',
        '[class*="Card_"]',
        '[class*="Detail_"]'
      ];

      wooSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          analysis.wooElements.push({
            selector,
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            children: el.children.length,
            textPreview: el.textContent?.substring(0, 100)
          });
        });
      });

      return analysis;
    });

    this.results.pageStructure = pageStructure;

    console.log('📊 页面结构分析:');
    console.log(`   Body类名: ${pageStructure.body.className}`);
    console.log(`   主要元素: ${pageStructure.mainElements.length} 个`);
    console.log(`   Feed元素: ${pageStructure.feedElements.length} 个`);
    console.log(`   WOO元素: ${pageStructure.wooElements.length} 个`);

    // 显示主要的WOO元素
    if (pageStructure.wooElements.length > 0) {
      console.log('\n🏗️ 主要WOO元素:');
      pageStructure.wooElements.slice(0, 10).forEach((el, index) => {
        console.log(`   ${index + 1}. ${el.tagName} - ${el.className}`);
        if (el.textPreview && el.textPreview.length > 10) {
          console.log(`      文本: ${el.textPreview.substring(0, 50)}...`);
        }
      });
    }

    return pageStructure;
  }

  async testSelectors() {
    console.log('\n🧪 测试各种选择器...');

    const selectors = [
      // 微博搜索相关选择器
      {
        name: 'Feed主体',
        selectors: [
          '.Feed_body__3R0rO',
          '.Feed_body',
          '.Feed_wrap_3v9LH',
          '.Feed_normal_12A98',
          '.Feed_body__item',
          '.Feed_body__main'
        ]
      },
      {
        name: '卡片选择器',
        selectors: [
          '.Card_wrap_2ibWe',
          '.Card_bottomGap_2Xjqi',
          '.Card_card_3Jk5b',
          'article.Feed_wrap_3v9LH',
          'article[class*="Feed"]'
        ]
      },
      {
        name: 'WOO面板',
        selectors: [
          '.woo-panel-main',
          '.woo-panel-top',
          '.woo-panel-right',
          '.woo-panel-bottom',
          '.woo-panel-left'
        ]
      },
      {
        name: '内容选择器',
        selectors: [
          '.wbpro-feed-content',
          '.detail_text_1U10O',
          '.detail_ogText_2Z1Q8',
          '.wbpro-feed-ogText',
          '[class*="detail_text"]',
          '[class*="feed-content"]'
        ]
      },
      {
        name: '用户信息',
        selectors: [
          '.head_main_3DRDm',
          '.head-info_from_3FX0m',
          '[class*="head_main"]',
          '[class*="head-info"]'
        ]
      },
      {
        name: '通用选择器',
        selectors: [
          'article',
          '.card',
          '.item',
          '.post',
          '.feed-item'
        ]
      }
    ];

    const results = {};

    for (const category of selectors) {
      console.log(`\n📋 测试 ${category.name} 选择器:`);
      results[category.name] = {};

      for (const selector of category.selectors) {
        try {
          const elements = await this.manager.page.$$(selector);
          const count = elements.length;

          if (count > 0) {
            // 分析前几个元素
            const sampleInfo = await this.manager.page.evaluate((sel, limit) => {
              const elements = Array.from(document.querySelectorAll(sel)).slice(0, limit);
              return elements.map(el => ({
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                children: el.children.length,
                textLength: el.textContent?.length || 0,
                hasText: el.textContent?.trim().length > 0
              }));
            }, selector, Math.min(count, 3));

            results[category.name][selector] = {
              count,
              sampleInfo
            };

            console.log(`   ✅ ${selector}: ${count} 个元素`);
            if (sampleInfo.length > 0) {
              const sample = sampleInfo[0];
              console.log(`      标签: ${sample.tagName}, 子元素: ${sample.children}`);
              console.log(`      文本长度: ${sample.textLength}, 有内容: ${sample.hasText}`);
            }
          } else {
            console.log(`   ❌ ${selector}: 0 个元素`);
          }
        } catch (error) {
          console.log(`   ⚠️  ${selector}: 错误 - ${error.message}`);
        }
      }
    }

    this.results.selectorTests = results;

    // 推荐最佳选择器
    console.log('\n🎯 推荐选择器:');
    const recommendations = this.generateRecommendations(results);
    recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`);
    });

    return results;
  }

  generateRecommendations(results) {
    const recommendations = [];

    // 基于测试结果生成推荐
    Object.entries(results).forEach(([category, selectors]) => {
      Object.entries(selectors).forEach(([selector, data]) => {
        if (data.count > 0 && data.count < 50) { // 合理的数量范围
          if (selector.includes('Feed') || selector.includes('Card') || selector.includes('article')) {
            recommendations.push(`${category}: ${selector} (${data.count}个元素)`);
          }
        }
      });
    });

    return recommendations.slice(0, 10); // 返回前10个推荐
  }

  async saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `weibo-search-analysis-${timestamp}.json`;
    const filepath = path.join(process.env.HOME || '~', '.webauto', filename);

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(this.results, null, 2));

    console.log(`📁 分析结果保存到: ${filepath}`);
  }

  async cleanup() {
    if (this.manager) {
      await this.manager.cleanup();
      console.log('🧹 清理完成');
    }
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const keyword = args[0] || '热点';

  console.log('🔥 微博搜索页面分析工具');
  console.log('================================');
  console.log(`关键字: "${keyword}"\n`);

  const analyzer = new WeiboSearchAnalyzer();

  try {
    await analyzer.initialize();
    const results = await analyzer.analyzeSearchResults(keyword);

    console.log('\n🎉 分析完成！');
    console.log('✅ 可以使用推荐的选择器更新微博操作子');

  } catch (error) {
    console.error('❌ 分析失败:', error);
    process.exit(1);
  } finally {
    await analyzer.cleanup();
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = WeiboSearchAnalyzer;