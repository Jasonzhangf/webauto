#!/usr/bin/env node

/**
 * 简单的微博个人主页抓取脚本
 * 直接使用Playwright来抓取个人主页内容
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scrapeWeiboProfileSimple(profileUrl, options = {}) {
  try {
    console.log('=== 微博个人主页抓取 (简单版) ===');
    console.log('目标链接:', profileUrl);
    console.log('开始时间:', new Date().toLocaleString());
    console.log('');

    const maxPosts = (options.maxPages || 3) * (options.postsPerPage || 20);

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
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 等待页面加载
      await page.waitForSelector('.Feed_body_3R0rO, .WB_detail, .card-wrap', { timeout: 15000 });

      // 尝试提取用户名
      let username = 'unknown_user';
      try {
        const usernameElement = await page.$('.PCD_user_info .username, .Profile_header .name, .UserInfo_name, .gn_name');
        if (usernameElement) {
          username = await usernameElement.textContent() || 'unknown_user';
          username = username.trim();
        }
      } catch (e) {
        console.log('无法提取用户名，使用默认值');
      }

      // 如果还是默认值，尝试从URL提取
      if (username === 'unknown_user') {
        const urlMatch = profileUrl.match(/weibo\.com\/([^\/\?]+)/);
        if (urlMatch) {
          username = urlMatch[1];
        }
      }

      console.log('用户名:', username);

      // 滚动加载更多内容
      const posts = [];
      let scrollCount = 0;
      const maxScrolls = options.maxPages || 3;

      while (posts.length < maxPosts && scrollCount < maxScrolls) {
        console.log(`正在抓取第 ${scrollCount + 1} 页内容...`);

        // 提取当前页面的帖子
        const currentPosts = await page.evaluate(() => {
          const postElements = document.querySelectorAll('.Feed_body_3R0rO, .WB_detail, .card-wrap');
          const results = [];

          postElements.forEach((element, index) => {
            try {
              // 提取帖子内容
              const contentElement = element.querySelector('.Feed_body_3R0rO, .WB_text, .text');
              const content = contentElement ? contentElement.textContent.trim() : '';

              // 提取时间
              const timeElement = element.querySelector('.Feed_body_3R0rO .from a, .WB_text .from a, .time');
              const time = timeElement ? timeElement.textContent.trim() : '';

              // 提取统计数据
              const stats = {
                likes: 0,
                comments: 0,
                reposts: 0
              };

              // 提取点赞数
              const likesElement = element.querySelector('.Feed_body_3R0rO .card-act span, .WB_detail .card-act span');
              if (likesElement) {
                const likesText = likesElement.textContent;
                const likesMatch = likesText.match(/(\d+)/);
                if (likesMatch) {
                  stats.likes = parseInt(likesMatch[1]);
                }
              }

              // 提取图片
              const images = [];
              const imageElements = element.querySelectorAll('img[src*="sinaimg.cn"]');
              imageElements.forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.includes('avatar') && !src.includes('thumb') && !src.includes('emoji')) {
                  images.push(src.startsWith('//') ? 'https:' + src : src);
                }
              });

              // 提取用户名
              const userElement = element.querySelector('.Feed_body_3R0rO .name a, .WB_detail .name a, .name a');
              const username = userElement ? userElement.textContent.trim() : '';

              // 生成帖子ID
              const id = `post_${Date.now()}_${index}`;

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
              console.log('解析帖子时出错:', e.message);
            }
          });

          return results;
        });

        // 添加新帖子
        const newPosts = currentPosts.filter(post => !posts.some(existing => existing.content === post.content));
        posts.push(...newPosts);

        console.log(`当前帖子总数: ${posts.length}`);

        // 滚动到底部加载更多
        scrollCount++;
        if (scrollCount < maxScrolls && posts.length < maxPosts) {
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await page.waitForTimeout(2000); // 等待新内容加载
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
    console.log('使用方法: node simple_profile_scraper.js <profileUrl> [options]');
    console.log('');
    console.log('参数:');
    console.log('  profileUrl      微博个人主页链接');
    console.log('');
    console.log('选项:');
    console.log('  --max-pages     最大抓取页面数 (默认: 3)');
    console.log('  --posts-per-page 每页帖子数 (默认: 20)');
    console.log('');
    console.log('示例:');
    console.log('  node simple_profile_scraper.js https://weibo.com/1671109627');
    console.log('  node simple_profile_scraper.js https://weibo.com/央视新闻 --max-pages 5');
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

  scrapeWeiboProfileSimple(profileUrl, options)
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

export { scrapeWeiboProfileSimple };