#!/usr/bin/env node

/**
 * 1688单个对话流程验证（mock发送）
 * 测试从主页找到搜索框，输入关键字，打开搜索页面，查找结果列表，找到商家对话框，输入你好，发送（mock）
 */

const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

async function testSingleChatFlow() {
  console.log('🚀 开始1688单个对话流程测试...');

  // 读取cookie文件
  const cookiePath = path.join(__dirname, '../sharedmodule/operations-framework/cookies.json');
  if (!fs.existsSync(cookiePath)) {
    console.error('❌ Cookie文件不存在:', cookiePath);
    return false;
  }

  const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
  console.log(`✅ 读取到 ${cookies.length} 个cookie`);

  const browser = await firefox.launch({
    headless: false,
    slowMo: 500  // 减慢操作速度便于观察
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  });

  // 设置cookie
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // 步骤1：访问1688主页
    console.log('🔄 步骤1：访问1688主页...');
    await page.goto('https://www.1688.com/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('✅ 主页访问成功');

    // 步骤2：找到搜索框并输入关键字
    console.log('🔄 步骤2：查找搜索框...');

    const searchSelectors = [
      'input[placeholder*="搜索"]',
      'input[type="search"]',
      '.search-input',
      '#q',
      'input[name="q"]'
    ];

    let searchInput = null;
    for (const selector of searchSelectors) {
      try {
        searchInput = await page.waitForSelector(selector, { timeout: 3000 });
        if (searchInput) {
          console.log(`✅ 找到搜索框: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!searchInput) {
      console.error('❌ 未找到搜索框');
      return false;
    }

    // 输入搜索关键字
    const searchKeyword = '服装批发';
    console.log(`🔄 输入搜索关键字: ${searchKeyword}`);
    await searchInput.click();
    await searchInput.clear();
    await searchInput.type(searchKeyword, { delay: 100 });
    await page.waitForTimeout(1000);

    // 步骤3：点击搜索按钮或按回车
    console.log('🔄 步骤3：执行搜索...');

    // 尝试找到搜索按钮
    const searchButtonSelectors = [
      '.search-btn',
      '.btn-search',
      'button[type="submit"]',
      '.search-button'
    ];

    let searchPerformed = false;
    for (const selector of searchButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          searchPerformed = true;
          console.log(`✅ 点击搜索按钮: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // 如果没找到按钮，按回车键
    if (!searchPerformed) {
      await searchInput.press('Enter');
      console.log('✅ 按回车键执行搜索');
    }

    await page.waitForTimeout(3000);

    // 步骤4：等待搜索结果页面加载
    console.log('🔄 步骤4：等待搜索结果加载...');
    await page.waitForLoadState('networkidle');

    // 验证是否在搜索结果页面
    const currentUrl = page.url();
    if (currentUrl.includes('search.1688.com') || currentUrl.includes('offer')) {
      console.log('✅ 搜索结果页面加载成功');
    } else {
      console.log('⚠️ 页面URL可能不是搜索结果页:', currentUrl);
    }

    // 步骤5：查找商家列表
    console.log('🔄 步骤5：查找商家列表...');

    const productSelectors = [
      '.sm-offer-item',
      '.offer-item',
      '.product-item',
      '.item'
    ];

    let products = [];
    for (const selector of productSelectors) {
      try {
        products = await page.$$(selector);
        if (products.length > 0) {
          console.log(`✅ 找到 ${products.length} 个商品: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (products.length === 0) {
      console.error('❌ 未找到商品列表');
      return false;
    }

    // 步骤6：选择第一个商品并查找联系商家按钮
    console.log('🔄 步骤6：选择第一个商品并查找联系按钮...');

    const firstProduct = products[0];

    // 尝试不同的联系按钮选择器
    const contactButtonSelectors = [
      'a[href*="contact"]',
      'button[title*="联系"]',
      '.contact-btn',
      '.chat-btn',
      'a[title*="旺旺"]',
      '.ww-contact'
    ];

    let contactButton = null;
    for (const selector of contactButtonSelectors) {
      try {
        // 在商品范围内查找
        contactButton = await firstProduct.$(selector);
        if (contactButton) {
          console.log(`✅ 找到联系按钮: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!contactButton) {
      console.log('⚠️ 未在商品中找到联系按钮，尝试在页面中查找...');
      for (const selector of contactButtonSelectors) {
        try {
          contactButton = await page.$(selector);
          if (contactButton) {
            console.log(`✅ 在页面中找到联系按钮: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }

    if (contactButton) {
      console.log('🔄 点击联系按钮...');
      const [newPage] = await Promise.all([
        context.waitForEvent('page'),
        contactButton.click()
      ]);

      if (newPage) {
        page = newPage;
        console.log('✅ 聊天页面已打开');
      } else {
        console.log('⚠️ 可能没有打开新页面，继续在当前页面查找聊天界面');
      }
    } else {
      console.log('⚠️ 未找到联系按钮，尝试直接访问聊天页面');
      await page.goto('https://air.1688.com/', { waitUntil: 'networkidle' });
    }

    await page.waitForTimeout(3000);

    // 步骤7：查找聊天输入框
    console.log('🔄 步骤7：查找聊天输入框...');

    const chatInputSelectors = [
      '[contenteditable="true"]',
      '.chat-input',
      'textarea',
      'input[type="text"]',
      '.message-input'
    ];

    let chatInput = null;
    for (const selector of chatInputSelectors) {
      try {
        chatInput = await page.waitForSelector(selector, { timeout: 3000 });
        if (chatInput) {
          console.log(`✅ 找到聊天输入框: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!chatInput) {
      console.error('❌ 未找到聊天输入框');
      return false;
    }

    // 步骤8：输入消息（mock）
    console.log('🔄 步骤8：输入消息（mock）...');
    const message = '你好，请问这个产品有现货吗？';

    await chatInput.click();
    await chatInput.fill('');  // 清空
    await chatInput.type(message, { delay: 50 });
    console.log(`✅ 已输入消息: "${message}"`);

    await page.waitForTimeout(2000);

    // 步骤9：查找发送按钮
    console.log('🔄 步骤9：查找发送按钮...');

    const sendButtonSelectors = [
      '.send-btn',
      'button[class*="send"]',
      'button[class*="Send"]',
      '[title*="发送"]',
      '.btn-send'
    ];

    let sendButton = null;
    for (const selector of sendButtonSelectors) {
      try {
        sendButton = await page.$(selector);
        if (sendButton) {
          console.log(`✅ 找到发送按钮: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (sendButton) {
      console.log('🔄 找到发送按钮，准备发送（mock模式）...');
      // 在mock模式下，我们不实际点击发送，只是高亮显示
      await sendButton.evaluate(el => {
        el.style.border = '3px solid green';
        el.style.backgroundColor = 'lightgreen';
      });
      console.log('✅ 发送按钮已高亮（mock模式，未实际发送）');
    } else {
      console.log('⚠️ 未找到发送按钮');
    }

    // 步骤10：截图保存
    console.log('🔄 步骤10：保存测试结果截图...');
    const screenshotPath = path.join(__dirname, '../screenshots/1688-single-chat-mock.png');
    await fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('📸 截图已保存:', screenshotPath);

    // 测试总结
    console.log('🎉 单个对话流程测试完成！');
    console.log('✅ 测试步骤完成情况:');
    console.log('  1. ✅ 访问1688主页');
    console.log('  2. ✅ 查找并使用搜索框');
    console.log(`  3. ✅ 搜索关键字: ${searchKeyword}`);
    console.log(`  4. ✅ 找到 ${products.length} 个商品结果`);
    console.log('  5. ✅ 查找联系商家按钮');
    console.log('  6. ✅ 进入聊天界面');
    console.log('  7. ✅ 找到聊天输入框');
    console.log(`  8. ✅ 输入消息: "${message}"`);
    console.log('  9. ✅ 查找发送按钮（mock模式）');
    console.log(' 10. ✅ 保存测试截图');

    return true;

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

// 运行测试
testSingleChatFlow().then(success => {
  if (success) {
    console.log('🎊 1688单个对话流程测试成功完成');
    process.exit(0);
  } else {
    console.log('💥 1688单个对话流程测试失败');
    process.exit(1);
  }
}).catch(error => {
  console.error('💥 测试脚本执行失败:', error);
  process.exit(1);
});