#!/usr/bin/env node

/**
 * 快速保存当前登录状态
 * 立即检测并保存已登录的Cookie
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function quickSaveCurrentLogin() {
  console.log('🚀 快速保存当前登录状态...');

  try {
    // 启动浏览器
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    // 导航到微博
    console.log('🌐 导航到微博...');
    await page.goto('https://weibo.com', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // 等待页面加载
    await page.waitForTimeout(3000);

    // 检查当前状态
    const currentUrl = page.url();
    const pageTitle = await page.title();
    console.log(`📍 当前URL: ${currentUrl}`);
    console.log(`📄 页面标题: ${pageTitle}`);

    // 检测头像元素
    console.log('🔍 检测头像元素...');
    const avatarResult = await page.evaluate(() => {
      const avatarSelectors = [
        'img[src*="tvax1.sinaimg.cn"]',
        'img[class*="Ctrls_avatar"]',
        'img[alt*="profile"]',
        '.gn_name',
        '.S_txt1'
      ];

      const results = {};
      let foundAvatar = null;

      avatarSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          const visible = Array.from(elements).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 &&
                   el.offsetParent !== null &&
                   window.getComputedStyle(el).display !== 'none' &&
                   window.getComputedStyle(el).visibility !== 'hidden';
          });

          if (visible.length > 0) {
            results[selector] = visible.length;

            if (!foundAvatar && visible[0].src && visible[0].src.includes('tvax1.sinaimg.cn')) {
              foundAvatar = visible[0];
            }
          }
        } catch (e) {
          // 忽略选择器错误
        }
      });

      return {
        foundAvatar: !!foundAvatar,
        avatarInfo: foundAvatar ? {
          src: foundAvatar.src,
          alt: foundAvatar.alt,
          className: foundAvatar.className
        } : null,
        results,
        totalFound: Object.values(results).reduce((sum, count) => sum + count, 0)
      };
    });

    console.log('📊 头像检测结果:');
    console.log(`   - 找到头像: ${avatarResult.foundAvatar ? '✅ 是' : '❌ 否'}`);
    console.log(`   - 总元素数: ${avatarResult.totalFound}`);

    if (avatarResult.avatarInfo) {
      console.log(`   - 头像地址: ${avatarResult.avatarInfo.src}`);
      console.log(`   - ALT文本: ${avatarResult.avatarInfo.alt}`);
    }

    // 检查是否为登录页
    const isLoginPage = currentUrl.includes('newlogin') ||
                      currentUrl.includes('visitor') ||
                      pageTitle.includes('登录') ||
                      pageTitle.includes('Visitor');

    console.log(`🔐 登录页面检测: ${isLoginPage ? '❌ 是登录页' : '✅ 非登录页'}`);

    // 如果不是登录页且找到头像，则保存Cookie
    if (!isLoginPage && avatarResult.foundAvatar) {
      console.log('💾 保存认证Cookie...');

      const cookies = await context.cookies();

      // 只保存重要的认证Cookie
      const essentialCookieNames = [
        'SUB', 'WBPSESS', 'XSRF-TOKEN', 'SUBP', 'ALF', 'SRT', 'SCF', 'SSOLoginState'
      ];

      const essentialCookies = cookies.filter(cookie =>
        cookie.name &&
        cookie.value &&
        cookie.domain &&
        essentialCookieNames.includes(cookie.name)
      );

      if (essentialCookies.length > 0) {
        // 确保目录存在
        const cookieDir = path.dirname('./cookies/weibo-cookies.json');
        if (!fs.existsSync(cookieDir)) {
          fs.mkdirSync(cookieDir, { recursive: true });
        }

        // 保存Cookie
        fs.writeFileSync('./cookies/weibo-cookies.json', JSON.stringify(essentialCookies, null, 2));

        console.log('✅ Cookie保存成功！');
        console.log(`   保存数量: ${essentialCookies.length}`);
        console.log(`   保存的Cookie: ${essentialCookies.map(c => c.name).join(', ')}`);

        // 检查文件时间
        const stats = fs.statSync('./cookies/weibo-cookies.json');
        console.log(`   保存时间: ${stats.mtime.toLocaleString()}`);

      } else {
        console.log('❌ 没有找到认证Cookie');
        console.log(`   当前Cookie总数: ${cookies.length}`);
        console.log(`   Cookie列表: ${cookies.map(c => c.name).join(', ')}`);
      }
    } else {
      console.log('❌ 检测到未登录状态，不保存Cookie');
    }

    console.log('\n📱 浏览器保持打开状态供检查...');
    console.log('按 Ctrl+C 退出');

    // 保持浏览器打开
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 快速保存失败:', error.message);
  }
}

// 执行
quickSaveCurrentLogin();