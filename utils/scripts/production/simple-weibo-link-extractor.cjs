/**
 * 简化版微博链接提取器
 * 只提取链接，不进入帖子页面
 */

const { createTestSystem, validateCookieFile } = require('../tests/utils/test-helpers.cjs');
const { TEST_CONFIG } = require('../tests/utils/test-config.cjs');
const fs = require('fs');

async function simpleWeiboLinkExtractor() {
  console.log('🚀 开始简化微博链接提取...');

  // 验证Cookie
  const cookieValidation = validateCookieFile();
  if (!cookieValidation.valid) {
    throw new Error('Cookie验证失败');
  }

  console.log(`✅ Cookie验证成功 (${cookieValidation.count} 个Cookie)`);

  // 创建测试系统
  const testSystem = createTestSystem({
    logLevel: 'info',
    headless: false,
    timeout: 0 // 取消整个操作的超时限制
  });

  try {
    await testSystem.initialize();

    // 访问微博主页 - 使用domcontentloaded而不是networkidle
    console.log('🔍 访问微博主页...');
    await testSystem.state.page.goto(TEST_CONFIG.urls.homepage, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // 等待页面加载
    await testSystem.state.page.waitForTimeout(10000);

    // 滚动多次以加载更多内容 - 使用pagedown滚动
    console.log('🔄 滚动页面加载内容...');
    for (let i = 0; i < 25; i++) { // 增加滚动次数以获取50条链接
      console.log(`🔄 第 ${i + 1} 次滚动...`);

      // 使用pagedown按键滚动，每次滚动更多内容
      await testSystem.state.page.keyboard.press('PageDown');
      await testSystem.state.page.waitForTimeout(5000); // 保持等待时间

      // 额外的小等待确保内容稳定
      await testSystem.state.page.waitForTimeout(1000);

      // 检查页面是否卡死 - 只对单个滚动操作设置超时
      try {
        await testSystem.state.page.waitForFunction(() => {
          return document.readyState === 'complete';
        }, { timeout: 30000 }); // 单个操作30秒超时
      } catch (error) {
        console.log(`第 ${i + 1} 次滚动后页面状态检查超时，继续执行`);
      }
    }

    // 提取所有链接
    console.log('🔗 提取页面链接...');
    const links = await testSystem.state.page.evaluate(() => {
      const linkElements = document.querySelectorAll('a[href*="weibo.com"]');
      const validLinks = new Set();

      linkElements.forEach(link => {
        const href = link.href;
        if (href && href.includes('weibo.com')) {
          const cleanUrl = href.split('?')[0].split('#')[0];
          validLinks.add(cleanUrl);
        }
      });

      return Array.from(validLinks);
    });

    // 过滤出帖子链接
    const postLinks = links.filter(link => {
      return link.match(/weibo\.com\/\d+\/[A-Za-z0-9]+$/) ||
             link.match(/weibo\.com\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/);
    });

    // 过滤掉非帖子链接
    const filteredPostLinks = postLinks.filter(link => {
      return !link.includes('service.account.weibo.com') &&
             !link.includes('weibo.com/signup') &&
             !link.includes('weibo.com/login') &&
             !link.includes('weibo.com/home') &&
             !link.includes('weibo.com/explore');
    });

    console.log('\n📊 链接提取结果:');
    console.log(`- 总链接数: ${links.length}`);
    console.log(`- 帖子链接数: ${postLinks.length}`);
    console.log(`- 过滤后帖子链接: ${filteredPostLinks.length}`);

    // 显示前20个链接
    console.log('\n🔗 前20个帖子链接:');
    filteredPostLinks.slice(0, 20).forEach((link, index) => {
      console.log(`${index + 1}. ${link}`);
    });

    // 保存结果
    const result = {
      timestamp: new Date().toISOString(),
      totalLinks: links.length,
      postLinks: postLinks.length,
      filteredPostLinks: filteredPostLinks.length,
      links: filteredPostLinks.slice(0, 100) // 只保存前100个
    };

    const resultFile = `${TEST_CONFIG.paths.outputDir}/simple-weibo-links-${Date.now()}.json`;
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    console.log(`\n📁 结果已保存到: ${resultFile}`);

    return result;

  } catch (error) {
    console.error('❌ 链接提取失败:', error.message);
    throw error;
  } finally {
    await testSystem.cleanup();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  simpleWeiboLinkExtractor()
    .then(results => {
      console.log('\n🎊 链接提取完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 链接提取失败:', error.message);
      process.exit(1);
    });
}

module.exports = simpleWeiboLinkExtractor;