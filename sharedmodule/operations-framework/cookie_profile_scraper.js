#!/usr/bin/env node

/**
 * 带Cookie的微博个人主页抓取脚本
 * 使用已保存的微博Cookie进行登录状态抓取
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scrapeWeiboProfileWithCookie(profileUrl, options = {}) {
  try {
    console.log('=== 微博个人主页抓取 (Cookie版) ===');
    console.log('目标链接:', profileUrl);
    console.log('开始时间:', new Date().toLocaleString());
    console.log('');

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
      // 加载Cookie
      console.log('加载微博Cookie...');
      const cookiePath = '/Users/fanzhang/.webauto/cookies/weibo.com.json';
      const cookies = JSON.parse(await fs.readFile(cookiePath, 'utf8'));

      // 将Cookie添加到上下文
      await context.addCookies(cookies);
      console.log(`已加载 ${cookies.length} 个Cookie`);

      // 导航到个人主页
      console.log('正在导航到个人主页...');
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // 等待页面加载
      await page.waitForTimeout(5000);

      // 检查登录状态
      const loginStatus = await page.evaluate(() => {
        const loginElements = document.querySelectorAll('.login, .login_btn, [action-type="login"], .gn_login');
        const hasLoginPrompt = loginElements.length > 0;

        // 检查是否包含登录文本
        const bodyText = document.body.textContent;
        const hasLoginText = bodyText.includes('登录') && bodyText.includes('注册');

        // 检查是否有用户信息元素
        const userElements = document.querySelectorAll('.WB_face, .gn_name, .PCD_user_info');
        const hasUserInfo = userElements.length > 0;

        return {
          hasLoginPrompt,
          hasLoginText,
          hasUserInfo,
          isLoggedIn: !hasLoginPrompt && !hasLoginText && hasUserInfo
        };
      });

      console.log('登录状态检查:');
      console.log('- 登录提示:', loginStatus.hasLoginPrompt ? '有' : '无');
      console.log('- 登录文本:', loginStatus.hasLoginText ? '有' : '无');
      console.log('- 用户信息:', loginStatus.hasUserInfo ? '有' : '无');
      console.log('- 登录状态:', loginStatus.isLoggedIn ? '已登录' : '未登录');

      if (!loginStatus.isLoggedIn) {
        console.log('⚠️  未检测到登录状态，尝试继续抓取...');
      }

      // 提取用户名
      let username = 'unknown_user';
      try {
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
      const maxScrolls = options.maxPages || 3; // 默认滚动3次
      const targetPosts = 50; // 目标50条帖子

      console.log(`目标抓取 ${targetPosts} 条帖子...`);

      while (scrollCount < maxScrolls && posts.length < targetPosts) {
        console.log(`正在抓取第 ${scrollCount + 1} 页内容...`);

        // 等待可能的懒加载
        await page.waitForTimeout(2000);

        // 提取当前页面的帖子
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
            '.wbs-feed',
            '.Feed_body'
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

              // 提取帖子内容
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

              // 提取图片
              const images = [];
              const imageElements = element.querySelectorAll('img');
              imageElements.forEach(img => {
                const src = img.getAttribute('src') || img.getAttribute('data-src');
                if (src && !src.includes('avatar') && !src.includes('thumb') && !src.includes('emoji')) {
                  if (!src.includes('icon') && !src.includes('logo') && !src.includes('vip')) {
                    const fullSrc = src.startsWith('//') ? 'https:' + src : src;
                    images.push(fullSrc);
                  }
                }
              });

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

        // 如果已经达到目标数量，停止抓取
        if (posts.length >= targetPosts) {
          console.log(`已达到目标数量 ${targetPosts}，停止抓取`);
          break;
        }

        // 滚动到底部加载更多
        scrollCount++;

        if (scrollCount < maxScrolls && posts.length < targetPosts) {
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
        loginStatus,
        postsCount: posts.length,
        posts
      };

      await fs.writeFile(jsonPath, JSON.stringify(saveData, null, 2), 'utf8');

      console.log('');
      console.log('=== 抓取结果 ===');
      console.log('✅ 抓取成功');
      console.log('用户名:', username);
      console.log('帖子总数:', posts.length);
      console.log('登录状态:', loginStatus.isLoggedIn ? '已登录' : '未登录');
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
        loginStatus: loginStatus.isLoggedIn,
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
    console.log('使用方法: node cookie_profile_scraper.js <profileUrl> [options]');
    console.log('');
    console.log('参数:');
    console.log('  profileUrl      微博个人主页链接');
    console.log('');
    console.log('选项:');
    console.log('  --max-pages     最大滚动次数 (默认: 3)');
    console.log('');
    console.log('示例:');
    console.log('  node cookie_profile_scraper.js https://weibo.com/1671109627');
    console.log('  node cookie_profile_scraper.js https://weibo.com/央视新闻 --max-pages 5');
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
      default:
        console.warn('未知选项:', args[i]);
    }
  }

  scrapeWeiboProfileWithCookie(profileUrl, options)
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

export { scrapeWeiboProfileWithCookie };