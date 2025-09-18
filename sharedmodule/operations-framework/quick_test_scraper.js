#!/usr/bin/env node

/**
 * 快速测试微博抓取脚本
 * 用于验证方法是否有效
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';

async function quickTest() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    console.log('=== 快速测试微博抓取 ===');

    // 加载Cookie
    const cookiePath = '/Users/fanzhang/.webauto/cookies/weibo.com.json';
    const cookies = JSON.parse(await fs.readFile(cookiePath, 'utf8'));

    // 过滤掉已过期的Cookie
    const now = Date.now() / 1000;
    const validCookies = cookies.filter(cookie => {
      if (cookie.expires === -1) return true;
      return cookie.expires > now;
    });

    await context.addCookies(validCookies);
    console.log(`已加载 ${validCookies.length} 个有效Cookie`);

    // 导航到个人主页
    await page.goto('https://weibo.com/1671109627', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 等待页面加载
    await page.waitForTimeout(8000);

    // 快速提取一些帖子
    const posts = await page.evaluate(() => {
      const results = [];

      // 查找所有可能的帖子元素
      const postSelectors = [
        'article.woo-panel-main.woo-panel-top.woo-panel-right.woo-panel-bottom.woo-panel-left.Feed_wrap_3v9LH',
        '.Feed_body_3R0rO',
        '.Feed_wrap_3v9LH'
      ];

      let allElements = [];
      postSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => allElements.push(el));
      });

      allElements = [...new Set(allElements)];

      console.log(`找到 ${allElements.length} 个可能的帖子元素`);

      allElements.forEach((element, index) => {
        try {
          let content = '';

          // 尝试提取内容
          const feedBody = element.querySelector('.Feed_body_3R0rO');
          if (feedBody) {
            content = feedBody.textContent.trim();
          } else {
            content = element.textContent.trim();
          }

          // 过滤掉非帖子内容
          const skipKeywords = [
            '登录', '注册', '首页', '发现', '消息', '设置', '退出',
            '微博', '随时随地发现新鲜事', '包容万物恒河水',
            '粉丝', '关注', '全部微博', 'V指数', '昨日发博'
          ];

          if (content.length < 10 || content.length > 2000 ||
              skipKeywords.some(keyword => content.includes(keyword))) {
            return;
          }

          // 提取时间
          let time = '';
          const timeElements = element.querySelectorAll('time, .time, .date, header span');
          timeElements.forEach(timeEl => {
            const timeText = timeEl.textContent.trim();
            if (timeText && timeText.length < 20) {
              time = timeText;
            }
          });

          // 生成帖子ID
          const id = `post_${Date.now()}_${index}`;

          results.push({
            id,
            content,
            time,
            url: window.location.href
          });
        } catch (e) {
          // 忽略错误
        }
      });

      return results;
    });

    console.log(`\n成功提取 ${posts.length} 条帖子:`);

    posts.forEach((post, index) => {
      console.log(`\n${index + 1}. ${post.content.substring(0, 150)}...`);
      console.log(`   时间: ${post.time || '未知'}`);
    });

    // 保存结果
    const result = {
      timestamp: new Date().toISOString(),
      postsCount: posts.length,
      posts: posts
    };

    await fs.writeFile('/Users/fanzhang/.webauto/weibo/user-profiles/包容万物恒河水/quick_test_result.json', JSON.stringify(result, null, 2), 'utf8');
    console.log(`\n结果已保存到: quick_test_result.json`);

    return posts.length;

  } catch (error) {
    console.error('测试失败:', error);
    return 0;
  } finally {
    await browser.close();
  }
}

quickTest().then(count => {
  console.log(`\n测试完成，共抓取 ${count} 条帖子`);
  process.exit(0);
}).catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});