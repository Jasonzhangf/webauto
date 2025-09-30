#!/usr/bin/env node

/**
 * 调试页面布局的脚本
 * 截取当前页面状态，分析布局问题
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function debugPageLayout() {
  console.log('🔍 调试页面布局...');

  let browser;
  try {
    // 启动浏览器
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--window-position=200,100',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();

    // 导航到微博登录页面
    console.log('🌐 导航到微博登录页面...');
    await page.goto('https://weibo.com/login.php', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // 等待页面加载
    await page.waitForTimeout(5000);

    // 截图前的状态分析
    const pageInfo = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;

      return {
        windowSize: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        scrollPosition: {
          x: window.scrollX,
          y: window.scrollY
        },
        bodyStyles: {
          margin: body.style.margin,
          padding: body.style.padding,
          display: body.style.display,
          justifyContent: body.style.justifyContent,
          alignItems: body.style.alignItems,
          width: body.style.width,
          height: body.style.height
        },
        htmlStyles: {
          margin: html.style.margin,
          padding: html.style.padding,
          display: html.style.display,
          justifyContent: html.style.justifyContent,
          alignItems: html.style.alignItems,
          width: html.style.width,
          height: html.style.height
        },
        bodyRect: body.getBoundingClientRect(),
        htmlRect: html.getBoundingClientRect(),
        mainElements: Array.from(document.querySelectorAll('main, .main, .content, .wrapper, .container, .login_main, .login_box')).map(el => ({
          tagName: el.tagName,
          className: el.className,
          rect: el.getBoundingClientRect()
        })),
        loginElements: Array.from(document.querySelectorAll('form, input[type="text"], input[type="password"], button[type="submit"], .login_btn, [class*="login"]')).map(el => ({
          tagName: el.tagName,
          className: el.className,
          rect: el.getBoundingClientRect()
        }))
      };
    });

    console.log('\n📊 页面布局分析:');
    console.log('窗口大小:', pageInfo.windowSize);
    console.log('滚动位置:', pageInfo.scrollPosition);
    console.log('Body样式:', pageInfo.bodyStyles);
    console.log('HTML样式:', pageInfo.htmlStyles);
    console.log('Body矩形:', pageInfo.bodyRect);
    console.log('HTML矩形:', pageInfo.htmlRect);
    console.log('主要元素数量:', pageInfo.mainElements.length);
    console.log('登录元素数量:', pageInfo.loginElements.length);

    // 截图1: 原始状态
    await page.screenshot({
      path: './debug-layout-1-original.png',
      fullPage: true
    });
    console.log('📸 已截图: debug-layout-1-original.png');

    // 应用居中样式
    await page.evaluate(() => {
      // 重置样式
      document.documentElement.style.margin = '0';
      document.documentElement.style.padding = '0';
      document.documentElement.style.width = '100%';
      document.documentElement.style.height = '100%';
      document.documentElement.style.display = 'flex';
      document.documentElement.style.justifyContent = 'center';
      document.documentElement.style.alignItems = 'flex-start';

      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.width = '100%';
      document.body.style.minHeight = '100vh';
      document.body.style.display = 'flex';
      document.body.style.justifyContent = 'center';
      document.body.style.alignItems = 'flex-start';

      window.scrollTo(0, 0);

      // 查找并居中主要内容
      const selectors = ['main', '.main', '.content', '.wrapper', '.container', '.login_main', '.login_box', 'form'];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          console.log('居中元素:', selector);
          break;
        }
      }
    });

    await page.waitForTimeout(2000);

    // 截图2: 应用居中样式后
    await page.screenshot({
      path: './debug-layout-2-centered.png',
      fullPage: true
    });
    console.log('📸 已截图: debug-layout-2-centered.png');

    console.log('\n⏱️  保持浏览器打开10秒供你检查...');
    await page.waitForTimeout(10000);

    await browser.close();
    console.log('✅ 调试完成');

  } catch (error) {
    console.error('❌ 调试失败:', error.message);
    if (browser) {
      await browser.close();
    }
  }
}

debugPageLayout()
  .then(() => {
    console.log('\n🎉 页面布局调试完成');
  })
  .catch(console.error);