#!/usr/bin/env node

/**
 * 基于成功经验的50条帖子抓取脚本
 * 使用之前验证有效的方法和宽松的过滤条件
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';

async function scrapeWorkingFifty() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    console.log('=== 基于50条帖子抓取（工作版本） ===');

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

    // 获取用户信息
    const userInfo = await page.evaluate(() => {
      const titleMatch = document.title.match(/@([^的]+)/);
      return {
        username: titleMatch ? titleMatch[1] : '未知用户'
      };
    });

    console.log('用户信息:', userInfo.username);

    // 使用我们验证有效的方法
    const allPosts = new Map();
    let scrollCount = 0;
    const maxScrolls = 15;
    const targetPosts = 50;

    console.log(`\n目标抓取 ${targetPosts} 条帖子...`);

    while (scrollCount < maxScrolls && allPosts.size < targetPosts) {
      console.log(`\n=== 第 ${scrollCount + 1} 次滚动 ===`);
      console.log(`当前已抓取: ${allPosts.size} 条`);

      // 等待Vue组件渲染
      await page.waitForTimeout(3000);

      // 使用之前验证有效的提取方法
      const currentPosts = await page.evaluate(() => {
        const results = [];

        // 使用成功的选择器
        const selectors = [
          'article.woo-panel-main.woo-panel-top.woo-panel-right.woo-panel-bottom.woo-panel-left.Feed_wrap_3v9LH',
          '.Feed_body_3R0rO'
        ];

        let elements = [];
        selectors.forEach(selector => {
          try {
            const found = document.querySelectorAll(selector);
            found.forEach(el => elements.push(el));
          } catch (e) {
            // 忽略无效选择器
          }
        });

        // 去重
        elements = [...new Set(elements)];

        console.log(`找到 ${elements.length} 个元素`);

        elements.forEach((element, index) => {
          try {
            // 获取内容
            let content = '';

            // 优先从Feed_body提取
            const feedBody = element.querySelector('.Feed_body_3R0rO');
            if (feedBody) {
              content = feedBody.textContent.trim();
            } else {
              content = element.textContent.trim();
            }

            // 宽松的长度过滤
            if (content.length < 15 || content.length > 2000) return;

            // 宽松的关键词过滤 - 只过滤明显的非内容
            const skipPatterns = [
              /^包容万物恒河水\s*$/, // 纯用户名
              /^\d+粉丝\d+关注$/, // 纯统计
              /^V指数.*$/, // V指数
              /^昨日发博.*$/ // 昨日发博
            ];

            const shouldSkip = skipPatterns.some(pattern =>
              pattern.test(content.replace(/\s+/g, ' '))
            );

            if (shouldSkip) return;

            // 提取时间
            let time = '';
            const timeMatch = content.match(/(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日|今天|昨天|刚刚)/);
            if (timeMatch) {
              time = timeMatch[1];
            }

            // 提取互动数据（简化版）
            let stats = { likes: 0, comments: 0, reposts: 0 };

            // 查找数字，通常在末尾
            const numbers = content.match(/(\d+(?:\.\d+)?[万千亿]?|\d+)\s*(点赞|评论|转发)?/g);
            if (numbers && numbers.length >= 3) {
              // 最后三个数字通常是互动数据
              const lastNumbers = numbers.slice(-3);
              stats.likes = parseNumber(lastNumbers[0]);
              stats.comments = parseNumber(lastNumbers[1]);
              stats.reposts = parseNumber(lastNumbers[2]);
            }

            // 清理内容 - 移除互动数据
            let cleanContent = content.replace(/\s*\d+(?:\.\d+)?[万千亿]?\s*点赞\s*\d+(?:\.\d+)?[万千亿]?\s*评论\s*\d+(?:\.\d+)?[万千亿]?\s*转发.*$/, '').trim();
            cleanContent = cleanContent.replace(/\s*展开\s*$/, '').trim();

            // 如果清理后内容太短，使用原始内容
            if (cleanContent.length < 10) {
              cleanContent = content;
            }

            // 生成内容哈希
            const contentHash = cleanContent.substring(0, 100);

            results.push({
              contentHash,
              content: cleanContent,
              time,
              stats,
              rawContent: content
            });

          } catch (e) {
            // 忽略错误
          }
        });

        function parseNumber(numStr) {
          if (typeof numStr !== 'string') return 0;
          const cleanStr = numStr.replace(/[^\d万.]/g, '');
          if (cleanStr.includes('万')) {
            return Math.round(parseFloat(cleanStr) * 10000);
          } else if (cleanStr.includes('亿')) {
            return Math.round(parseFloat(cleanStr) * 100000000);
          } else {
            return parseInt(cleanStr) || 0;
          }
        }

        return results;
      });

      // 添加到总集合
      currentPosts.forEach(post => {
        if (!allPosts.has(post.contentHash)) {
          allPosts.set(post.contentHash, post);
        }
      });

      console.log(`新增: ${currentPosts.length} 条，去重后总计: ${allPosts.size} 条`);

      // 显示新增的帖子
      if (currentPosts.length > 0) {
        console.log('新增帖子预览:');
        currentPosts.slice(0, 2).forEach((post, i) => {
          console.log(`  ${i+1}. ${post.content.substring(0, 100)}...`);
        });
      }

      // 检查是否达到目标
      if (allPosts.size >= targetPosts) {
        console.log(`✅ 已达到目标数量 ${targetPosts} 条！`);
        break;
      }

      // 滚动加载更多
      scrollCount++;

      if (scrollCount < maxScrolls) {
        // 滚动到底部
        await page.evaluate(() => {
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
          });
        });

        // 等待加载
        await page.waitForTimeout(5000);
      }
    }

    // 转换为数组
    const postsArray = Array.from(allPosts.values());

    // 添加统一信息
    const finalPosts = postsArray.map((post, index) => ({
      id: `post_${Date.now()}_${index}`,
      username: userInfo.username,
      content: post.content,
      time: post.time,
      stats: post.stats,
      url: 'https://weibo.com/1671109627'
    }));

    console.log(`\n=== 抓取完成 ===`);
    console.log(`最终抓取数量: ${finalPosts.length} 条`);
    console.log(`滚动次数: ${scrollCount} 次`);

    // 保存结果
    const result = {
      timestamp: new Date().toISOString(),
      username: userInfo.username,
      targetPosts,
      actualPosts: finalPosts.length,
      scrollCount,
      posts: finalPosts
    };

    const savePath = '/Users/fanzhang/.webauto/weibo/user-profiles/包容万物恒河水/working_fifty_posts.json';
    await fs.writeFile(savePath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`结果已保存到: ${savePath}`);

    // 显示前15条帖子
    if (finalPosts.length > 0) {
      console.log('\n=== 前15条帖子 ===');
      finalPosts.slice(0, 15).forEach((post, index) => {
        console.log(`\n${index + 1}. ${post.content.substring(0, 150)}...`);
        console.log(`   时间: ${post.time || '未知'}`);
        console.log(`   点赞: ${post.stats.likes.toLocaleString()} | 评论: ${post.stats.comments.toLocaleString()} | 转发: ${post.stats.reposts.toLocaleString()}`);
      });
    }

    // 统计信息
    const totalLikes = finalPosts.reduce((sum, post) => sum + post.stats.likes, 0);
    const totalComments = finalPosts.reduce((sum, post) => sum + post.stats.comments, 0);
    const totalReposts = finalPosts.reduce((sum, post) => sum + post.stats.reposts, 0);

    console.log('\n=== 统计信息 ===');
    console.log(`总点赞数: ${totalLikes.toLocaleString()}`);
    console.log(`总评论数: ${totalComments.toLocaleString()}`);
    console.log(`总转发数: ${totalReposts.toLocaleString()}`);
    if (finalPosts.length > 0) {
      console.log(`平均点赞: ${Math.round(totalLikes / finalPosts.length).toLocaleString()}`);
      console.log(`平均评论: ${Math.round(totalComments / finalPosts.length).toLocaleString()}`);
      console.log(`平均转发: ${Math.round(totalReposts / finalPosts.length).toLocaleString()}`);
    }

    return finalPosts.length;

  } catch (error) {
    console.error('抓取失败:', error);
    return 0;
  } finally {
    await browser.close();
  }
}

scrapeWorkingFifty().then(count => {
  console.log(`\n🎉 抓取完成！共获取 ${count} 条微博帖子`);
  process.exit(0);
}).catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});