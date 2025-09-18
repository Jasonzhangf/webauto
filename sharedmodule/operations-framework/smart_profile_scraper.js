#!/usr/bin/env node

/**
 * 智能微博个人主页抓取脚本
 * 能够处理部分登录状态和不同的页面结构
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scrapeWeiboProfileSmart(profileUrl, options = {}) {
  try {
    console.log('=== 微博个人主页抓取 (智能版) ===');
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

      // 过滤掉已过期的Cookie
      const now = Date.now() / 1000;
      const validCookies = cookies.filter(cookie => {
        if (cookie.expires === -1) return true; // 会话Cookie
        return cookie.expires > now;
      });

      console.log(`总共 ${cookies.length} 个Cookie，其中 ${validCookies.length} 个有效`);

      // 将有效Cookie添加到上下文
      if (validCookies.length > 0) {
        await context.addCookies(validCookies);
      }

      // 导航到个人主页
      console.log('正在导航到个人主页...');
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // 等待页面加载
      await page.waitForTimeout(5000);

      // 分析页面状态
      const pageInfo = await page.evaluate(() => {
        const bodyText = document.body.textContent;

        // 检查登录状态
        const loginElements = document.querySelectorAll('.login, .login_btn, [action-type="login"], .gn_login');
        const hasLoginPrompt = loginElements.length > 0;
        const hasLoginText = bodyText.includes('登录') && bodyText.includes('注册');

        // 检查是否有用户信息
        const hasUserInfo = bodyText.includes('全部微博') || bodyText.includes('粉丝') || bodyText.includes('关注');

        // 尝试提取用户统计信息
        let userStats = {
          followers: '未知',
          following: '未知',
          posts: '未知'
        };

        // 查找粉丝数、关注数、微博数
        const statsText = bodyText.match(/粉丝([\d万.]+)|关注([\d万.]+)|微博([\d万.]+)/g);
        if (statsText) {
          statsText.forEach(stat => {
            if (stat.includes('粉丝')) {
              const match = stat.match(/粉丝([\d万.]+)/);
              if (match) userStats.followers = match[1];
            } else if (stat.includes('关注')) {
              const match = stat.match(/关注([\d万.]+)/);
              if (match) userStats.following = match[1];
            } else if (stat.includes('微博')) {
              const match = stat.match(/微博([\d万.]+)/);
              if (match) userStats.posts = match[1];
            }
          });
        }

        // 尝试多种方式提取用户名
        let username = '未知用户';
        const titleMatch = document.title.match(/@([^的]+)/);
        if (titleMatch) {
          username = titleMatch[1];
        }

        // 查找帖子元素
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

        let postCount = 0;
        postSelectors.forEach(selector => {
          postCount += document.querySelectorAll(selector).length;
        });

        // 检查是否有"加载更多"或分页元素
        const loadMoreElements = document.querySelectorAll('.load_more, .next, .page_next, .WB_more');
        const hasLoadMore = loadMoreElements.length > 0;

        return {
          username,
          hasLoginPrompt,
          hasLoginText,
          hasUserInfo,
          userStats,
          postCount,
          hasLoadMore,
          title: document.title,
          url: window.location.href,
          isLoggedIn: !hasLoginPrompt && !hasLoginText && hasUserInfo
        };
      });

      console.log('页面分析结果:');
      console.log('- 用户名:', pageInfo.username);
      console.log('- 粉丝数:', pageInfo.userStats.followers);
      console.log('- 关注数:', pageInfo.userStats.following);
      console.log('- 微博数:', pageInfo.userStats.posts);
      console.log('- 登录提示:', pageInfo.hasLoginPrompt ? '有' : '无');
      console.log('- 登录文本:', pageInfo.hasLoginText ? '有' : '无');
      console.log('- 用户信息:', pageInfo.hasUserInfo ? '有' : '无');
      console.log('- 帖子元素数量:', pageInfo.postCount);
      console.log('- 加载更多按钮:', pageInfo.hasLoadMore ? '有' : '无');
      console.log('- 推断登录状态:', pageInfo.isLoggedIn ? '已登录' : '未登录');

      // 现在尝试抓取内容
      const posts = [];
      let scrollCount = 0;
      const maxScrolls = options.maxPages || 5; // 默认滚动5次
      const targetPosts = 50; // 目标50条帖子

      console.log(`目标抓取 ${targetPosts} 条帖子...`);

      while (scrollCount < maxScrolls && posts.length < targetPosts) {
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

          console.log(`找到 ${allElements.length} 个可能的帖子元素`);

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
                '.post-content',
                '.WB_detail'  // 有时整个WB_detail就是内容
              ];

              let content = '';
              let contentElement = null;

              for (const selector of contentSelectors) {
                // 如果是父元素本身
                if (element.matches(selector)) {
                  contentElement = element;
                } else {
                  contentElement = element.querySelector(selector);
                }

                if (contentElement && contentElement.textContent.trim()) {
                  content = contentElement.textContent.trim();
                  break;
                }
              }

              // 如果没有找到内容，尝试获取元素的文本内容
              if (!content) {
                content = element.textContent.trim();
              }

              // 如果内容太短或太长，可能是非帖子元素
              if (content.length < 5 || content.length > 2000) {
                return;
              }

              // 过滤掉导航文本和其他非帖子内容
              const skipKeywords = ['登录', '注册', '首页', '发现', '消息', '我', '设置', '退出', '微博', '随时随地发现新鲜事'];
              if (skipKeywords.some(keyword => content.includes(keyword))) {
                return;
              }

              // 提取时间
              const timeSelectors = [
                '.Feed_body_3R0rO .from a',
                '.WB_text .from a',
                '.time',
                '.date',
                '.from a',
                '.WB_from'
              ];

              let time = '';
              for (const selector of timeSelectors) {
                const timeElement = element.querySelector(selector);
                if (timeElement && timeElement.textContent.trim()) {
                  time = timeElement.textContent.trim();
                  break;
                }
              }

              // 如果没有找到时间，尝试从内容中提取
              if (!time) {
                const timeMatch = content.match(/(\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|今天|昨天|刚刚)/);
                if (timeMatch) {
                  time = timeMatch[1];
                }
              }

              // 提取统计数据
              const stats = {
                likes: 0,
                comments: 0,
                reposts: 0
              };

              // 尝试提取点赞、评论、转发数
              const actElements = element.querySelectorAll('.card-act span, .act span, .action span, .WB_handle span');
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
                username: document.title.match(/@([^的]+)/)?.[1] || '未知用户',
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

        // 如果没有新帖子，可能已经到底了
        if (newPosts.length === 0 && scrollCount > 0) {
          console.log('没有新帖子，可能已经到底了');
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
      const saveDir = path.join(process.env.HOME || '~', '.webauto', 'weibo', 'user-profiles', pageInfo.username);
      await fs.mkdir(saveDir, { recursive: true });

      // 保存JSON数据
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const jsonFileName = `profile_posts_${timestamp}.json`;
      const jsonPath = path.join(saveDir, jsonFileName);

      const saveData = {
        username: pageInfo.username,
        profileUrl,
        extractionTime: new Date().toISOString(),
        pageInfo: {
          userStats: pageInfo.userStats,
          loginStatus: pageInfo.isLoggedIn,
          postElementsFound: pageInfo.postCount,
          hasLoadMore: pageInfo.hasLoadMore
        },
        postsCount: posts.length,
        posts
      };

      await fs.writeFile(jsonPath, JSON.stringify(saveData, null, 2), 'utf8');

      console.log('');
      console.log('=== 抓取结果 ===');
      console.log('✅ 抓取成功');
      console.log('用户名:', pageInfo.username);
      console.log('粉丝数:', pageInfo.userStats.followers);
      console.log('关注数:', pageInfo.userStats.following);
      console.log('微博总数:', pageInfo.userStats.posts);
      console.log('帖子总数:', posts.length);
      console.log('登录状态:', pageInfo.isLoggedIn ? '已登录' : '部分登录');
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
        username: pageInfo.username,
        userStats: pageInfo.userStats,
        postsCount: posts.length,
        loginStatus: pageInfo.isLoggedIn,
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
    console.log('使用方法: node smart_profile_scraper.js <profileUrl> [options]');
    console.log('');
    console.log('参数:');
    console.log('  profileUrl      微博个人主页链接');
    console.log('');
    console.log('选项:');
    console.log('  --max-pages     最大滚动次数 (默认: 5)');
    console.log('');
    console.log('示例:');
    console.log('  node smart_profile_scraper.js https://weibo.com/1671109627');
    console.log('  node smart_profile_scraper.js https://weibo.com/央视新闻 --max-pages 5');
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

  scrapeWeiboProfileSmart(profileUrl, options)
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

export { scrapeWeiboProfileSmart };