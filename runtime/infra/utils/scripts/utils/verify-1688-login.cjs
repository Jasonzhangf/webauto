#!/usr/bin/env node

/**
 * 验证1688登录状态和基本对话功能
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function verifyLogin() {
  console.log('开始验证1688登录状态...');

  // 读取cookie文件
  const cookiePath = path.join(__dirname, '../sharedmodule/operations-framework/cookies.json');
  if (!fs.existsSync(cookiePath)) {
    console.error('❌ Cookie文件不存在:', cookiePath);
    return false;
  }

  const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
  console.log(`✅ 读取到 ${cookies.length} 个cookie`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  });

  // 设置cookie
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // 访问1688主页验证登录状态
    console.log('🔄 访问1688主页...');
    await page.goto('https://www.1688.com/', { waitUntil: 'networkidle' });

    // 检查登录状态
    const isLoggedIn = await page.evaluate(() => {
      const loginElement = document.querySelector('.user-avatar, .user-name, .user-info');
      return !!loginElement;
    });

    if (isLoggedIn) {
      console.log('✅ 登录状态验证成功');

      // 获取用户信息
      const userInfo = await page.evaluate(() => {
        const userName = document.querySelector('.user-name')?.textContent?.trim();
        const userId = document.querySelector('[data-user-id]')?.getAttribute('data-user-id');
        return { userName, userId };
      });

      console.log('👤 用户信息:', userInfo);

      // 尝试访问聊天页面
      console.log('🔄 尝试访问聊天页面...');
      await page.goto('https://air.1688.com/', { waitUntil: 'networkidle' });

      // 等待页面加载
      await page.waitForTimeout(3000);

      // 检查是否有聊天界面元素
      const hasChatInterface = await page.evaluate(() => {
        const chatElements = document.querySelectorAll('[contenteditable="true"], .chat-input, .message-input, .send-btn');
        return chatElements.length > 0;
      });

      if (hasChatInterface) {
        console.log('✅ 聊天界面验证成功');

        // 统计可交互元素
        const elementCount = await page.evaluate(() => {
          const inputs = document.querySelectorAll('[contenteditable="true"], input[type="text"], textarea');
          const buttons = document.querySelectorAll('button, .btn, [role="button"]');
          return {
            inputs: inputs.length,
            buttons: buttons.length,
            contenteditable: document.querySelectorAll('[contenteditable="true"]').length
          };
        });

        console.log('📊 页面元素统计:', elementCount);

        // 截图保存
        const screenshotPath = path.join(__dirname, '../screenshots/1688-login-verify.png');
        await fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log('📸 截图已保存:', screenshotPath);

        return true;
      } else {
        console.log('❌ 聊天界面验证失败');
        return false;
      }
    } else {
      console.log('❌ 登录状态验证失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 验证过程中发生错误:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

// 运行验证
verifyLogin().then(success => {
  if (success) {
    console.log('🎉 1688登录验证完成，可以进行下一步操作');
    process.exit(0);
  } else {
    console.log('💥 1688登录验证失败，请检查cookie状态');
    process.exit(1);
  }
}).catch(error => {
  console.error('💥 验证脚本执行失败:', error);
  process.exit(1);
});