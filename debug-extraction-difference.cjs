#!/usr/bin/env node

/**
 * 调试版本 - 分析检测与提取差异
 */

const { chromium } = require('playwright');

async function debugDetectionExtraction() {
  console.log('🔍 调试检测与提取差异');
  console.log('='.repeat(50));

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // 加载cookie
    try {
      const fs = require('fs');
      if (fs.existsSync('./cookies/weibo-cookies.json')) {
        const cookieData = JSON.parse(fs.readFileSync('./cookies/weibo-cookies.json', 'utf8'));
        const cookies = cookieData.cookies || [];
        if (cookies.length > 0) {
          await context.addCookies(cookies);
          console.log(`✅ 已加载 ${cookies.length} 个Cookie`);
        }
      }
    } catch (e) {
      console.log('⚠️ Cookie加载失败');
    }

    // 访问微博
    console.log('🌐 访问微博主页...');
    await page.goto('https://weibo.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);

    // 1. 执行计数策略
    console.log('\n📊 执行计数策略分析...');
    const strategyCounts = await page.evaluate(() => {
      const strategies = [
        // 策略1：通过链接模式检测
        () => {
          const links = Array.from(document.querySelectorAll('a[href*="weibo.com/"][href*="/"]'));
          const weiboPattern = /weibo\.com\/(\d+)\/([a-zA-Z0-9_-]{8,})/;
          const validLinks = links.filter(link => weiboPattern.test(link.href));
          return {
            name: '链接模式检测',
            count: validLinks.length,
            sampleUrls: validLinks.slice(0, 5).map(link => link.href)
          };
        },
        // 策略2：通过Feed卡片检测
        () => {
          const feedCards = document.querySelectorAll('[class*="Feed"], [class*="feed"], [class*="Card"], [class*="card"]');
          return {
            name: 'Feed卡片检测',
            count: feedCards.length,
            sampleHtml: feedCards.length > 0 ? feedCards[0].outerHTML.substring(0, 200) : 'N/A'
          };
        },
        // 策略3：通过文章容器检测
        () => {
          const articles = document.querySelectorAll('article, [class*="article"], [class*="post"], [class*="content"]');
          return {
            name: '文章容器检测',
            count: articles.length,
            sampleHtml: articles.length > 0 ? articles[0].outerHTML.substring(0, 200) : 'N/A'
          };
        },
        // 策略4：通过时间戳检测
        () => {
          const timeElements = document.querySelectorAll('time, [class*="time"], [class*="date"], [datetime]');
          return {
            name: '时间戳检测',
            count: timeElements.length,
            sampleText: timeElements.length > 0 ? timeElements[0].textContent : 'N/A'
          };
        }
      ];

      return strategies.map(strategy => {
        try {
          return strategy();
        } catch (e) {
          return { name: strategy.name || '未知', count: 0, error: e.message };
        }
      });
    });

    // 显示策略结果
    strategyCounts.forEach(result => {
      console.log(`\n📋 ${result.name}: ${result.count}个`);
      if (result.sampleUrls) {
        console.log(`   样例链接: ${result.sampleUrls.slice(0, 3).join(', ')}`);
      }
      if (result.sampleHtml) {
        console.log(`   样例HTML: ${result.sampleHtml}`);
      }
      if (result.sampleText) {
        console.log(`   样例文本: ${result.sampleText}`);
      }
      if (result.error) {
        console.log(`   错误: ${result.error}`);
      }
    });

    // 2. 详细分析检测到的链接
    console.log('\n🔍 详细分析检测到的链接...');
    const detectedLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="weibo.com/"][href*="/"]'));
      const weiboPattern = /weibo\.com\/(\d+)\/([a-zA-Z0-9_-]{8,})/;

      return links.map(link => {
        const match = link.href.match(weiboPattern);
        if (match) {
          const [fullUrl, userId, postId] = match;

          // 分析链接上下文
          let contextInfo = '';
          let currentElement = link.parentElement;
          let depth = 0;

          while (currentElement && depth < 5) {
            const className = currentElement.className || '';
            const tagName = currentElement.tagName.toLowerCase();
            contextInfo += `${tagName}[${className}] > `;
            currentElement = currentElement.parentElement;
            depth++;
          }

          return {
            url: fullUrl,
            userId,
            postId,
            text: link.textContent?.trim() || '',
            isVisible: link.offsetParent !== null,
            context: contextInfo,
            linkHtml: link.outerHTML
          };
        }
        return null;
      }).filter(Boolean);
    });

    console.log(`\n📊 检测到 ${detectedLinks.length} 个微博链接:`);

    // 按上下文分组
    const contextGroups = {};
    detectedLinks.forEach(link => {
      const context = link.context.split(' > ')[0]; // 只取直接父元素
      if (!contextGroups[context]) {
        contextGroups[context] = [];
      }
      contextGroups[context].push(link);
    });

    console.log('\n📂 按上下文分组统计:');
    Object.entries(contextGroups).forEach(([context, links]) => {
      console.log(`\n🔹 ${context}: ${links.length}个`);
      links.slice(0, 3).forEach(link => {
        console.log(`   - ${link.url} (${link.text})`);
      });
      if (links.length > 3) {
        console.log(`   ... 还有 ${links.length - 3} 个`);
      }
    });

    // 3. 分析为什么没有提取更多
    console.log('\n❓ 分析提取限制因素...');

    const validForExtraction = detectedLinks.filter(link => {
      // 检查是否满足提取条件
      let isValidContext = false;
      const context = link.context.toLowerCase();

      if (context.includes('feed') || context.includes('card') ||
          context.includes('item') || context.includes('content') ||
          context.includes('post') || context.includes('article') ||
          context.includes('wrap') || context.includes('container') ||
          context.includes('main')) {
        isValidContext = true;
      }

      // 如果没有合适的上下文，只要链接可见就接受
      if (!isValidContext && link.isVisible) {
        isValidContext = true;
      }

      return isValidContext && link.isVisible;
    });

    console.log(`\n✅ 符合提取条件的链接: ${validForExtraction.length}个`);
    console.log(`❌ 被过滤的链接: ${detectedLinks.length - validForExtraction.length}个`);

    if (validForExtraction.length > detectedLinks.length) {
      console.log('\n🎯 发现问题：实际可提取链接多于当前提取结果！');
      console.log('可能原因:');
      console.log('1. 提取算法中的正则表达式或过滤逻辑有问题');
      console.log('2. 上下文验证过于严格');
      console.log('3. 去重逻辑过于激进');
    }

    await browser.close();

  } catch (error) {
    console.error('❌ 调试失败:', error.message);
    await browser.close();
  }
}

debugDetectionExtraction().catch(console.error);