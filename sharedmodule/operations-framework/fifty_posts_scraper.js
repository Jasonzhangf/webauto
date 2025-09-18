#!/usr/bin/env node

/**
 * 抓取50条微博帖子的优化脚本
 * 简化发帖人信息获取，专注内容抓取
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';

async function scrapeFiftyPosts() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    console.log('=== 抓取50条微博帖子 ===');

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

    // 提取用户基本信息（一次性获取）
    const userInfo = await page.evaluate(() => {
      const bodyText = document.body.textContent;
      const titleMatch = document.title.match(/@([^的]+)/);

      let userStats = {
        followers: '未知',
        following: '未知',
        posts: '未知'
      };

      // 从页面文本提取统计信息
      const postsMatch = bodyText.match(/全部微博（([\d万.]+)）/);
      if (postsMatch) userStats.posts = postsMatch[1];

      const followersMatch = bodyText.match(/粉丝([\d万.]+)/);
      if (followersMatch) userStats.followers = followersMatch[1];

      const followingMatch = bodyText.match(/关注([\d万.]+)/);
      if (followingMatch) userStats.following = followingMatch[1];

      return {
        username: titleMatch ? titleMatch[1] : '未知用户',
        userStats
      };
    });

    console.log('用户信息:', userInfo.username);
    console.log('粉丝数:', userInfo.userStats.followers);
    console.log('关注数:', userInfo.userStats.following);
    console.log('微博总数:', userInfo.userStats.posts);

    // 开始抓取帖子
    const allPosts = new Map(); // 使用Map去重
    let scrollCount = 0;
    const maxScrolls = 20; // 增加滚动次数
    const targetPosts = 50;

    console.log(`\n目标抓取 ${targetPosts} 条帖子...`);

    while (scrollCount < maxScrolls && allPosts.size < targetPosts) {
      console.log(`\n=== 第 ${scrollCount + 1} 次滚动 ===`);
      console.log(`当前已抓取: ${allPosts.size} 条`);

      // 等待Vue组件渲染
      await page.waitForTimeout(2000);

      // 提取当前页面的帖子
      const currentPosts = await page.evaluate(() => {
        const results = [];

        // 使用最优的选择器组合
        const selectors = [
          'article.woo-panel-main.woo-panel-top.woo-panel-right.woo-panel-bottom.woo-panel-left.Feed_wrap_3v9LH',
          '.Feed_body_3R0rO'
        ];

        let elements = [];
        selectors.forEach(selector => {
          const found = document.querySelectorAll(selector);
          found.forEach(el => elements.push(el));
        });

        // 去重
        elements = [...new Set(elements)];

        console.log(`找到 ${elements.length} 个元素`);

        elements.forEach((element, index) => {
          try {
            let content = '';

            // 优先从Feed_body提取内容
            const feedBody = element.querySelector('.Feed_body_3R0rO');
            if (feedBody) {
              content = feedBody.textContent.trim();
            } else {
              content = element.textContent.trim();
            }

            // 过滤条件
            if (content.length < 10 || content.length > 3000) return;

            // 过滤掉用户信息和非帖子内容
            const skipKeywords = [
              '包容万物恒河水', // 用户名
              '粉丝', '关注', '全部微博',
              'V指数', '昨日发博', '阅读数', '互动数',
              '海外新鲜事博主', '顾问', '已实名', 'IP属地'
            ];

            if (skipKeywords.some(keyword => content.includes(keyword))) return;

            // 提取时间信息
            let time = '';
            const timeMatch = content.match(/(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日|今天|昨天|刚刚)/);
            if (timeMatch) {
              time = timeMatch[1];
            }

            // 提取互动数据
            let stats = { likes: 0, comments: 0, reposts: 0 };

            // 查找footer中的数字
            const footerText = content;
            const numbers = footerText.match(/(\d+(?:\.\d+)?[万千亿]?|\d+)\s*(点赞|评论|转发)?/g);

            if (numbers && numbers.length >= 1) {
              // 最后三个数字通常是点赞、评论、转发
              const relevantNumbers = numbers.slice(-3);
              if (relevantNumbers.length >= 1) stats.likes = parseNumber(relevantNumbers[0]);
              if (relevantNumbers.length >= 2) stats.comments = parseNumber(relevantNumbers[1]);
              if (relevantNumbers.length >= 3) stats.reposts = parseNumber(relevantNumbers[2]);
            }

            // 清理内容，移除互动数字
            let cleanContent = content.replace(/\s*\d+\s*点赞\s*\d+\s*评论\s*\d+\s*转发.*$/, '').trim();
            cleanContent = cleanContent.replace(/\s*展开\s*$/, '').trim();

            // 生成内容哈希用于去重
            const contentHash = cleanContent.substring(0, 50);

            results.push({
              contentHash,
              content: cleanContent,
              time,
              stats,
              index
            });

          } catch (e) {
            // 忽略错误
          }
        });

        // 辅助函数
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

      // 添加到总集合（自动去重）
      currentPosts.forEach(post => {
        if (!allPosts.has(post.contentHash)) {
          allPosts.set(post.contentHash, post);
        }
      });

      console.log(`新增: ${currentPosts.length} 条，去重后总计: ${allPosts.size} 条`);

      // 检查是否达到目标
      if (allPosts.size >= targetPosts) {
        console.log(`✅ 已达到目标数量 ${targetPosts} 条！`);
        break;
      }

      // 滚动加载更多
      scrollCount++;

      if (scrollCount < maxScrolls) {
        // 平滑滚动到底部
        await page.evaluate(() => {
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
          });
        });

        // 等待加载
        await page.waitForTimeout(4000);
      }
    }

    // 转换为数组并按时间排序
    const postsArray = Array.from(allPosts.values());

    // 添加统一的用户信息
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
      userInfo,
      targetPosts,
      actualPosts: finalPosts.length,
      scrollCount,
      posts: finalPosts
    };

    const savePath = '/Users/fanzhang/.webauto/weibo/user-profiles/包容万物恒河水/fifty_posts_result.json';
    await fs.writeFile(savePath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`结果已保存到: ${savePath}`);

    // 显示前10条帖子
    if (finalPosts.length > 0) {
      console.log('\n=== 前10条帖子 ===');
      finalPosts.slice(0, 10).forEach((post, index) => {
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
    console.log(`平均点赞: ${Math.round(totalLikes / finalPosts.length).toLocaleString()}`);
    console.log(`平均评论: ${Math.round(totalComments / finalPosts.length).toLocaleString()}`);
    console.log(`平均转发: ${Math.round(totalReposts / finalPosts.length).toLocaleString()}`);

    return finalPosts.length;

  } catch (error) {
    console.error('抓取失败:', error);
    return 0;
  } finally {
    await browser.close();
  }
}

scrapeFiftyPosts().then(count => {
  console.log(`\n🎉 抓取完成！共获取 ${count} 条微博帖子`);
  process.exit(0);
}).catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});