#!/usr/bin/env node

/**
 * 改进的微博个人主页抓取脚本
 * 修复了算法问题，能够抓取更多内容
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scrapeWeiboProfileImproved(profileUrl, options = {}) {
  try {
    console.log('=== 微博个人主页抓取 (改进版) ===');
    console.log('目标链接:', profileUrl);
    console.log('开始时间:', new Date().toLocaleString());
    console.log('');

    const maxPosts = (options.maxPages || 5) * (options.postsPerPage || 20); // 默认抓取更多

    // 启动浏览器
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
      // 导航到个人主页
      console.log('正在导航到个人主页...');
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // 等待页面加载
      await page.waitForTimeout(5000);

      // 获取真实的用户名
      let username = 'unknown_user';
      try {
        // 尝试多种方式获取用户名
        username = await page.evaluate(() => {
          const selectors = [
            '.PCD_user_info .username',
            '.Profile_header .name',
            '.UserInfo_name',
            '.gn_name',
            '.WB_face .name',
            'h1',
            '.username'
          ];

          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
              return element.textContent.trim();
            }
          }

          // 从页面标题提取
          const titleMatch = document.title.match(/@([^的]+)/);
          if (titleMatch) {
            return titleMatch[1];
          }

          return 'unknown_user';
        });
      } catch (e) {
        console.log('无法提取用户名，使用默认值');
      }

      console.log('用户名:', username);

      // 滚动加载更多内容
      const posts = [];
      let scrollCount = 0;
      const maxScrolls = options.maxPages || 5; // 增加滚动次数

      while (scrollCount < maxScrolls && posts.length < maxPosts) {
        console.log(`正在抓取第 ${scrollCount + 1} 页内容...`);

        // 等待可能的懒加载
        await page.waitForTimeout(2000);

        // 提取当前页面的帖子 - 使用更全面的选择器
        const currentPosts = await page.evaluate(() => {
          const results = [];

          // 尝试多种选择器来找到帖子
          const postSelectors = [
            '.Feed_body_3R0rO',
            '.WB_detail',
            '.card-wrap',
            '.WB_feed',
            '[node-type="feed_list_item"]',
            '.card-feed',
            '.wbs-feed'
          ];

          let allElements = [];
          postSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => allElements.push(el));
          });

          // 去重
          allElements = [...new Set(allElements)];

          allElements.forEach((element, index) => {
            try {
              // 跳过明显的非帖子元素
              if (element.classList.contains('header') ||
                  element.classList.contains('footer') ||
                  element.classList.contains('nav') ||
                  element.classList.contains('sidebar')) {
                return;
              }

              // 提取帖子内容 - 尝试多种内容选择器
              const contentSelectors = [
                '.Feed_body_3R0rO',
                '.WB_text',
                '.text',
                '.content',
                '.post-content'
              ];

              let content = '';
              let contentElement = null;

              for (const selector of contentSelectors) {
                contentElement = element.querySelector(selector);
                if (contentElement && contentElement.textContent.trim()) {
                  content = contentElement.textContent.trim();
                  break;
                }
              }

              // 如果没有找到内容，跳过这个元素
              if (!content) return;

              // 提取时间
              const timeSelectors = [
                '.Feed_body_3R0rO .from a',
                '.WB_text .from a',
                '.time',
                '.date',
                '.from a'
              ];

              let time = '';
              for (const selector of timeSelectors) {
                const timeElement = element.querySelector(selector);
                if (timeElement && timeElement.textContent.trim()) {
                  time = timeElement.textContent.trim();
                  break;
                }
              }

              // 提取统计数据
              const stats = {
                likes: 0,
                comments: 0,
                reposts: 0
              };

              // 尝试提取点赞、评论、转发数
              const actElements = element.querySelectorAll('.card-act span, .act span, .action span');
              actElements.forEach(actEl => {
                const text = actEl.textContent;
                if (text.includes('赞')) {
                  const match = text.match(/(\d+)/);
                  if (match) stats.likes = parseInt(match[1]);
                } else if (text.includes('评论')) {
                  const match = text.match(/(\d+)/);
                  if (match) stats.comments = parseInt(match[1]);
                } else if (text.includes('转发')) {
                  const match = text.match(/(\d+)/);
                  if (match) stats.reposts = parseInt(match[1]);
                }
              });

              // 提取图片 - 更全面的图片查找
              const images = [];
              const imageElements = element.querySelectorAll('img');
              imageElements.forEach(img => {
                const src = img.getAttribute('src') || img.getAttribute('data-src');
                if (src && !src.includes('avatar') && !src.includes('thumb') && !src.includes('emoji')) {
                  // 过滤掉明显的非内容图片
                  if (!src.includes('icon') && !src.includes('logo') && !src.includes('vip')) {
                    const fullSrc = src.startsWith('//') ? 'https:' + src : src;
                    images.push(fullSrc);
                  }
                }
              });

              // 提取用户名
              const userSelectors = [
                '.Feed_body_3R0rO .name a',
                '.WB_detail .name a',
                '.name a',
                '.username a',
                '.user-name'
              ];

              let username = '';
              for (const selector of userSelectors) {
                const userElement = element.querySelector(selector);
                if (userElement && userElement.textContent.trim()) {
                  username = userElement.textContent.trim();
                  break;
                }
              }

              // 生成帖子ID
              const id = `post_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;

              results.push({
                id,
                username,
                content,
                time,
                stats,
                images,
                url: window.location.href
              });
            } catch (e) {
              // 忽略单个帖子的解析错误
            }
          });

          return results;
        });

        // 添加新帖子（基于内容去重）
        const newPosts = currentPosts.filter(post =>
          !posts.some(existing =>
            existing.content === post.content &&
            existing.time === post.time
          )
        );

        posts.push(...newPosts);

        console.log(`当前帖子总数: ${posts.length} (新增: ${newPosts.length})`);

        // 滚动到底部加载更多
        scrollCount++;

        if (scrollCount < maxScrolls && posts.length < maxPosts) {
          // 多次滚动，每次滚动不同的距离
          for (let i = 0; i < 3; i++) {
            await page.evaluate(() => {
              window.scrollBy(0, window.innerHeight);
            });
            await page.waitForTimeout(1000);
          }

          // 额外等待时间，让内容加载
          await page.waitForTimeout(3000);
        }
      }

      console.log(`总共抓取 ${posts.length} 条帖子`);

      // 保存数据
      const saveDir = path.join(process.env.HOME || '~', '.webauto', 'weibo', 'user-profiles', username);
      await fs.mkdir(saveDir, { recursive: true });

      // 保存JSON数据
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const jsonFileName = `profile_posts_${timestamp}.json`;
      const jsonPath = path.join(saveDir, jsonFileName);

      const saveData = {
        username,
        profileUrl,
        extractionTime: new Date().toISOString(),
        postsCount: posts.length,
        posts
      };

      await fs.writeFile(jsonPath, JSON.stringify(saveData, null, 2), 'utf8');

      console.log('');
      console.log('=== 抓取结果 ===');
      console.log('✅ 抓取成功');
      console.log('用户名:', username);
      console.log('帖子总数:', posts.length);
      console.log('保存路径:', saveDir);
      console.log('JSON文件:', jsonFileName);

      // 显示前10条帖子
      if (posts.length > 0) {
        console.log('');
        console.log('=== 最新博文 ===');
        const displayCount = Math.min(10, posts.length);
        posts.slice(0, displayCount).forEach((post, index) => {
          console.log(`${index + 1}. ${post.content?.substring(0, 200)}...`);
          console.log(`   时间: ${post.time || '未知'}`);
          console.log(`   点赞: ${post.stats?.likes || 0} | 评论: ${post.stats?.comments || 0} | 转发: ${post.stats?.reposts || 0}`);
          if (post.images && post.images.length > 0) {
            console.log(`   图片: ${post.images.length} 张`);
          }
          console.log('---');
        });
      }

      // 统计信息
      const totalLikes = posts.reduce((sum, post) => sum + (post.stats?.likes || 0), 0);
      const totalComments = posts.reduce((sum, post) => sum + (post.stats?.comments || 0), 0);
      const postsWithImages = posts.filter(post => post.images && post.images.length > 0).length;

      console.log('');
      console.log('=== 统计信息 ===');
      console.log(`总点赞数: ${totalLikes}`);
      console.log(`总评论数: ${totalComments}`);
      console.log(`带图片的帖子: ${postsWithImages}`);
      if (posts.length > 0) {
        console.log(`平均点赞: ${Math.round(totalLikes / posts.length)}`);
      }

      return {
        success: true,
        username,
        postsCount: posts.length,
        data: posts,
        savePath: saveDir,
        jsonFile: jsonFileName,
        stats: {
          totalLikes,
          totalComments,
          postsWithImages,
          avgLikes: posts.length > 0 ? Math.round(totalLikes / posts.length) : 0
        }
      };

    } finally {
      await browser.close();
    }

  } catch (error) {
    console.error('抓取失败:', error.message);
    throw error;
  }
}

// 命令行参数处理
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方法: node improved_profile_scraper.js <profileUrl> [options]');
    console.log('');
    console.log('参数:');
    console.log('  profileUrl      微博个人主页链接');
    console.log('');
    console.log('选项:');
    console.log('  --max-pages     最大抓取页面数 (默认: 5)');
    console.log('  --posts-per-page 每页帖子数 (默认: 20)');
    console.log('');
    console.log('示例:');
    console.log('  node improved_profile_scraper.js https://weibo.com/1671109627');
    console.log('  node improved_profile_scraper.js https://weibo.com/央视新闻 --max-pages 10');
    process.exit(1);
  }

  const profileUrl = args[0];
  const options = {};

  // 解析选项
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--max-pages':
        options.maxPages = parseInt(args[++i]);
        break;
      case '--posts-per-page':
        options.postsPerPage = parseInt(args[++i]);
        break;
      default:
        console.warn('未知选项:', args[i]);
    }
  }

  scrapeWeiboProfileImproved(profileUrl, options)
    .then(result => {
      console.log('');
      console.log('抓取完成!');
      process.exit(0);
    })
    .catch(error => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { scrapeWeiboProfileImproved };