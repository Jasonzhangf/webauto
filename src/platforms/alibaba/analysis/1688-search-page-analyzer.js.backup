#!/usr/bin/env node

import { firefox } from 'playwright';
import fs from 'fs';
import path from 'path';

async function analyze1688SearchPage() {
  let browser;
  let context;

  try {
    console.log('🔍 启动浏览器分析1688搜索页面...');

    // 启动浏览器
    browser = await firefox.launch({
      headless: false,
      args: []
    });

    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'zh-CN'
    });

    // 加载Cookie
    const cookieFile = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';
    if (fs.existsSync(cookieFile)) {
      const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
      await context.addCookies(cookies);
      console.log('✅ Cookie加载成功');
    }

    // 创建页面
    const page = await context.newPage();

    // 导航到搜索页面
    const searchUrl = 'https://s.1688.com/selloffer/offer_search.htm?keywords=phone';
    console.log(`🌐 导航到: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('✅ 页面导航成功');

    // 等待页面加载
    console.log('⏳ 等待页面完全加载...');
    await page.waitForTimeout(5000);

    // 分析页面
    console.log('\n📊 ===== 页面分析报告 =====');

    const pageAnalysis = await page.evaluate(() => {
      const analysis = {
        pageInfo: {
          title: document.title,
          url: window.location.href,
          readyState: document.readyState
        },
        linkAnalysis: {
          totalLinks: document.querySelectorAll('a').length,
          productLinks: document.querySelectorAll('a[href*="detail.1688.com"]').length,
          all1688Links: document.querySelectorAll('a[href*="1688.com"]').length
        },
        containerAnalysis: {
          offerContainers: document.querySelectorAll('[class*="offer"]').length,
          productContainers: document.querySelectorAll('[class*="product"]').length,
          itemContainers: document.querySelectorAll('[class*="item"]').length
        },
        searchResults: []
      };

      // 提取搜索结果
      const productLinks = document.querySelectorAll('a[href*="detail.1688.com"]');
      console.log(`🔍 找到 ${productLinks.length} 个商品链接`);

      productLinks.forEach((link, index) => {
        try {
          const url = link.href;
          const text = link.textContent?.trim() || '';
          const parentElement = link.closest('div, li, td, article, section');

          if (url && text && text.length > 5) {
            // 查找价格信息
            let price = '价格面议';
            const priceElements = parentElement?.querySelectorAll('[class*="price"], .money, [class*="money"]');
            for (const priceElement of priceElements || []) {
              if (priceElement?.textContent?.trim()) {
                price = priceElement.textContent.trim();
                break;
              }
            }

            // 查找地区信息
            let location = '未知地区';
            const locationElements = parentElement?.querySelectorAll('[class*="location"], [class*="address"], .area');
            for (const locationElement of locationElements || []) {
              if (locationElement?.textContent?.trim()) {
                location = locationElement.textContent.trim();
                break;
              }
            }

            const result = {
              index: index + 1,
              title: text.substring(0, 100),
              price: price,
              location: location,
              url: url,
              parentClasses: parentElement?.className || '',
              linkClasses: link.className || ''
            };

            analysis.searchResults.push(result);
            console.log(`✅ 提取商品 ${index + 1}: ${text.substring(0, 30)}... | 价格: ${price} | 地区: ${location}`);
          }
        } catch (e) {
          console.warn(`解析商品 ${index} 时出错:`, e.message);
        }
      });

      // 输出页面结构片段
      if (analysis.searchResults.length === 0) {
        console.log('\n⚠️ 未找到搜索结果，输出页面结构分析...');

        // 查找可能包含搜索结果的区域
        const possibleContainers = [
          '.sm-offer-item',
          '.offer-item',
          '.product-item',
          '.search-result-item',
          '[class*="offer"]',
          '[class*="product"]',
          '[class*="result"]'
        ];

        possibleContainers.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            console.log(`📦 找到 ${elements.length} 个匹配 "${selector}" 的元素`);
            if (elements.length > 0) {
              const firstElement = elements[0];
              console.log(`  - 第一个元素的HTML:`, firstElement.outerHTML.substring(0, 200));
            }
          }
        });

        // 输出页面主要内容区域
        const mainContent = document.querySelector('.main-content, .content, #content, main');
        if (mainContent) {
          console.log('\n📄 主要内容区域HTML片段:');
          console.log(mainContent.innerHTML.substring(0, 1000));
        } else {
          console.log('\n📄 Body HTML片段:');
          console.log(document.body?.innerHTML?.substring(0, 1000));
        }
      }

      return analysis;
    });

    console.log('\n📊 ===== 分析结果汇总 =====');
    console.log(`页面标题: ${pageAnalysis.pageInfo.title}`);
    console.log(`页面URL: ${pageAnalysis.pageInfo.url}`);
    console.log(`总链接数: ${pageAnalysis.linkAnalysis.totalLinks}`);
    console.log(`商品链接数: ${pageAnalysis.linkAnalysis.productLinks}`);
    console.log(`1688链接数: ${pageAnalysis.linkAnalysis.all1688Links}`);
    console.log(`搜索结果数: ${pageAnalysis.searchResults.length}`);

    if (pageAnalysis.searchResults.length > 0) {
      console.log('\n📦 搜索结果示例:');
      pageAnalysis.searchResults.slice(0, 3).forEach(result => {
        console.log(`- ${result.title} | ${result.price} | ${result.location}`);
      });
    }

    // 保存分析结果
    const outputPath = 'workflows/records/1688-search-page-analysis.json';
    fs.writeFileSync(outputPath, JSON.stringify(pageAnalysis, null, 2));
    console.log(`\n💾 分析结果已保存到: ${outputPath}`);

    // 等待用户查看
    console.log('\n⏸️ 浏览器将保持打开状态，请手动检查页面内容...');
    console.log('按任意键继续...');

    // 等待用户输入（简单实现）
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });

  } catch (error) {
    console.error('❌ 分析失败:', error);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔚 浏览器已关闭');
    }
  }
}

// 运行分析
analyze1688SearchPage();