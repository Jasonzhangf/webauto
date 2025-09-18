#!/usr/bin/env node

/**
 * 宽松版本的微博抓取脚本
 * 减少过滤条件，更积极地抓取内容
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';

async function relaxedScrape() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    console.log('=== 宽松版本微博抓取测试 ===');

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

    // 等待页面完全加载
    console.log('等待页面加载...');
    await page.waitForTimeout(10000);

    // 检查登录状态
    const loginStatus = await page.evaluate(() => {
      const bodyText = document.body.textContent;
      const hasLoginText = bodyText.includes('登录') && bodyText.includes('注册');
      const hasUserInfo = bodyText.includes('全部微博') || bodyText.includes('粉丝');
      return {
        hasLoginText,
        hasUserInfo,
        isLoggedIn: !hasLoginText && hasUserInfo,
        bodyTextPreview: bodyText.substring(0, 500)
      };
    });

    console.log('登录状态:', loginStatus);

    if (!loginStatus.isLoggedIn) {
      console.log('❌ 登录状态检测失败');
      return 0;
    }

    console.log('✅ 登录状态正常，开始抓取内容...');

    // 尝试多种方法提取内容
    const extractionMethods = [
      {
        name: '新版Vue架构',
        selector: 'article.woo-panel-main.woo-panel-top.woo-panel-right.woo-panel-bottom.woo-panel-left.Feed_wrap_3v9LH'
      },
      {
        name: 'Feed内容',
        selector: '.Feed_body_3R0rO'
      },
      {
        name: 'Feed包装',
        selector: '.Feed_wrap_3v9LH'
      },
      {
        name: 'Vue滚动项',
        selector: '.vue-recycle-scroller__item-view article'
      },
      {
        name: '通用文章',
        selector: 'article'
      }
    ];

    let allPosts = [];

    for (const method of extractionMethods) {
      console.log(`\n尝试方法: ${method.name}`);
      console.log(`选择器: ${method.selector}`);

      const posts = await page.evaluate((selector) => {
        const results = [];
        const elements = document.querySelectorAll(selector);

        console.log(`找到 ${elements.length} 个元素`);

        elements.forEach((element, index) => {
          try {
            // 获取元素内容
            const content = element.textContent.trim();

            // 宽松的过滤条件
            if (content.length > 5 && content.length < 3000) {
              // 只过滤明显的导航元素
              const skipPatterns = [
                /^登录注册$/,
                /^微博$/,
                /^随时随地发现新鲜事$/,
                /^包容万物恒河水\s*$/,
                /^\d+粉丝\d+关注$/,
                /^V指数.*$/,
                /^昨日发博.*$/
              ];

              const shouldSkip = skipPatterns.some(pattern =>
                pattern.test(content.replace(/\s+/g, ''))
              );

              if (!shouldSkip) {
                // 尝试提取时间
                let time = '';
                const timeMatch = content.match(/(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日|今天|昨天|刚刚)/);
                if (timeMatch) {
                  time = timeMatch[1];
                }

                results.push({
                  id: `post_${Date.now()}_${index}`,
                  content: content,
                  time: time,
                  method: selector,
                  contentLength: content.length
                });
              }
            }
          } catch (e) {
            // 忽略错误
          }
        });

        return results;
      }, method.selector);

      console.log(`方法 ${method.name} 找到 ${posts.length} 条内容`);

      // 显示前3条作为示例
      if (posts.length > 0) {
        console.log('示例内容:');
        posts.slice(0, 3).forEach((post, i) => {
          console.log(`  ${i+1}. ${post.content.substring(0, 100)}... (长度: ${post.contentLength})`);
        });
      }

      allPosts.push(...posts);
    }

    // 去重
    const uniquePosts = [];
    const seenContents = new Set();

    allPosts.forEach(post => {
      if (!seenContents.has(post.content)) {
        seenContents.add(post.content);
        uniquePosts.push(post);
      }
    });

    console.log(`\n去重后总共: ${uniquePosts.length} 条内容`);

    // 保存结果
    const result = {
      timestamp: new Date().toISOString(),
      loginStatus,
      methodsTested: extractionMethods.length,
      totalPostsBeforeDedupe: allPosts.length,
      uniquePostsCount: uniquePosts.length,
      posts: uniquePosts
    };

    await fs.writeFile('/Users/fanzhang/.webauto/weibo/user-profiles/包容万物恒河水/relaxed_test_result.json', JSON.stringify(result, null, 2), 'utf8');
    console.log(`\n结果已保存到: relaxed_test_result.json`);

    return uniquePosts.length;

  } catch (error) {
    console.error('测试失败:', error);
    return 0;
  } finally {
    await browser.close();
  }
}

relaxedScrape().then(count => {
  console.log(`\n宽松测试完成，共抓取 ${count} 条内容`);
  process.exit(0);
}).catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});